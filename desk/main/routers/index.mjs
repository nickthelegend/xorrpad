/**
 * routers/index.mjs — which router executes a trade.
 *
 * There is one today. The point of the seam is not variety for its own sake:
 * the tokenized equities in `stocks.mjs` have their depth on a custom
 * concentrated-liquidity factory and on Uniswap v4, neither of which a direct
 * V3 call can reach, so an aggregator is the only route to them. This is where
 * one plugs in.
 *
 * A router is selected only if it says it is `available()` — meaning it has
 * whatever credential it needs. A router that cannot run must never be chosen
 * and must never be reported: the route on a fill is read back off the mined
 * receipt in dex.mjs precisely so a label cannot drift from what happened.
 */
import * as uniswap from "./uniswap.mjs";
import * as kyberswap from "./kyberswap.mjs";

/**
 * Every router built, in preference order.
 *
 * Uniswap first, deliberately. It is the path with measured behaviour behind it
 * in this codebase and it needs nothing but an RPC, so a fill is always
 * possible. KyberSwap is chosen explicitly (`ROUTER=kyberswap`) or by the code
 * that needs it — the tokenized equities, which a direct V3 call cannot reach.
 */
export const ALL = [uniswap, kyberswap];

/** Those that have what they need to run right now. */
export function usable() { return ALL.filter((r) => r.available()); }

/**
 * The router to trade through.
 *
 * `ROUTER` names one explicitly; otherwise the first usable one wins. Naming a
 * router that cannot run is an error rather than a silent fallback — quietly
 * routing somewhere other than where you were told is how a fill ends up
 * claiming a venue it never touched.
 */
export function pick(preferred = process.env.ROUTER) {
  const ready = usable();
  if (!ready.length) throw new Error("no router is available — this build cannot execute a trade");
  if (!preferred) return ready[0];
  const want = ALL.find((r) => r.name === preferred);
  if (!want) throw new Error(`unknown router "${preferred}" — built: ${ALL.map((r) => r.name).join(", ")}`);
  if (!want.available())
    throw new Error(`router "${preferred}" is built but not usable — it is missing its API key`);
  return want;
}

/** Address -> router name, for reading a route back off a receipt. */
export function bySpender() {
  return new Map(ALL.map((r) => [String(r.spender).toLowerCase(), r.name]));
}

/** The router by name, whether or not it is the preferred one. */
export function byName(n) { return ALL.find((r) => r.name === n) || null; }

/**
 * Quote every usable router and return them best-first.
 *
 * The losers are kept, not discarded. A fill that says "routed through X" is a
 * claim; a fill that says "X beat Y by 0.4%, and here is Y's number" is an
 * auditable one — and it is the only way to notice the aggregator quietly
 * getting worse than the direct pool.
 *
 * A router that throws is recorded with its reason rather than dropped: "the
 * aggregator was unreachable" and "the aggregator had no route" are different
 * facts, and losing that distinction is how a network problem gets diagnosed as
 * a liquidity one.
 */
export async function quoteAll(sell, buy, amountIn) {
  const rs = usable();
  const settled = await Promise.all(rs.map(async (r) => {
    const t0 = Date.now();
    try {
      const q = await r.quote(sell, buy, amountIn);
      return { router: r, name: r.name, quote: q, out: q.amountOut, ms: Date.now() - t0 };
    } catch (e) {
      return { router: r, name: r.name, error: String(e.message || e).slice(0, 140), ms: Date.now() - t0 };
    }
  }));
  const ok = settled.filter((x) => x.quote && Number.isFinite(x.out) && x.out > 0)
                    .sort((a, b) => b.out - a.out);
  return { best: ok[0] || null, all: settled, failed: settled.filter((x) => x.error) };
}

/**
 * How much the winner won by, as a fraction. Null when nothing to compare
 * against — which is not the same as a margin of zero.
 */
export function margin(ranked) {
  const ok = ranked.all.filter((x) => x.quote).sort((a, b) => b.out - a.out);
  if (ok.length < 2) return null;
  return (ok[0].out - ok[1].out) / ok[1].out;
}
