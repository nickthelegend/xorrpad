/** Traction from successful on-chain swap instructions and SPL transfers only. */
import { createRequire } from "node:module";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM,COLLATERAL,devnetConnection,ours } from "./chains/pmamm.mjs";
const require=createRequire(import.meta.url),{BorshInstructionCoder}=require("@anchor-lang/core");
const coder=new BorshInstructionCoder(require("@pm-amm/sdk/idl/pm_amm.json"));
const TOKEN="TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",TTL=60000,cache=new Map();
const pub=value=>value?.toBase58?.() || String(value);
const decimal=raw=>`${raw/1000000n}.${(raw%1000000n).toString().padStart(6,"0")}`;
function decode(ix) {
  if(pub(ix.programId)!==PROGRAM.toBase58() || typeof ix.data!=="string")return null;
  const decoded=coder.decode(ix.data,"base58");
  if(!decoded)throw new Error("unrecognized pm-AMM instruction in chain history");
  return decoded;
}
function transfer(ix) {
  if(pub(ix.programId)!==TOKEN || !["transfer","transferChecked"].includes(ix.parsed?.type))return null;
  const info=ix.parsed.info,raw=info.amount ?? info.tokenAmount?.amount;
  if(!/^\d+$/.test(String(raw)))throw new Error("unparseable SPL transfer amount in chain history");
  return {source:info.source,destination:info.destination,amount:BigInt(raw)};
}
export function parseMarketTransaction(tx,marketAddresses) {
  if(!tx?.meta)throw new Error("transaction metadata missing");
  if(tx.meta.err)return {swaps:[],created:[]};
  const swaps=[],created=[];
  const keys=tx.transaction.message.accountKeys;
  const signers=new Set(keys.filter(k=>k.signer).map(k=>pub(k.pubkey)));
  for(const [outerIndex,root] of tx.transaction.message.instructions.entries()) {
    const inner=tx.meta.innerInstructions?.find(g=>g.index===outerIndex)?.instructions || [];
    const ordered=[{...root,stackHeight:1},...inner];
    for(let i=0;i<ordered.length;i++) {
      const ix=ordered[i],decoded=decode(ix);
      if(!decoded)continue;
      const name=decoded.name.replace(/_/g,"").toLowerCase();
      if(name==="initializemarket" && marketAddresses.has(pub(ix.accounts?.[1])))created.push(pub(ix.accounts[1]));
      if(name!=="swap")continue;
      const accounts=ix.accounts?.map(pub),market=accounts?.[1];
      if(!marketAddresses.has(market))continue;
      if(accounts[2]!==COLLATERAL.toBase58())throw new Error("unexpected collateral in market swap history");
      if(!signers.has(accounts[0]))throw new Error("swap authority is not a transaction signer; delegated CPI wallet identity cannot be inferred");
      const direction=Object.keys(decoded.data.direction || {})[0]?.replace(/_/g,"").toLowerCase();
      if(!["usdctoyes","usdctono","yestousdc","notousdc","yestono","notoyes"].includes(direction))throw new Error("unrecognized swap direction");
      if(ix.stackHeight==null)throw new Error("CPI stack height missing; swap transfers cannot be isolated");
      const children=[];
      for(let j=i+1;j<ordered.length;j++) {
        if(ordered[j].stackHeight==null)throw new Error("CPI stack height missing; swap transfers cannot be isolated");
        if(ordered[j].stackHeight<=ix.stackHeight)break;
        children.push(ordered[j]);
      }
      const transfers=children.map(transfer).filter(Boolean),user=accounts[6],vault=accounts[5];
      const tokenIndex=accounts.lastIndexOf(TOKEN);
      if(![9,11].includes(tokenIndex))throw new Error("unsupported pm-AMM swap account layout");
      const creatorAccount=tokenIndex===11 && accounts[10]!==PROGRAM.toBase58()?accounts[10]:null;
      const buy=direction.startsWith("usdc"),sell=direction.endsWith("usdc");
      const input=BigInt((decoded.data.amount_in ?? decoded.data.amountIn).toString());
      let volume=0n,creatorFees=0n;
      if(buy)volume=input;
      if(sell)volume=transfers.filter(t=>t.source===vault && [user,accounts[9],creatorAccount].includes(t.destination)).reduce((n,t)=>n+t.amount,0n);
      if((buy || sell) && !transfers.length)throw new Error("USDC swap transfers unavailable in transaction metadata");
      if(sell && volume===0n)throw new Error("sell-side USDC output missing in chain history");
      if(creatorAccount)creatorFees=transfers.filter(t=>t.source===(buy?user:vault) && t.destination===creatorAccount).reduce((n,t)=>n+t.amount,0n);
      swaps.push({market,trader:accounts[0],direction,volumeRaw:volume,creatorFeesRaw:creatorFees});
    }
  }
  return {swaps,created};
}
export async function scanMarketHistory(markets,connection) {
  connection ||= await devnetConnection();
  const byMarket=new Map(markets.map(m=>[m.market,{...m,traders:new Set(),swaps:0,volume:0n,fees:0n,created:false}]));
  const signatures=new Map();
  for(const market of markets) {
    let before;
    for(;;) {
      const page=await connection.getSignaturesForAddress(new PublicKey(market.market),{limit:1000,...(before?{before}:{})},"confirmed");
      for(const row of page)if(!row.err)signatures.set(row.signature,row);
      if(page.length<1000)break;
      if(page.at(-1).signature===before)throw new Error("RPC history pagination did not advance");
      before=page.at(-1).signature;
    }
  }
  const addresses=new Set(byMarket.keys()),missing=[];
  const ids=[...signatures.keys()];
  for(let i=0;i<ids.length;i+=10) {
    const batch=ids.slice(i,i+10);
    const transactions=await connection.getParsedTransactions(batch,{maxSupportedTransactionVersion:0,commitment:"confirmed"});
    for(let j=0;j<batch.length;j++) {
      if(!transactions[j]){missing.push(batch[j]);continue;}
      const parsed=parseMarketTransaction(transactions[j],addresses);
      for(const market of parsed.created)byMarket.get(market).created=true;
      for(const swap of parsed.swaps) {
        const row=byMarket.get(swap.market);row.traders.add(swap.trader);row.swaps++;row.volume+=swap.volumeRaw;row.fees+=swap.creatorFeesRaw;
      }
    }
  }
  const wallets=new Set(),unprovenCreation=[];
  let count=0,volume=0n,fees=0n;
  const perMarket=[...byMarket.values()].map(m=>{
    for(const trader of m.traders)wallets.add(trader);
    count+=m.swaps;volume+=m.volume;fees+=m.fees;
    if(!m.created)unprovenCreation.push(m.market);
    return {market:m.market,uniqueTraderWallets:m.traders.size,swaps:m.swaps,volumeUsdc:decimal(m.volume),creatorFeesUsdc:decimal(m.fees),creationFound:m.created};
  });
  const complete=missing.length===0 && unprovenCreation.length===0;
  const observed={uniqueTraderWallets:wallets.size,swaps:count,volumeUsdc:decimal(volume),creatorFeesUsdc:decimal(fees),volumeRaw:volume.toString(),creatorFeesRaw:fees.toString()};
  return {cluster:"devnet",source:"chain transaction history",complete,markets:markets.length,
    ...(complete?observed:{uniqueTraderWallets:null,swaps:null,volumeUsdc:null,creatorFeesUsdc:null,observed,
      setupRequired:"Setup required: PMAMM_RPC (devnet archive RPC with complete market transaction history)"}),
    perMarket,history:{successfulSignatures:ids.length,missingTransactions:missing,marketsWithoutCreation:unprovenCreation},
    units:"mUSDC, 6 decimals",volumeDefinition:"Gross USDC leg: instruction amount_in for buys; actual vault outflow for sells. YES/NO conversions count as swaps but have zero USDC volume.",
    creatorFeeDefinition:"Actual SPL fee transfers to the creator account inside each swap; waived self-trading fee shares are not counted as received fees.",
    observedAt:new Date().toISOString(),cacheMs:TTL};
}
export async function keeperStats(creator) {
  const hit=cache.get(creator);
  if(hit && (hit.pending || Date.now()-hit.at<TTL))return hit.promise;
  const entry={at:Date.now(),pending:true,promise:null};
  entry.promise=(async()=>scanMarketHistory(await ours(creator)))().then(result=>{entry.pending=false;entry.at=Date.now();return {creator,...result};})
    .catch(e=>{if(cache.get(creator)===entry)cache.delete(creator);throw e;});
  cache.set(creator,entry);return entry.promise;
}
