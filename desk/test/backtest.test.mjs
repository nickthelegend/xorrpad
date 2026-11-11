/** Validation and arithmetic only; no fake market candles or service responses. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {historyRequest,pythSymbol,historyMint} from '../main/history.mjs';
import {metrics,validateBacktest,validateRule} from '../main/backtest.mjs';
import {validatePrediction} from '../main/prediction-backtest.mjs';
import {validateTool} from '../main/agent-tools.mjs';
const base={symbol:'SOL',from:1793491200,to:1794096000,strategy:'mr_band_fade',venue:'phoenix'};
test('Pyth symbols, bounded ranges, completed historical time and resolutions',()=>{
  assert.equal(pythSymbol('SOL-PERP'),'Crypto.SOL/USD');
  assert.equal(historyMint(pythSymbol('SOL-PERP')),'So11111111111111111111111111111111111111112');
  assert.equal(historyMint(pythSymbol('BTC-PERP')),'3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh');
  for(const s of ['AAPL','AAPLx','aaplx'])assert.equal(pythSymbol(s),'Equity.US.AAPL/USD');
  assert.equal(pythSymbol('Equity.US.NVDA/USD'),'Equity.US.NVDA/USD');
  assert.equal(historyRequest({...base,resolution:'D'}).step,86400);
  for(const bad of [{symbol:'../SOL'},{from:1.1},{to:base.from},{to:Math.ceil(Date.now()/1000)+100},{resolution:'bad'},{from:0,to:1e9}])
    assert.throws(()=>historyRequest({...base,...bad}),/invalid|must/);
});
test('bounded declarative rules reject arbitrary code, unknown operators, warmup and invalid sizing',()=>{
  const rule={name:'value',entry:[{left:{indicator:'rsi',period:14},op:'lt',right:30}],side:'short'};
  assert.equal(validateRule(rule),rule);
  assert.equal(validateBacktest({...base,strategy:'rule',rule}).initialCash,10000);
  for(const bad of [{strategy:'missing'},{venue:'missing'},{slippageBps:NaN},{slippageBps:1001},{tradeUsd:20000},
    {initialCash:0},{fees:{entryRate:0}},{candles:[]},{strategy:'rule',rule:{...rule,eval:'true'}},
    {strategy:'rule',rule:{...rule,entry:[{left:{indicator:'future',period:2},op:'gt',right:0}]}},
    {strategy:'rule',rule:{...rule,entry:[{left:1,op:'constructor',right:2}]}},
    {strategy:'rule',rule:{...rule,entry:[{left:{indicator:'ema',period:501},op:'gt',right:0}]}},
    {strategy:'rule',rule,venue:'jupiter'}])assert.throws(()=>validateBacktest({...base,...bad}),/invalid|must/);
});
test('metrics use net equity, sample returns, elapsed exposure and undefined nulls',()=>{
  // Pure arithmetic, not market data: $100 -> $110 -> $99 has a 10% peak drawdown.
  const m=metrics([{t:0,equity:100},{t:3600000,equity:110},{t:7200000,equity:99}], [{pnl:10},{pnl:-11}],100,3600000);
  assert.equal(m.pnl,-1);assert.equal(m.finalEquity,99);assert.equal(m.maxDrawdownPct,10);
  assert.equal(m.winRate,0.5);assert.equal(m.exposure,0.5);assert.ok(Math.abs(m.sharpe)<1e-10);
  const none=metrics([{t:0,equity:100},{t:3600000,equity:100}],[],100);
  assert.equal(none.winRate,null);assert.equal(none.sharpe,null);assert.equal(none.exposure,0);
});
test('prediction model and agent schema enforce required inputs and forbid fee/candle overrides',()=>{
  const p={symbol:base.symbol,from:base.from,to:base.to,strike:100,liquidityUsdc:50};
  assert.equal(validatePrediction(p).lookback,20);
  for(const bad of [{strike:0},{liquidityUsdc:undefined},{lookback:1},{minEdgePct:-1},{slippageBps:1001},{tradeUsd:0.0000001},{candles:[]}])
    assert.throws(()=>validatePrediction({...p,...bad}),/invalid|rounds/);
  validateTool('backtest',base);validateTool('backtest',{kind:'predict',...p});
  assert.throws(()=>validateTool('backtest',{...base,slippageBps:1001}),/invalid/);
  assert.throws(()=>validateTool('backtest',{kind:'predict',...p,venue:'phoenix'}),/invalid/);
  assert.throws(()=>validateTool('backtest',{...base,rule:[]}),/invalid/);
});
