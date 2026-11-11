/** Counterfactual pm-AMM curve replay on real Pyth OHLC. No historical pool tape is asserted. */
import BN from 'bn.js';
import { capitalPhi, phi } from '@pm-amm/sdk/math';
import { marketState, quoteSwap } from './chains/pm-amm-helpers.mjs';
import { History, historyRequest } from './history.mjs';
import { metrics } from './backtest.mjs';

export function validatePrediction(input) {
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>
    !['symbol','from','to','resolution','strike','liquidityUsdc','tradeUsd','initialCash','slippageBps','lookback','minEdgePct'].includes(k)))throw new Error('invalid prediction backtest field');
  const req=historyRequest(input);
  for(const k of ['strike','liquidityUsdc'])if(!Number.isFinite(input[k])||input[k]<=0||input[k]>1e9)throw new Error(`invalid ${k}`);
  const o={initialCash:1000,tradeUsd:10,slippageBps:10,lookback:20,minEdgePct:2,...input,...req};
  if(!Number.isFinite(o.initialCash)||o.initialCash<=0||o.initialCash>1e9||!Number.isFinite(o.tradeUsd)||
    o.tradeUsd<=0||o.tradeUsd>o.initialCash||!Number.isSafeInteger(Math.round(o.tradeUsd*1e6)))throw new Error('invalid prediction capital');
  if(!Number.isInteger(o.lookback)||o.lookback<2||o.lookback>500)throw new Error('invalid prediction lookback');
  if(!Number.isFinite(o.slippageBps)||o.slippageBps<0||o.slippageBps>1000||
     !Number.isFinite(o.minEdgePct)||o.minEdgePct<0||o.minEdgePct>100)throw new Error('invalid prediction edge or slippage');
  if(o.tradeUsd*1e6<1)throw new Error('prediction trade rounds to zero');
  return o;
}
const fixed=n=>new BN(((BigInt(Math.trunc(n))<<48n)+BigInt(Math.round((n-Math.trunc(n))*2**48))).toString());
function initialCurve(o,start) {
  const reserves=o.liquidityUsdc*1e6,L=reserves/phi(0);
  return {endTs:new BN(o.to),lastAccrualTs:new BN(start),lZero:fixed(L/Math.sqrt(o.to-start)),
    reserveYes:fixed(reserves),reserveNo:fixed(reserves),resolved:false,winningSide:0};
}
function probability(seen,strike,endMs,lookback) {
  if(seen.length<lookback+1)return null;
  const seg=seen.slice(-lookback-1);let squares=0,seconds=0;
  for(let i=1;i<seg.length;i++) {squares+=Math.log(seg[i].close/seg[i-1].close)**2;seconds+=(seg[i].tClose-seg[i-1].tClose)/1000;}
  const variance=squares/seconds,tau=(endMs-seg.at(-1).tClose)/1000;
  if(!(variance>0&&tau>0))return null;
  return capitalPhi((Math.log(seg.at(-1).close/strike)-variance*tau/2)/Math.sqrt(variance*tau));
}
export function replayPrediction(candles,input) {
  const o=validatePrediction(input);
  if(!Array.isArray(candles)||candles.length<o.lookback+2||candles.length>20000)throw new Error('prediction candles must include lookback and expiry');
  if(candles.some((c,i)=>!Number.isSafeInteger(c.t)||!Number.isSafeInteger(c.tClose)||c.tClose<=c.t||
    c.t<o.from*1000||c.tClose>o.to*1000||!Number.isFinite(c.close)||c.close<=0||
    (i&&candles[i-1].tClose!==c.t)))throw new Error('prediction candles must be contiguous and within range');
  if(candles.at(-1).tClose!==o.to*1000)throw new Error('Setup required: Pyth candle closing exactly at prediction expiry');
  let curve=initialCurve(o,candles[0].t/1000),position=null;
  const equityCurve=[{t:candles[0].t,equity:o.initialCash}],trades=[],observations=[];
  for(let i=0;i<candles.length;i++) {
    const c=candles[i],now=c.tClose/1000;
    if(now>=o.to)break;
    const fairYes=probability(candles.slice(0,i+1),o.strike,o.to*1000,o.lookback);
    const state=marketState(curve,now);
    observations.push({t:c.tClose,underlying:c.close,curveYesPrice:state.price,fairYes});
    if(!position&&fairYes!==null) {
      const amountIn=Math.floor(o.tradeUsd*1e6);
      const choices=['yes','no'].map(side=>{
        const q=quoteSwap(curve,side==='yes'?'usdcToYes':'usdcToNo',amountIn,now);
        const shares=Math.floor(q.out*(1-o.slippageBps/10000))/1e6;
        const expectedPnl=shares*(side==='yes'?fairYes:1-fairYes)-amountIn/1e6;
        return {side,q,shares,expectedPnl,edgePct:expectedPnl/(amountIn/1e6)*100};
      }).sort((a,b)=>b.expectedPnl-a.expectedPnl);
      const best=choices[0];
      if(best.edgePct>=o.minEdgePct&&best.shares>0) {
        position={entryTime:c.tClose,signalTime:c.tClose,side:best.side,shares:best.shares,
          cost:amountIn/1e6,fee:best.q.fee/1e6,expectedPnl:best.expectedPnl,edgePct:best.edgePct,fairYes};
        // Exact helper fill changes this model's reserves. Adverse slippage is a haircut on received shares.
        const net=amountIn-best.q.fee;
        const x=state.x+net-(best.side==='yes'?best.q.out:0),y=state.y+net-(best.side==='no'?best.q.out:0);
        curve={...curve,lastAccrualTs:new BN(now),reserveYes:fixed(x),reserveNo:fixed(y)};
      }
    }
    const quote=position?quoteSwap(curve,position.side==='yes'?'yesToUsdc':'noToUsdc',Math.floor(position.shares*1e6),now):null;
    equityCurve.push({t:c.tClose,equity:o.initialCash-(position?.cost??0)+(quote?quote.out*(1-o.slippageBps/10000)/1e6:0)});
  }
  const settlementPrice=candles.at(-1).close,outcome=settlementPrice>o.strike?'yes':'no';
  if(position) {
    const payout=position.side===outcome?position.shares:0;
    trades.push({...position,exitTime:o.to*1000,outcome,payout,pnl:payout-position.cost,reason:'Pyth expiry candle close settlement'});
  }
  equityCurve.push({t:o.to*1000,equity:o.initialCash+(trades[0]?.pnl??0)});
  const summary=metrics(equityCurve,trades,o.initialCash,position?o.to*1000-position.entryTime:0);
  return {kind:'predict',symbol:o.symbol,question:`${o.symbol} above $${o.strike} at ${new Date(o.to*1000).toISOString()}`,
    strike:o.strike,endTs:o.to,settlementPrice,outcome,trades,equityCurve,observations,...summary,
    edge:{expectedPnl:position?.expectedPnl??null,expectedPct:position?.edgePct??null,realizedPct:position?summary.pnl/position.cost*100:null},
    model:{pool:'Counterfactual balanced pm-AMM curve; user-specified liquidity, no external order flow. Not historical pm-AMM market prices or fills.',
      liquidityUsdc:o.liquidityUsdc,fees:'Exact pm-amm-helpers quoteSwap: 2% on USDC leg; no redemption fee.',
      strategy:'Estimate zero-drift lognormal fair value from trailing squared log returns per second; buy the side with positive fee-inclusive edge and hold once to expiry.',
      lookback:o.lookback,minEdgePct:o.minEdgePct,slippageBps:o.slippageBps,
      timing:'Decide and quote at completed-bar close; no underlying-price execution. Curve state depends only on prior model trades and elapsed time.',
      settlement:'Expiry candle close > strike. This candle-resolution model is not the keeper exact-publish-time/confidence settlement.'}};
}
export async function predictionBacktest(input,{history=new History()}={}) {
  const o=validatePrediction(input),h=await history.get(o);
  return {...replayPrediction(h.candles,input),history:{...h,candles:undefined,barCount:h.candles.length}};
}
