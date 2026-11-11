/** Real Jupiter routes and real Solana mint decimals; no transaction submission. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { quote,mintInfo } from "../main/chains/solana.mjs";
test("expanded Jupiter book quotes SOL and HYPE with actual mint decimals",{timeout:60000},async t=>{
  try {
    for(const symbol of ["SOL","HYPE"]) {
      const mint=await mintInfo(symbol),q=await quote("USDC",symbol,1);
      assert.ok(Number.isInteger(mint.decimals) && mint.decimals>0);
      assert.ok(q.amountOut>0 && q.price>0 && q.raw.outAmount);
      assert.equal(q.raw.outputMint,mint.mint);
      console.log(`Real Jupiter ${symbol}: ${q.amountOut}, decimals ${mint.decimals}, via ${q.route}`);
    }
  } catch(e) {
    if(!/fetch failed|timeout|timed out|ECONN|ENOTFOUND|HTTP (429|50[0234]|403|401)/.test(e.message))throw e;
    console.log(`SKIP: Jupiter/Solana API unavailable: ${e.message}`);t.skip(`Jupiter/Solana API unavailable: ${e.message}`);
  }
});
