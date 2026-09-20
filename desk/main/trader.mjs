/**
 * trader.mjs — the loop the desk actually runs.
 *
 *   recall memory -> read the market -> agents propose -> decide() gates it
 *   -> execute -> write the outcome back to memory
 *
 * The last step is what makes the next decision better, and what makes wiping
 * the store visibly break the thing. Prices come from real on-chain quotes, so
 * there is no price API key and no invented number anywhere.
 */
import { evaluateAll, AGENT_KINDS } from "./agents.mjs";
import { decide } from "./decide.mjs";
import { quote, swap, ROUTE } from "./dex.mjs";
import { balances, chainInfo, IS_FORK } from "./chain.mjs";
import { TOKENS } from "./tokens.mjs";
import { SYMBOLS } from "./markets.mjs";
import { prices as feedPrices } from "./scan.mjs";
import { withTradeLock, dayBudget } from "./lock.mjs";
import { NO_MEMORY_LIMITS } from "./memory.mjs";

/**
 * Real prices for every tradeable market.
 *
 * Quoting the pool we would trade against is the truest price, so that is the
 * primary source. The reference feed is the fallback for a market whose pool
 * momentarily will not quote — never an invented number, and the response says
 * which source each price came from.
 */
export async function getMarket(symbols = SYMBOLS) {
  const prices = {}, failed = {}, source = {};
  for (const s of symbols) {
    try {
      const probe = s === "cbBTC" ? 0.005 : s === "ETH" ? 0.1 : 10;
      const q = await quote(s, "USDC", probe);
      prices[s] = q.amountOut / probe;
      source[s] = "pool";
    } catch (e) { failed[s] = String(e.message || e).slice(0, 80); }
  }
  const missing = symbols.filter((s) => prices[s] == null);
  if (missing.length) {
    const feed = await feedPrices(missing).catch(() => ({}));
    for (const s of missing) if (feed[s] != null) { prices[s] = feed[s]; source[s] = "feed"; }
  }
  prices.USDC = 1; source.USDC = "peg";
  return { prices, failed, source, at: new Date().toISOString() };
}

/** Fold a fill back into the remembered position (average up/down honestly). */
/**
 * Write down what actually happened, not what was expected to.
 *
 * `usd / price` is the size that was *proposed* divided by the price that was
 * *quoted*. The swap that just ran knows better than both: `fill.received` is a
 * real balance delta measured either side of the transaction, and `fill.sold`
 * is what really left the wallet after any clamp to the wallet balance or to
 * the day's remaining room.
 *
 * Measured on one AERO buy before this: the chain gave 45.75216105, the store
 * wrote 45.80219242 — 0.109% of tokens the pad did not own, from one trade.
 * That number is not cosmetic. `avg_entry_usd` is computed from it, the
 * momentum and grid agents measure drift against that average, and both P&L
 * readouts divide by it, so the error propagates into decisions and not just
 * into a display.
 *
 * `fill` is optional: with none, this falls back to the old estimate, which is
 * the best available answer when there is no transaction to read.
 */
export async function applyFill(mem, { symbol, side, usd, price, agent, fill = null }) {
  const cur = (await mem.getEntity("position", symbol).catch(() => null))?.body || null;

  // `sold` is "<amount> <SYMBOL>" — the amount really sent.
  const soldAmt = fill?.sold ? Number(String(fill.sold).split(" ")[0]) : NaN;
  const got = Number(fill?.received);

  // BUY: received is the asset, sold is the USDC. SELL: the other way round.
  const qty = side === "BUY"
    ? (Number.isFinite(got) ? got : (price ? usd / price : 0))
    : (Number.isFinite(soldAmt) ? soldAmt : (price ? usd / price : 0));
  const cashUsd = side === "BUY"
    ? (Number.isFinite(soldAmt) ? soldAmt : usd)
    : (Number.isFinite(got) ? got : usd);

  if (side === "BUY") {
    const newQty = (cur?.qty || 0) + qty;
    // Cost basis is real dollars over real tokens, both sides from the fill.
    const newAvg = cur?.qty
      ? ((cur.qty * cur.avg_entry_usd) + cashUsd) / newQty
      : (qty > 0 ? cashUsd / qty : price);
    await mem.setEntity("position", symbol, {
      qty: newQty, avg_entry_usd: newAvg, updated: new Date().toISOString(),
    });
  } else {
    const newQty = Math.max(0, (cur?.qty || 0) - qty);
    // A round trip priced in USD never lands exactly on zero. Buying $50 of ETH
    // at one price and selling $50 back at another leaves a sub-cent residual,
    // and a 1e-12 threshold called that dust an open position forever — so a
    // fully closed trade was never archived, and the pad kept claiming to hold
    // 0.0000007 ETH. Closed means economically nothing is left: under a cent of
    // value, or under a thousandth of what was held.
    const dust = newQty * (price || 0) < 0.01
              || (cur?.qty ? newQty / cur.qty < 1e-3 : true);
    if (dust) {
      // Archive, do not destroy. A closed trade is the only record that the
      // trade ever happened, and hard-deleting it left the store unable to
      // answer "what did I used to hold?".
      const held = cur?.qty ? `${Number(cur.qty).toFixed(6)} @ $${Number(cur.avg_entry_usd).toFixed(4)}` : "";
      await mem.archiveEntity("position", symbol,
        `closed at $${Number(price).toFixed(4)}${held ? ` (was ${held})` : ""}`).catch(() => {});
    }
    else await mem.setEntity("position", symbol, {
      qty: newQty, avg_entry_usd: cur?.avg_entry_usd ?? price,
      updated: new Date().toISOString(),
    });
  }

  // The DCA interval is only real if something records when it last bought.
  //
  // `dca_last_ms` was read by the agent and written by nobody — the whole
  // codebase mentioned it once, in the read. So `last` was always 0,
  // `Date.now() - 0` always cleared a 24h window, and "recurring buy every 24h"
  // proposed a buy on EVERY evaluation. Armed, that is every tick rather than
  // once a day, and the reason string was stating a schedule the code did not
  // keep.
  //
  // Stamped on the fill rather than the proposal: a refused DCA has not had its
  // buy yet, so it should be free to ask again. Merged rather than replaced —
  // the baton also carries the agent, market and size that the desk restores on
  // boot, and setState writes the whole document.
  if (agent === "dca" && side === "BUY") {
    const b = await mem.recallBrief();
    await mem.setState("baton", { ...(b.baton || {}), dca_last_ms: Date.now() });
  }
}

/**
 * One pass of the loop.
 * @param opts.execute  actually sign (fork: true by default; mainnet: never
 *                      without an explicit confirmation upstream)
 */
export async function runOnce(mem, { execute = IS_FORK, cfgs = {}, market } = {}) {
  const brief = await mem.recallBrief();
  const mkt = market || await getMarket();
  // Everything settles against USDC, so a signal naming USDC as the asset to
  // trade would become swap("USDC","USDC") — a self-swap with no pool. The
  // rebalance agent used to emit exactly that, and because runOnce takes
  // signals[0] blindly it was the FIRST thing every armed tick tried, so the
  // whole automation route answered 500. Dropping them here means no future
  // strategy can take the tick down the same way, and a signal that cannot be
  // expressed as a trade never reaches the gate pretending it is one.
  const signals = evaluateAll(mkt, brief, cfgs).filter((s) => s.symbol !== "USDC");
  if (!signals.length) return { signals: [], verdict: null, fill: null, market: mkt };

  const signal = signals[0];
  const verdict = decide(signal, brief);

  // The proposal is journaled whether or not it executes — that history is
  // what reflection later turns into rules.
  await mem.journal({
    evaluated: { signal, market: mkt.prices },
    // vetoedBy is what lets decayRules tell a rule that is doing work from one
    // that has never stopped anything.
    acted: { action: verdict.action, usd: verdict.sizeUsd, executed: false,
             ...(verdict.vetoedBy ? { vetoedBy: verdict.vetoedBy } : {}) },
    forward: { why: verdict.why },
  });

  let fill = null;
  if (verdict.action === "EXECUTE" && execute) {
    if (!IS_FORK) throw new Error("refusing to auto-execute on mainnet — needs explicit confirmation");

    // Everything from here to the journalled fill runs alone. The verdict above
    // was reasoned against a spend figure another execution may already have
    // moved, so the day's room is read again now that nothing else is in
    // flight. See lock.mjs for what overlapping without this actually cost.
    return await withTradeLock(async () => {
      const day = await dayBudget(mem, { NO_MEMORY_LIMITS });
      if (day.left <= 0) {
        const why = [`$${day.spent} already executed today (journal)`, "daily budget exhausted"];
        const rejected = { action: "REJECT", sizeUsd: 0, why, memoryUsed: true };
        await mem.journal({ evaluated: { signal, market: mkt.prices },
                            acted: { action: "REJECT", usd: 0, executed: false },
                            forward: { why } });
        return { signals, signal, verdict: rejected, fill: null, market: mkt, brief };
      }
      // Same clamp decide() applies, against the number as it stands now.
      if (verdict.sizeUsd > day.left) {
        verdict.why = [...(verdict.why || []),
                       `clamped $${verdict.sizeUsd} -> $${day.left} (the day's room, re-read at execution)`];
        verdict.sizeUsd = day.left;
      }

      const px = mkt.prices[signal.symbol];
      const [sell, buy] = signal.side === "BUY"
        ? ["USDC", signal.symbol] : [signal.symbol, "USDC"];
      const amountIn = signal.side === "BUY"
        ? verdict.sizeUsd                       // spend USD
        : verdict.sizeUsd / px;                 // sell this much of the asset
      fill = await swap(sell, buy, Number(amountIn.toFixed(TOKENS[sell].decimals > 8 ? 8 : 6)));
      await applyFill(mem, { symbol: signal.symbol, side: signal.side, usd: verdict.sizeUsd, price: px, agent: signal.agent, fill });
      await mem.journal({
        evaluated: { signal },
        acted: { action: "FILL", usd: verdict.sizeUsd, executed: true, hash: fill.hash },
        forward: { received: fill.received, symbol: fill.receivedSymbol },
      });
      return { signals, signal, verdict, fill, market: mkt, brief };
    });
  }

  return { signals, signal, verdict, fill, market: mkt, brief };
}

export async function snapshot(mem) {
  const [info, bal, brief, px] = await Promise.all([
    chainInfo(), balances(), mem.recallBrief(),
    // Cached candle closes — cheap, and it means the market strip has prices
    // on first paint instead of waiting for someone to press SCAN.
    feedPrices().catch(() => ({})),
  ]);
  return { chain: info, route: ROUTE, balances: bal, memory: brief, agents: AGENT_KINDS, prices: px };
}
