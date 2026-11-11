/** Real Pyth history and venue reads. Only unreachable dependencies are skipped. */
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {History,HistoryUnavailable} from '../main/history.mjs';
import {replay,backtest} from '../main/backtest.mjs';
import {feeSchedule,fundingHistory} from '../main/backtest-fees.mjs';
import {replayPrediction} from '../main/prediction-backtest.mjs';
import {BOOK} from '../main/strategies.mjs';
const dir=await mkdtemp(path.join(tmpdir(),'xorrpad-t6-'));
after(()=>rm(dir,{recursive:true,force:true}));
const history=new History({dir}),from=1793491200,to=1794096000;
let historyPromise;
async function real(t) {
  historyPromise??=history.get({symbol:'SOL',from,to});
  try{return await historyPromise;}
  catch(e){if(!(e instanceof HistoryUnavailable))throw e;console.log(`SKIP: ${e.message}`);t.skip(e.message);return null;}
}
const options={symbol:'SOL',from,to,venue:'phoenix',strategy:'rule',tradeUsd:100,
  rule:{name:'positive price',entry:[{left:{indicator:'close'},op:'gt',right:0}],maxHoldMin:240,stopPct:99,takeProfitPct:99}};
const unavailable=e=>/fetch failed|ECONN|ENOTFOUND|timeout|timed out|HTTP (401|403|408|429|5\d\d)/i.test(e.message);
test('real Phoenix fee schedule and historical funding payments',{timeout:60000},async t=>{
  let fees;
  try{fees=await feeSchedule('phoenix','SOL',100);}catch(e){if(!unavailable(e))throw e;t.skip(e.message);return;}
  assert.ok(fees.entryRate>0&&fees.exitRate===fees.entryRate);assert.match(fees.basis,/Current observed/);
  const funding=await fundingHistory('phoenix','SOL',from,to);
  if(funding.status==='funding not modelled') {console.log(`SKIP funding dependency: ${funding.reason}`);t.skip(funding.reason);return;}
  assert.ok(funding.events.length>0);assert.ok(funding.events.every(e=>e.t>from*1000&&e.t<=to*1000&&Number.isFinite(e.usdPerUnit)));
  console.log(`REAL Phoenix taker rate ${fees.entryRate}; ${funding.events.length} historical payments; ${funding.status}`);
  const missing=await fundingHistory('jupperps','SOL',from,to);assert.equal(missing.status,'funding not modelled');assert.deepEqual(missing.events,[]);
});
test('real Jupiter Perps on-chain opening and closing fee schedules',{timeout:60000},async t=>{
  let fees;
  try{fees=await feeSchedule('jupperps','SOL',10);}catch(e){if(!unavailable(e))throw e;t.skip(e.message);return;}
  assert.ok(fees.entryRate>0&&fees.entryRate<1&&fees.exitRate>0&&fees.exitRate<1);
  assert.ok(Number.isSafeInteger(fees.slot));assert.match(fees.source,/on-chain increase\/decrease/);
  console.log(`REAL Jupiter Perps $10 fee snapshot: entry ${fees.entryRate}, exit ${fees.exitRate}, slot ${fees.slot}`);
});
test('real Jupiter route fees are disclosed or fail explicitly, never assumed zero',{timeout:60000},async t=>{
  try {
    const fees=await feeSchedule('jupiter','SOL',10);
    assert.ok(Number.isFinite(fees.entryRate)&&fees.entryRate>=0&&Number.isFinite(fees.exitRate)&&fees.exitRate>=0);
    assert.match(fees.source,/routePlan/);console.log(`REAL Jupiter spot fee snapshot: entry ${fees.entryRate}, exit ${fees.exitRate}`);
  } catch(e) {
    if(e.message==='Setup required: Jupiter route fee disclosure for both trade legs') {
      assert.match(e.message,/Setup required:/);console.log(`REAL Jupiter route: ${e.message}`);return;
    }
    if(!unavailable(e))throw e;t.skip(e.message);
  }
});
test('real Pyth candles cache, corrupt cache recovery, no fabricated volume and equity reference',{timeout:120000},async t=>{
  const h=await real(t);if(!h)return;
  assert.ok(h.candles.length>100);assert.ok(h.candles.every((c,i)=>c.t>=from*1000&&c.tClose<=to*1000&&(!i||c.t>h.candles[i-1].t)));
  const hit=await history.get({symbol:'SOL',from,to});assert.deepEqual(hit.candles,h.candles);assert.equal(hit.networkRequests,0);assert.ok(hit.cacheHits>0);
  assert.equal(h.volumeAvailable,h.candles.some(c=>c.volume>0));
  const cacheDir=path.join(dir,'history','pyth-v1'),file=(await readdir(cacheDir))[0];
  await writeFile(path.join(cacheDir,file),'corrupt cache');
  const recovered=await history.get({symbol:'SOL',from,to});assert.ok(recovered.networkRequests>0);assert.deepEqual(recovered.candles,h.candles);
  let equity;
  try{equity=await history.get({symbol:'AAPLx',from,to});}catch(e){if(!(e instanceof HistoryUnavailable))throw e;t.skip(e.message);return;}
  assert.equal(equity.symbol,'Equity.US.AAPL/USD');assert.ok(equity.candles.length>0);
  console.log(`REAL Pyth SOL ${h.candles.length} bars, AAPL ${equity.candles.length} bars; cache re-read and corruption recovery verified`);
});
test('real history replay accounts for both fees, funding, slippage, sizing, exits and metrics',{timeout:120000},async t=>{
  const h=await real(t);if(!h)return;
  let fees;try{fees=await feeSchedule('phoenix','SOL',100);}catch(e){if(!unavailable(e))throw e;t.skip(e.message);return;}
  const funding=await fundingHistory('phoenix','SOL',from,to),r=replay({candles:h.candles,options,fees,funding});
  assert.ok(r.trades.length>0);assert.equal(r.tradeCount,r.trades.length);
  assert.ok(Math.abs(r.pnl-r.trades.reduce((a,b)=>a+b.pnl,0))<1e-8);
  for(const trade of r.trades) {
    assert.ok(trade.entryTime>=trade.signalTime);assert.ok(trade.exitTime>trade.entryTime);
    assert.ok(trade.entryFee>0&&trade.exitFee>0);assert.ok(Math.abs(trade.pnl-(trade.grossPnl-trade.fees-trade.funding))<1e-9);
    assert.ok(trade.qty*trade.entryPrice<=options.tradeUsd+1e-9);
    const payments=funding.events.filter(e=>e.t>trade.entryTime&&e.t<=trade.exitTime);
    assert.ok(Math.abs(trade.funding-trade.qty*trade.direction*payments.reduce((a,b)=>a+b.usdPerUnit,0))<1e-9);
  }
  assert.ok(r.exposure>0&&r.exposure<=1);assert.ok(Number.isFinite(r.maxDrawdownPct));
  assert.equal(r.equityCurve.at(-1).equity,r.finalEquity);
  const highSlip=replay({candles:h.candles,options:{...options,slippageBps:100},fees,funding});
  assert.ok(highSlip.pnl<r.pnl);
  const short=replay({candles:h.candles,options:{...options,rule:{...options.rule,side:'short'}},fees,funding});
  assert.ok(short.trades.every(t=>t.direction===-1));
  console.log(`REAL replay ${r.tradeCount} trades, PnL $${r.pnl}, funding ${r.funding.status}`);
});
test('no look-ahead: delayed real data delays decisions; truncated/future-shifted paths preserve past fills',{timeout:120000},async t=>{
  const h=await real(t);if(!h)return;
  let fees;try{fees=await feeSchedule('phoenix','SOL',100);}catch(e){if(!unavailable(e))throw e;t.skip(e.message);return;}
  const c=h.candles,first=c[0].close,values=c.slice(1,-2).map(b=>b.close),hi=Math.max(...values),lo=Math.min(...values);
  assert.ok(hi>lo,'real path must move');
  const condition=hi>first?{op:'gt',right:(first+hi)/2}:{op:'lt',right:(first+lo)/2};
  const opts={...options,rule:{...options.rule,maxHoldMin:525600,entry:[{left:{indicator:'close'},...condition}]}};
  const full=replay({candles:c,options:opts,fees});assert.ok(full.trades.length>0);
  const delayed=c.map((b,i)=>({...c[Math.max(0,i-1)],t:b.t,tClose:b.tClose}));
  const shifted=replay({candles:delayed,options:opts,fees});
  assert.equal(shifted.trades[0].signalTime,full.trades[0].signalTime+3600000);
  assert.equal(shifted.trades[0].entryTime,full.trades[0].entryTime+3600000);
  assert.equal(shifted.trades[0].entryPrice,full.trades[0].entryPrice);
  assert.notDeepEqual(shifted.equityCurve,full.equityCurve);
  const cut=Math.floor(c.length*0.6),cutTime=c[cut].t;
  const prefix=replay({candles:c.slice(0,cut),options,fees});
  const futureShift=c.map((b,i)=>i<cut?b:{...c[c.length-1-(i-cut)],t:b.t,tClose:b.tClose});
  const changed=replay({candles:futureShift,options,fees}),original=replay({candles:c,options,fees});
  const entries=r=>r.trades.filter(b=>b.entryTime<cutTime).map(({signalTime,entryTime,entryPrice,qty,entryFee})=>({signalTime,entryTime,entryPrice,qty,entryFee}));
  assert.deepEqual(entries(prefix),entries(original));assert.deepEqual(entries(changed),entries(original));
  console.log('REAL shifted path delayed the first decision/fill by one hour; changing the future preserved every prior fill');
});
test('every book strategy uses real Pyth data and gate warmup; volume absence is explicit',{timeout:120000},async t=>{
  const h=await real(t);if(!h)return;
  let fees,daily,btc;
  try{[fees,daily,btc]=await Promise.all([feeSchedule('phoenix','SOL',100),history.get({symbol:'BTC',from:from-202*86400,to,resolution:'1D'}),history.get({symbol:'BTC',from,to})]);}
  catch(e){if(!(e instanceof HistoryUnavailable)&&!unavailable(e))throw e;t.skip(e.message);return;}
  for(const strategy of ['book',...Object.keys(BOOK)]) {
    const r=replay({candles:h.candles,options:{...options,strategy,rule:undefined},fees,btcDaily:daily.candles,btcHourly:btc.candles});
    assert.ok(Number.isFinite(r.pnl));
    if(!h.volumeAvailable&&['volume_thrust','stretch_capitulation'].includes(strategy))assert.equal(r.tradeCount,0);
    console.log(`REAL BOOK ${strategy}: ${r.tradeCount} trades, PnL $${r.pnl}`);
  }
  const result=await backtest({...options,strategy:'mr_band_fade',rule:undefined},{history});assert.equal(result.history.barCount,h.candles.length);
});
test('prediction exact helpers replay real Pyth path and disclose counterfactual edge',{timeout:120000},async t=>{
  const h=await real(t);if(!h)return;
  const input={symbol:'SOL',from,to,strike:h.candles[0].close,liquidityUsdc:1000,lookback:20,minEdgePct:0};
  const r=replayPrediction(h.candles,input);
  assert.match(r.model.pool,/Counterfactual/);assert.match(r.model.fees,/2%/);
  assert.equal(r.outcome,h.candles.at(-1).close>input.strike?'yes':'no');assert.ok(r.trades.length<=1);
  if(r.trades.length) {const trade=r.trades[0];assert.equal(trade.pnl,trade.payout-trade.cost);assert.ok(Math.abs(trade.fee-trade.cost*0.02)<1e-6);}
  const cut=Math.floor(h.candles.length/2);
  const changed=h.candles.map((b,i)=>i<cut?b:{...h.candles[h.candles.length-1-(i-cut)],t:b.t,tClose:b.tClose});
  const shifted=replayPrediction(changed,input);
  assert.deepEqual(shifted.observations.filter(p=>p.t<h.candles[cut].t),r.observations.filter(p=>p.t<h.candles[cut].t));
  console.log(`REAL underlying prediction model: expected edge ${r.edge.expectedPct}%, realized ${r.edge.realizedPct}%, ${r.tradeCount} trades`);
});
