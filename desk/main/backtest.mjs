/** Completed-bar decisions, next-open fills, one unlevered position at a time. */
import { BOOK, ema, rsi, relativeVolume } from './strategies.mjs';
import { regimeOf } from './candles.mjs';
import { History, historyRequest } from './history.mjs';
import { feeSchedule, fundingHistory } from './backtest-fees.mjs';
import { MARKETS } from './markets.mjs';

const OPS={lt:(a,b)=>a<b,lte:(a,b)=>a<=b,gt:(a,b)=>a>b,gte:(a,b)=>a>=b};
const VOLUME_BOOK=['stretch_capitulation','volume_thrust'];
const GATED_BOOK=['deep_stretch_reversion','oversold_exhaustion','stretch_capitulation','stretch_oversold_confluence'];
function positive(n,name,max=1e9) { if(!Number.isFinite(n)||n<=0||n>max)throw new Error(`invalid ${name}`); return n; }
function operand(v) {
  if(typeof v==='number') {if(!Number.isFinite(v))throw new Error('invalid rule value');return;}
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['indicator','period'].includes(k))||
      !['close','sma','ema','rsi','returnPct','relativeVolume'].includes(v.indicator))throw new Error('invalid rule indicator');
  if(v.indicator!=='close'&&(!Number.isInteger(v.period)||v.period<2||v.period>500))throw new Error('invalid rule period (2–500)');
}
export function validateRule(rule) {
  if(!rule||typeof rule!=='object'||Array.isArray(rule)||Object.keys(rule).some(k=>
    !['name','entry','exit','side','stopPct','takeProfitPct','maxHoldMin','requireUptrend'].includes(k)))throw new Error('invalid rule strategy');
  if(typeof rule.name!=='string'||!rule.name.trim()||rule.name.length>100)throw new Error('invalid rule name');
  for(const key of ['entry','exit']) {
    if(key==='exit'&&rule.exit===undefined)continue;
    if(!Array.isArray(rule[key])||!rule[key].length||rule[key].length>12)throw new Error(`invalid rule ${key}`);
    for(const c of rule[key]) {
      if(!c||Object.keys(c).some(k=>!['left','op','right'].includes(k))||!Object.hasOwn(OPS,c.op))throw new Error('invalid rule condition');
      operand(c.left);operand(c.right);
    }
  }
  if(rule.side!==undefined&&!['long','short'].includes(rule.side))throw new Error('invalid rule side');
  if(rule.requireUptrend!==undefined&&typeof rule.requireUptrend!=='boolean')throw new Error('invalid rule trend gate');
  for(const k of ['stopPct','takeProfitPct'])if(rule[k]!==undefined)positive(rule[k],k,99);
  if(rule.maxHoldMin!==undefined)positive(rule.maxHoldMin,'maxHoldMin',525600);
  return rule;
}
function measure(v,c) {
  if(typeof v==='number')return v;
  if(v.indicator==='close')return c.at(-1)?.close??NaN;
  if(c.length<v.period+(v.indicator==='returnPct'||v.indicator==='rsi'||v.indicator==='relativeVolume'?1:0))return NaN;
  const closes=c.slice(-v.period).map(b=>b.close);
  if(v.indicator==='sma')return closes.reduce((a,b)=>a+b,0)/v.period;
  if(v.indicator==='ema')return ema(closes,v.period);
  if(v.indicator==='rsi')return rsi(c.map(b=>b.close),v.period);
  if(v.indicator==='relativeVolume') {
    const window=c.slice(-(v.period+1));
    return window.every(b=>Number.isFinite(b.volume))&&window.some(b=>b.volume>0)?relativeVolume(c,v.period):NaN;
  }
  return (c.at(-1).close/c.at(-1-v.period).close-1)*100;
}
function matches(conditions,c) { return conditions.every(k=>{const a=measure(k.left,c),b=measure(k.right,c);return Number.isFinite(a)&&Number.isFinite(b)&&OPS[k.op](a,b);}); }
function validateCandles(c) {
  if(!Array.isArray(c)||c.length<2||c.length>20000)throw new Error('candles must contain 2–20000 completed bars');
  for(let i=0;i<c.length;i++) {
    const b=c[i];
    if(!Number.isSafeInteger(b.t)||!Number.isSafeInteger(b.tClose)||b.tClose<=b.t||b.tClose>Date.now()||
      (i&&c[i-1].tClose>b.t)||![b.open,b.high,b.low,b.close].every(n=>Number.isFinite(n)&&n>0)||
      b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close)||b.high<b.low)throw new Error('invalid or overlapping candles');
  }
}
export function validateBacktest(input) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('invalid backtest request');
  if(Object.keys(input).some(k=>!['symbol','from','to','resolution','strategy','rule','venue','initialCash','tradeUsd','slippageBps'].includes(k)))throw new Error('invalid backtest field');
  const req=historyRequest(input);
  if(!['phoenix','jupperps','jupiter'].includes(input.venue))throw new Error('invalid venue; use phoenix, jupperps or jupiter');
  if(input.strategy==='rule')validateRule(input.rule);
  else if(input.strategy!=='book'&&!Object.hasOwn(BOOK,input.strategy))throw new Error('invalid strategy; choose book, a BOOK strategy or rule');
  if(input.strategy!=='rule'&&input.rule!==undefined)throw new Error('rule requires strategy=rule');
  const initialCash=positive(input.initialCash??10000,'initialCash'),tradeUsd=positive(input.tradeUsd??1000,'tradeUsd');
  if(tradeUsd>initialCash)throw new Error('tradeUsd must not exceed initialCash');
  const slippageBps=input.slippageBps??10;
  if(!Number.isFinite(slippageBps)||slippageBps<0||slippageBps>1000)throw new Error('invalid slippageBps (0–1000)');
  if(input.venue==='jupiter'&&input.rule?.side==='short')throw new Error('spot rule side must be long');
  return {...input,...req,initialCash,tradeUsd,slippageBps};
}

export function metrics(equityCurve,trades,initialCash,exposedMs=0) {
  let peak=initialCash,maxDrawdown=0;
  const returns=[];
  for(let i=0;i<equityCurve.length;i++) {
    const p=equityCurve[i];peak=Math.max(peak,p.equity);maxDrawdown=Math.max(maxDrawdown,(peak-p.equity)/peak);
    if(i&&equityCurve[i-1].equity>0)returns.push(p.equity/equityCurve[i-1].equity-1);
  }
  const finalEquity=equityCurve.at(-1)?.equity??initialCash,pnl=finalEquity-initialCash;
  const mean=returns.reduce((a,b)=>a+b,0)/(returns.length||1);
  const sd=returns.length>1?Math.sqrt(returns.reduce((a,b)=>a+(b-mean)**2,0)/(returns.length-1)):0;
  const duration=equityCurve.length>1?equityCurve.at(-1).t-equityCurve[0].t:0;
  return {pnl,returnPct:pnl/initialCash*100,finalEquity,maxDrawdownPct:maxDrawdown*100,
    winRate:trades.length?trades.filter(t=>t.pnl>0).length/trades.length:null,
    sharpe:sd>0&&duration>0?mean/sd*Math.sqrt(365.25*86400000*returns.length/duration):null,
    exposure:duration>0?exposedMs/duration:0,tradeCount:trades.length};
}

export function replay({candles,options,fees,funding={status:'funding not modelled',events:[]},btcDaily=[],btcHourly=[]}) {
  const o=validateBacktest(options);validateCandles(candles);
  if(![fees?.entryRate,fees?.exitRate].every(n=>Number.isFinite(n)&&n>=0&&n<1))throw new Error('invalid fee schedule');
  if(fees.venue!==o.venue)throw new Error('fee venue must match replay venue');
  if(candles.some(c=>c.t<o.from*1000||c.tClose>o.to*1000))throw new Error('candles must lie inside requested range');
  if(btcDaily.length)validateCandles(btcDaily);if(btcHourly.length)validateCandles(btcHourly);
  const fundingEvents=funding.events;
  if(!Array.isArray(fundingEvents)||fundingEvents.some((p,i)=>!Number.isFinite(p.usdPerUnit)||!Number.isSafeInteger(p.t)||(i&&p.t<=fundingEvents[i-1].t)))throw new Error('invalid funding history');
  const warnings=[],volumeAvailable=candles.some(c=>c.volume>0);
  const names=o.strategy==='book'?Object.keys(BOOK):[o.strategy];
  if(!volumeAvailable)warnings.push('History volume unavailable; volume strategies cannot fire.');
  if(names.some(n=>GATED_BOOK.includes(n))||o.rule?.requireUptrend)warnings.push('Trend gate: latest completed BTC hour vs 200 completed BTC daily closes; insufficient gate history disables gated entries.');
  const slip=o.slippageBps/10000, trades=[], equityCurve=[{t:candles[0].t,equity:o.initialCash},{t:candles[0].tClose,equity:o.initialCash}];
  let balance=o.initialCash,position=null,exposedMs=0,fundingIndex=0;
  const exit=(price,t,reason)=>{
    const p=position,fill=price*(1-p.direction*slip),exitFee=p.qty*fill*fees.exitRate;
    const grossPnl=p.direction*p.qty*(fill-p.entryPrice),pnl=grossPnl-p.entryFee-exitFee-p.funding;
    balance+=grossPnl-exitFee;exposedMs+=t-p.entryTime;
    trades.push({...p,exitTime:t,exitPrice:fill,exitFee,fees:p.entryFee+exitFee,grossPnl,pnl,reason});position=null;
  };
  const payUntil=t=>{
    while(fundingIndex<fundingEvents.length&&fundingEvents[fundingIndex].t<=t) {
      const event=fundingEvents[fundingIndex++];
      if(position&&event.t>position.entryTime) {const paid=position.qty*position.direction*event.usdPerUnit;balance-=paid;position.funding+=paid;}
    }
  };
  for(let i=1;i<candles.length;i++) {
    const bar=candles[i],seen=candles.slice(0,i),signalTime=seen.at(-1).tClose;
    payUntil(bar.t);
    let exited=false;
    if(position&&(bar.t-position.entryTime>=position.maxHoldMin*60000||o.rule?.exit&&matches(o.rule.exit,seen))) {
      exit(bar.open,bar.t,'next-open exit');exited=true;
    }
    if(!position&&!exited&&balance>0) {
      const daily=btcDaily.filter(b=>b.tClose<=signalTime).slice(-200),btc=btcHourly.filter(b=>b.tClose<=signalTime).at(-1);
      const uptrend=daily.length===200&&!!btc&&btc.close>daily.reduce((a,b)=>a+b.close,0)/200;
      let s;
      if(o.strategy==='rule') {
        if((!o.rule.requireUptrend||uptrend)&&matches(o.rule.entry,seen))s={strategy:o.rule.name,side:o.rule.side==='short'?'SELL':'BUY',...o.rule};
      } else for(const name of names) {
        if(VOLUME_BOOK.includes(name)&&!volumeAvailable)continue;
        s=BOOK[name](seen,{symbol:o.symbol,uptrend,regime:regimeOf(seen)});if(s)break;
      }
      if(s) {
        const direction=s.side==='SELL'||s.side==='short'?-1:1,fill=bar.open*(1+direction*slip);
        const notional=Math.min(o.tradeUsd,balance/(1+fees.entryRate)),qty=notional/fill,entryFee=notional*fees.entryRate;
        balance-=entryFee;position={strategy:s.strategy,signalTime,entryTime:bar.t,entryPrice:fill,qty,direction,entryFee,funding:0,
          stopPct:s.stopPct??8,takeProfitPct:s.takeProfitPct??16,maxHoldMin:s.maxHoldMin??1440};
      }
    }
    if(position) {
      const p=position,stop=p.entryPrice*(1-p.direction*p.stopPct/100),target=p.entryPrice*(1+p.direction*p.takeProfitPct/100);
      const stopped=p.direction===1?bar.low<=stop:bar.high>=stop;
      const won=p.direction===1?bar.high>=target:bar.low<=target;
      if(stopped||won) {
        // Intrabar ordering is unknown. Charge funding through this bar and choose the stop first.
        payUntil(bar.tClose);
        const price=stopped?(p.direction===1?Math.min(stop,bar.open):Math.max(stop,bar.open)):target;
        exit(price,bar.tClose,stopped?'stop (stop-first intrabar model)':'take profit');
      }
    }
    payUntil(bar.tClose);
    if(position&&i===candles.length-1)exit(bar.close,bar.tClose,'end of history');
    equityCurve.push({t:bar.tClose,equity:balance+(position?position.direction*position.qty*(bar.close-position.entryPrice):0)});
  }
  return {symbol:o.symbol,strategy:o.strategy,venue:o.venue,fees,funding:{...funding,events:undefined,eventCount:fundingEvents.length},
    slippage:{bps:o.slippageBps,model:'Fixed adverse basis points on every entry and exit, in addition to venue fees.'},
    assumptions:['Signals use completed bars only; fills at next available open. One unlevered position; no overlapping trades.',
      'Stops win ambiguous intrabar ties; gaps through stops fill at the worse open. Intrabar exits charged whole-bar funding.',
      'Historical OHLC is a reference path, not historical executable venue liquidity. No liquidation, network fee or rent simulation.',
      'Sharpe: sample deviation of observed-bar equity returns, zero risk-free rate, annualized by elapsed calendar time; null if undefined.'],
    warnings,trades,equityCurve,...metrics(equityCurve,trades,o.initialCash,exposedMs)};
}

export async function backtest(input,{history=new History()}={}) {
  const o=validateBacktest(input),h=await history.get(o);
  const needsGate=o.strategy==='book'||GATED_BOOK.includes(o.strategy)||o.rule?.requireUptrend;
  let market=o.symbol.startsWith('mint:')?o.symbol.slice(5):o.symbol.replace(/^Crypto\./,'').replace(/^Equity\.[A-Z]{2}\./,'').replace('/USD','');
  if(o.venue==='jupiter'&&o.symbol.startsWith('Equity.')) {
    market=Object.keys(MARKETS).find(s=>s.replace(/x$/i,'').toUpperCase()===market&&MARKETS[s].class==='equity')??market;
  }
  const [fees,funding,daily,hourly]=await Promise.all([
    feeSchedule(o.venue,market,o.tradeUsd),fundingHistory(o.venue,market,o.from,o.to),
    needsGate?history.get({symbol:'BTC',from:Math.max(0,o.from-202*86400),to:o.to,resolution:'1D'}):null,
    needsGate?(o.symbol==='Crypto.BTC/USD'?h:history.get({symbol:'BTC',from:o.from,to:o.to,resolution:o.resolution})):null,
  ]);
  const result=replay({candles:h.candles,options:input,fees,funding,btcDaily:daily?.candles,btcHourly:hourly?.candles});
  return {...result,warnings:[...result.warnings,...(h.warnings || []),...(daily?.warnings || []).map(w=>'BTC gate: '+w)],
    history:{...h,candles:undefined,barCount:h.candles.length},
    gateHistory:daily?{source:daily.source,complete:daily.complete,coverage:daily.coverage}:null};
}
