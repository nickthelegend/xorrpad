/**
 * scan.mjs — run the whole measured-edge book across every tradeable market.
 *
 * This is what the pad's BASE key does: pull real hourly candles for each of
 * the six markets, evaluate all six strategies against each, and return what
 * fired, ranked. One market-wide trend gate is computed once and shared, the
 * way xorr does it — BTC above its 200-day mean or dip buying is off entirely.
 *
 * A scan that finds nothing is the normal case and is reported as such. These
 * thresholds are strict on purpose; a book that fires constantly is a book with
 * no thresholds.
 */
import { MARKETS, SYMBOLS } from "./markets.mjs";
import { klines, marketUptrend, regimeOf } from "./candles.mjs";
import { runBook, ema, rsi, atrPct, relativeVolume, PROVENANCE } from "./strategies.mjs";

/** Everything the book saw, per market — so a "nothing fired" is explainable. */
export async function scan({ symbols = SYMBOLS } = {}) {
  const gate = await marketUptrend();
  const markets = [];
  const signals = [];

  for (const sym of symbols) {
    const m = MARKETS[sym];
    if (!m) continue;
    try {
      const c = await klines(m.binance);
      const closes = c.map((x) => x.close);
      const price = closes[closes.length - 1];
      const mean50 = ema(closes.slice(-60), 50);
      const regime = regimeOf(c);
      const ctx = { uptrend: gate.uptrend, regime, symbol: sym };
      const fired = runBook(c, ctx);

      markets.push({
        symbol: sym, label: m.label, class: m.class, price,
        rsi: +rsi(closes.slice(-40)).toFixed(1),
        emaGapPct: +(((price - mean50) / mean50) * 100).toFixed(2),
        relVol: +relativeVolume(c).toFixed(2),
        atrPct: +(atrPct(c) * 100).toFixed(2),
        regime, fired: fired.map((f) => f.strategy),
      });
      for (const f of fired) signals.push({ ...f, class: m.class, price, provenance: PROVENANCE[f.strategy] });
    } catch (e) {
      markets.push({ symbol: sym, label: m.label, class: m.class, error: String(e.message || e).slice(0, 90) });
    }
  }

  signals.sort((a, b) => b.confidence - a.confidence);
  return {
    at: new Date().toISOString(),
    gate,                       // { uptrend, px, sma200, reason }
    markets,
    signals,
    summary: signals.length
      ? `${signals.length} signal(s) across ${new Set(signals.map((s) => s.symbol)).size} market(s)`
      : gate.uptrend
        ? "no setup — none of the six conditions is met on any market right now"
        : `no setup — ${gate.reason}`,
  };
}

/** Prices only, straight from the same candles the strategies read. */
export async function prices(symbols = SYMBOLS) {
  const out = { USDC: 1 };
  for (const sym of symbols) {
    const m = MARKETS[sym];
    if (!m) continue;
    try {
      const c = await klines(m.binance, { limit: 2 });
      out[sym] = c[c.length - 1].close;
    } catch { /* a market with no reference feed simply has no price here */ }
  }
  return out;
}
