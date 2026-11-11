/** Refresh public market identities only. No prices, wallet data, or credentials are saved. */
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
const { PublicKey } = createRequire(new URL("../desk/package.json", import.meta.url))("@solana/web3.js");
const sources = {
  floor: "https://perp.so/api/tradingfloor",
  spot: "https://perp.so/api/spot/asset-catalog",
  phoenix: "https://perp-api.phoenix.trade/v1/view/exchange/markets",
};
async function read(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`${new URL(url).pathname}: HTTP ${r.status}`);
  return r.json();
}
const [floor, catalog, phoenix] = await Promise.all(Object.values(sources).map(read));
if (!catalog.ok || !Array.isArray(catalog.assets) || !Array.isArray(phoenix)) throw new Error("invalid source market list");
const bySymbol = new Map(phoenix.map(m => [m.symbol.toUpperCase(), m]));
const validMint = mint => { try { return new PublicKey(mint).toBase58() === mint; } catch { return false; } };
function perpFor(symbol, assetClass) {
  const upper = symbol.toUpperCase();
  return bySymbol.get(upper) || (assetClass === "equity" ? bySymbol.get(upper.replace(/(?:ON|X)$/, "")) : null);
}
const spotMarkets = catalog.assets.map(t => {
  const m = perpFor(t.symbol || "", t.assetClass);
  return { symbol: t.symbol || "", name: t.name || t.symbol || "", mint: t.mint || null,
    assetClass: t.assetClass || null, phoenix: m?.symbol || null,
    jupiter: validMint(t.mint) ? { outputMint: t.mint, status: "quote required" } : null,
    status: m ? "phoenix perp" : validMint(t.mint) ? "Jupiter quote required" : "not routable" };
});
// Read only public trade identities; never copy the source's unrelated config.
const trades = [];
function visit(value) {
  if (Array.isArray(value)) return value.forEach(visit);
  if (!value || typeof value !== "object") return;
  if (typeof value.asset === "string") trades.push(value);
  for (const [k,v] of Object.entries(value)) if (k !== "config") visit(v);
}
visit(floor);
const floorMarkets = [...new Set(trades.map(t => t.asset))].sort().map(symbol => {
  const mentions = trades.filter(t => t.asset === symbol);
  const markedMint = mentions.find(t => t.markMint && validMint(t.markMint))?.markMint;
  const candidates = spotMarkets.filter(t => t.symbol.toUpperCase() === symbol.toUpperCase());
  const token = markedMint ? spotMarkets.find(t => t.mint === markedMint)
    : bySymbol.has(symbol.toUpperCase()) ? candidates[0]
    : candidates.length === 1 && candidates[0].assetClass === "equity" ? candidates[0] : null;
  const m = bySymbol.get(symbol.toUpperCase()) || (token?.assetClass === "equity" ? perpFor(symbol,"equity") : null);
  return { symbol, phoenix: m?.symbol || null, jupiter: token?.jupiter || null,
    status: m ? "phoenix perp" : token?.jupiter ? "Jupiter quote required" : "not routable" };
});
const output = { schemaVersion: 1, observedAt: new Date().toISOString(), sources,
  note: "Pinned token identities, not execution guarantees. Jupiter availability and mint decimals are read live; duplicate tickers require the mint. Phoenix markets are also discovered live by the adapter.",
  floorMarkets, phoenixMarkets: phoenix.map(m => ({ symbol:m.symbol, market:m.marketPubkey, status:m.marketStatus, assetClass:m.metadata?.assetClass || null })), spotMarkets };
await writeFile(new URL("../desk/main/markets.solana.json", import.meta.url), JSON.stringify(output,null,2)+"\n");
console.log(`Mapped ${floorMarkets.length} TradingFloor symbols, ${phoenix.length} Phoenix markets and ${spotMarkets.length} spot mint identities`);
console.log(`Not routable on the TradingFloor: ${floorMarkets.filter(m=>m.status==="not routable").map(m=>m.symbol).join(", ") || "none"}`);
