/** Real devnet only: no stubs, no local validator, no signing key. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import * as pm from "../main/chains/pmamm.mjs";

// A throwaway public point, with no corresponding signing key generated or held.
let bytes;
do { bytes = randomBytes(32); } while (!PublicKey.isOnCurve(bytes));
const owner = process.env.PMAMM_TEST_OWNER || new PublicKey(bytes).toBase58();
const networkFailure = e => /fetch failed|timeout|timed out|ECONN|ENOTFOUND|HTTP (429|50[0234])|429 Too Many|503 Service/i.test(e.message);
function realTest(name, ...args) {
  const fn=args.pop(), options=args[0] || {};
  return test(name,options,async t=>{
    try { await fn(t); }
    catch(e) {
      if(!networkFailure(e)) throw e;
      console.log(`SKIP: devnet unreachable: ${e.message}`);
      t.skip(`devnet unreachable: ${e.message}`);
    }
  });
}

let rows, connection, blocked;
async function live(t) {
  if (blocked) { t.skip(blocked); return false; }
  try {
    connection ||= await pm.devnetConnection();
    rows ||= await pm.markets();
    return true;
  } catch(e) {
    if (!networkFailure(e)) throw e;
    blocked = `devnet unreachable: ${e.message}`;
    console.log(`SKIP: ${blocked}`); t.skip(blocked); return false;
  }
}
function unsigned(built) {
  const tx = VersionedTransaction.deserialize(Buffer.from(built.unsignedTx, "base64"));
  assert.ok(tx.signatures.every(s => s.every(byte => byte === 0)), "every signature must be empty");
  assert.equal(tx.message.staticAccountKeys[0].toBase58(), owner);
  assert.ok(tx.message.staticAccountKeys.some(k => k.equals(pm.PROGRAM)));
  assert.equal(built.cluster, "devnet");
  if (!process.env.PMAMM_PUBLIC_URL) assert.match(built.setupRequired, /Setup required: PMAMM_PUBLIC_URL/);
  return tx;
}
let selected, built;
realTest("pm-AMM reads live devnet markets with real price, end time and vault liquidity", async t => {
  if (!await live(t)) return;
  assert.ok(Array.isArray(rows));
  for (const row of rows) {
    assert.ok(row.name && row.endTs > Date.now()/1000);
    assert.ok(row.yesPrice >= 0 && row.yesPrice <= 1);
    assert.ok(row.liquidity === null || row.liquidity >= 0);
  }
  selected = rows.filter(r => r.liquidity > 10 && r.yesPrice > .1 && r.yesPrice < .9)
    .sort((a,b) => b.liquidity-a.liquidity)[0];
  console.log(`Real devnet: ${rows.length} live markets; throwaway owner ${owner}`);
});
realTest("pm-AMM quotes YES and NO and builds an unsigned swap for a throwaway public key", async t => {
  if (!await live(t)) return;
  if (!selected) return t.skip("devnet has no live liquid mUSDC market");
  for (const side of ["yes", "no"]) {
    const quote = await pm.quote({ market:selected.market, side, usdc:1 });
    assert.ok(quote.expectedShares > 0 && Number.isFinite(quote.priceImpactPct));
    assert.equal(quote.feeRaw, 20000);
    const result = await pm.buildSwap({ owner, market:selected.market, side, usdc:1, slippageBps:100 });
    unsigned(result);
    assert.equal(result.minOutputRaw, Math.floor(result.quote.amountOutRaw*.99));
    if (side === "yes") built=result;
  }
});
realTest("the unsigned pm-AMM swap simulates successfully on real devnet", { timeout:90000 }, async t => {
  if (!await live(t)) return;
  if (!built) return t.skip("no live market swap was built");
  const firstSimulation = await connection.simulateTransaction(unsigned(built), {sigVerify:false,replaceRecentBlockhash:true,commitment:"confirmed"});
  console.log(`Initial real devnet simulation: ${JSON.stringify(firstSimulation.value.err)}`);
  if(firstSimulation.value.err===null) {
    assert.ok(firstSimulation.value.unitsConsumed>0);
    console.log(`Real devnet simulation: ${firstSimulation.value.unitsConsumed} CU, err=null`);
    return;
  }
  const payer = new PublicKey(owner);
  let sol = await connection.getBalance(payer), fundingReason="";
  if (sol < 20000000 && !process.env.PMAMM_TEST_OWNER) {
    try {
      await connection.requestAirdrop(payer, 1000000000);
      await setTimeout(15000);
      sol = await connection.getBalance(payer);
    } catch(e) { fundingReason = /410/.test(e.message) ? "HTTP 410: RPC faucet closed on devnet" : e.message.split("\n")[0]; }
  }
  if (sol < 20000000) {
    const reason=`Setup required: PMAMM_TEST_OWNER — fund a throwaway devnet public key with SOL and mUSDC; airdrop unavailable (${fundingReason || "insufficient SOL"})`;
    console.log(`SKIP: ${reason}`); return t.skip(reason);
  }
  const { getAssociatedTokenAddressSync } = await import("@solana/spl-token");
  const collateral = getAssociatedTokenAddressSync(pm.COLLATERAL,payer);
  let funds = await connection.getAccountInfo(collateral);
  if ((!funds || funds.data.readBigUInt64LE(64)<1000000n) && !process.env.PMAMM_TEST_OWNER) {
    const faucet = await fetch("https://pm-amm-devnet.vercel.app/api/faucet", {
      method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({wallet:owner}), signal:AbortSignal.timeout(20000),
    });
    if (!faucet.ok) fundingReason=`mUSDC faucet HTTP ${faucet.status}`;
    else await setTimeout(15000);
    funds = await connection.getAccountInfo(collateral);
  }
  if (!funds || funds.data.readBigUInt64LE(64)<1000000n) {
    const reason=`Setup required: PMAMM_TEST_OWNER — throwaway devnet wallet needs mUSDC (${fundingReason || "empty collateral account"})`;
    console.log(`SKIP: ${reason}`); return t.skip(reason);
  }
  // Rebuild after funding to refresh the quote and blockhash.
  built=await pm.buildSwap({owner,market:selected.market,side:"yes",usdc:1,slippageBps:100});
  const simulation = await connection.simulateTransaction(unsigned(built), {sigVerify:false,replaceRecentBlockhash:true,commitment:"confirmed"});
  assert.equal(simulation.value.err,null,JSON.stringify(simulation.value));
  assert.ok(simulation.value.unitsConsumed>0);
  console.log(`Real devnet simulation: ${simulation.value.unitsConsumed} CU, err=null`);
});
realTest("pm-AMM builds unsigned market creation and reads actual owner positions", async t => {
  if (!await live(t)) return;
  const create = await pm.buildCreateMarket({ owner, name:"xorrpad unsigned devnet check", durationSecs:3600, initialPriceBps:5000, depositUsdc:1 });
  unsigned(create);
  assert.ok(create.market && Number.isSafeInteger(create.marketId));
  assert.ok(Array.isArray(await pm.positions(owner)));
});
realTest("pm-AMM builds an unsigned claim from a real resolved devnet market", async t => {
  if (!await live(t)) return;
  const { createRequire } = await import("node:module");
  const { PmAmmClient } = createRequire(import.meta.url)("@pm-amm/sdk");
  const client=PmAmmClient.readOnly(connection,pm.PROGRAM,pm.COLLATERAL);
  const resolved=(await client.fetchAllMarkets(443)).find(r=>r.account.resolved && r.account.collateralMint.equals(pm.COLLATERAL));
  if(!resolved) return t.skip("devnet has no resolved mUSDC market to build a claim against");
  const claim=await pm.buildClaim({owner,market:resolved.publicKey.toBase58()});
  unsigned(claim);
  assert.equal(claim.market,resolved.publicKey.toBase58());
});
