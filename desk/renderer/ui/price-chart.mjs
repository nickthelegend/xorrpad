/** Local canvas renderer: only completed Pyth candles, never interpolated ticks. */
import { $, esc, fmt, error, loading } from './shared.mjs';
const periods = { '1m': ['1', 60], '15m': ['15', 900], '1h': ['60', 3600], '1d': ['1D', 86400] };
export function mountChart({ root, api, signal, selection }) {
  root.innerHTML = `<div class="market-head" id="market-head"></div><div class="chart-toolbar" role="group" aria-label="Candle timeframe">${Object.keys(periods).map(p => `<button data-period="${p}" aria-pressed="${p === '1h'}">${p}</button>`).join('')}<span class="hint">Pyth Benchmarks · UTC</span></div><div id="candle-state">${loading()}</div><canvas id="price-candles" role="img" aria-label="Selected market candle chart" hidden></canvas><p class="chart-caption mono" id="candle-caption"></p>`;
  let period = '1h', candles = [], live = null, change = null, funding = null, markAt, historyAt, sequence = 0, current = '', hovering = null;
  const canvas = $('#price-candles', root), state = $('#candle-state', root), caption = $('#candle-caption', root);
  function header() {
    const s = selection();
    $('#market-head', root).innerHTML = `<div><h2>${esc(s.market || 'Select a market')} <span class="tag">${esc(s.kind)}</span></h2><strong class="market-price mono">${fmt(live, 'USD', 6)}</strong></div><dl><div><dt>24h / Pyth reference</dt><dd>${fmt(change, '%')}</dd></div><div><dt>Funding / 8h</dt><dd>${s.kind === 'spot' ? 'Not applicable' : fmt(funding, '%')}</dd></div><div><dt>Venue</dt><dd>${esc(s.venue || (s.kind === 'spot' ? 'jupiter' : 'phoenix'))}</dd></div></dl>`;
  }
  function draw() {
    if (canvas.hidden || !candles.length) return;
    const css = getComputedStyle(root), ink = css.getPropertyValue('--muted'), good = css.getPropertyValue('--good'), bad = css.getPropertyValue('--bad'), line = css.getPropertyValue('--line'), accent = css.getPropertyValue('--accent');
    const w = canvas.clientWidth, h = 310, ratio = devicePixelRatio || 1;
    canvas.width = w * ratio; canvas.height = h * ratio;
    const c = canvas.getContext('2d'); c.scale(ratio, ratio); c.clearRect(0,0,w,h);
    const left = 10, right = w > 500 ? 90 : 66, top = 16, bottom = 30, plot = w-left-right;
    const values = candles.flatMap(b => [b.high,b.low]); if (live > 0) values.push(live);
    let low = Math.min(...values), high = Math.max(...values), pad = (high-low)*.07 || high*.001; low -= pad; high += pad;
    const y = v => top+(high-v)/(high-low)*(h-top-bottom), step = plot/candles.length;
    c.font = '10px Azeret, monospace'; c.textBaseline = 'middle';
    for (let i=0;i<5;i++) { const value = low+(high-low)*i/4, yy=y(value); c.strokeStyle=line;c.beginPath();c.moveTo(left,yy);c.lineTo(w-right,yy);c.stroke();c.fillStyle=ink;c.fillText(value.toLocaleString('en-US',{maximumFractionDigits:5}),w-right+8,yy); }
    candles.forEach((b,i) => { const x=left+(i+.5)*step; c.strokeStyle=c.fillStyle=b.close>=b.open?good:bad;c.beginPath();c.moveTo(x,y(b.high));c.lineTo(x,y(b.low));c.stroke();c.fillRect(x-Math.max(1,step*.58)/2,y(Math.max(b.open,b.close)),Math.max(1,step*.58),Math.max(1,Math.abs(y(b.open)-y(b.close)))); });
    if (live > 0) { c.strokeStyle=accent;c.setLineDash([4,4]);c.beginPath();c.moveTo(left,y(live));c.lineTo(w-right,y(live));c.stroke();c.setLineDash([]); }
    c.fillStyle=ink;
    for (const [index,x] of [[0,left],[Math.floor(candles.length/2),left+plot/2-28],[candles.length-1,w-right-58]]) c.fillText(new Date(candles[index].t).toISOString().slice(period === '1d'?5:11,period === '1d'?10:16),x,h-12);
    if (hovering != null) { const i=Math.min(candles.length-1,Math.max(0,Math.floor((hovering-left)/step))), b=candles[i];c.strokeStyle=ink;c.beginPath();c.moveTo(left+(i+.5)*step,top);c.lineTo(left+(i+.5)*step,h-bottom);c.stroke();caption.textContent=`${new Date(b.t).toISOString()} · O ${b.open} H ${b.high} L ${b.low} C ${b.close}`; }
    else caption.textContent=`${candles.length} completed candles · ${historyAt || ''} · Live mark ${markAt || 'unavailable'}`;
  }
  async function history(n, s) {
    state.innerHTML=loading();canvas.hidden=true;
    const [resolution, seconds]=periods[period], to=Math.floor(Date.now()/1000/seconds)*seconds;
    try {
      const d=await api('/backtest/history?'+new URLSearchParams({symbol:s.market,resolution,from:to-seconds*160,to}));
      if (n!==sequence || signal.aborted) return;
      candles=d.candles;historyAt=new Date().toLocaleTimeString();state.innerHTML='';canvas.hidden=false;draw();
    } catch(e) { if(n===sequence&&!signal.aborted){state.innerHTML=error(e);caption.textContent='No substitute or interpolated history.';} }
  }
  async function mark(n, s) {
    const results=await Promise.allSettled([
      s.kind==='spot' ? api('/quote?'+new URLSearchParams({sell:'USDC',buy:s.market,amount:50})) : s.venue === 'jupperps' ? api('/route?'+new URLSearchParams({kind:'perp',market:s.market,side:'long',size:50,leverage:1})) : api('/perps/markets'),
      api('/backtest/history?'+new URLSearchParams({symbol:s.market,resolution:'60',from:Math.floor(Date.now()/3600000)*3600-86400,to:Math.floor(Date.now()/3600000)*3600})),
    ]);
    if(n!==sequence||signal.aborted)return;
    const [q,h]=results;
    if(q.status==='fulfilled') { const m=s.kind==='spot'?q.value:s.venue === 'jupperps' ? [q.value.best,...(q.value.alternatives || [])].find(m=>m?.venue==='jupperps')?.quote : q.value.markets?.find(m=>m.market===s.market); live=m?.price??m?.markPrice??null; funding=m?.funding?.eightHourRatePercent??null;markAt=new Date().toLocaleTimeString(); }
    else { live=null;markAt='unavailable: '+q.reason.message; }
    change=h.status==='fulfilled'&&live>0 ? (live/h.value.candles[0].open-1)*100 : null;
    header();draw();
  }
  function update(force=false) { const s=selection(), key=JSON.stringify([s.market,s.kind,s.venue]);if(!force&&key===current)return;current=key;const n=++sequence;live=change=funding=null;header();history(n,s);mark(n,s); }
  for(const b of root.querySelectorAll('[data-period]')) b.onclick=()=>{period=b.dataset.period;for(const p of root.querySelectorAll('[data-period]'))p.setAttribute('aria-pressed',String(p===b));update(true);};
  canvas.onpointermove=e=>{hovering=e.offsetX;draw();};canvas.onpointerleave=()=>{hovering=null;draw();};
  const resize=new ResizeObserver(draw);resize.observe(canvas);
  const themes=new MutationObserver(draw);themes.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  update();const timer=setInterval(()=>{const s=selection();mark(sequence,s);},15000), historyTimer=setInterval(()=>history(sequence,selection()),60000);
  return { update, dispose(){clearInterval(timer);clearInterval(historyTimer);resize.disconnect();themes.disconnect();sequence++;} };
}
