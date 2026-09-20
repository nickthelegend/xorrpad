/**
 * routers/kyberswap.mjs — a real DEX aggregator, with no API key.
 *
 * This exists because of a wrong conclusion worth recording: the plan had
 * aggregator routing blocked on a credential, because 0x answers 401 without a
 * key and 1inch needs KYC. Neither fact implies what was inferred from them.
 * KyberSwap's aggregator API is open — no key, no signup — and it routes Base.
 *
 * What that unlocks is not "a second quote to compare against". It is the only
 * way this project reaches the **tokenized equities**: their depth sits on a
 * concentrated-liquidity pool behind a custom factory (`aerodrome-cl`) and on
 * Uniswap v4, and a direct SwapRouter02 call cannot touch either. The
 * aggregator can, and it prices them:
 *
 *     $25 USDC -> 0.11066515 NVDAc   via aerodrome-cl-3   (measured 2026-09-09)
 *
 * Two things about it that are not obvious:
 *
 *   1. **It refuses anvil's default account.** Building a transaction for
 *      0xf39Fd6…2266 — the address of the private key printed in anvil's own
 *      startup banner — returns `wallets: invalid`. That is a sensible
 *      anti-abuse rule on their side, and it means a fork that wants to route
 *      through them needs a wallet that is not the well-known one. Set
 *      AGENT_PRIVATE_KEY to anything else; on a fork the balance is granted
 *      with a cheatcode anyway.
 *   2. **Quoting and building are separate calls.** `/routes` returns a route
 *      summary; `/route/build` turns that exact summary into calldata. The
 *      summary must be passed back verbatim — it is signed state, not a hint.
 */
import { formatUnits, parseUnits } from "viem";
import { account } from "../chain.mjs";
import { TOKENS } from "../tokens.mjs";
import { STOCKS } from "../stocks.mjs";

export const name = "kyberswap";

const BASE = "https://aggregator-api.kyberswap.com/base/api/v1";
const TIMEOUT_MS = Number(process.env.KYBER_TIMEOUT_MS || 12_000);

/**
 * No key to check, so the only question is whether the operator has turned it
 * off. It is opt-in rather than default: the direct Uniswap path is the one
 * with years of measured behaviour behind it in this codebase, and an
 * aggregator adds a network dependency to every fill.
 */
export function available() {
  return process.env.KYBERSWAP !== "off";
}

/** The aggregator's router — the contract that pulls the input token. */
export let spender = "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5";

/** Equities are addressable too; they are simply not in TOKENS. */
function meta(sym) {
  if (TOKENS[sym]) return { address: TOKENS[sym].address, decimals: TOKENS[sym].decimals, native: TOKENS[sym].native };
  if (STOCKS[sym]) return { address: STOCKS[sym].address, decimals: STOCKS[sym].decimals };
  throw new Error(`${sym} is not a token this build knows`);
}

// Native ETH is the sentinel to the aggregator, but this codebase wraps before
// trading, so route WETH and keep the two paths identical.
const addr = (s) => (meta(s).native ? TOKENS.WETH.address : meta(s).address);

async function get(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS),
                               headers: { "x-client-id": "xorr-pad" } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.code !== 0)
    throw new Error(`kyberswap: ${j.message || `HTTP ${r.status}`}`);
  return j.data;
}

export async function quote(sell, buy, amountIn) {
  const tIn = meta(sell), tOut = meta(buy);
  const amt = parseUnits(String(amountIn), tIn.decimals);
  const url = `${BASE}/routes?tokenIn=${addr(sell)}&tokenOut=${addr(buy)}` +
              `&amountIn=${amt}&gasInclude=true`;
  let data;
  try {
    data = await get(url);
  } catch (e) {
    // Distinguish "no route" from "the aggregator is unreachable". Calling a
    // network failure a liquidity failure sends an operator hunting for a pool
    // problem that does not exist — the same mistake the Uniswap path already
    // guards against.
    const m = String(e.message || e);
    if (/timed out|aborted|fetch failed|ENOTFOUND|ECONNREFUSED/i.test(m))
      throw new Error(`could not reach the KyberSwap aggregator (${m}). This is not a liquidity problem.`);
    throw new Error(`no aggregator route for ${sell}->${buy}: ${m}`);
  }
  const rs = data.routeSummary;
  if (data.routerAddress) spender = data.routerAddress;
  const out = BigInt(rs.amountOut);
  if (out <= 0n) throw new Error(`no aggregator route for ${sell}->${buy}`);

  return {
    route: name,
    // The venues actually used, so a fill can say where it went rather than
    // just naming the aggregator that chose.
    venues: [...new Set((rs.route || []).flat().map((h) => h.exchange))],
    amountIn, amountInRaw: amt,
    amountOut: Number(formatUnits(out, tOut.decimals)),
    amountOutRaw: out,
    price: Number(formatUnits(out, tOut.decimals)) / Number(amountIn),
    summary: rs,                      // passed back verbatim to build
    usd: Number(rs.amountOutUsd) || null,
  };
}

/**
 * Turn the quote into calldata. Returns raw `{to, data, value}` — an aggregator
 * has no ABI to encode against, and dex.mjs sends this as a plain transaction.
 */
export async function buildSwap({ quote: q, slippagePct = 1 }) {
  if (!q?.summary) throw new Error("kyberswap: buildSwap needs the summary from quote()");
  const r = await fetch(`${BASE}/route/build`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-client-id": "xorr-pad" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      routeSummary: q.summary,
      sender: account.address,
      recipient: account.address,
      slippageTolerance: Math.round(slippagePct * 100),   // basis points
      source: "xorr-pad",
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.code !== 0) {
    const why = JSON.stringify(j.details || j.message || `HTTP ${r.status}`);
    if (/wallets/.test(why))
      throw new Error(
        `KyberSwap refused to build for ${account.address}. It rejects anvil's ` +
        `default account, whose key is printed in anvil's own banner — set ` +
        `AGENT_PRIVATE_KEY to any other key; a fork grants the balance regardless.`);
    throw new Error(`kyberswap could not build the swap: ${why}`);
  }
  return { to: j.data.routerAddress, data: j.data.data, value: 0n };
}
