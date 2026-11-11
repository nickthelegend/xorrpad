// Sustained real devnet reads. The desk cannot sign or submit swaps.
import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";
import { rpc } from "./devnet-rpc.mjs";
const n = Number(process.argv[2] || 3);
for (let i = 0; i < n; i++) {
  let slot;
  try { slot = await rpc("getSlot"); }
  catch (e) { console.log(`SKIP: devnet unreachable: ${e.message}`); break; }
  assert.ok(slot > 0);
  console.log(`${i + 1}/${n}: devnet slot ${slot}`);
  if (i + 1 < n) await setTimeout(15000);
}
