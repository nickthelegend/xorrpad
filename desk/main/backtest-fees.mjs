import * as phoenix from './chains/phoenix.mjs';
import * as jupperps from './chains/jupperps.mjs';
import * as jupiter from './chains/solana.mjs';
import { spotFees } from './aggregate.mjs';

export async function feeSchedule(venue,market,tradeUsd) {
  let result;
  if(venue==='phoenix') {
    const m=(await phoenix.perpMarkets()).find(m=>m.market===market);
    if(!m)throw new Error(`invalid Phoenix market: ${market}`);
    result={kind:'perp',entryRate:m.takerFeeRate,exitRate:m.takerFeeRate,
      source:'Phoenix market metadata / standard taker',observedAt:new Date().toISOString()};
  } else if(venue==='jupperps') {
    result={kind:'perp',...await jupperps.backtestFees(market,tradeUsd),
      source:'Jupiter Perps on-chain increase/decrease and impact fee schedule at requested notional'};
  } else if(venue==='jupiter') {
    const buy=await jupiter.quote('USDC',market,tradeUsd);
    const sell=await jupiter.quote(market,'USDC',buy.amountOut);
    const entry=spotFees(buy,market),exit=spotFees(sell,market);
    if(entry.usd===null||exit.usd===null)throw new Error('Setup required: Jupiter route fee disclosure for both trade legs');
    result={kind:'spot',entryRate:entry.usd/tradeUsd,exitRate:exit.usd/(sell.amountIn*sell.price),
      source:'Jupiter current routePlan fee amounts, converted by the T1 adapter',
      observedAt:new Date().toISOString(),routes:{buy:buy.route,sell:sell.route}};
  } else throw new Error('invalid venue; use phoenix, jupperps or jupiter');
  if(![result.entryRate,result.exitRate].every(n=>Number.isFinite(n)&&n>=0&&n<1))throw new Error('invalid venue fee schedule');
  return {...result,venue,basis:'Current observed fee schedule applied to both historical legs; historical schedule changes, network fees and rent excluded.'};
}

/** Actual USD per base-unit payments, not a forward projection of today's rate. */
export async function fundingHistory(venue,market,from,to) {
  if(venue==='jupiter')return {status:'not applicable (spot)',events:[]};
  if(venue!=='phoenix')return {status:'funding not modelled',reason:'Jupiter historical borrow/funding payments are not exposed by the T1 adapter',events:[]};
  const events=new Map();
  try {
    for(let start=from;start<to;start+=7*86400) {
      const end=Math.min(to,start+7*86400);
      const url=new URL(`${phoenix.API}/v1/funding/overview/${encodeURIComponent(market)}`);
      url.search=new URLSearchParams({startTime:String(start*1000),endTime:String(end*1000),perMarketLimit:'2000'});
      const r=await fetch(url,{signal:AbortSignal.timeout(15000)});
      if(!r.ok)throw new Error(`Phoenix funding HTTP ${r.status}`);
      const j=await r.json();
      if(j.symbol!==market||!Array.isArray(j.points))throw new Error('invalid Phoenix funding response');
      for(const p of j.points) {
        const t=Number(p.timestamp)*1000,usdPerUnit=Number(p.fundingAmountPerUnit);
        if(!Number.isSafeInteger(t)||!Number.isFinite(usdPerUnit))throw new Error('invalid Phoenix funding payment');
        if(t>from*1000&&t<=to*1000)events.set(t,{t,usdPerUnit});
      }
    }
    const rows=[...events.values()].sort((a,b)=>a.t-b.t);
    const complete=rows.length>0&&rows[0].t-from*1000<5400000&&to*1000-rows.at(-1).t<5400000&&
      rows.every((p,i)=>!i||p.t-rows[i-1].t<5400000);
    return {status:complete?'historical funding included':'funding not modelled for missing intervals; available historical payments included',
      source:`${phoenix.API}/v1/funding/overview/${market}`,events:rows};
  } catch(e) {
    const rows=[...events.values()].sort((a,b)=>a.t-b.t);
    return {status:rows.length?'funding not modelled for missing intervals; available historical payments included':'funding not modelled',
      reason:e.message,source:`${phoenix.API}/v1/funding/overview/${market}`,events:rows};
  }
}
