/**
 * agents.mjs — the six agents on the desk.
 *
 * The roster matches xorr's real agent kinds (dca, grid, momentum, rebalance,
 * yield, risk). Each is deterministic and explainable: it looks at the market
 * and at memory, and either returns a Signal or null. No LLM invents a trade
 * here — the model's job is language, not position sizing.
 *
 * Signal = { agent, side, symbol, sizeUsd, reason, confidence }
 */

export const AGENT_KINDS = ["dca", "grid", "momentum", "rebalance", "yield", "risk"];

/** Recurring buy. Fires when the configured interval has elapsed. */
function dca(market, brief, cfg = {}) {
  const symbol = cfg.symbol || "ETH";
  const sizeUsd = cfg.sizeUsd ?? 25;
  const everyMs = cfg.everyMs ?? 24 * 3600e3;
  const last = brief.baton?.dca_last_ms ?? 0;
  if (Date.now() - last < everyMs) return null;
  return { agent: "dca", side: "BUY", symbol, sizeUsd,
           reason: `recurring buy every ${Math.round(everyMs / 3600e3)}h`, confidence: 0.6 };
}

/** Ladder: buy each rung down, sell each rung up, from the remembered entry. */
function grid(market, brief, cfg = {}) {
  const symbol = cfg.symbol || "ETH";
  const step = cfg.stepPct ?? 3;
  const pos = brief.positions?.[symbol];
  const px = market.prices?.[symbol];
  if (!px || !pos?.avg_entry_usd) return null;
  const drift = ((px - pos.avg_entry_usd) / pos.avg_entry_usd) * 100;
  if (drift <= -step)
    return { agent: "grid", side: "BUY", symbol, sizeUsd: cfg.sizeUsd ?? 25,
             reason: `${drift.toFixed(1)}% below remembered entry ${pos.avg_entry_usd}`, confidence: 0.7 };
  if (drift >= step)
    return { agent: "grid", side: "SELL", symbol, sizeUsd: cfg.sizeUsd ?? 25,
             reason: `${drift.toFixed(1)}% above remembered entry ${pos.avg_entry_usd}`, confidence: 0.7 };
  return null;
}

/** Trend: act on short-window momentum. */
function momentum(market, brief, cfg = {}) {
  const symbol = cfg.symbol || "ETH";
  const th = cfg.thresholdPct ?? 2;
  const ch = market.change24hPct?.[symbol];
  if (ch == null) return null;
  if (ch >= th)
    return { agent: "momentum", side: "BUY", symbol, sizeUsd: cfg.sizeUsd ?? 50,
             reason: `+${ch.toFixed(1)}% over 24h`, confidence: Math.min(1, ch / (th * 3)) };
  if (ch <= -th)
    return { agent: "momentum", side: "SELL", symbol, sizeUsd: cfg.sizeUsd ?? 50,
             reason: `${ch.toFixed(1)}% over 24h`, confidence: Math.min(1, -ch / (th * 3)) };
  return null;
}

// Everything is bought and sold against this, so it can never be the asset a
// signal names. See rebalance().
const QUOTE = "USDC";

/** Drift the book back toward the remembered target weights. */
function rebalance(market, brief, cfg = {}) {
  const target = cfg.target || { ETH: 0.5, USDC: 0.5 };
  const band = cfg.bandPct ?? 10;
  const val = {};
  let total = 0;
  for (const [sym, p] of Object.entries(brief.positions || {})) {
    const px = sym === "USDC" ? 1 : market.prices?.[sym];
    if (!px || p?.qty == null) continue;
    val[sym] = p.qty * px;
    total += val[sym];
  }
  if (total <= 0) return null;
  // USDC is the quote asset: every trade is priced and settled in it, so it is
  // never a *position* and its share of the book here is always 0. Left in the
  // loop it drifted -50% forever and asked to BUY USDC — which becomes
  // swap("USDC","USDC"), a self-swap with no pool, and it took the automation
  // route down with an unhandled 500 every time a tick ran armed.
  //
  // Wanting more cash is not a purchase, it is a sale: the corrective trade is
  // to SELL whatever is over its weight, not to buy the thing you buy with.
  for (const [sym, w] of Object.entries(target)) {
    if (sym === QUOTE) continue;
    const actual = (val[sym] || 0) / total;
    const drift = (actual - w) * 100;
    if (Math.abs(drift) >= band) {
      const usd = Math.abs(drift / 100) * total;
      return { agent: "rebalance", side: drift > 0 ? "SELL" : "BUY", symbol: sym,
               sizeUsd: Math.round(usd), confidence: 0.65,
               reason: `${sym} is ${actual.toFixed(2)} vs target ${w} (drift ${drift.toFixed(1)}%)` };
    }
  }
  // The cash leg, expressed the only way it can actually be traded: if the quote
  // asset is under its target weight, sell the most over-weight holding.
  //
  // It fires ONLY when cash is actually tracked. `val` is built from remembered
  // positions, and USDC is normally not one — so an absent entry means "this
  // book does not know its cash weight", not "cash is zero". Reading it as zero
  // makes the target permanently unreachable: every tick sees a 50% shortfall,
  // sells the largest holding, and the next tick sees the same shortfall again,
  // liquidating the book one tick at a time while believing it is rebalancing.
  // A strategy with no view of half its inputs should not trade on them.
  const cashTarget = target[QUOTE];
  if (cashTarget != null && val[QUOTE] != null) {
    const cashActual = val[QUOTE] / total;
    if ((cashTarget - cashActual) * 100 >= band) {
      const over = Object.entries(val)
        .filter(([sym]) => sym !== QUOTE)
        .sort((a, b) => b[1] - a[1])[0];
      if (over) {
        const usd = Math.min(over[1], (cashTarget - cashActual) * total);
        return { agent: "rebalance", side: "SELL", symbol: over[0],
                 sizeUsd: Math.round(usd), confidence: 0.65,
                 reason: `cash is ${cashActual.toFixed(2)} vs target ${cashTarget} — selling ${over[0]}, the largest holding, to raise it` };
      }
    }
  }
  return null;
}

/**
 * Put idle cash to work when there is more of it than the remembered buffer.
 *
 * This used to return `SELL USDC` — the quote asset, which every trade is
 * already denominated in. That is swap("USDC","USDC"): the same self-swap the
 * rebalance agent used to emit, and just as untradeable. It survived a run
 * longer than that one because it only fires when the book actually HOLDS
 * cash, and the check that caught the rebalance case was written against a
 * book that held none.
 *
 * There is no lending venue in this build — the only place a trade can go is
 * the DEX — so "keeping" idle cash cannot mean earning protocol yield here.
 * The one thing it can honestly mean is deploying the excess into an asset,
 * and the reason says exactly that rather than implying interest is being
 * earned somewhere.
 */
function yieldAgent(market, brief, cfg = {}) {
  const buffer = cfg.bufferUsd ?? 100;
  const symbol = cfg.symbol || "ETH";
  const usdc = brief.positions?.[QUOTE]?.qty ?? 0;
  if (usdc <= buffer) return null;
  if (!market.prices?.[symbol]) return null;
  return { agent: "yield", side: "BUY", symbol, sizeUsd: Math.round(usdc - buffer),
           reason: `${usdc} USDC idle above the ${buffer} buffer — deploying the excess into ${symbol}`,
           confidence: 0.5 };
}

/** Protect: cut a position that has fallen past the remembered stop. */
function risk(market, brief, cfg = {}) {
  const stop = cfg.stopPct ?? 8;
  for (const [sym, p] of Object.entries(brief.positions || {})) {
    const px = market.prices?.[sym];
    if (!px || !p?.avg_entry_usd) continue;
    const dd = ((px - p.avg_entry_usd) / p.avg_entry_usd) * 100;
    if (dd <= -stop)
      return { agent: "risk", side: "SELL", symbol: sym,
               sizeUsd: Math.round((p.qty || 0) * px), confidence: 0.9,
               reason: `${sym} ${dd.toFixed(1)}% below remembered entry — stop at -${stop}%` };
  }
  return null;
}

const IMPLS = { dca, grid, momentum, rebalance, yield: yieldAgent, risk };

/** Run one agent. `brief` is Sibyl's recallBrief() — memory drives every one. */
export function evaluate(kind, market, brief, cfg) {
  const fn = IMPLS[kind];
  if (!fn) throw new Error(`unknown agent kind '${kind}'`);
  return fn(market, brief, cfg) || null;
}

/** Run the whole roster, highest confidence first. */
export function evaluateAll(market, brief, cfgs = {}) {
  return AGENT_KINDS
    .map((k) => evaluate(k, market, brief, cfgs[k]))
    .filter(Boolean)
    .sort((a, b) => b.confidence - a.confidence);
}
