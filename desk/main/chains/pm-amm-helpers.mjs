// Source: https://predict-pm-amm.dev/helpers/pm-amm-helpers.ts
// Retrieved 2026-11-12; types removed, formulas unchanged.
/**
 * pm-AMM market helpers: current state, exact swap quotes in all 6 directions,
 * and batched market reads. Copy this file into your project.
 *
 * Why it exists: on-chain reserves are stored as of `lastAccrualTs`, and every
 * swap first accrues (liquidity decays as L_eff = L_0·√(T−t)). Quoting the
 * stored reserves against today's L_eff over-promises output by a few % on a
 * market that hasn't traded for a while, so a tight `minOutput` fails with
 * `SlippageExceeded (6007)`. `marketState()` rescales the reserves to `now`
 * the way the program does, and `quoteSwap()` reproduces the program's swap
 * math, fee included.
 *
 * Deps: @pm-amm/sdk (math only), @solana/web3.js
 */


import { capitalPhi, i80f48ToNumber, phi } from "@pm-amm/sdk/math";

const FEE_BPS = 200; // 2% on the USDC leg; YES<->NO is free
const Z_CLAMP = 5.9; // the program clamps the sell-side z to ±5.9















const nowSecs = () => Math.floor(Date.now() / 1000);

/** State of a market as the program would see it at `now` (after accrual). */
export function marketState(m               , now = nowSecs())              {
  const endTs = m.endTs.toNumber();
  const lZero = i80f48ToNumber(m.lZero);
  const secondsLeft = Math.max(endTs - now, 0);
  const lEff = lZero * Math.sqrt(Math.max(endTs - now, 1));
  const lLast = lZero * Math.sqrt(Math.max(endTs - m.lastAccrualTs.toNumber(), 1));
  const scale = lLast > 0 ? lEff / lLast : 0;
  const x = i80f48ToNumber(m.reserveYes) * scale;
  const y = i80f48ToNumber(m.reserveNo) * scale;
  const winner = m.winningSide === 1 ? "yes" : m.winningSide === 2 ? "no" : null;
  const price = winner ? (winner === "yes" ? 1 : 0) : lEff > 0 ? capitalPhi((y - x) / lEff) : 0.5;
  return {
    x,
    y,
    lEff,
    price,
    secondsLeft,
    expired: secondsLeft === 0,
    resolved: m.resolved,
    winner,
  };
}

// ---- the pm-AMM curve: x = L(uΦ(u)+φ(u)−u), y = L(uΦ(u)+φ(u)), u = (y−x)/L ----

const base = (u        ) => u * capitalPhi(u) + phi(u);

/** Solve base(u) = t (base is increasing) by bisection. */
function solveU(f                       , target        , increasing         )         {
  let lo = -40;
  let hi = 40;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const v = f(mid);
    if (increasing ? v < target : v > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
const xFromY = (y        , L        ) => y - L * solveU(base, y / L, true);
const yFromX = (x        , L        ) => {
  const u = solveU((v) => base(v) - v, x / L, false);
  return x + u * L;
};

/** Gross curve output for `dIn` (raw units, after the input fee). */
function curveOut(s             , dir               , dIn        )         {
  const { x, y, lEff: L } = s;
  const clampZ = (z        ) => Math.max(-Z_CLAMP, Math.min(Z_CLAMP, z));
  switch (dir) {
    case "usdcToYes":
      return dIn + (x - xFromY(y + dIn, L));
    case "usdcToNo":
      return dIn + (y - yFromX(x + dIn, L));
    case "yesToUsdc":
      return y - L * base(clampZ((y - x - dIn) / L));
    case "noToUsdc": {
      const z = clampZ((y - x + dIn) / L);
      return x - L * (base(z) - z);
    }
    case "yesToNo":
      return y - yFromX(x + dIn, L);
    case "noToYes":
      return x - xFromY(y + dIn, L);
  }
}










/**
 * Exact quote for `client.send.swap(market, direction, amountIn, minOutput)`.
 * `amountIn` in raw 6-dp units (5_000_000 = 5 mUSDC or 5 tokens).
 */
export function quoteSwap(
  m               ,
  direction               ,
  amountIn        ,
  now = nowSecs(),
)            {
  const s = marketState(m, now);
  if (s.resolved || s.expired) throw new Error("market is resolved or expired: no swaps");
  const usdcIn = direction === "usdcToYes" || direction === "usdcToNo";
  const usdcOut = direction === "yesToUsdc" || direction === "noToUsdc";
  const feeIn = usdcIn ? Math.floor((amountIn * FEE_BPS) / 10_000) : 0;
  const gross = Math.max(Math.floor(curveOut(s, direction, amountIn - feeIn)), 0);
  const feeOut = usdcOut ? Math.floor((gross * FEE_BPS) / 10_000) : 0;
  const out = gross - feeOut;
  return { out, fee: feeIn + feeOut, avgPrice: amountIn > 0 ? out / amountIn : 0 };
}

/** `minOutput` for a swap with `slippageBps` tolerance (default 1%). */
export function minOutput(q           , slippageBps = 100)         {
  return Math.floor((q.out * (10_000 - slippageBps)) / 10_000);
}

/**
 * Read many markets in ONE RPC call (the public devnet RPC rate-limits hard).
 * Returns null for addresses that aren't markets.
 */
export async function fetchMarkets(
  client             ,
  pdas             ,
)                                    {
  // The typed AccountFetcher doesn't expose fetchMultiple; the Anchor one does.
  const ns = client.program.account

   ;
  return ns.market.fetchMultiple(pdas);
}
