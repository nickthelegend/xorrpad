/** Pinned Solana mint identities. A repeated ticker is never a mint lookup. */
import { readFileSync } from "node:fs";
import { XSTOCKS, REJECTED, USDC, SOL } from "./xstocks.mjs";
export const catalog = JSON.parse(readFileSync(new URL("./markets.solana.json",import.meta.url),"utf8"));
const counts = new Map();
for (const t of catalog.spotMarkets) if (t.jupiter) counts.set(t.symbol.toUpperCase(),(counts.get(t.symbol.toUpperCase())||0)+1);
export const TOKENS = Object.assign(Object.create(null), { ...Object.fromEntries(Object.entries(XSTOCKS).map(([s,t])=>[s,{...t,symbol:s,assetClass:"equity"}])),
  SOL:{...SOL,name:"Solana",assetClass:"crypto"}, USDC:{...USDC,name:"USD Coin",assetClass:"stablecoin"} });
const byMint = new Map(Object.entries(TOKENS).map(([s,t])=>[t.mint,{...t,symbol:s}]));
for (const t of catalog.spotMarkets) {
  if (!t.jupiter || !t.symbol || byMint.has(t.mint)) continue;
  const safeTicker = /^[A-Za-z0-9][A-Za-z0-9._-]{0,20}$/.test(t.symbol);
  const symbol = !safeTicker ? `mint:${t.mint}` : counts.get(t.symbol.toUpperCase())===1 && !Object.keys(TOKENS).some(s=>s.toUpperCase()===t.symbol.toUpperCase())
    ? t.symbol : `${t.symbol}@${t.mint}`;
  const token = {symbol,mint:t.mint,name:t.name,assetClass:t.assetClass,venue:"Jupiter",routeStatus:"quote required",riskNote:REJECTED[t.symbol] || null};
  TOKENS[symbol]=token; byMint.set(t.mint,token);
}
const bySymbol = new Map(Object.entries(TOKENS).map(([s,t])=>[s.toUpperCase(),t]));
export const SYMBOLS = Object.keys(TOKENS).filter(s=>s!=="USDC");
export function tokenOf(symbolOrMint) {
  const t = TOKENS[symbolOrMint] || byMint.get(symbolOrMint) || bySymbol.get(String(symbolOrMint).toUpperCase());
  if (t) return t;
  const why = REJECTED[symbolOrMint];
  throw new Error(why ? `${symbolOrMint} is not traded here: ${why}` : `${symbolOrMint} is not an unambiguous allowlisted Solana token; use the exact catalog mint`);
}
export const isEquity = value => tokenOf(value).assetClass === "equity";
