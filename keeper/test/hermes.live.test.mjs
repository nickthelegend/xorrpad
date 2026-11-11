/** Real Hermes only. Authentication/unavailability is printed as a skip. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FEEDS,fetchPrice,parseHermes } from "../pyth.mjs";
test("official Hermes feed discovery confirms SOL, BTC and ETH identities",{timeout:60000},async t=>{
  try {
    for(const symbol of Object.keys(FEEDS)) {
      const url=new URL("https://hermes.pyth.network/v2/price_feeds");url.searchParams.set("query",`${symbol}/USD`);
      const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw new Error(`Hermes feed discovery HTTP ${response.status}`);
      const feeds=await response.json(),match=feeds.find(r=>r.attributes?.symbol===`Crypto.${symbol}/USD`);
      assert.equal(match?.id,FEEDS[symbol]);
    }
  }catch(e){if(!/fetch failed|timeout|timed out|ECONN|ENOTFOUND|HTTP (429|50[0234]|403|401)/.test(e.message))throw e;console.log(`SKIP: Hermes unavailable: ${e.message}`);t.skip(e.message);}
});
test("Hermes parsing uses an actual signed response and retrieves the exact publish second",{timeout:50000},async t=>{
  try {
    const latest=await fetchPrice("SOL");
    assert.ok(latest.price>0 && latest.confidence>=0 && latest.hermes.binary.data.length>0);
    const historical=await fetchPrice("SOL",latest.publishTime);
    assert.equal(historical.publishTime,latest.publishTime);assert.equal(historical.feedId,FEEDS.SOL);
    assert.ok(historical.hermes.binary.data.length>0);
    assert.throws(()=>parseHermes(historical.hermes,"SOL",historical.publishTime-1),/exact publish time unavailable/);
    console.log(`Real signed Hermes SOL observation: ${historical.publishTime}`);
  }catch(e){
    if(!/Setup required: PYTH_API_KEY|fetch failed|timeout|timed out|ECONN|ENOTFOUND|HTTP (429|50[0234])/.test(e.message))throw e;
    console.log(`SKIP: ${e.message}`);t.skip(e.message);
  }
});
