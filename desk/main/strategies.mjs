/**
 * strategies.mjs — xorr's measured-edge book, ported to the pad.
 *
 * These are not new ideas and they are not invented here. They are the six
 * strategies from the xorr engine that were built the honest way round:
 * `backtest/discover.py` measured forward returns for a condition on both
 * halves of two years of hourly data across nine majors, and only conditions
 * still positive on data the search never touched became strategies.
 *
 * What the measurement found, carried over verbatim:
 *
 *   condition          in-sample   held-out   t      n
 *   below_ema6 (24h)   +2.351%     +1.249%    7.49   1353
 *   rsi_below25 (24h)  +0.577%     +0.393%    3.81   1652
 *   rsi_below30 (24h)  +0.143%     +0.147%    2.42   4234
 *   below_ema3 (24h)   +0.408%     +0.116%    2.15   7578
 *   up_vol2.5 (4h)     +0.170%     +0.101%    1.84   1264
 *
 * The thresholds, the holding periods, the ATR-scaled stops and the two shared
 * gates are all the same numbers the engine runs. What is deliberately NOT
 * carried over is the ~45 inherited "fade the liquidation flush" strategies:
 * xorr's own gauntlet found almost all of them fail out-of-sample, and porting
 * a book of known-failing strategies to make a bigger number on a slide would
 * be dishonest. `mr_band_fade` is here because it is the control that survived.
 *
 * HONEST STATUS, from xorr's own README: no strategy in this book has been
 * shown to make money net of fees. The live book's first 30 trades were +$4.32
 * gross and -$23.07 net, the loss being entirely fees. These are real measured
 * edges that are too small to pay for their own execution at retail size. The
 * pad runs them because they are real and explainable, not because they print.
 */

// --- thresholds, exactly as configured in xorr/backend/config.py -----------
export const P = {
  stretch_deep_pct: 0.06,      // below_ema6
  stretch_mid_pct: 0.03,       // below_ema3
  oversold_rsi_max: 25.0,      // rsi_below25
  confluence_rsi_max: 32.0,
  capitulation_volume: 1.8,
  thrust_volume: 2.5,          // up_vol2.5
  stretch_stop_atr: 6.0,
  thrust_stop_atr: 1.5,
  band_fade_len: 20,
  band_fade_mult: 2.0,
  HOLD_MIN: 1440,              // the measured edge peaks around a day
  FAST_HOLD_MIN: 300,
};

import { closedBars } from "./candles.mjs";

// --- the same measurements ------------------------------------------------

export function ema(values, period) {
  if (!values.length) return 0;
  const k = 2 / (period + 1);
  let out = values[0];
  for (let i = 1; i < values.length; i++) out = (values[i] - out) * k + out;
  return out;
}

export function rsi(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    gains += Math.max(0, d); losses += Math.max(0, -d);
  }
  let ag = gains / period, al = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (period - 1) + Math.max(0, d)) / period;
    al = (al * (period - 1) + Math.max(0, -d)) / period;
  }
  if (al <= 0) return 100;
  return 100 - 100 / (1 + ag / al);
}

/** ATR as a share of price — stops scale to the symbol's own noise. */
export function atrPct(candles, period = 14) {
  // The range of a bar that is still being written is only as wide as the part
  // of the hour that has happened, so measuring it would narrow the stop for no
  // reason other than what time it is.
  const c = closedBars(candles);
  if (c.length < period + 1) return 0;
  const trs = [];
  for (let i = c.length - period; i < c.length; i++) {
    const cur = c[i], prev = c[i - 1];
    trs.push(Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close)));
  }
  // Normalised by the live price: the stop is a share of what we would pay now.
  const last = candles[candles.length - 1].close;
  return last > 0 ? (trs.reduce((a, b) => a + b, 0) / trs.length) / last : 0;
}

export function relativeVolume(candles, window = 20) {
  // A completed hour against the twenty completed hours before it. Dividing the
  // part of an hour that has happened so far by twenty whole ones understates
  // this by roughly the fraction of the hour still to come -- measured at 3-5x
  // on real feed data -- which put `thrust_volume: 2.5` out of reach entirely.
  const c = closedBars(candles);
  if (c.length < window + 1) return 1;
  const prior = c.slice(-(window + 1), -1);
  const mean = prior.reduce((a, x) => a + x.volume, 0) / window;
  return mean > 0 ? c[c.length - 1].volume / mean : 1;
}

/**
 * Size the stop to volatility, not to a fixed percentage.
 *
 * xorr measured that an 8% cap turned a +0.43%/trade edge into roughly zero:
 * these are horizon trades, so a tight stop gets taken out by intrabar noise
 * before the thesis can resolve. The stop is a disaster brake, not the exit.
 */
function stopAndTarget(candles, stopAtr, rr) {
  const a = atrPct(candles);
  if (a <= 0) return { stop: 8, tp: 8 * rr };
  const stop = Math.max(6, Math.min(25, a * 100 * stopAtr));
  return { stop: +stop.toFixed(2), tp: +(stop * rr).toFixed(2) };
}

/** The measured edge is dislocation, not descent. */
function notFallingKnife(c) {
  if (c.length < 3) return false;
  const last = c[c.length - 1], prev = c[c.length - 2];
  return last.low >= prev.low || last.close > last.open;
}

// --- the book -------------------------------------------------------------
// Each returns a signal or null. `ctx` = { uptrend, regime, symbol }.

const sig = (name, symbol, confidence, { stop, tp }, holdMin, rationale) => ({
  strategy: name, symbol, side: "BUY", confidence: +confidence.toFixed(3),
  stopPct: stop, takeProfitPct: tp, maxHoldMin: holdMin, rationale,
});

/** 1. The single strongest condition in the whole scan. */
export function deepStretchReversion(c, ctx) {
  if (c.length < 60 || !ctx.uptrend) return null;
  const closes = c.map((x) => x.close);
  const mean = ema(closes.slice(-60), 50);
  if (mean <= 0) return null;
  const stretch = (closes[closes.length - 1] - mean) / mean;
  if (stretch > -P.stretch_deep_pct) return null;
  if (!notFallingKnife(c)) return null;
  const depth = Math.abs(stretch);
  return sig("deep_stretch_reversion", ctx.symbol, Math.min(0.92, 0.65 + depth * 2),
    stopAndTarget(c, P.stretch_stop_atr, 2.2), P.HOLD_MIN,
    `${(depth * 100).toFixed(1)}% below the 50-bar mean — the deepest-measuring edge in the scan (+1.25% out-of-sample over 24h, t=7.5)`);
}

/** 2. Genuine RSI exhaustion. The strict version on purpose. */
export function oversoldExhaustion(c, ctx) {
  if (c.length < 40 || !ctx.uptrend) return null;
  const r = rsi(c.slice(-40).map((x) => x.close));
  if (r >= P.oversold_rsi_max) return null;
  if (!notFallingKnife(c)) return null;
  return sig("oversold_exhaustion", ctx.symbol,
    Math.min(0.9, 0.6 + (P.oversold_rsi_max - r) * 0.02),
    stopAndTarget(c, P.stretch_stop_atr, 2.0), P.HOLD_MIN,
    `RSI ${r.toFixed(0)} — measured exhaustion, +0.39% out-of-sample over 24h`);
}

/** 3. Dislocation that arrives with capitulation volume. */
export function stretchCapitulation(c, ctx) {
  if (c.length < 60 || !ctx.uptrend) return null;
  const closes = c.map((x) => x.close);
  const mean = ema(closes.slice(-60), 50);
  if (mean <= 0) return null;
  const stretch = (closes[closes.length - 1] - mean) / mean;
  if (stretch > -P.stretch_mid_pct) return null;
  const relVol = relativeVolume(c);
  if (relVol < P.capitulation_volume) return null;
  if (!notFallingKnife(c)) return null;
  return sig("stretch_capitulation", ctx.symbol,
    Math.min(0.92, 0.63 + Math.abs(stretch) * 1.5 + (relVol - 1) * 0.04),
    stopAndTarget(c, P.stretch_stop_atr, 2.4), P.HOLD_MIN,
    `${(Math.abs(stretch) * 100).toFixed(1)}% below the mean on ${relVol.toFixed(1)}x volume — dislocation with capitulation behind it`);
}

/** 4. The two strongest measured conditions agreeing. */
export function stretchOversoldConfluence(c, ctx) {
  if (c.length < 60 || !ctx.uptrend) return null;
  const closes = c.map((x) => x.close);
  const mean = ema(closes.slice(-60), 50);
  if (mean <= 0) return null;
  const stretch = (closes[closes.length - 1] - mean) / mean;
  if (stretch > -P.stretch_mid_pct) return null;
  const r = rsi(closes.slice(-40));
  if (r >= P.confluence_rsi_max) return null;
  if (!notFallingKnife(c)) return null;
  return sig("stretch_oversold_confluence", ctx.symbol,
    Math.min(0.94, 0.68 + Math.abs(stretch) * 1.8),
    stopAndTarget(c, P.stretch_stop_atr, 2.4), P.HOLD_MIN,
    `${(Math.abs(stretch) * 100).toFixed(1)}% below the mean with RSI ${r.toFixed(0)} — the two strongest measured conditions agreeing`);
}

/** 5. The one momentum edge that stayed positive out-of-sample. */
export function volumeThrust(c, ctx) {
  if (c.length < 120) return null;
  const closes = c.map((x) => x.close);
  const n = closes.length;
  if (closes[n - 2] <= 0) return null;
  const ret = (closes[n - 1] - closes[n - 2]) / closes[n - 2];
  if (ret <= 0) return null;
  const window = [];
  for (let i = n - 100; i < n; i++) if (closes[i - 1] > 0) window.push(Math.abs((closes[i] - closes[i - 1]) / closes[i - 1]));
  if (window.length < 50) return null;
  const threshold = window.slice().sort((a, b) => a - b)[Math.floor(window.length * 0.9)];
  if (ret < threshold) return null;
  const relVol = relativeVolume(c);
  if (relVol < P.thrust_volume) return null;
  return sig("volume_thrust", ctx.symbol, Math.min(0.88, 0.6 + (relVol - 1) * 0.05),
    stopAndTarget(c, P.thrust_stop_atr, 1.8), P.FAST_HOLD_MIN,
    `top-decile up move on ${relVol.toFixed(1)}x volume — the one momentum condition that stayed positive out-of-sample`);
}

/** 6. The control. Everything else needed a flush; this needs only a band. */
export function mrBandFade(c, ctx) {
  const L = P.band_fade_len;
  if (c.length < L + 30) return null;
  // Only fade in a range. In a trend the band is not a boundary.
  if (!["CHOP", "RISK_OFF"].includes(ctx.regime)) return null;
  const closes = c.slice(-L).map((x) => x.close);
  const mean = closes.reduce((a, b) => a + b, 0) / L;
  const sd = Math.sqrt(closes.reduce((a, x) => a + (x - mean) ** 2, 0) / L);
  if (sd <= 0 || mean <= 0) return null;
  const z = (c[c.length - 1].close - mean) / sd;
  if (z > -P.band_fade_mult) return null;
  const prevZ = (c[c.length - 2].close - mean) / sd;
  if (z < prevZ) return null;                // still accelerating away
  return sig("mr_band_fade", ctx.symbol, Math.min(0.85, 0.55 + Math.abs(z) * 0.08),
    { stop: 2.6, tp: 4.0 }, 300,
    `stretched ${Math.abs(z).toFixed(1)} standard deviations below the ${L}-bar mean in a ranging tape, and no longer extending`);
}

export const BOOK = {
  deep_stretch_reversion: deepStretchReversion,
  oversold_exhaustion: oversoldExhaustion,
  stretch_capitulation: stretchCapitulation,
  stretch_oversold_confluence: stretchOversoldConfluence,
  volume_thrust: volumeThrust,
  mr_band_fade: mrBandFade,
};

/** Provenance, so the UI can say where each number came from. */
export const PROVENANCE = {
  deep_stretch_reversion: { measured: "+2.351% in-sample / +1.249% held-out, t=7.49, n=1353", verdict: "strongest condition in the scan" },
  oversold_exhaustion: { measured: "+0.577% / +0.393%, t=3.81, n=1652", verdict: "threshold does real work — at RSI 30 the effect is a quarter" },
  stretch_capitulation: { measured: "built from two independently measured effects", verdict: "rarer and more selective than either alone" },
  stretch_oversold_confluence: { measured: "intersection of the two strongest conditions", verdict: "fewer signals, cleaner ones" },
  volume_thrust: { measured: "+0.170% / +0.101%, t=1.84, n=1264", verdict: "the only momentum condition positive on both halves" },
  mr_band_fade: { measured: "ungated control", verdict: "survives the gauntlet — if gated strategies do not beat it, the gate was never the edge" },
};

/** Run the whole book over one market. */
export function runBook(candles, ctx) {
  const out = [];
  for (const [name, fn] of Object.entries(BOOK)) {
    try {
      const s = fn(candles, ctx);
      if (s) out.push(s);
    } catch { /* one bad strategy must not take the pass down */ }
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}
