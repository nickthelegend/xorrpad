/** Exact-expiry oracle resolution with a durable evidence-before-send journal. */
import { readdir } from "node:fs/promises";
import { PublicKey } from "@solana/web3.js";
import { assertMint,guard,MINT } from "./guards.mjs";
import { fetchPrice } from "./pyth.mjs";
import { questionFor } from "./markets.mjs";
import { STATE_DIR,RESOLUTIONS_DIR,readJson,writePublicJson } from "./paths.mjs";
const MARKET_FILE=/^[1-9A-HJ-NP-Za-km-z]{32,44}\.json$/;
export function classifyOutcome(price,strike) {
  if(!/^\d+$/.test(String(strike)) || !/^\d+$/.test(String(price.rawPrice)) || !/^\d+$/.test(String(price.rawConfidence)) || !Number.isInteger(price.exponent) || Math.abs(price.exponent)>18)
    throw new Error("invalid exact settlement operands");
  const multiplier=price.exponent>=0?10n**BigInt(price.exponent):1n,denominator=price.exponent<0?10n**BigInt(-price.exponent):1n;
  const value=BigInt(price.rawPrice)*multiplier,confidence=BigInt(price.rawConfidence)*multiplier,target=BigInt(strike)*denominator;
  if(value-confidence>target)return "yes";
  if(value+confidence<target || (confidence===0n && value===target))return "no";
  return "unresolved"; // Even a confidence bound touching the strike is held open.
}
export async function jobs() {
  const entries=await readdir(STATE_DIR,{withFileTypes:true});
  const rows=[];
  for(const e of entries)if(e.isFile() && MARKET_FILE.test(e.name))rows.push(await readJson(new URL(e.name,STATE_DIR),null));
  return rows;
}
async function publishIfConfirmed(context,record,market,evidence,file) {
  if(!market.resolved || market.winningSide!==(evidence.outcome==="yes"?1:2))throw new Error("chain resolution does not match the keeper evidence");
  const status=(await context.connection.getSignatureStatuses([evidence.resolveSignature],{searchTransactionHistory:true})).value[0];
  if(!status || status.err || !["confirmed","finalized"].includes(status.confirmationStatus))throw new Error("resolution signature is not confirmed; evidence is not published as successful");
  evidence.confirmedAt=new Date().toISOString();evidence.resolveTransaction=`https://explorer.solana.com/tx/${evidence.resolveSignature}?cluster=devnet`;
  await writePublicJson(file,evidence);
  record.resolveSignature=evidence.resolveSignature;record.resolved=true;
  await writePublicJson(new URL(`${record.market}.json`,STATE_DIR),record);
  console.log(`RESOLVED ${record.market} ${evidence.outcome.toUpperCase()} ${evidence.resolveSignature}`);
  return evidence;
}
export async function resolveOne(context,record) {
  if(record.creator!==context.owner.toBase58() || record.cluster!=="devnet" || record.collateralMint!==MINT)throw new Error("keeper job has an incompatible creator, cluster or collateral");
  const pubkey=new PublicKey(record.market),market=await context.client.fetchMarket(pubkey);
  if(!market)throw new Error(`keeper market missing on devnet: ${record.market}`);
  assertMint(market.collateralMint);
  const name=Buffer.from(market.name).toString("utf8").replace(/\0+$/,"");
  if(!market.authority.equals(context.owner) || market.endTs.toNumber()!==record.endTs || name!==record.question || name!==questionFor(record.symbol,record.strike,record.endTs))
    throw new Error("keeper job does not match the on-chain creator/question/expiry");
  const output=new URL(`${record.market}.json`,RESOLUTIONS_DIR),pending=new URL(`${record.market}.resolution.json`,STATE_DIR);
  const published=await readJson(output,null);
  if(published) {
    if(!market.resolved || published.outcome!==(market.winningSide===1?"yes":"no"))throw new Error("published evidence conflicts with chain state");
    return published;
  }
  let evidence=await readJson(pending,null);
  if(market.resolved) {
    if(!evidence?.resolveSignature)throw new Error("market resolved without a keeper resolution journal; no proof is fabricated");
    return publishIfConfirmed(context,record,market,evidence,output);
  }
  if(Math.floor(Date.now()/1000)<record.endTs || Number(record.retryAfter || 0)>Date.now())return null;
  if(evidence?.resolveSignature) {
    const status=(await context.connection.getSignatureStatuses([evidence.resolveSignature],{searchTransactionHistory:true})).value[0];
    if(!status || !status.err)throw new Error(`resolution may be pending: ${evidence.resolveSignature}; no duplicate submission`);
    evidence=null; // The prior transaction failed; fetch the exact same expiry price again.
  }
  let price;
  try {price=await fetchPrice(record.symbol,record.endTs);}
  catch(e) {
    if(e.message.startsWith("Setup required:"))throw e;
    record.retryAfter=Date.now()+60000;await writePublicJson(new URL(`${record.market}.json`,STATE_DIR),record);
    console.log(`UNRESOLVED: ${record.market}: ${e.message}`);return null;
  }
  const outcome=classifyOutcome(price,record.strike);
  if(outcome==="unresolved") {
    record.retryAfter=Date.now()+60000;await writePublicJson(new URL(`${record.market}.json`,STATE_DIR),record);
    console.log(`UNRESOLVED: confidence straddles strike (${record.market})`);return null;
  }
  evidence={market:record.market,creator:record.creator,cluster:"devnet",collateralMint:MINT,question:record.question,
    symbol:record.symbol,strike:record.strike,endTs:record.endTs,feedId:price.feedId,sourceUrl:price.sourceUrl,
    requestedPublishTime:record.endTs,publishTime:price.publishTime,price:price.price,confidence:price.confidence,
    rawPrice:price.rawPrice,rawConfidence:price.rawConfidence,exponent:price.exponent,outcome,
    hermes:price.hermes,retrievedAt:price.retrievedAt,createSignature:record.createSignature,
    verification:"Hermes HTTPS response and signed update are published for independent verification; pm-AMM still accepts its creator's resolution, not an on-chain Pyth proof."};
  await writePublicJson(pending,evidence); // Keep the signed update durable before any resolution transaction.
  await guard(context.connection);
  const ix=await context.client.ix.resolveMarket({signer:context.owner,market:pubkey,side:outcome});
  await context.send([ix],async signature=>{evidence.resolveSignature=signature;await writePublicJson(pending,evidence);});
  return publishIfConfirmed(context,record,await context.client.fetchMarket(pubkey),evidence,output);
}
export async function resolveDue(context) {
  for(const record of await jobs())if(record && record.endTs<=Date.now()/1000 && !record.resolved)await resolveOne(context,record);
}
