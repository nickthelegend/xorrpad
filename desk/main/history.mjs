/** Pyth Benchmarks OHLC only. Never substitutes another exchange or invents volume. */
import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { appDataDir } from './permissions.mjs';
import { MARKETS } from './markets.mjs';

export const PYTH_HISTORY = 'https://benchmarks.pyth.network/v1/shims/tradingview/history';
export const RESOLUTIONS = Object.freeze({'1':60,'5':300,'15':900,'30':1800,'60':3600,'120':7200,'240':14400,'1D':86400});
export class HistoryUnavailable extends Error {
  constructor(message, options) { super(`Pyth history unavailable: ${message}`, options); this.status=502; }
}
export function pythSymbol(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('invalid symbol');
  if (/^(Crypto\.[A-Z0-9.]+|Equity\.[A-Z]{2}\.[A-Z0-9.]+)\/USD$/.test(value)) return value;
  const ticker=value.toUpperCase().replace(/-PERP$/, '');
  if (!/^[A-Z0-9]{1,24}$/.test(ticker)) throw new Error('invalid symbol');
  const equity=Object.entries(MARKETS).find(([s,m]) => m.class==='equity' &&
    [s.toUpperCase(),s.replace(/x$/i,'').toUpperCase()].includes(ticker));
  return equity ? `Equity.US.${equity[0].replace(/x$/i,'').toUpperCase()}/USD` : `Crypto.${ticker}/USD`;
}
export function historyRequest({symbol,from,to,resolution='60'}={}) {
  symbol=pythSymbol(symbol); resolution=String(resolution)==='D'?'1D':String(resolution);
  const step=RESOLUTIONS[resolution];
  if (!step) throw new Error('invalid resolution');
  if (![from,to].every(n=>Number.isSafeInteger(n)&&n>=0) || from>=to || to*1000>Date.now())
    throw new Error('from/to must be past Unix seconds with from < to');
  if ((to-from)/step>20000) throw new Error('history range must be at most 20000 bars');
  return {symbol,from,to,resolution,step};
}
function decode(j, {from,to,step}) {
  if (j?.s==='no_data') return [];
  if (j?.s!=='ok') throw new Error('invalid Pyth history payload');
  if (!['t','o','h','l','c'].every(k=>Array.isArray(j[k])&&j[k].length===j.t.length) ||
      (j.v!=null&&(!Array.isArray(j.v)||j.v.length!==j.t.length))) throw new Error('invalid Pyth history arrays');
  return j.t.map((t,i)=>{
    const [open,high,low,close]=['o','h','l','c'].map(k=>j[k][i]);
    const volume=j.v?.[i]??null;
    if (!Number.isSafeInteger(t)||t<0||(i&&t<=j.t[i-1])||
        ![open,high,low,close].every(n=>Number.isFinite(n)&&n>0)||
        high<Math.max(open,close)||low>Math.min(open,close)||high<low||
        (volume!==null&&(!Number.isFinite(volume)||volume<0))) throw new Error('invalid Pyth candle');
    return {t:t*1000,tClose:(t+step)*1000,open,high,low,close,volume};
  }).filter(c=>c.t>=from*1000&&c.tClose<=to*1000);
}
export class History {
  constructor({dir=appDataDir()}={}) { this.dir=path.join(dir,'history','pyth-v1'); }
  async get(input) {
    const req=historyRequest(input), rows=new Map();
    let cacheHits=0,networkRequests=0;
    for (let from=req.from;from<req.to;) {
      const part={...req,from,to:Math.min(req.to,Math.floor(from/req.step+1000)*req.step)};
      const query=new URLSearchParams({symbol:req.symbol,resolution:req.resolution,from:String(part.from),to:String(part.to)});
      const url=`${PYTH_HISTORY}?${query}`;
      const file=path.join(this.dir,createHash('sha256').update(url).digest('hex')+'.json');
      let candles;
      try {
        const saved=JSON.parse(await readFile(file,'utf8'));
        if(saved.url!==url) throw new Error('cache provenance mismatch');
        candles=decode(saved.payload,part); cacheHits++;
      } catch(e) {
        if(e.code!=='ENOENT') await unlink(file).catch(()=>{});
      }
      if (!candles) {
        let r;
        try { r=await fetch(url,{signal:AbortSignal.timeout(15000)}); }
        catch(e) { throw new HistoryUnavailable(e.message,{cause:e}); }
        if (!r.ok) throw new HistoryUnavailable(`HTTP ${r.status}`);
        const payload=await r.json(), decoded=decode(payload,part); networkRequests++;
        candles=decoded;
        if(candles.length) {
          await mkdir(this.dir,{recursive:true,mode:0o700});
          const tmp=file+'.'+randomUUID()+'.tmp';
          try { await writeFile(tmp,JSON.stringify({url,fetchedAt:new Date().toISOString(),payload}),{mode:0o600}); await rename(tmp,file); }
          finally { await unlink(tmp).catch(()=>{}); }
        }
      }
      for(const c of candles) rows.set(c.t,c);
      from=part.to;
    }
    const candles=[...rows.values()].sort((a,b)=>a.t-b.t);
    if(!candles.length) throw new Error(`Setup required: Pyth history for ${req.symbol} in the requested range`);
    return {source:PYTH_HISTORY,symbol:req.symbol,resolution:req.resolution,from:req.from,to:req.to,
      cacheHits,networkRequests,volumeAvailable:candles.some(c=>c.volume>0),candles};
  }
}
export const history = input => new History().get(input);
