// Historical entry point; network diagnostics now use devnet exclusively.
import assert from "node:assert/strict";
import { rpc } from "./devnet-rpc.mjs";
let fees;
try { fees = await rpc("getRecentPrioritizationFees"); }
catch(e) { console.log(`SKIP: devnet unreachable: ${e.message}`); }
if (fees) {
  assert.ok(Array.isArray(fees) && fees.length > 0);
  assert.ok(fees.every(f => Number.isSafeInteger(f.prioritizationFee) && f.prioritizationFee >= 0));
  console.log(`${fees.length} real devnet prioritization fee samples`);
}
