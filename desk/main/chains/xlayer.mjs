/**
 * chains/xlayer.mjs — the pad's X Layer venue, through the OKX DEX aggregator.
 *
 * X Layer is OKX's zkEVM (chain 196). It is EVM, so in principle the Base code
 * in dex.mjs could point at it — but the liquidity here does not sit in Uniswap
 * V3 pools the way it does on Base. It is spread across LFGSwap, QuickSwap, two
 * community AMMs, Uniswap V2 and V3, and a JIT router, and the only sane way to
 * reach all of that is the aggregator that already indexes it.
 *
 * So this venue speaks to the OKX Agentic Wallet CLI (`onchainos`) rather than
 * to an RPC. The CLI holds the credential; this module never sees a key.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS ONE IS READ-ONLY, EMPHATICALLY
 *
 * `onchainos swap execute` exists and it works: one command, quote → approve →
 * sign → broadcast, against the operator's real funded account on mainnet.
 * There is no fork here and no testnet worth demoing on.
 *
 * This module therefore binds only `swap quote`. Executing is left to a person
 * at a keyboard who can see what they are agreeing to. A trading device that
 * lives on a desk must not be one typo away from spending someone's balance.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * THE BOOK, MEASURED
 *
 * Liquidity reported by OKX token search, 2026-09-21:
 *
 *   USDT   0x779d…3736   $102,609,000   listed — the quote asset
 *   WOKB   0xe538…9b2b   $ 89,900,700   listed — gas token, the deep pair
 *   USDC   0xb6ce…3061   $ 25,805,700   listed
 *   WETH   0x5a77…c71c   $     46,400   thin — listed, flagged
 *   WBTC   0xea03…08e1   $      3,268   REJECTED — a $500 order is most of the pool
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export const id = "xlayer";
export const label = "X Layer";
export const chainId = 196;

/** The aggregator's own name for this chain. */
const CHAIN = "xlayer";
const CLI = process.env.ONCHAINOS_BIN || `${process.env.HOME}/.local/bin/onchainos`;
const TIMEOUT = Number(process.env.OKX_TIMEOUT_MS || 60000);

/**
 * The verified book. Addresses are pinned for the same reason the Solana
 * mints are: a ticker is not an identity, and an aggregator will happily
 * quote a token that merely shares a symbol.
 */
export const TOKENS = {
  USDT: { address: "0x779ded0c9e1022225f8e0630b35a9b54be713736", decimals: 6,  liquidity: 102609081 },
  WOKB: { address: "0xe538905cf8410324e03a5a23c1c177a474d59b2b", decimals: 18, liquidity: 89900702 },
  USDC: { address: "0xb6ceceab302e2e4948951ee7843fc24e92933061", decimals: 6,  liquidity: 25805720 },
  WETH: { address: "0x5a77f1443d16ee5761d310e38b62f77f726bc71c", decimals: 18, liquidity: 46445, thin: true },
};

export const REJECTED = {
  WBTC: "only $3,268 of liquidity — a $500 order would be most of the pool",
};

export const SYMBOLS = Object.keys(TOKENS);
export const quoteAsset = "USDT";

export function tokenOf(symbol) {
  const t = TOKENS[symbol];
  if (!t) {
    const why = REJECTED[symbol];
    throw new Error(why ? `${symbol} is not traded here: ${why}`
                        : `${symbol} is not in the X Layer book (${SYMBOLS.join(", ")})`);
  }
  return { ...t, symbol };
}

/** Is the OKX CLI present and logged in? A quote is impossible otherwise. */
let _cached = null;
export async function status() {
  if (_cached && Date.now() - _cached.at < 30000) return _cached.v;
  let v;
  try {
    const { stdout } = await run(CLI, ["wallet", "status"], { timeout: TIMEOUT });
    const j = JSON.parse(stdout);
    v = { cli: true, loggedIn: !!j?.data?.loggedIn, account: j?.data?.currentAccountName || null,
          policy: j?.data?.policy || null };
  } catch (e) {
    v = { cli: false, loggedIn: false, reason: String(e.message || e).slice(0, 120) };
  }
  _cached = { at: Date.now(), v };
  return v;
}

export function available() { return true; }     // checked properly by status()

async function cli(args) {
  const { stdout } = await run(CLI, args, { timeout: TIMEOUT, maxBuffer: 8 << 20 });
  const j = JSON.parse(stdout);
  if (!j.ok) throw new Error(`okx: ${JSON.stringify(j).slice(0, 200)}`);
  return j.data;
}

export async function info() {
  const s = await status();
  return { chain: id, label, chainId, aggregator: "okx-dex", signing: "external", ...s };
}

/** What the operator holds on X Layer, in human units. */
export async function balances() {
  const s = await status();
  if (!s.loggedIn) return {};
  const d = await cli(["wallet", "balance"]).catch(() => null);
  const out = {};
  for (const det of d?.details || []) {
    for (const t of det.tokenAssets || []) {
      if (String(t.chainIndex) !== String(chainId)) continue;
      const amt = Number(t.balance);
      if (amt > 0) out[t.symbol] = { amount: amt, decimals: Number(t.decimal), usd: Number(t.usdValue || 0),
                                     address: t.tokenAddress };
    }
  }
  return out;
}

/**
 * Price a trade through the OKX aggregator.
 *
 * The aggregator flags honeypots and transfer taxes on both legs; those flags
 * are carried through rather than dropped, because "this token charges 10% to
 * sell" is exactly the sort of thing a one-line price hides.
 */
export async function quote(sell, buy, amountIn) {
  const a = tokenOf(sell), b = tokenOf(buy);
  if (!(Number(amountIn) > 0)) throw new Error(`quote: amount must be positive, got ${amountIn}`);

  const d = await cli(["swap", "quote", "--chain", CHAIN,
                       "--from", a.address, "--to", b.address,
                       "--readable-amount", String(amountIn)]);
  const q = Array.isArray(d) ? d[0] : d;
  if (!q) throw new Error(`okx returned no route for ${sell} -> ${buy} on X Layer`);

  const amountOut = Number(q.toTokenAmount) / 10 ** b.decimals;
  if (!(amountOut > 0)) throw new Error(`okx returned a zero quote for ${sell} -> ${buy}`);

  const hops = (q.dexRouterList || []).map((r) => r.dexProtocol?.dexName).filter(Boolean);
  const route = [...new Set(hops)].join(" → ") || "okx-dex";
  const flags = [];
  for (const r of q.dexRouterList || []) {
    for (const side of [r.fromToken, r.toToken]) {
      if (side?.isHoneyPot) flags.push(`${side.tokenSymbol} flagged as a honeypot`);
      if (Number(side?.taxRate) > 0) flags.push(`${side.tokenSymbol} charges ${Number(side.taxRate) * 100}% tax`);
    }
  }

  return {
    venue: "okx-dex", chain: id, sell, buy,
    amountIn: Number(amountIn), amountOut,
    price: amountOut / Number(amountIn),
    route, flags: [...new Set(flags)],
    impactPct: Number(q.priceImpactPercentage ?? 0),
    raw: q,
  };
}

/** One unit of `symbol` in USDT. */
export async function price(symbol, notional = 50) {
  if (symbol === quoteAsset) return 1;
  const q = await quote(quoteAsset, symbol, notional);
  return notional / q.amountOut;
}

/** See WHY THIS ONE IS READ-ONLY. The CLI can execute; this module will not. */
export async function swap() {
  throw new Error(
    "x layer: quotes only — this account is funded on mainnet, so execution stays with a human " +
    "(`onchainos swap execute` if you mean it)");
}

export function markets() {
  return { symbols: SYMBOLS, quoteAsset, kind: "crypto", chainId };
}
