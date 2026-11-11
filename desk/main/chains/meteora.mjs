/** Direct DLMM discovery and on-chain quotes. No signing or submission. */
import { createRequire } from "node:module";
import { Connection, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { tokenOf } from "../spot-book.mjs";
import { walletHandoff } from "../wallet-requests.mjs";
const require = createRequire(import.meta.url);
const DLMM = require("@meteora-ag/dlmm"); // SDK ESM entry has unsupported Anchor directory imports.
export const id = "meteora", label = "Meteora DLMM";
const API = "https://dlmm.datapi.meteora.ag", USDC = tokenOf("USDC").mint;
const cache = new Map();
function connection() {
  return new Connection(process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com", {
    commitment:"confirmed", disableRetryOnRateLimit:true,
    fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(15000)}),
  });
}
async function pools(filter) {
  const hit = cache.get(filter);
  if (hit && Date.now()-hit.at < 60000) return hit.promise;
  const entry = {at:Date.now(),promise:null};
  entry.promise = (async()=>{
    const rows = [];
    for (let page=1,pages=1;page<=pages;page++) {
      const url = new URL(`${API}/pools`);
      for (const [k,v] of Object.entries({page,page_size:1000,filter_by:filter,sort_by:"tvl:desc"})) url.searchParams.set(k,v);
      const r = await fetch(url,{signal:AbortSignal.timeout(15000)});
      if (!r.ok) throw new Error(`Meteora pools: HTTP ${r.status}`);
      const body = await r.json();
      if (!Array.isArray(body.data) || !Number.isInteger(body.pages)) throw new Error("invalid Meteora pools response");
      rows.push(...body.data); pages=body.pages;
    }
    return rows;
  })().catch(e=>{cache.delete(filter);throw e;});
  if (cache.size>256) cache.clear();
  cache.set(filter,entry); return entry.promise;
}
export async function markets(market) {
  const mint = market ? tokenOf(market).mint : null;
  const filters = mint ? [`token_x=${mint} && token_y=${USDC}`,`token_x=${USDC} && token_y=${mint}`]
    : [`token_x=${USDC}`,`token_y=${USDC}`];
  const rows = (await Promise.all(filters.map(f=>pools(`${f} && is_blacklisted=false`)))).flat();
  return [...new Map(rows.filter(p=>!p.is_blacklisted && (p.token_x.address===USDC || p.token_y.address===USDC)
    && (!mint || p.token_x.address===mint || p.token_y.address===mint)).map(p=>[p.address,{
      market:p.token_x.address===USDC ? p.token_y.address : p.token_x.address,
      pool:p.address,name:p.name,tokenX:p.token_x,tokenY:p.token_y,liquidityUsd:Number(p.tvl),
    }])).values()];
}
export async function quote(sell,buy,amountIn,{slippageBps=100}={}) {
  const a=tokenOf(sell),b=tokenOf(buy);
  if (a.mint!==USDC && b.mint!==USDC) throw new Error("Meteora direct requires a USDC pair");
  if (a.mint===b.mint) throw new Error("cannot quote a self-swap");
  if (!Number.isFinite(Number(amountIn)) || amountIn<=0) throw new Error("amount must be positive");
  if (!Number.isInteger(slippageBps) || slippageBps<0 || slippageBps>9999) throw new Error("invalid slippageBps");
  const candidates=(await markets(a.mint===USDC ? buy : sell)).sort((x,y)=>y.liquidityUsd-x.liquidityUsd).slice(0,3);
  if (!candidates.length) throw new Error("no Meteora DLMM USDC pool for this market");
  const rpc=connection();
  const results=await Promise.all(candidates.map(async m=>{
    try {
      const pool=await DLMM.create(rpc,new PublicKey(m.pool));
      const swapForY=pool.tokenX.publicKey.toBase58()===a.mint;
      if ((swapForY ? pool.tokenY : pool.tokenX).publicKey.toBase58()!==b.mint) throw new Error("on-chain pool mint mismatch");
      const di=(swapForY ? pool.tokenX : pool.tokenY).mint.decimals;
      const dout=(swapForY ? pool.tokenY : pool.tokenX).mint.decimals;
      const units=Math.floor(Number(amountIn)*10**di);
      if (!Number.isSafeInteger(units) || units<=0) throw new Error("amount rounds to zero or exceeds safe precision");
      const raw=pool.swapQuote(new BN(units),swapForY,new BN(slippageBps),await pool.getBinArrayForSwap(swapForY),false);
      if (!raw.consumedInAmount.eq(new BN(units))) throw new Error("Meteora returned a partial fill");
      const amountOut=Number(raw.outAmount.toString())/10**dout;
      if (!(amountOut>0)) throw new Error("Meteora returned no output");
      const price=a.mint===USDC ? Number(amountIn)/amountOut : amountOut/Number(amountIn);
      const fee=Number(raw.fee.toString())/10**(raw.feeOnInput ? di : dout);
      const feeMint=raw.feeOnInput ? a.mint : b.mint;
      return {venue:id,cluster:"mainnet-beta",sell,buy,amountIn:Number(amountIn),amountOut,price,
        feeUsd:fee*(feeMint===USDC ? 1 : price),impactPct:Number(raw.priceImpact.toString()),
        liquidity:m.liquidityUsd,liquidityUnit:"USD pool TVL (API)",pool:m.pool,route:`Meteora DLMM ${m.pool}`,slippageBps,
        raw:{inAmount:String(units),minOutAmount:raw.minOutAmount.toString(),
          binArraysPubkey:raw.binArraysPubkey.map(k=>k.toBase58()),inputMint:a.mint,outputMint:b.mint}};
    } catch(e) {return {pool:m.pool,error:e.message};}
  }));
  const good=results.filter(r=>!r.error).sort((x,y)=>y.amountOut-x.amountOut);
  if (!good.length) throw new Error(`Meteora pool quotes failed: ${results.map(r=>`${r.pool}: ${r.error}`).join("; ")}`);
  return {...good[0],poolErrors:results.filter(r=>r.error),poolSelection:"best output among top 3 USDC pools by API TVL"};
}
export async function buildSwap(q,owner,{request=true}={}) {
  if (!owner) throw new Error("Setup required: SOLANA_ADDRESS (explicit swap owner)");
  const user=new PublicKey(owner);
  if (!PublicKey.isOnCurve(user.toBytes())) throw new Error("owner must be an on-curve wallet public key");
  const fresh=await quote(q.sell,q.buy,q.amountIn,{slippageBps:q.slippageBps});
  const pool=await DLMM.create(connection(),new PublicKey(fresh.pool));
  const tx=await pool.swap({inToken:new PublicKey(fresh.raw.inputMint),outToken:new PublicKey(fresh.raw.outputMint),
    inAmount:new BN(fresh.raw.inAmount),minOutAmount:new BN(fresh.raw.minOutAmount),lbPair:pool.pubkey,user,
    binArraysPubkey:fresh.raw.binArraysPubkey.map(k=>new PublicKey(k))});
  tx.feePayer=user;
  return {unsignedTx:tx.serialize({requireAllSignatures:false,verifySignatures:false}).toString("base64"),
    signWith:user.toBase58(),cluster:"mainnet-beta",signing:"external",quote:fresh,
    ...(request ? walletHandoff(owner,()=>buildSwap(q,owner,{request:false}),{label:"xorrpad Meteora",variable:"SOLANA_PAY_PUBLIC_URL"}) : {})};
}
export const available=()=>true;
export async function info() {const rows=await markets();return {cluster:"mainnet-beta",signing:"external",marketCount:new Set(rows.map(r=>r.market)).size,poolCount:rows.length};}
export async function swap() {throw new Error("meteora: the desk never signs or submits");}
