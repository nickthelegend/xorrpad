/** Runtime spot identities only. Phoenix markets remain live venue discovery. */
import { readFile,writeFile,rename } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const { PublicKey }=createRequire(new URL("../desk/package.json",import.meta.url))("@solana/web3.js");
const destination=new URL("../desk/main/markets.solana.json",import.meta.url);
export const SOURCE="https://perp.so/api/spot/asset-catalog";
const validMint=mint=>{try{return new PublicKey(mint).toBase58()===mint;}catch{return false;}};
export function slimSnapshot(rows) {
  // Every field here is consumed by spot-book.mjs. Do not repeat outputMint,
  // route descriptions or perps metadata for thousands of spot identities.
  return {spotMarkets:rows.map(t=>({symbol:t.symbol || "",name:t.name || t.symbol || "",mint:t.mint ?? null,
    assetClass:t.assetClass ?? null,jupiter:!!t.jupiter}))};
}
async function main() {
  let rows;
  if(process.argv.includes("--slim-current"))rows=JSON.parse(await readFile(destination,"utf8")).spotMarkets;
  else {
    const response=await fetch(SOURCE,{signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error(`perp.so spot catalog HTTP ${response.status}`);
    const catalog=await response.json();
    if(!catalog.ok || !Array.isArray(catalog.assets))throw new Error("invalid perp.so spot catalog");
    rows=catalog.assets.map(t=>({...t,jupiter:validMint(t.mint)}));
  }
  if(!Array.isArray(rows) || !rows.length)throw new Error("refusing to replace the snapshot with an empty identity list");
  const temp=new URL(destination.href+`.${process.pid}.tmp`),contents=JSON.stringify(slimSnapshot(rows))+"\n";
  await writeFile(temp,contents);await rename(temp,destination);
  console.log(`Wrote ${rows.length} spot mint identities in ${Buffer.byteLength(contents)} bytes`);
}
if(process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url)main().catch(e=>{console.error(e.message);process.exitCode=1;});
