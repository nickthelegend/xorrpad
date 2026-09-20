// The experiment that actually judges the 30% gas margin in dex.mjs.
//
// Population variance across other people's swaps says nothing about our
// margin — we estimate per call, against our own calldata. What can break the
// margin is drift between OUR estimate and OUR inclusion: a cold storage slot
// the first time this wallet receives a token, or an extra initialized tick
// crossed because the pool moved after we estimated.
//
// Both numbers are on-chain after the fact:
//   tx.gas        the limit we set, which is estimate * 1.30
//   receipt.gasUsed  what it really took
// so estimate = tx.gas / 1.3, and drift = gasUsed / estimate. Anything at or
// above 1.30 would have run out of gas.
//
//   node test/gas-drift.mjs
import "./env.mjs";
const { swap } = await import("../main/dex.mjs");
const { pub } = await import("../main/chain.mjs");
const { MARKETS } = await import("../main/markets.mjs");

const MARGIN = 1.30;
// Prefer tokens this wallet is least likely to have touched, so at least one
// leg pays the cold-SSTORE cost that the margin exists to absorb.
const picks = ["ETH", ...Object.keys(MARKETS || {}).filter((s) => s !== "ETH" && s !== "USDC").slice(0, 4)];
const rows = [];

for (const sym of picks) {
  try {
    const f = await swap("USDC", sym, 5);
    if (!f?.hash) throw new Error("no hash");
    const [tx, rc] = await Promise.all([
      pub.getTransaction({ hash: f.hash }),
      pub.getTransactionReceipt({ hash: f.hash }),
    ]);
    const limit = Number(tx.gas);
    const used = Number(rc.gasUsed);
    const estimate = limit / MARGIN;
    const drift = used / estimate;
    rows.push({ sym, limit, used, estimate: Math.round(estimate), drift, ok: drift < MARGIN });
    console.log(`  USDC->${sym.padEnd(7)} estimate ${Math.round(estimate).toString().padStart(7)}  used ${used.toString().padStart(7)}  limit ${limit.toString().padStart(7)}  drift ${drift.toFixed(3)}x`);
  } catch (e) {
    console.log(`  USDC->${sym.padEnd(7)} skipped: ${e.message.split("\n")[0].slice(0, 80)}`);
  }
}

if (!rows.length) { console.log("\nno fills — cannot judge the margin"); process.exit(1); }
const worst = rows.reduce((a, b) => (b.drift > a.drift ? b : a));
const headroom = ((MARGIN - worst.drift) / MARGIN) * 100;
console.log(`\nworst drift ${worst.drift.toFixed(3)}x on USDC->${worst.sym} (margin is ${MARGIN}x)`);
console.log(headroom > 0
  ? `the 30% margin held with ${headroom.toFixed(1)}% of it still unused`
  : `the 30% margin was EXCEEDED — this swap would have run out of gas`);
console.log(`\nCaveat: measured on a fork, uncontested. It cannot show a pool moving`);
console.log(`between our estimate and a contested mainnet inclusion.`);
process.exit(rows.every((r) => r.ok) ? 0 : 1);
