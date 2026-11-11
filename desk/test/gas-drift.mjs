// Actual compute consumption from a devnet simulation, without signing.
// A funded public account is needed for a meaningful simulation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rpc } from "./devnet-rpc.mjs";
test("devnet compute budget of an unsigned transaction", async (t) => {
  const tx = process.env.PMAMM_SIMULATION_TX;
  if (!tx) return t.skip("Setup required: PMAMM_SIMULATION_TX (unsigned base64 devnet transaction)");
  let result;
  try { result = await rpc("simulateTransaction", [tx, {encoding:"base64", sigVerify:false, replaceRecentBlockhash:true}]); }
  catch(e) { return t.skip(`devnet unreachable: ${e.message}`); }
  assert.equal(result.value.err, null, JSON.stringify(result.value));
  assert.ok(result.value.unitsConsumed > 0 && result.value.unitsConsumed <= 1400000);
  console.log(`devnet units consumed: ${result.value.unitsConsumed}`);
});
