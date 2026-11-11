/** Keeper endpoints and traction decoder against real chain data, never a fake fill. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Memory } from "../main/memory.mjs";
import { devnetConnection,ours } from "../main/chains/pmamm.mjs";
import { keeperCreator } from "../main/keeper-read.mjs";
import { keeperStats,parseMarketTransaction,scanMarketHistory } from "../main/pmamm-stats.mjs";
process.env.PAD_TOKEN="xorrpad-dev";
const {createServer}=await import("../main/server.mjs");
const unavailable=e=>/Setup required: KEEPER_PUBLIC_KEY|fetch failed|timeout|timed out|ECONN|ENOTFOUND|429|503|502/.test(e.message);
test("keeper routes return actual creator-filtered markets, public evidence and cached chain stats",{timeout:50000},async t=>{
  const mem=new Memory({db:"/tmp/xorrpad-keeper-http.db"}),server=createServer(mem);
  await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(8713,"127.0.0.1",resolve);});
  const base="http://127.0.0.1:8713",headers={authorization:"Bearer xorrpad-dev"};
  try {
    assert.equal((await fetch(base+"/pm/ours")).status,401);
    assert.equal((await fetch(base+"/pm/stats",{method:"POST",headers})).status,405);
    const creator=await keeperCreator(),chainMarkets=await ours(creator);
    for(const route of ["ours","resolutions","stats"]) {
      const response=await fetch(`${base}/pm/${route}`,{headers}),body=await response.json();
      assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.creator,creator);assert.equal(body.cluster,"devnet");
      if(route==="ours")assert.deepEqual(body.markets.map(m=>m.market).sort(),chainMarkets.map(m=>m.market).sort());
      if(route==="resolutions")assert.ok(Array.isArray(body.resolutions));
      if(route==="stats") {assert.equal(body.source,"chain transaction history");assert.ok(body.cacheMs>=60000);}
    }
    const first=await keeperStats(creator),second=await keeperStats(creator);assert.equal(first,second);
    console.log(`Real keeper chain count: ${chainMarkets.length} markets; stats complete=${first.complete}`);
  }catch(e){if(!unavailable(e))throw e;console.log(`SKIP: ${e.message}`);t.skip(e.message);}
  finally {await new Promise(resolve=>server.close(resolve));mem.stop();}
});
// Immutable, independently observed reference swap. It is NOT a keeper trade
// and is never included in /pm/stats for our creator.
const REFERENCE_MARKET="9Ly4tHCaenGc6nkhAwWHxjKisEkpNZm9dh7XtacQiDra";
const REFERENCE_SIGNATURE="5hFEx7T33RLSekreevbuEZ1khnJojRi97eJ3EWndjpACwvxcFhtBfyPbRS8NQrcRtTW7ACcaCo2Be5kyxsqPnoKU";
test("traction decoder reads an actual successful swap and actual creator fee transfer",{timeout:30000},async t=>{
  try {
    const c=await devnetConnection(),tx=await c.getParsedTransaction(REFERENCE_SIGNATURE,{maxSupportedTransactionVersion:0});
    if(!tx)return t.skip("Setup required: PMAMM_RPC with archive access to the reference devnet transaction");
    const result=parseMarketTransaction(tx,new Set([REFERENCE_MARKET]));
    assert.equal(result.swaps.length,1);assert.equal(result.swaps[0].volumeRaw,10093000n);assert.equal(result.swaps[0].creatorFeesRaw,100930n);
    assert.equal(result.swaps[0].direction,"usdctono");assert.equal(result.swaps[0].trader,"GDwVtusHrHkYLwFAyaqy5hh2SpA8qKiRwkVsjLSaCbXo");
    console.log(`Real reference swap: 10.093 mUSDC gross volume, 0.100930 mUSDC creator fee, ${REFERENCE_SIGNATURE}`);
  }catch(e){if(!unavailable(e))throw e;console.log(`SKIP: devnet unavailable: ${e.message}`);t.skip(e.message);}
});
test("traction history scan finds creation and swap totals on a real reference market",{timeout:60000},async t=>{
  try {
    const stats=await scanMarketHistory([{market:REFERENCE_MARKET}]);
    assert.equal(stats.source,"chain transaction history");assert.ok(stats.history.successfulSignatures>0);
    if(stats.complete) {assert.ok(stats.swaps>0);assert.ok(BigInt(stats.volumeRaw)>=10093000n);}
    else {assert.match(stats.setupRequired,/PMAMM_RPC/);assert.equal(stats.swaps,null);assert.ok(stats.observed);}
    console.log(`Real reference history: complete=${stats.complete}, swaps=${stats.swaps ?? stats.observed.swaps}`);
  }catch(e){if(!unavailable(e))throw e;console.log(`SKIP: devnet unavailable: ${e.message}`);t.skip(e.message);}
});
