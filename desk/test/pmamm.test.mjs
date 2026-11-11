import { test } from "node:test";
import assert from "node:assert/strict";
import { rawUsdc, buildSwap, buildCreateMarket, buildClaim, quote, walletRequest } from "../main/chains/pmamm.mjs";
import { ALL, assertNeverSigns, pick } from "../main/chains/index.mjs";
import { readFile } from "node:fs/promises";

test("mUSDC conversion preserves six decimals and refuses rounding or overflow", () => {
  assert.equal(rawUsdc("12.345678"),12345678);
  assert.equal(rawUsdc("0.000001"),1);
  assert.equal(rawUsdc(0,true),0);
  for(const v of [0,-1,"0.0000001","1e4",Infinity,NaN,null,undefined,"9007199255"]) assert.throws(()=>rawUsdc(v));
});
test("every registered Solana venue refuses signing and has no signing call", async () => {
  assert.equal(await assertNeverSigns(),true);
  assert.deepEqual(ALL.map(v=>v.id),["solana","pmamm","phoenix","meteora","jupperps"]);
  assert.throws(()=>pick("unknown"),/unknown chain/);
  for(const venue of ALL) {
    const source = await readFile(new URL(`../main/chains/${venue.id}.mjs`,import.meta.url),"utf8");
    assert.doesNotMatch(source,/\.signTransaction\(|\.sendAndConfirm\(|\.sendRawTransaction\(|\.send\.\w+\(/);
  }
});
test("transaction builders require a public wallet address, with the exact setup variable", async () => {
  const previous=process.env.SOLANA_ADDRESS;
  delete process.env.SOLANA_ADDRESS;
  try {
    for(const fn of [buildSwap,buildCreateMarket,buildClaim]) await assert.rejects(fn({}),/Setup required: SOLANA_ADDRESS/);
    await assert.rejects(buildSwap({owner:"invalid"}),/invalid SOLANA_ADDRESS/);
  } finally { if(previous !== undefined) process.env.SOLANA_ADDRESS=previous; }
});
test("invalid quote inputs and unknown wallet requests fail without querying a chain", async () => {
  await assert.rejects(quote({side:"other",usdc:1}),/side must/);
  await assert.rejects(quote({side:"yes",usdc:"0.0000001"}),/at most 6 decimals/);
  assert.equal((await walletRequest("unknown","GET")).status,410);
});
