/** Public Phoenix API + real mainnet read/build/simulate. Never signs or sends. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createPhoenixClient } from "@ellipsis-labs/rise";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import * as phoenix from "../main/chains/phoenix.mjs";
let bytes; do { bytes=randomBytes(32); } while(!PublicKey.isOnCurve(bytes));
const authority=process.env.PHOENIX_AUTHORITY || new PublicKey(bytes).toBase58();
const unavailable=e=>[429,500,502,503,504,403].includes(e.status) || /fetch failed|ECONN|ENOTFOUND|timeout|timed out|429|503|502/.test(e.message);
function liveTest(name,fn) { test(name,{timeout:60000},async t=>{
  try { await fn(t); }
  catch(e) { if(!unavailable(e)) throw e; console.log(`SKIP: Phoenix API/RPC unavailable: ${e.message}`); t.skip(`Phoenix API/RPC unavailable: ${e.message}`); }
}); }
let markets,built;
function unsigned(result) {
  const tx=VersionedTransaction.deserialize(Buffer.from(result.unsignedTx,"base64"));
  assert.equal(tx.message.staticAccountKeys[0].toBase58(),authority);
  assert.equal(tx.message.header.numRequiredSignatures,1);
  assert.ok(tx.signatures.every(s=>s.every(b=>b===0)));
  assert.ok(tx.message.staticAccountKeys.some(k=>k.equals(phoenix.PROGRAM)));
  assert.equal(result.cluster,"mainnet-beta"); assert.equal(result.mode,"read-only-mainnet");
  return tx;
}
liveTest("Phoenix lists every live API market with mark, funding and leverage", async()=>{
  const c=createPhoenixClient({apiUrl:phoenix.API,auth:false,ws:false,timeout:15000,rateLimitRetry:false});
  try {
    const source=await c.api.markets().getMarkets(); markets=await phoenix.perpMarkets();
    assert.deepEqual(markets.map(m=>m.market).sort(),source.map(m=>m.symbol).sort());
    assert.ok(markets.length>0);
    for(const m of markets) {
      assert.ok(Number.isFinite(m.maxLeverage) && m.maxLeverage>=1);
      assert.ok(m.markPrice===null || m.markPrice>0);
      assert.ok(m.funding===null || Number.isFinite(m.funding.ratePercent));
    }
    console.log(`Real Phoenix API: ${markets.length} markets, all included`);
  } finally {c.dispose();}
});
liveTest("Phoenix quotes both sides using real depth, fees and tier-aware liquidation math",async()=>{
  for(const side of ["long","short"]) {
    const q=await phoenix.perpQuote({market:"SOL",side,usd:10,leverage:2});
    assert.ok(q.entryPrice>0 && q.notionalUsd>0 && q.baseUnits>0);
    assert.equal(q.fee,q.notionalUsd*q.feeRate);
    assert.ok(Number.isFinite(q.funding.ratePercent));
    assert.ok(q.liquidationPrice===null || q.liquidationPrice>0);
    assert.match(q.liquidationBasis,/excludes other account positions/);
    console.log(`Real SOL ${side}: entry ${q.entryPrice}, fee ${q.fee}, estimated liquidation ${q.liquidationPrice}`);
  }
  const m=(markets || await phoenix.perpMarkets()).find(m=>m.market==="SOL");
  await assert.rejects(phoenix.perpQuote({market:"SOL",side:"long",usd:10,leverage:m.maxLeverage+1}),/leverage exceeds/);
});
liveTest("Phoenix builds an actually unsigned open transaction for a public authority",async()=>{
  built=await phoenix.buildOpen({authority,market:"SOL",side:"long",usd:10,leverage:2,slippageBps:100});
  unsigned(built);
  assert.equal(built.reduceOnly,false); assert.equal(built.quote.market,"SOL");
  if(!process.env.PHOENIX_PUBLIC_URL) assert.match(built.setupRequired,/Setup required: PHOENIX_PUBLIC_URL/);
  console.log(`Real unsigned Phoenix order: ${Buffer.from(built.unsignedTx,"base64").length} bytes; authority ${authority}`);
});
liveTest("Phoenix unsigned order simulates on real mainnet with sigVerify:false",async t=>{
  if(!built) return t.skip("Phoenix open build unavailable; see preceding live build test");
  const connection=await phoenix.simulationConnection();
  const simulation=await connection.simulateTransaction(unsigned(built),{sigVerify:false,replaceRecentBlockhash:true,commitment:"confirmed"});
  console.log(`Real Phoenix mainnet simulation: ${JSON.stringify(simulation.value.err)}`);
  if(simulation.value.err && (!process.env.PHOENIX_AUTHORITY || built.setupRequirements.length || ["AccountNotFound","InsufficientFundsForFee"].includes(simulation.value.err))) {
    const why=`Setup required: PHOENIX_AUTHORITY (registered, enabled, funded trader and SOL fee payer); actual simulation returned ${JSON.stringify(simulation.value.err)}`;
    console.log(`SKIP: ${why}`); return t.skip(why);
  }
  assert.equal(simulation.value.err,null,JSON.stringify(simulation.value));
  assert.ok(simulation.value.unitsConsumed>0);
});
liveTest("Phoenix reads actual positions and builds a reduce-only close when an account is available",async t=>{
  let positions;
  try {positions=await phoenix.positions(authority);}
  catch(e) {if(!e.message.startsWith("Setup required: PHOENIX_AUTHORITY")) throw e; console.log(`SKIP: ${e.message}`);return t.skip(e.message);}
  assert.ok(Array.isArray(positions));
  if(!positions.length) return t.skip("Setup required: PHOENIX_AUTHORITY needs an open position for the close test");
  const p=positions[0];
  const close=await phoenix.buildClose({authority,market:p.market,traderPdaIndex:p.traderPdaIndex,subaccountIndex:p.subaccountIndex});
  unsigned(close);assert.equal(close.reduceOnly,true);assert.equal(close.baseUnits,p.baseUnits);
  assert.notEqual(close.side,p.side);assert.equal(close.subaccountIndex,p.subaccountIndex);
});
