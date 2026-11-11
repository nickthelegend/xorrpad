/** Shared read-only router. Spot size is input units (USDC to buy, asset to sell).
 * Perp size is USD collateral; predict size is devnet mUSDC. No venue signs.
 */
import * as jupiter from './chains/solana.mjs';
import * as meteora from './chains/meteora.mjs';
import * as phoenix from './chains/phoenix.mjs';
import * as jupperps from './chains/jupperps.mjs';
import * as pmamm from './chains/pmamm.mjs';
import {tokenOf} from './spot-book.mjs';
const TIMEOUT=25000;
async function bounded(fn,ms=TIMEOUT){
 let timer;
 try{return await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`venue timed out after ${ms}ms`)),ms);})]);}
 finally{clearTimeout(timer);}
}
export function spotFees(q,market){
 if(q.feeUsd!=null)return {usd:q.feeUsd,basis:'included in quoted output'};
 const target=tokenOf(market).mint,usdc=tokenOf('USDC').mint;
 const details=(q.raw?.routePlan||[]).map(r=>r.swapInfo).filter(Boolean);
 // Jupiter may omit fee data. Unknown never becomes zero.
 if(!details.length||details.some(d=>d.feeAmount==null||!d.feeMint))return {usd:null,basis:'Jupiter output includes route fees; separate fee data unavailable'};
 let usd=0;
 for(const d of details){
  if(d.feeMint===usdc)usd+=Number(d.feeAmount)/1e6;
  else if(d.feeMint===target){
   const decimals=q.raw.inputMint===target?Number(q.raw.inAmount)/q.amountIn:Number(q.raw.outAmount)/q.amountOut;
   usd+=Number(d.feeAmount)/decimals*q.price;
  }else return {usd:null,basis:'included in output; intermediate mint fee has no USD conversion',details};
 }
 return {usd,basis:'included in quoted output',details};
}
const REGISTRY=[
 {venue:'jupiter',kind:'spot',network:'mainnet-beta',signing:'external unsigned',list:()=>jupiter.markets().symbols,health:()=>jupiter.quote('USDC','SOL',1)},
 {venue:'meteora',kind:'spot',network:'mainnet-beta',signing:'external unsigned',list:()=>meteora.markets()},
 {venue:'phoenix',kind:'perp',network:'mainnet-beta',signing:'external unsigned',list:()=>phoenix.perpMarkets()},
 {venue:'jupperps',kind:'perp',network:'mainnet-beta',signing:'external unsigned API build',list:()=>jupperps.perpMarkets()},
 {venue:'pmamm',kind:'predict',network:'devnet',signing:'external unsigned',list:()=>pmamm.markets()},
];
export async function venues({includeMarkets=false}={}){
 return Promise.all(REGISTRY.map(v=>bounded(async()=>{
  const [rows]=await Promise.all([v.list(),v.health?.()]);
  return {venue:v.venue,kind:v.kind,network:v.network,signing:v.signing,ok:true,
   ...(includeMarkets?{markets:[...new Map(rows.map(r=>{const market=typeof r==='string'?r:r.market;return [market,{market,name:typeof r==='string'?r:r.name,markPrice:r.markPrice??null,observedAt:r.observedAt??null}];})).values()]}:{}),
   marketCount:new Set(rows.map(r=>typeof r==='string'?r:r.market)).size,
   ...(v.venue==='meteora'?{poolCount:rows.length}:{}),
   ...(v.venue==='jupiter'?{marketCountSource:'pinned mint catalog; each market still requires a live quote'}:{}),observedAt:new Date().toISOString()};
 }).catch(e=>({venue:v.venue,kind:v.kind,network:v.network,signing:v.signing,ok:false,marketCount:null,error:e.message}))));
}
export async function route({kind,market,side,size,leverage=1}){
 side=String(side||'').toLowerCase();size=Number(size);leverage=Number(leverage);
 if(!['spot','perp','predict'].includes(kind))throw new Error('kind must be spot, perp or predict');
 if(typeof market!=='string'||!market)throw new Error('market is required');
 if(!Number.isFinite(size)||size<=0)throw new Error('size must be positive');
 if(!({spot:['buy','sell'],perp:['long','short'],predict:['yes','no']}[kind].includes(side)))throw new Error(`invalid side for ${kind}`);
 if(kind==='perp'&&(!Number.isFinite(leverage)||leverage<1))throw new Error('leverage must be at least 1');
 if(kind==='spot')market=tokenOf(market).symbol;
 if(kind==='perp')market=market.toUpperCase().replace(/-PERP$/,'');
 const candidates=REGISTRY.filter(v=>v.kind===kind);
 const results=await Promise.all(candidates.map(v=>bounded(async()=>{
  let q,liquidity=null,liquidityUnit=null;
  if(kind==='spot'){
   if(v.venue==='meteora'&&!(await meteora.markets(market)).length)return {venue:v.venue,status:'unlisted',error:'market has no direct USDC DLMM pool',why:['no direct USDC DLMM listing']};
   const adapter=v.venue==='jupiter'?jupiter:meteora;
   q=await adapter.quote(side==='buy'?'USDC':market,side==='buy'?market:'USDC',size);
  }else{
   const adapter=v.venue==='phoenix'?phoenix:v.venue==='jupperps'?jupperps:pmamm;
   const rows=await v.list(),m=rows.find(m=>m.market===market);
   if(!m)return {venue:v.venue,status:'unlisted',error:'market is not listed',why:['venue does not list this market']};
   liquidity=m.liquidity??m.poolLiquidityUsd??null;
   liquidityUnit=m.liquidityUnit??(m.poolLiquidityUsd!=null?'USD JLP AUM':null);
   q=kind==='perp'?await adapter.perpQuote({market,side,usd:size,leverage}):await pmamm.quote({market,side,usdc:size});
  }
  const price=q.price??q.entryPrice,fees=kind==='spot'?spotFees(q,market):{usd:q.fee,basis:kind==='predict'?'mUSDC; charged in addition to execution price':q.feeBasis||q.quoteBasis};
  if(!Number.isFinite(price)||price<=0)throw new Error('venue returned invalid quote price');
  const normalized={venue:v.venue,status:'quoted',kind,market,side,network:v.network,price,fees,
   impact:q.impactPct??q.priceImpactPct??null,impactUnit:'percent',liquidity:q.liquidity??liquidity,
   liquidityUnit:q.liquidityUnit??liquidityUnit,quote:q,why:[]};
  // Spot output already includes fees; perp effective price includes entry fee.
  normalized.effectivePrice=kind==='spot'?price:kind==='perp'?price+(side==='short'?-1:1)*q.fee/q.baseUnits:price+q.fee/q.expectedShares;
  if(!Number.isFinite(normalized.effectivePrice))throw new Error('venue returned invalid effective price');
  if(normalized.liquidity===null)normalized.why.push('venue does not expose liquidity in its quote');
  if(q.quoteBasis)normalized.why.push(q.quoteBasis);
  if(q.poolSelection)normalized.why.push(q.poolSelection);
  return normalized;
 }).catch(e=>({venue:v.venue,status:'error',error:e.message,why:['venue failed; no quote substituted']}))));
 const quoted=results.filter(r=>r.status==='quoted');
 const maximize=side==='sell'||side==='short';
 quoted.sort((a,b)=>kind==='spot'?b.quote.amountOut-a.quote.amountOut:maximize?b.effectivePrice-a.effectivePrice:a.effectivePrice-b.effectivePrice);
 const best=quoted[0]||null;
 if(best)best.why.unshift(kind==='spot'?'highest net output for identical input size':`${maximize?'highest':'lowest'} effective entry price including quoted opening fees; ongoing funding/borrow excluded`);
 for(const r of quoted.slice(1))r.why.unshift('less favorable quoted execution than best');
 return {kind,market,side,size,leverage:kind==='perp'?leverage:undefined,best,
  alternatives:results.filter(r=>r!==best),observedAt:new Date().toISOString(),
  sizeUnit:kind==='spot'?(side==='buy'?'USDC':market):kind==='perp'?'USD collateral':'devnet mUSDC'};
}
