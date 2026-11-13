// MIT · Copyright (c) 2026 Nivesh Gajengi
// Coordinator vectors are local state-machine inputs, never substituted API responses.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {PanicFlatten,flattenPlan,isFlattenLeg} from '../main/panic-flatten.mjs';
import {SignalQueue} from '../main/signals.mjs';
import {decide} from '../main/decide.mjs';
import {DEFAULT_POLICY} from '../main/permissions.mjs';
import {buildRouted} from '../main/propose.mjs';
import {Memory} from '../main/memory.mjs';
import {tiltReceipt} from '../main/tilt-guard.mjs';
import {FlattenPadSimulator} from '../../tools/padsim/flatten.mjs';
const perp={kind:'perp',venue:'jupperps',market:'TEST',symbol:'TEST',owner:'public-test-owner',side:'SHORT',sizeUsd:10,
 flattenAction:'perp',positionId:'test-position',reducePct:100,closeInput:{owner:'public-test-owner',authority:'public-test-owner',position:'test-position',reducePct:100,expectedSide:'long',expectedNotionalUsd:10}};
const cancel={kind:'perp',venue:'jupperps',market:'TEST',symbol:'TEST',owner:'public-test-owner',side:'SHORT',sizeUsd:10,
 flattenAction:'cancel',orderId:'test-order',cancelInput:{owner:'public-test-owner',positionRequestPubkey:'test-order',path:'orders/limit'}};
const outcome={kind:'predict',venue:'pmamm',market:'TEST',symbol:'TEST',owner:'public-test-owner',side:'SELL',outcomeSide:'yes',sharesRaw:'1000000',sizeUsd:1,flattenAction:'outcome'};
async function until(fn){for(let i=0;i<500;i++){if(fn())return;await delay(10);}throw Error('F4 state timeout');}
function harness({legs=[perp,outcome,cancel],messages=[],changed=false,refuse=false,pause=false,handoff=false}={}){
 const calls=[],events=[];let reads=0,engine,release;
 const signals=new SignalQueue({gate:e=>engine.allows(e.id,e.proposal)?e.proposal:{...e.proposal,verdict:{action:'REJECT',why:['killed']}}});
 engine=new PanicFlatten({inventory:async()=>({legs:changed && reads++?[{...perp,sizeUsd:20}]:legs,messages}),signals,
  propose:async signal=>({signal,verdict:{action:refuse?'REJECT':'EXECUTE',sizeUsd:signal.sizeUsd,autoAccept:false,why:['local coordination vector']}}),
  executor:{execute:async id=>{const e=signals.get(id);assert(engine.allows(id,e.proposal));calls.push(e.proposal.signal.flattenAction);
   if(pause)await new Promise(r=>release=r);return handoff?{ok:true,handoff:true}:{ok:true,receipt:true};}},
  killed:()=>true,publish:(_device,r)=>events.push(r)});
 return {engine,signals,calls,events,release:()=>release?.()};
}
const answer=(p,action='yes',extra={})=>({action:'flatten:'+action,planId:p.id,fingerprint:p.fingerprint,heldMs:800,...extra});
test('F4 YES executes only the displayed reduce-only plan, cancellations first, and NO executes nothing',async()=>{
 for(const key of ['yes','no']){
  const h=harness();try{
   const p=await h.engine.begin('pad');assert.equal(p.state,'awaiting');assert.equal(p.orders,1);assert.equal(p.perps,1);assert.equal(p.outcomes,1);assert.deepEqual(h.calls,[]);
   assert.equal((await h.engine.begin('pad')).id,p.id); // One plan per latch, no repeated tick proposal.
   await h.engine.answer('pad',answer(p,key));
   await until(()=>['complete','refused'].includes(h.engine.record('pad').state));
   assert.deepEqual(h.calls,key==='yes'?['cancel','perp','outcome']:[]);
   await assert.rejects(h.engine.answer('pad',answer(p)),/No live/);
   assert.equal(h.engine.killed('pad'),true);
  }finally{h.signals.close();}
 }
});
test('F4 waits for confirmed queue state after each handoff before starting the next leg',async()=>{
 const h=harness({handoff:true});try{
  const p=await h.engine.begin('pad');await h.engine.answer('pad',answer(p));
  for(let i=0;i<3;i++){
   await until(()=>h.calls.length===i+1);await delay(10);assert.equal(h.calls.length,i+1);
   const entry=h.signals.list().find(e=>e.state==='accepted');assert(entry);
   await h.signals.transition(entry.id,'signed');await delay(10);assert.equal(h.calls.length,i+1);
   await h.signals.transition(entry.id,'executed');
  }
  await until(()=>h.engine.record('pad').state==='complete');assert.deepEqual(h.calls,['cancel','perp','outcome']);
 }finally{h.signals.close();}
});
test('F4 stale identities, short holds, changed inventory, permission refusal and cancelled grants cannot trade',async()=>{
 const h=harness({pause:true});try{
  const p=await h.engine.begin('pad');
  for(const change of [{planId:'old'},{fingerprint:'changed'},{heldMs:799},{heldMs:NaN}])await assert.rejects(h.engine.answer('pad',answer(p,'yes',change)));
  await assert.rejects(h.engine.answer('other-pad',answer(p)));
  await h.engine.answer('pad',answer(p));await until(()=>h.calls.length===1);
  const e=h.signals.list().find(e=>e.state==='accepted');assert(h.engine.allows(e.id,e.proposal,'pad'));
  assert.equal(h.engine.allows(e.id,e.proposal,'other'),false);
  assert.equal(h.engine.allows(e.id,{...e.proposal,signal:{...e.proposal.signal,reduceOnly:false}}),false);
  h.engine.cancel('pad');assert.equal(h.engine.allows(e.id,e.proposal),false);h.release();await delay(20);assert.deepEqual(h.calls,['cancel']);
 }finally{h.signals.close();}
 for(const options of [{changed:true},{refuse:true}]){const h=harness(options);try{const p=await h.engine.begin('pad');await h.engine.answer('pad',answer(p));await until(()=>h.engine.record('pad').state==='failed');assert.deepEqual(h.calls,[]);}finally{h.signals.close();}}
 const p=flattenPlan({legs:[perp]},'old',Date.now()-60000).record;
 const expired=harness();try{const live=await expired.engine.begin('pad');
  // Public expiry vector also proves the displayed fingerprint is episode-bound.
  assert.notEqual(p.fingerprint,live.fingerprint);await assert.rejects(expired.engine.answer('pad',answer(p)));
  expired.engine.now=()=>Date.now()+60000;await assert.rejects(expired.engine.answer('pad',answer(live)),/Setup required/);assert.deepEqual(expired.calls,[]);
 }finally{expired.signals.close();}
});
test('F4 refuses opening/partial/invalid plans, preserves Setup/empty, caps and mainnet gate',async()=>{
 const p=flattenPlan({legs:[perp]});assert(isFlattenLeg(p.signals[0]));
 for(const change of [{reduceOnly:false},{reducePct:50},{side:'LONG'},{source:'other'},{sizeUsd:0},{sizeUsd:20},{positionId:'other'},{flattenAction:'open'}])assert.equal(isFlattenLeg({...p.signals[0],...change}),false);
 const shares=flattenPlan({legs:[outcome]}).signals[0];assert(isFlattenLeg(shares));assert.equal(isFlattenLeg({...shares,sizeUsd:0.5}),false);
 assert.equal(flattenPlan({legs:Array(33).fill(perp)}).record.state,'setup');
 assert.equal(flattenPlan({legs:[perp,perp]}).record.state,'setup');assert.equal(flattenPlan({legs:[{kind:'open'}]}).record.state,'setup');
 assert.equal(flattenPlan({legs:[],messages:['Setup required: missing public authority']}).record.state,'setup');
 assert.equal(flattenPlan({legs:[]}).record.state,'empty');
 assert.equal(tiltReceipt({}, {...cancel,reduceOnly:true},'4.0.0').closed,false);
 assert.equal(tiltReceipt({}, {...perp,reduceOnly:true},'4.0.0').closed,true);
 const brief={limits:{allow:['TEST'],max_trade_usd:10,max_day_usd:30,max_leverage:1},spent_today:0};
 assert.equal(decide(p.signals[0],brief,{policy:{...DEFAULT_POLICY,maxTradeUsd:0}}).action,'REJECT');
 const old=process.env.XORR_ALLOW_MAINNET;delete process.env.XORR_ALLOW_MAINNET;
 try{await assert.rejects(buildRouted({signal:p.signals[0],verdict:{action:'EXECUTE',sizeUsd:10},routing:{best:{network:'mainnet-beta',venue:'jupperps'}}},{owner:perp.owner}),/mainnet/i);}
 finally{if(old!==undefined)process.env.XORR_ALLOW_MAINNET=old;}
});
process.env.PAD_TOKEN='f4-public-test';
delete process.env.SOLANA_ADDRESS;delete process.env.PHOENIX_AUTHORITY;delete process.env.JUPPERPS_AUTHORITY;
const {createServer}=await import('../main/server.mjs');
test('F4 actual encrypted killed pad gets honest live Setup, refuses YES/ordinary keys, accepts NO and preserves rearm',{timeout:90000},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'xorr-f4-'));process.env.XORR_USER_DATA=dir;
 const mem=new Memory({db:path.join(dir,'memory.db')}),server=createServer(mem);
 const pad=new FlattenPadSimulator({device:'f4-panic-pad',serial:true,fragmentBytes:19,sessionStateFile:path.join(dir,'public-accounting.json')});let browser;
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  await pad.listen(8724);const peer=server.padlink.attach(net.createConnection(8724,'127.0.0.1'),'usb');
  await until(()=>peer.candidate);server.padlink.pair(pad.pairing);await until(()=>peer.verified&&pad.verified);
  assert.throws(()=>pad.kill(1999),/2s/);pad.kill(2000);
  const record=await pad.waitFor(m=>m.type==='flatten'&&m.state==='setup');assert.equal(record.reduceOnly,true);assert.match(record.message,/Setup required/);
  assert.equal(server.padlink.killed.has(pad.device),true);assert.equal(peer.status?.armed ?? server.padlink.getStatus(peer).armed,false);
  await assert.rejects(pad.key('yes',{heldMs:800}),/Setup required/);await assert.rejects(pad.key('buy'),/killed/);
  const id=pad.device+':'+(++pad.seq);pad.send({type:'key',id,edge:'down',...answer(record)});
  assert.equal((await pad.waitFor(m=>m.type==='result'&&m.id===id)).ok,false);assert.equal(server.signals.list().length,0);
  await mkdir(new URL('../../firmware/build/',import.meta.url),{recursive:true});await writeFile(new URL('../../firmware/build/f4-flatten-setup.json',import.meta.url),JSON.stringify(record,null,2));
  const out=new URL('../../docs/screens/v4/',import.meta.url);await mkdir(out,{recursive:true});
  browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(base+'/?token=f4-public-test#device');
  for(const width of [1440,375]){await page.setViewportSize({width,height:960});await delay(1000);await page.screenshot({path:fileURLToPath(new URL(`flatten-device-${width}.png`,out)),fullPage:true,animations:'disabled'});}
  const no=await pad.key('no');assert.equal((await pad.waitFor(m=>m.type==='result'&&m.id===no)).ok,true);
  await until(()=>peer.flatten.state==='refused');assert(server.padlink.killed.has(pad.device));assert.equal(server.signals.list().length,0);
  server.padlink.rearm(pad.device);await pad.waitFor(m=>m.type==='rearm_request');pad.pressConfirm();await delay(810);pad.confirm();
  await pad.waitFor(m=>m.type==='rearm_complete');await until(()=>!server.padlink.killed.has(pad.device));assert.equal(pad.killed,false);
 }finally{await browser?.close();server.padlink.close();await pad.close();await new Promise(r=>server.close(r));mem.stop();delete process.env.XORR_USER_DATA;await rm(dir,{recursive:true,force:true});}
});
