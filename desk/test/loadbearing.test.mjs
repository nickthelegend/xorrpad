/**
 * loadbearing.test.mjs — the claim, under test.
 *
 * "If deleting memory doesn't change what the agent does, it isn't memory —
 * it's a database."
 *
 * So: run a fixed set of signals through decide() with a seeded Sibyl store,
 * physically delete the store, run the IDENTICAL signals again, and assert the
 * verdicts diverge. A control signal must stay the same, so we know we are
 * measuring memory and not noise.
 */
import assert from "node:assert/strict";
import { Memory, NO_MEMORY_LIMITS } from "../main/memory.mjs";
import { decide } from "../main/decide.mjs";

const DB = "/tmp/xorrpad-loadbearing.db";
const m = new Memory({ db: DB });

// Every signal is ETH, which is allowed BOTH with memory and without it. That
// isolates the thing under test: any change in verdict is memory, not a token
// that happened to drop off the allowlist.
const SIGNALS = [
  { name: "A  ETH buy $80",  sig: { agent: "momentum", side: "BUY",  symbol: "ETH", sizeUsd: 80, reason: "+6% 24h",  confidence: .8 } },
  { name: "B  ETH buy $30",  sig: { agent: "dca",      side: "BUY",  symbol: "ETH", sizeUsd: 30, reason: "recurring", confidence: .6 } },
  { name: "C  ETH sell $30", sig: { agent: "risk",     side: "SELL", symbol: "ETH", sizeUsd: 30, reason: "stop hit",  confidence: .9 } },
  { name: "D  ETH buy $8",   sig: { agent: "dca",      side: "BUY",  symbol: "ETH", sizeUsd: 8,  reason: "recurring", confidence: .6 } },
];

const fmt = (v) => `${v.action.padEnd(7)} $${String(v.sizeUsd).padEnd(4)} ${v.why[v.why.length - 1] || ""}`;

// ---- 1. seed a real store -------------------------------------------------
await m.wipe();
await m.setReference("risk/limits", {
  max_trade_usd: 40, max_day_usd: 300, allow: ["ETH", "USDC", "cbBTC", "DEGEN"],
});
await m.setEntity("position", "ETH", { qty: 0.012, avg_entry_usd: 3100 });
await m.setEntity("rule", "no-eth-buy-over-50", {
  accepted: true, symbol: "ETH", side: "BUY", above_usd: 50,
  text: "you rejected every ETH buy over $50",
});

const withMem = await m.recallBrief();
assert.ok(withMem.limits, "seeded limits must be readable");
const before = SIGNALS.map(({ sig }) => decide(sig, withMem));

// ---- 2. delete the memory, for real --------------------------------------
const wiped = await m.wipe();
const afterBrief = await m.recallBrief();
assert.equal(afterBrief.limits, null, "after wipe there must be no remembered limits");
assert.equal(Object.keys(afterBrief.positions).length, 0, "after wipe there must be no positions");
const after = SIGNALS.map(({ sig }) => decide(sig, afterBrief));

// ---- 3. report ------------------------------------------------------------
console.log(`\nstore: ${DB}  (removed: ${wiped.removed.join(", ") || "nothing"})\n`);
console.log("signal            WITH memory                                  WITHOUT memory");
console.log("-".repeat(112));
SIGNALS.forEach((s, i) => {
  console.log(`${s.name.padEnd(17)} ${fmt(before[i]).padEnd(44)} ${fmt(after[i])}`);
});

// ---- 4. assertions: memory must change the outcome -----------------------
// A: a rule you taught it vetoes the trade. Forgotten -> it trades again.
assert.equal(before[0].action, "REJECT",  "A: remembered rule must veto the $80 ETH buy");
assert.equal(after[0].action,  "EXECUTE", "A: with memory gone the veto is forgotten");

// B: your remembered cap ($40) is what sizes the trade; without memory it
// collapses to the timid fallback instead.
assert.equal(before[1].sizeUsd, 30, "B: within the remembered $40 cap, so untouched");
assert.equal(after[1].sizeUsd, NO_MEMORY_LIMITS.max_trade_usd,
             `B: without memory it shrinks to $${NO_MEMORY_LIMITS.max_trade_usd}`);

// A memoryless agent must be MORE cautious, never equally bold. This is the
// honest answer to "what breaks when memory is deleted?"
assert.ok(NO_MEMORY_LIMITS.max_trade_usd < 40 && NO_MEMORY_LIMITS.max_day_usd < 300,
          "the no-memory fallback must be stricter than the remembered limits");

// C: selling requires knowing you hold the bag.
assert.equal(before[2].action, "EXECUTE", "C: sell allowed — position is remembered");
assert.equal(after[2].action, "REJECT",  "C: without memory it refuses to sell what it cannot see");

// D: the control — unchanged, so we know this is memory and not noise.
assert.deepEqual(
  { a: before[3].action, s: before[3].sizeUsd },
  { a: after[3].action,  s: after[3].sizeUsd },
  "D: control signal must be identical either way",
);

const changed = SIGNALS.filter((_, i) =>
  before[i].action !== after[i].action || before[i].sizeUsd !== after[i].sizeUsd).length;
console.log(`\n${changed} of ${SIGNALS.length} decisions changed when memory was deleted (control D unchanged).`);
console.log("memory is load-bearing: PASS\n");
m.stop();
