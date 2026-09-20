// T5.1's bar, as a re-runnable file rather than something typed once into a
// terminal and lost.
//
// The failure this guards against is not a slow swap — it is the fork WEDGING:
// a free public RPC rate-limits under burst archive traffic, anvil backs off,
// and every read that needs an upstream fetch stops answering for the rest of
// the session. That is the most likely way a live demo dies, so the bar is a
// sustained run, not a single fill.
//
//   node test/stress.mjs [count]
//
// Real swaps against the real fork. Nothing here is simulated.
import "./env.mjs";
const N = Number(process.argv[2] || 30);
const { swap } = await import("../main/dex.mjs");
const { pub } = await import("../main/chain.mjs");

const times = [];
let ok = 0;
const failures = [];
const t0 = Date.now();

for (let i = 0; i < N; i++) {
  // Alternate direction so the run does not simply drain one side of a pool
  // and start failing for a reason that has nothing to do with the upstream.
  const buying = i % 2 === 0;
  const a = Date.now();
  try {
    const f = buying ? await swap("USDC", "ETH", 5) : await swap("ETH", "USDC", 0.001);
    if (!f?.hash) throw new Error("no hash on the fill");
    times.push(Date.now() - a);
    ok++;
    process.stdout.write(`  ${String(i + 1).padStart(2)}/${N} ${buying ? "USDC->ETH" : "ETH->USDC"} ${f.hash.slice(0, 12)}… ${Date.now() - a}ms\n`);
  } catch (e) {
    times.push(Date.now() - a);
    failures.push(`#${i + 1} ${buying ? "USDC->ETH" : "ETH->USDC"}: ${e.message.split("\n")[0].slice(0, 120)}`);
    process.stdout.write(`  ${String(i + 1).padStart(2)}/${N} FAILED ${e.message.split("\n")[0].slice(0, 90)}\n`);
  }
}

// A wedged fork does not always throw — it can also go silent. Prove the node
// still answers an upstream-backed read after the run, not just during it.
let alive = false, headErr = "";
try {
  await pub.getBlockNumber();
  await pub.getBalance({ address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" });
  alive = true;
} catch (e) { headErr = e.message.split("\n")[0].slice(0, 100); }

const secs = ((Date.now() - t0) / 1000).toFixed(1);
const slowest = Math.max(...times);
console.log(`\nRESULT: ${ok} ok / ${N - ok} failed in ${secs}s, slowest single swap ${slowest}ms`);
console.log(`fork still answering upstream-backed reads afterwards: ${alive ? "YES" : "NO — " + headErr}`);
for (const f of failures) console.log(`  ! ${f}`);
process.exit(ok === N && alive ? 0 : 1);
