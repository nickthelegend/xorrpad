// MIT · Copyright (c) 2026 Nivesh Gajengi
import {createHash,randomUUID} from 'node:crypto';
import * as phoenix from './chains/phoenix.mjs';
import * as jupperps from './chains/jupperps.mjs';
import * as pmamm from './chains/pmamm.mjs';
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const amount=n=>Number.isFinite(n)&&n>0;
/** Closed vocabulary: a reduceOnly label alone never grants a killed exception. */
export function isFlattenLeg(s) {
 if(s?.reduceOnly!==true || s.manualConfirmation!==true || s.source!=='pad-flatten' || typeof s.flattenId!=='string' || !s.flattenId ||
  typeof s.owner!=='string' || !s.owner || typeof s.market!=='string' || !s.market || s.market.length>64 || s.symbol!==s.market || !amount(s.sizeUsd))return false;
 if(s.flattenAction==='perp')return s.kind==='perp' && ['phoenix','jupperps'].includes(s.venue) && s.reducePct===100 &&
  ['LONG','SHORT'].includes(s.side) && s.positionId && s.closeInput?.owner===s.owner && s.closeInput.reducePct===100 && s.closeInput.expectedNotionalUsd===s.sizeUsd &&
  (s.venue==='jupperps'?s.closeInput.position===s.positionId:s.closeInput.authority===s.owner && s.closeInput.market===s.market &&
    s.positionId===`${s.owner}:${s.closeInput.traderPdaIndex}:${s.closeInput.subaccountIndex}:${s.market}`) &&
  s.side===(s.closeInput.expectedSide==='long'?'SHORT':s.closeInput.expectedSide==='short'?'LONG':null);
 if(s.flattenAction==='cancel')return s.kind==='perp' && !!s.orderId && !!s.cancelInput && ['LONG','SHORT'].includes(s.side) &&
  (s.venue==='jupperps'?s.cancelInput.owner===s.owner && s.cancelInput.positionRequestPubkey===s.orderId && ['orders/limit','tpsl'].includes(s.cancelInput.path):
   s.venue==='phoenix' && s.cancelInput.authority===s.owner && s.cancelInput.symbol===s.market && s.cancelInput.orders?.length===1);
 if(s.flattenAction==='outcome')return s.kind==='predict' && s.venue==='pmamm' && ['yes','no'].includes(s.outcomeSide) &&
  s.side==='SELL' && typeof s.sharesRaw==='string' && /^[1-9]\d*$/.test(s.sharesRaw) && Number.isSafeInteger(Number(s.sharesRaw)) && Number(s.sharesRaw)/1e6===s.sizeUsd;
 return false;
}
export async function readFlattenInventory() {
 const results=await Promise.allSettled([phoenix.flattenInventory(),jupperps.flattenInventory(),pmamm.flattenInventory()]);
 const legs=[],messages=[];
 results.forEach((r,i)=>{if(r.status==='fulfilled')legs.push(...r.value);else messages.push(`${['Phoenix','Jupiter Perps','pm-AMM'][i]}: ${r.reason.message.startsWith('Setup required:')?'':'Setup required: '}${r.reason.message}`);});
 return {legs,messages};
}
export function flattenPlan({legs,messages=[]},id=randomUUID(),now=Date.now()) {
 const signals=legs.map(s=>({...s,source:'pad-flatten',flattenId:id,reduceOnly:true,manualConfirmation:true,leverage:1}));
 const unique=new Set(signals.map(s=>JSON.stringify([s.flattenAction,s.venue,s.positionId || s.orderId || s.market,s.outcomeSide])));
 const invalid=signals.length>32 || signals.some(s=>!isFlattenLeg(s)) || unique.size!==signals.length;
 if(invalid)messages=[...messages,'Setup required: unsupported, duplicate or oversized flatten inventory'];
 const shown=invalid?[]:signals;
 const orders=shown.filter(s=>s.flattenAction==='cancel').length,perps=shown.filter(s=>s.flattenAction==='perp').length;
 const state=messages.length?'setup':signals.length?'awaiting':'empty';
 const record={type:'flatten',id,reduceOnly:true,state,orders,perps,outcomes:shown.length-orders-perps,
  rows:shown.map(s=>{const market=s.market.length>16?s.market.slice(0,6)+'..'+s.market.slice(-4):s.market;return `${s.flattenAction==='cancel'?'CANCEL':s.flattenAction==='perp'?'CLOSE 100%':'SELL '+s.outcomeSide.toUpperCase()} $${s.sizeUsd.toFixed(2)} ${market} / ${s.venue}`.slice(0,96);}),
  message:messages.join('; ').slice(0,500),remainingMs:60000,observedAt:new Date(now).toISOString()};
 record.fingerprint=digest({id,signals,message:record.message});
 return {record,signals,expiresAt:now+60000};
}
/** One immutable plan per latch episode. NO and every failure retain the latch. */
export class PanicFlatten {
 #plans=new Map();#grants=new Map();
 constructor({inventory=readFlattenInventory,propose,signals,executor,killed,publish=()=>{},now=Date.now}){Object.assign(this,{inventory,propose,signals,executor,killed,publish,now});}
 record(device){const p=this.#plans.get(device);if(!p)return null;const r=structuredClone(p.record);r.remainingMs=r.state==='awaiting'?Math.max(0,p.expiresAt-this.now()):0;r.observedAt=new Date(this.now()).toISOString();return r;}
 emit(device,p){if(this.#plans.get(device)===p)this.publish(device,this.record(device));}
 async begin(device){
  if(this.#plans.has(device))return this.record(device);
  const p={record:{type:'flatten',id:randomUUID(),reduceOnly:true,state:'building',orders:0,perps:0,outcomes:0,rows:[],message:'Reading live orders and positions',remainingMs:0}};
  this.#plans.set(device,p);this.emit(device,p);
  let inventory;try{inventory=await this.inventory();}catch(e){inventory={legs:[],messages:['Setup required: '+e.message]};}
  if(this.#plans.get(device)!==p || !this.killed(device))return null;
  Object.assign(p,flattenPlan(inventory,p.record.id,this.now()));this.emit(device,p);return this.record(device);
 }
 allows(id,proposal,device){const g=this.#grants.get(id);return !!g && (!device || device===g.device) && this.killed(g.device) && this.#plans.get(g.device)===g.plan &&
  g.plan.record.state==='executing' && isFlattenLeg(proposal?.signal) && digest(proposal.signal)===g.digest;}
 async answer(device,m){
  const p=this.#plans.get(device);
  if(!this.killed(device) || !p || m.planId!==p.record.id || m.fingerprint!==p.record.fingerprint ||
   !['flatten:yes','flatten:no'].includes(m.action) || !['awaiting','setup','empty'].includes(p.record.state))throw Error('No live displayed flatten plan');
  if(m.action==='flatten:no'){p.record.state='refused';p.record.message='Latch remains on';this.emit(device,p);return {ok:true,rejected:true};}
  if(p.record.state!=='awaiting' || this.now()>=p.expiresAt || !Number.isFinite(m.heldMs) || m.heldMs<800)throw Error('Setup required: live reduce-only plan and fresh YES hold (800ms)');
  p.record.state='executing';p.record.message='Rechecking live inventory';this.emit(device,p);
  // Detached execution lets ACKs, signing replies, NO, and another KILL arrive.
  p.work=this.run(device,p).catch(e=>{if(this.#plans.get(device)===p){p.record.state='failed';p.record.message=e.message.slice(0,500);this.emit(device,p);}});
  return {ok:true,started:true};
 }
 async run(device,p){
  const fresh=flattenPlan(await this.inventory(),p.record.id);
  if(fresh.record.state!=='awaiting' || digest(fresh.signals)!==digest(p.signals))throw Error('Flatten inventory changed; latch remains on. Re-arm and request a fresh plan.');
  // Cancel orders before closing positions; never advance past an unconfirmed leg.
  const ordered=[...p.signals].sort((a,b)=>(a.flattenAction==='cancel'?0:1)-(b.flattenAction==='cancel'?0:1));
  for(const sig of ordered){
   if(this.#plans.get(device)!==p || !this.killed(device))throw Error('Flatten cancelled');
   const proposal=await this.propose(sig);
   if(proposal.verdict.action!=='EXECUTE' || proposal.verdict.sizeUsd!==sig.sizeUsd || !isFlattenLeg(proposal.signal))throw Error('Flatten permission/cap refused: '+proposal.verdict.why.join('; '));
   const entry=await this.signals.create(proposal);
   this.#grants.set(entry.id,{device,plan:p,digest:digest(proposal.signal)});
   try {
    const accepted=await this.signals.accept(entry.id);
    if(accepted.state!=='accepted')throw Error('Flatten leg refused by execution gate');
    if(!this.allows(entry.id,accepted.proposal,device))throw Error('Flatten cancelled');
    p.record.legId=entry.id;p.record.legReduceOnly=true;p.record.message='Review/sign '+sig.flattenAction+' '+sig.market;this.emit(device,p);
    const result=await this.executor.execute(entry.id);
    if(!result?.ok)throw Error(result?.error || 'Flatten leg failed');
    if(!result.receipt)await this.confirmed(entry.id,entry.expiresAt,p);
   }finally{this.#grants.delete(entry.id);}
  }
  if(this.#plans.get(device)!==p || !this.killed(device))return;
  p.record.state='complete';p.record.legId='';p.record.message='All planned transactions confirmed. Latch remains on.';this.emit(device,p);
 }
 confirmed(id,deadline,p){
  return new Promise((resolve,reject)=>{
   const finish=(error)=>{clearTimeout(timer);this.signals.off('event',check);p.cancelWait=null;error?reject(error):resolve();};
   const check=()=>{const e=this.signals.get(id);if(e?.state==='executed')finish();else if(['failed','expired','refused'].includes(e?.state))finish(Error(e.error || 'Flatten leg did not confirm'));};
   const timer=setTimeout(()=>finish(Error('Flatten signing expired; latch remains on')),Math.max(1,deadline-Date.now()));timer.unref();p.cancelWait=()=>finish(Error('Flatten cancelled'));this.signals.on('event',check);check();
  });
 }
 cancel(device){const p=this.#plans.get(device);this.#plans.delete(device);p?.cancelWait?.();for(const [id,g] of this.#grants)if(g.plan===p)this.#grants.delete(id);}
}
