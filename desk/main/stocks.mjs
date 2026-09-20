/**
 * stocks.mjs — Coinbase tokenized equities on Base.
 *
 * Real US shares, on the same chain and the same quote asset as everything else
 * the pad trades. Each token is backed 1:1 by a share held at Alpaca, a
 * regulated broker, and carries dividends and voting rights — ownership, not
 * price exposure wrapped in a certificate. They went live natively on Base on
 * 24 August 2026.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE THING THAT MATTERS MOST, AND IT IS NOT OBVIOUS
 *
 * These are **B20 tokens** — a standard Base built for stablecoins and
 * real-world assets — and they are implemented BY THE BASE NODE, not as EVM
 * bytecode. `eth_getCode` on one of these addresses returns a single byte,
 * `0xef`, which is a reserved prefix rather than a program.
 *
 * Measured on 2026-09-09, the same call to the same address:
 *
 *   real Base mainnet   symbol() -> "NVDAc"
 *   local anvil fork    symbol() -> EVM error: OpcodeNotFound
 *
 * anvil is vanilla revm. It forks *state*, and there is no state here to fork —
 * the behaviour lives in the node. **Tokenized stocks therefore cannot be
 * traded on a fork at all.** Not "the pool is thin", not "the block is stale":
 * the token does not exist there and every call to it reverts.
 *
 * That is why every entry below is `mainnetOnly: true`, and why the pad refuses
 * these markets on a fork with that reason rather than a generic failure. It is
 * the one part of this product that cannot be demonstrated without real money.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WHERE THE LIQUIDITY IS
 *
 * Not on Uniswap V3, which is the only router this codebase implements. Taking
 * NVDAc as the example, measured 2026-09-09:
 *
 *   venue                              pair          liquidity
 *   Aerodrome concentrated (custom)    NVDAc/USDC    $2,233,000   ← the deep one
 *   Uniswap v4                         NVDAc/ETH     $635,100
 *   Uniswap v4                         NVDAc/USDC    $287,600
 *   Uniswap v3                         NVDAc/WETH    $49,200
 *   Uniswap v3                         NVDAc/USDC    $11,200      ← too thin to use
 *
 * The deep pool is `0x853F5f1B92b16714Fe6CDA67CAad0856B83C7ab9`. It reports
 * `fee() = 500` and `tickSpacing() = 10` — a concentrated-liquidity pool — but
 * its `factory()` is `0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef`, which is
 * neither Uniswap's nor Aerodrome's published Slipstream factory. Quoting it
 * needs that deployment's own quoter.
 *
 * Liquidity spread across a custom CL factory, Uniswap v4 and Uniswap v3 is
 * precisely the problem a DEX aggregator exists to solve, and it is why routing
 * these through 1inch or 0x is the right answer rather than hand-rolling three
 * more routers. Until that lands, these markets quote and refuse honestly
 * instead of pretending a Uniswap V3 path exists.
 */

/** Every ticker verified on real Base mainnet: symbol(), decimals(), and a
 *  pool with real depth. Liquidity figures are USD, measured 2026-09-09. */
export const STOCKS = {
  NVDAc:  { symbol: "NVDAc",  label: "NVIDIA",            company: "NVIDIA Corporation",
            address: "0xb20000000000000000000078ee7ce2fE4908108C", decimals: 8, liquidityUsd: 2_233_000,
            pool: "0x853F5f1B92b16714Fe6CDA67CAad0856B83C7ab9" },
  GOOGLc: { symbol: "GOOGLc", label: "Alphabet",          company: "Alphabet Inc. Class A",
            address: "0xb2000000000000000000002D0BA3164cc74f58B7", decimals: 8, liquidityUsd: 1_690_000,
            pool: "0xB1987CAD1682841b4b641d50E520777eC5Ab5542" },
  AAPLc:  { symbol: "AAPLc",  label: "Apple",             company: "Apple Inc.",
            address: "0xb200000000000000000000C2e324d24d7eEcd1fb", decimals: 8, liquidityUsd: 1_511_000,
            pool: "0xA3b1E3f9747065e2073722Ff4c9027d3eA4994F0" },
  METAc:  { symbol: "METAc",  label: "Meta",              company: "Meta Platforms, Inc.",
            address: "0xb2000000000000000000008bC8786B856E61707C", decimals: 8, liquidityUsd: 1_308_000,
            pool: "0xEAF57753BC382E0324a1D43F72E7027705a2273E" },
  AMZNc:  { symbol: "AMZNc",  label: "Amazon",            company: "Amazon.com, Inc.",
            address: "0xb200000000000000000000d9192b6B456483C2E8", decimals: 8, liquidityUsd:   848_000,
            pool: "0xd03Bc8C7F2FAedCe2aac81bF0444AEA08Ea06E9b" },
  MSFTc:  { symbol: "MSFTc",  label: "Microsoft",         company: "Microsoft Corporation",
            address: "0xB200000000000000000000Ab99cFa739E253872B", decimals: 8, liquidityUsd:   711_000,
            pool: "0x7103eB3c9590d1281f7dc03b2A9EE27C39dF5D54" },
  SNDKc:  { symbol: "SNDKc",  label: "SanDisk",           company: "SanDisk Corporation",
            address: "0xb200000000000000000000397293Cb8cda9a10c5", decimals: 8, liquidityUsd:   650_000,
            pool: "0x5A8236f575471e7BfCA2C8462a200c28f737246E" },
  SPCXc:  { symbol: "SPCXc",  label: "SpaceX",            company: "Space Exploration Technologies",
            address: "0xb2000000000000000000007b9fcbd005511aCBd5", decimals: 8, liquidityUsd:   620_000,
            pool: "0x0bf58fe0FAc935Ac69595c19B12Ba0d75E3F8c0E" },
  TSLAc:  { symbol: "TSLAc",  label: "Tesla",             company: "Tesla, Inc.",
            address: "0xb2000000000000000000001e800a7f5189430cD0", decimals: 8, liquidityUsd:   609_000,
            pool: "0x469337fDcc5E8f38e2E4B670B04F57865D13a7BB" },
  MSTRc:  { symbol: "MSTRc",  label: "Strategy",          company: "Strategy Inc. (MicroStrategy)",
            address: "0xb2000000000000000000004884b426556b92883d", decimals: 8, liquidityUsd:   599_000,
            pool: "0x8b27f626ab668197000BC722A1012022CAeD10E2" },
};

/** Announced in the Coinbase rollout but with no Base pair found on
 *  2026-09-09. Kept so the pad can say why rather than shrug. */
export const STOCKS_UNLISTED = {
  COINc: { reason: "announced in the rollout, but no Base pool found on 2026-09-09" },
  INTCc: { reason: "announced in the rollout, but no Base pool found on 2026-09-09" },
  CRCLc: { reason: "announced in the rollout, but no Base pool found on 2026-09-09" },
};

export const STOCK_SYMBOLS = Object.keys(STOCKS);
export const isStock = (s) => Boolean(STOCKS[s]);

/**
 * Why a stock cannot be traded right now, or null if it can.
 *
 * Two separate refusals, and conflating them would be the dishonest move: one
 * is "you are on a fork and these tokens do not exist there", the other is
 * "this codebase cannot reach the pool yet".
 */
export function stockBlocker(symbol, { isFork, hasAggregator }) {
  if (!STOCKS[symbol]) return STOCKS_UNLISTED[symbol]?.reason || `${symbol} is not a listed equity`;
  if (isFork)
    return `${symbol} is a B20 token implemented by the Base node, not as EVM bytecode — ` +
           `a fork returns OpcodeNotFound for every call to it, at any block. The aggregator ` +
           `quotes it against real mainnet and would route it; only CHAIN_MODE=mainnet can fill it.`;
  if (!hasAggregator)
    return `${symbol}'s depth is on a concentrated-liquidity pool a direct Uniswap V3 call ` +
           `cannot reach (custom factory, plus Uniswap v4). It needs the aggregator router, ` +
           `which is disabled here — unset KYBERSWAP=off.`;
  return null;
}

/**
 * What the pool says a share costs, in USDC.
 *
 * THIS WORKS ON A FORK, and the reason is worth stating: the B20 token is
 * implemented by the node and reverts on a fork, but the POOL is ordinary EVM
 * bytecode — an EIP-1167 clone, 45 bytes — so `slot0()` answers normally. Price
 * the pool and never touch the token, and a fork can quote an equity it can
 * never trade.
 *
 * Every pool address above was discovered on-chain from the CL factory at
 * 0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef via getPool(USDC, token, 10) —
 * not copied from a listing.
 *
 * This is deliberately the POOL's price, not the share price on an exchange.
 * They can differ, and on a thin pool they differ a lot: SNDKc reads far above
 * SanDisk's quoted price. The pool's number is the one that matters here
 * because it is the one you would actually pay — and `priceImpact()` still
 * refuses a trade the pool is too thin to absorb.
 */
const SLOT0_ABI = [{
  type: "function", name: "slot0", stateMutability: "view", inputs: [],
  outputs: [{ type: "uint160" }, { type: "int24" }, { type: "uint16" },
            { type: "uint16" }, { type: "uint16" }, { type: "bool" }],
}];
const TOKEN0_ABI = [{ type: "function", name: "token0", stateMutability: "view",
                      inputs: [], outputs: [{ type: "address" }] }];
const USDC_ADDR = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

/** USDC per share for one ticker, or null if the pool cannot be read. */
export async function stockPrice(pub, symbol) {
  const t = STOCKS[symbol];
  if (!t?.pool) return null;
  try {
    const [slot0, token0] = await Promise.all([
      pub.readContract({ address: t.pool, abi: SLOT0_ABI, functionName: "slot0" }),
      pub.readContract({ address: t.pool, abi: TOKEN0_ABI, functionName: "token0" }),
    ]);
    const sqrt = Number(slot0[0]) / 2 ** 96;
    const ratio = sqrt * sqrt;                     // raw token1 per raw token0
    if (!Number.isFinite(ratio) || ratio <= 0) return null;
    const d = t.decimals - 6;                      // share decimals - USDC decimals
    const usdc = String(token0).toLowerCase() === USDC_ADDR
      ? Math.pow(10, d) / ratio                    // USDC is token0
      : ratio * Math.pow(10, -d);
    return Number.isFinite(usdc) && usdc > 0 ? usdc : null;
  } catch { return null; }                         // a fork without the pool, or a node blip
}

/** Every listed equity priced at once. Missing ones are simply absent. */
export async function stockPrices(pub, symbols = STOCK_SYMBOLS) {
  const out = {};
  await Promise.all(symbols.map(async (s) => {
    const p = await stockPrice(pub, s);
    if (p != null) out[s] = p;
  }));
  return out;
}
