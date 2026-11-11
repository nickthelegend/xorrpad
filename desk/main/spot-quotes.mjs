/** Bounded directory reads. Share in-flight quotes and cache failures as well as prices. */
import { price } from './chains/solana.mjs';
export const SPOT_QUOTE_TTL = 15000;
export class SpotQuotes {
  #cache = new Map();
  async get(symbols) {
    if (!Array.isArray(symbols) || !symbols.length || symbols.length > 12 || symbols.some(s => typeof s !== 'string' || !s || s.length > 96))
      throw Object.assign(new Error('choose 1–12 spot symbols'), {status:400});
    const quotes = [], queue = [...new Set(symbols)];
    const one = async symbol => {
      const hit = this.#cache.get(symbol);
      if(hit && Date.now() < hit.expiresAt) return hit.promise;
      const promise = price(symbol,50).then(value => ({symbol,price:value,observedAt:new Date().toISOString(),notionalUsdc:50}),
        e => ({symbol,price:null,error:e.message,observedAt:new Date().toISOString()}));
      this.#cache.set(symbol,{promise,expiresAt:Date.now()+SPOT_QUOTE_TTL});
      if(this.#cache.size > 256) this.#cache.delete(this.#cache.keys().next().value);
      return promise;
    };
    await Promise.all(Array.from({length:Math.min(2,queue.length)},async()=>{while(queue.length) quotes.push(await one(queue.shift()));}));
    return {quotes,cacheMs:SPOT_QUOTE_TTL,basis:'Jupiter USDC → asset, 50 USDC input; includes route impact'};
  }
}
