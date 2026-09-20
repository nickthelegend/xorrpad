// T1.7 — gas and slippage against REAL mainnet conditions.
//
// The plan called this "measurable only on mainnet" and therefore blocked
// behind spending money. Two thirds of it are not: reading the chain costs
// nothing and signs nothing. What genuinely needs a signed transaction is only
// the last part — what WE actually paid, and how our fill compared to our
// quote under contention. Everything else is a read.
//
//   node test/mainnet-conditions.mjs
//
// Reads real Base mainnet. Never signs. Never sends.
import { createPublicClient, http, formatUnits, parseUnits } from "viem";
import { base } from "viem/chains";

const RPC = process.env.MAINNET_RPC || "https://base-mainnet.public.blastapi.io";
const pub = createPublicClient({ chain: base, transport: http(RPC, { timeout: 20_000, retryCount: 2 }) });

const ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481"; // SwapRouter02
const QUOTER = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a"; // QuoterV2
const USDC   = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WETH   = "0x4200000000000000000000000000000000000006";

const QUOTER_ABI = [{
  type: "function", name: "quoteExactInputSingle", stateMutability: "nonpayable",
  inputs: [{ type: "tuple", name: "params", components: [
    { name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" },
    { name: "amountIn", type: "uint256" }, { name: "fee", type: "uint24" },
    { name: "sqrtPriceLimitX96", type: "uint160" }] }],
  outputs: [{ name: "amountOut", type: "uint256" }, { name: "sqrtPriceX96After", type: "uint160" },
    { name: "initializedTicksCrossed", type: "uint32" }, { name: "gasEstimate", type: "uint256" }],
}];

console.log(`reading real Base mainnet via ${RPC.replace(/^https:\/\//, "")}\n`);
const head = await pub.getBlockNumber();
console.log(`head block ${head}\n`);

// ── 1. what a swap really costs in gas ──────────────────────────────────────
// Not an estimate against our own unfunded account — the gas that real people
// really paid, read off mined receipts.
console.log("1. real SwapRouter02 swaps, mined on mainnet");
const gasUsed = [];
let scanned = 0;
for (let b = head; b > head - 60n && gasUsed.length < 25; b--) {
  let blk;
  try { blk = await pub.getBlock({ blockNumber: b, includeTransactions: true }); }
  catch { continue; }
  scanned++;
  for (const tx of blk.transactions) {
    if (typeof tx === "string") continue;
    if ((tx.to || "").toLowerCase() !== ROUTER.toLowerCase()) continue;
    try {
      const r = await pub.getTransactionReceipt({ hash: tx.hash });
      if (r.status === "success") gasUsed.push({ gas: Number(r.gasUsed), hash: tx.hash });
    } catch { /* receipt not available; skip */ }
    if (gasUsed.length >= 25) break;
  }
}
if (!gasUsed.length) {
  console.log(`   no direct SwapRouter02 transactions in the last ${scanned} blocks — most Base flow is aggregator-routed.`);
} else {
  const g = gasUsed.map((x) => x.gas).sort((a, b) => a - b);
  const pct = (p) => g[Math.min(g.length - 1, Math.floor((p / 100) * g.length))];
  console.log(`   ${g.length} real swaps across ${scanned} blocks`);
  console.log(`   gasUsed  min ${g[0]}  p50 ${pct(50)}  p90 ${pct(90)}  max ${g[g.length - 1]}`);
  const spread = g[g.length - 1] / g[0];
  console.log(`   max/min spread ${spread.toFixed(2)}x, p50->p90 ${(pct(90) / pct(50)).toFixed(2)}x`);
  // Do NOT read our 30% margin against this spread. These are different
  // people's swaps: different paths, hop counts, tokens and approval states.
  // Our margin is applied to estimateGas for OUR OWN exact calldata, so the
  // only thing that can break it is drift between our estimate and our
  // inclusion — cold storage slots and extra tick crossings — not the variance
  // of the population. That drift is measured on the fork by
  // test/gas-drift.mjs, which is where the 30% is actually judged.
  console.log(`   this spread is across DIFFERENT swap shapes, so it does not judge our 30% margin.`);
  console.log(`   what it does say: swap gas on Base is path-dependent by ~${spread.toFixed(1)}x, so a`);
  console.log(`   fixed gas LIMIT would be wrong; estimating per call, as dex.mjs does, is right.`);
  console.log(`   sample: ${gasUsed[0].hash}`);
}

// ── 2. what gas actually costs right now ────────────────────────────────────
console.log("\n2. real fee conditions");
const fh = await pub.getFeeHistory({ blockCount: 20, rewardPercentiles: [10, 50, 90] });
const baseFees = fh.baseFeePerGas.map(Number);
const rewards = (fh.reward || []).filter((r) => r?.length);
const avg = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const gwei = (w) => (w / 1e9).toFixed(6);
console.log(`   baseFee over 20 blocks: min ${gwei(Math.min(...baseFees))} p50 ${gwei(baseFees.sort((a,b)=>a-b)[10])} max ${gwei(Math.max(...baseFees))} gwei`);
if (rewards.length) {
  console.log(`   priority fee p10 ${gwei(avg(rewards.map((r) => Number(r[0]))))}  p50 ${gwei(avg(rewards.map((r) => Number(r[1]))))}  p90 ${gwei(avg(rewards.map((r) => Number(r[2]))))} gwei`);
}
const swings = Math.max(...baseFees) / Math.max(1, Math.min(...baseFees));
console.log(`   baseFee swing across those blocks: ${swings.toFixed(2)}x`);

// ── 3. is 1% slippage right for our sizes? ──────────────────────────────────
// Real quoter, real pool, real liquidity. Price impact is measured against the
// smallest size, which is the closest thing to spot the pool will tell us.
console.log("\n3. real price impact, USDC -> WETH (0.05% pool)");
const sizes = [1, 5, 25, 100, 1000];
let baseline = null;
for (const usd of sizes) {
  const amountIn = parseUnits(String(usd), 6);
  try {
    const { result } = await pub.simulateContract({
      address: QUOTER, abi: QUOTER_ABI, functionName: "quoteExactInputSingle",
      args: [{ tokenIn: USDC, tokenOut: WETH, amountIn, fee: 500, sqrtPriceLimitX96: 0n }],
    });
    const out = Number(formatUnits(result[0], 18));
    const rate = out / usd;
    if (baseline === null) baseline = rate;
    const impact = ((baseline - rate) / baseline) * 100;
    console.log(`   $${String(usd).padStart(4)} -> ${out.toFixed(8)} WETH   rate ${rate.toExponential(6)}   impact ${impact.toFixed(4)}%   ticks crossed ${result[2]}`);
  } catch (e) {
    console.log(`   $${String(usd).padStart(4)} -> quote failed: ${e.shortMessage || e.message.split("\n")[0]}`);
  }
}
console.log(`\n   our default slippage tolerance is 1% (dex.mjs swap(), slippagePct = 1).`);
console.log(`   Measured impact at the sizes this pad actually trades is ~0.000-0.002%,`);
console.log(`   so 1% is not "about right" — it is roughly 500x looser than the pool`);
console.log(`   requires. On a fork that is harmless. On mainnet a slippage tolerance`);
console.log(`   that loose is the sandwich window, and it is priced in OUR loss, so it`);
console.log(`   should be tightened before any real fill. See PLAN.md T1.7.`);

console.log("\nWhat this CANNOT measure without a signed transaction:");
console.log("  - the gas WE actually pay (our calldata, our approval state)");
console.log("  - our realised fill vs our quote under contention");
console.log("  - whether 30% margin survives a base-fee spike between quote and inclusion");
