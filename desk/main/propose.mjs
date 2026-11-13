/** One proposal path for keys, voice, strategy agents and the propose endpoint. */
import {readPerps,reducePosition} from './perps-cockpit.mjs';
import {assertSigningCluster} from './session-wallet.mjs';
import {route} from './aggregate.mjs';
import {decide} from './decide.mjs';
import * as jupiter from './chains/solana.mjs';
import * as meteora from './chains/meteora.mjs';
import * as phoenix from './chains/phoenix.mjs';
import * as jupperps from './chains/jupperps.mjs';
import * as pmamm from './chains/pmamm.mjs';
import {isFlattenLeg} from './panic-flatten.mjs';
export async function propose(signal,brief,{price}={}) {
 const kind=signal.kind||(['LONG','SHORT'].includes(signal.side)?'perp':'spot');
 const sig={...signal,kind,...(kind==='perp'?{leverage:signal.leverage??1}:{})};
 let verdict=decide(sig,brief);
 if(sig.manualConfirmation || sig.reduceOnly)verdict.autoAccept=false;
 if(verdict.action!=='EXECUTE')return {signal:sig,verdict,routing:null};
 if(sig.source==='pad-flatten') {
  if(!isFlattenLeg(sig) || verdict.sizeUsd!==sig.sizeUsd)throw Error('invalid or capped Flatten all leg');
  const adapter=sig.venue==='phoenix'?phoenix:sig.venue==='jupperps'?jupperps:pmamm;
  const q=sig.flattenAction==='cancel'?null:sig.flattenAction==='perp'?await adapter.quoteClose(sig.closeInput):await pmamm.quoteReduce(sig);
  return {signal:sig,verdict:{...verdict,autoAccept:false},routing:{best:{venue:sig.venue,network:sig.venue==='pmamm'?'devnet':'mainnet-beta',
   market:sig.market,effectivePrice:q?.entryPrice ?? q?.price,fees:{usd:q?.fee},quote:q},alternatives:[]}};
 }
 if(sig.reduceOnly) {
  const positions=(await readPerps()).positions;
  const input=reducePosition(sig,positions,verdict.sizeUsd);
  const p=positions.find(p=>p.id===sig.positionId);
  const q=await (sig.venue==='phoenix'?phoenix:jupperps).quoteClose(input);
  sig.manualConfirmation=true;verdict.autoAccept=false;
  return {signal:sig,verdict,routing:{best:{venue:sig.venue,network:p.cluster,market:p.market,
    side:sig.side.toLowerCase(),effectivePrice:q.entryPrice,fees:{usd:q.fee},quote:q,closeInput:input},alternatives:[]}};
 }
 let size=verdict.sizeUsd;
 if(kind==='spot'&&sig.side==='SELL'){
  // Identical base input across venues, derived from a real quoted reference.
  if(!(price>0)){
   const reference=await route({kind:'spot',market:sig.symbol,side:'buy',size});
   price=reference.best?.price;
  }
  if(!(price>0))return {signal:sig,verdict:{...verdict,action:'REJECT',sizeUsd:0,ruleId:'routing.no_reference',rules:[...verdict.rules,'routing.no_reference'],why:[...verdict.why,'no live reference price for sell sizing']},routing:null};
  size/=price;
  if(brief?.positions?.[sig.symbol]?.qty!=null)size=Math.min(size,brief.positions[sig.symbol].qty);
 }
 const routing=await route({kind,market:sig.market||sig.symbol,side:sig.outcomeSide||sig.side,size,leverage:sig.leverage});
 if(!routing.best)return {signal:sig,routing,verdict:{...verdict,action:'REJECT',sizeUsd:0,ruleId:'routing.no_quote',rules:[...verdict.rules,'routing.no_quote'],why:[...verdict.why,'no venue returned a quote; see routing alternatives']}};
 sig.venue=routing.best.venue;
 verdict=decide(sig,brief);
 if(sig.manualConfirmation || sig.reduceOnly)verdict.autoAccept=false;
 return {signal:sig,verdict,routing};
}
export async function buildRouted(proposal, {owner, request = true} = {}) {
 const {signal:sig,verdict,routing}=proposal,best=routing?.best;
 if(verdict.action!=='EXECUTE'||!best)throw new Error('proposal was not approved by the gate');
 if(sig.source==='pad-flatten') {
  assertSigningCluster(best.network);if(!isFlattenLeg(sig) || verdict.sizeUsd!==sig.sizeUsd || best.venue!==sig.venue || owner!==sig.owner)throw Error('invalid Flatten all route or owner');
  const adapter=sig.venue==='phoenix'?phoenix:sig.venue==='jupperps'?jupperps:pmamm;
  return sig.flattenAction==='cancel'?adapter.buildCancel(sig.cancelInput,{request}):sig.flattenAction==='perp'?adapter.buildClose(sig.closeInput,{request}):pmamm.buildReduce(sig,{request});
 }
 if(sig.reduceOnly) {
  assertSigningCluster(best.network);
  if(!best.closeInput || best.closeInput.reducePct!==50)throw Error('invalid reduce-only route');
  if(owner && owner!==best.closeInput.authority)throw Error('reduce-only owner differs from live position authority');
  return (best.venue==='phoenix'?phoenix:jupperps).buildClose(best.closeInput,{request});
 }
 if(sig.kind==='spot')return (best.venue==='meteora'?meteora:jupiter).buildSwap(best.quote,owner || process.env.SOLANA_ADDRESS,{request});
 if(sig.kind==='perp')return best.venue==='phoenix'
  ?phoenix.buildOpen({authority:owner||process.env.PHOENIX_AUTHORITY||process.env.SOLANA_ADDRESS,market:best.market,side:best.side,usd:verdict.sizeUsd,leverage:sig.leverage})
  :jupperps.buildOpen({owner:owner||process.env.JUPPERPS_AUTHORITY||process.env.SOLANA_ADDRESS,market:best.market,side:best.side,usd:verdict.sizeUsd,leverage:sig.leverage});
 return pmamm.buildSwap({owner:owner||process.env.SOLANA_ADDRESS,market:best.market,side:best.side,usdc:verdict.sizeUsd},{request});
}
