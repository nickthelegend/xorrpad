/** The verified Solana spot book, shared by the gate and desk. */
import { REJECTED } from "./xstocks.mjs";
import { TOKENS, SYMBOLS } from "./spot-book.mjs";
export { SYMBOLS };
export const MARKETS = Object.fromEntries(Object.entries(TOKENS).filter(([s])=>s!=="USDC").map(([symbol, t]) => [symbol, {
  ...t, symbol, label: t.name, class: t.assetClass === "equity" ? "equity" : "crypto", venue: "Jupiter",
}]));
export const DELISTED = Object.fromEntries(Object.entries(REJECTED).map(([s, reason]) => [s, { reason }]));
export const delistReason = (s) => DELISTED[s]?.reason;
