// MIT · Copyright (c) 2026 Nivesh Gajengi
import * as phoenix from './chains/phoenix.mjs';
import * as jupperps from './chains/jupperps.mjs';
const positive = n => Number.isFinite(n) && n > 0 ? n : null;
export function liquidationDistance(mark, liq, side) {
  if (!positive(mark) || !positive(liq) || !['long','short'].includes(side)) return null;
  return Math.max(0, (side === 'long' ? mark-liq : liq-mark) / mark * 100);
}
export function cockpitPosition(p, venue) {
  if (!['phoenix','jupperps'].includes(venue) || !p.market || !['long','short'].includes(p.side)) throw Error('invalid perp position');
  const id = venue === 'phoenix' ? `${p.authority}:${p.traderPdaIndex}:${p.subaccountIndex}:${p.market}` : p.position;
  if (!id) throw Error('invalid perp position identity');
  return {id,venue,cluster:'mainnet-beta',market:p.market,side:p.side,entry:positive(p.entryPrice),mark:positive(p.markPrice),
    leverage:positive(p.leverage),liq:positive(p.liquidationPrice),nextFunding:positive(p.nextFunding),
    distancePct:liquidationDistance(p.markPrice,p.liquidationPrice,p.side),
    pnl:Number.isFinite(p.unrealizedPnlUsd)?p.unrealizedPnlUsd:null,notionalUsd:positive(p.notionalUsd),
    position:p.position,authority:p.authority,traderPdaIndex:p.traderPdaIndex,subaccountIndex:p.subaccountIndex};
}
export async function readPerps() {
  const results=await Promise.allSettled([phoenix.positions(),jupperps.positions()]);
  const positions=[],messages=[];
  results.forEach((r,i)=>{
    const venue=i===0?'phoenix':'jupperps';
    if(r.status==='fulfilled') positions.push(...r.value.map(p=>cockpitPosition(p,venue)));
    else messages.push(`${venue}: Setup required: position feed unavailable or public authority not configured`);
  });
  return {type:'perps',positions,message:messages.join('; '),observedAt:new Date().toISOString()};
}
export function guardRecord(positions, pct=10) {
  if(!Number.isFinite(pct) || pct<=0 || pct>100)throw Error('invalid liqGuardPct');
  const p=positions.filter(p=>p.distancePct!==null && p.distancePct<=pct && p.notionalUsd>0)
    .sort((a,b)=>a.distancePct-b.distancePct)[0];
  return p ? {type:'liq_guard',active:true,market:p.market,mark:p.mark,liq:p.liq,distancePct:p.distancePct,
    proposal:{kind:'perp',market:p.market,side:p.side==='long'?'short':'long',venue:p.venue,positionId:p.id,
      reduceOnly:true,reducePct:50,size:p.notionalUsd/2,leverage:1,source:'pad-liq-guard'}} : {type:'liq_guard',active:false,proposal:null};
}
export function guardKey({peer,message,pending,killed,now=Date.now()}) {
  const g=peer.liqGuard;
  if(!peer.secure || !peer.verified || pending || killed || !g?.active || message.guardId!==g.id ||
    now-peer.perpsAt>=30000 || !['liq:yes','liq:no'].includes(message.action))throw Error('Liquidation guard unavailable: refresh the live position or finish the pending decision');
  return message.action==='liq:yes'?structuredClone(g.proposal):null;
}

export function reducePosition(sig, positions, approvedSize) {
  if(sig.kind!=='perp' || sig.reducePct!==50 || !['phoenix','jupperps'].includes(sig.venue) || !sig.positionId)
    throw Error('invalid reduce-only proposal');
  if(approvedSize!==sig.sizeUsd)throw Error('Reduce 50% exceeds caps; review permissions before proposing');
  const p=positions.find(p=>p.id===sig.positionId && p.venue===sig.venue && p.market===sig.market);
  if(!p || sig.side!==(p.side==='long'?'SHORT':'LONG'))throw Error('open perp position changed; refresh liquidation guard');
  if(!(p.notionalUsd>0) || Math.abs(p.notionalUsd/2-sig.sizeUsd)>Math.max(0.000001,sig.sizeUsd*1e-9))throw Error('position size changed; refresh liquidation guard');
  return {authority:p.authority,owner:p.authority,market:p.market,position:p.position,
    traderPdaIndex:p.traderPdaIndex,subaccountIndex:p.subaccountIndex,reducePct:50,
    expectedSide:p.side,expectedNotionalUsd:p.notionalUsd};
}
