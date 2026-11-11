/** The verified Solana spot book, shared by the gate and desk. */
import { XSTOCKS, REJECTED, SYMBOLS } from "./xstocks.mjs";
export { SYMBOLS };
export const MARKETS = Object.fromEntries(Object.entries(XSTOCKS).map(([symbol, t]) => [symbol, {
  ...t, symbol, label: t.name, class: "equity", venue: "Jupiter",
}]));
export const DELISTED = Object.fromEntries(Object.entries(REJECTED).map(([s, reason]) => [s, { reason }]));
export const delistReason = (s) => DELISTED[s]?.reason;
