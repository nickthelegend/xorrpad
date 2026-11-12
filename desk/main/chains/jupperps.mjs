import {assertCloseSnapshot} from './perp-close.mjs';
/** Jupiter perps: API marks, decoded JLP accounts, unsigned owner-specific builds. */
import {readFileSync} from 'node:fs';
import {BorshAccountsCoder} from '@anchor-lang/core';
import {Connection,PublicKey,VersionedTransaction} from '@solana/web3.js';
export const id='jupperps',label='Jupiter Perps';
export const PROGRAM=new PublicKey('PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu');
const POOL='5BUwFW4nRbftYTDMbgxykoFWqWHPzahFSNAaaaJtVKsq';
const ASSETS={
 SOL:{mint:'So11111111111111111111111111111111111111112',custody:'7xS2gz2bTp3fwCC7knJvUWTEU9Tycczu6VhJYKgi1wdz'},
 ETH:{mint:'7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',custody:'AQCGyheWPLeo6Qp9WpYS9m3Qj479t7R636N9ey1rEjEn'},
 BTC:{mint:'3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh',custody:'5Pv3gM9JrFFH883SWAhvJC9RPYmo8UNxuFtv5bMMALkm'},
};
const USDC_CUSTODY='G18jKKXQwBbrHeiK3C9MRXhkHsLHf7XgCSisykV46EZa';
const coder=new BorshAccountsCoder(JSON.parse(readFileSync(new URL('./jupperps-accounts.json',import.meta.url))));
const API='https://perps-api.jup.ag/v2',bi=v=>BigInt(v.toString()),num=v=>Number(v.toString()),ceil=(a,b)=>(a+b-1n)/b;
let snapshot;
async function api(path,body) {
 const r=await fetch(`${API}/${path}`,{method:body?'POST':'GET',headers:{'content-type':'application/json'},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 const j=await r.json();
 if(!r.ok){
  if(j.code==='insufficient_funds')throw new Error('Setup required: JUPPERPS_AUTHORITY (fund wallet with SOL and USDC)');
  throw new Error(`Jupiter Perps: HTTP ${r.status} ${j.code||''}: ${j.message||'request failed'}`);
 }
 return j;
}
async function state() {
 if(snapshot && Date.now()-snapshot.at<15000)return snapshot.promise;
 const entry={at:Date.now(),promise:null};
 entry.promise=(async()=>{
  const c=new Connection(process.env.JUPPERPS_RPC||process.env.SOLANA_RPC||'https://api.mainnet-beta.solana.com',{
   commitment:'confirmed',disableRetryOnRateLimit:true,fetch:(u,o)=>fetch(u,{...o,signal:AbortSignal.timeout(15000)})});
  if(await c.getGenesisHash()!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw new Error('Jupiter Perps requires mainnet-beta RPC');
  const keys=[POOL,...Object.values(ASSETS).map(a=>a.custody),USDC_CUSTODY];
  const r=await c.getMultipleAccountsInfoAndContext(keys.map(k=>new PublicKey(k)));
  const decoded=r.value.map((a,i)=>{
   if(!a||!a.owner.equals(PROGRAM))throw new Error('missing or invalid Jupiter Perps on-chain account');
   return coder.decode(i===0?'pool':'custody',a.data);
  });
  return {pool:decoded[0],custodies:Object.fromEntries(keys.slice(1).map((k,i)=>[k,decoded[i+1]])),slot:r.context.slot};
 })().catch(e=>{if(snapshot===entry)snapshot=null;throw e;});
 snapshot=entry;return entry.promise;
}
/** Integer reference math from the repository linked by Jupiter's perps docs. */
export function hourlyBorrowRate(c) {
 const net=bi(c.debt)-bi(c.borrowLendInterestsAccured),debt=ceil(net>0n?net:0n,1000000000n);
 const owned=bi(c.assets.owned)+debt,locked=bi(c.assets.locked)+debt,R=1000000000n;
 if(bi(c.fundingRateState.hourlyFundingDbps)>0n)return Number(owned>0n&&locked>0n?ceil(locked*(bi(c.fundingRateState.hourlyFundingDbps)*R/100000n),owned):0n)/1e9;
 const j=c.jumpRateState,u=owned>0n?locked*R/owned:0n,t=bi(j.targetUtilizationRate);
 if(t<=0n||t>=R)throw new Error('unsupported Jupiter borrow utilization target');
 const bps=u<=t?ceil((bi(j.targetRateBps)-bi(j.minRateBps))*u,t)+bi(j.minRateBps)
  :ceil((bi(j.maxRateBps)-bi(j.targetRateBps))*(u-t),R-t)+bi(j.targetRateBps);
 return Number((bps*R/10000n)/8760n)/1e9;
}
export function positionFees(c,amount,now=Math.floor(Date.now()/1000)) {
 const base=bi(c.increasePositionBps),scalar=bi(c.pricing.tradeImpactFeeScalar),p=c.priceImpactBuffer;
 let bps=base+(scalar===0n?0n:ceil(amount*10000n,scalar));
 if(bi(p.feeFactor)>0n){
  let imbalance=amount,last=num(p.lastUpdated);
  if(last>0&&now-last<60){
   const values=p.openInterest.map(bi),idx=now%60,prev=last%60;
   values[idx]=idx===prev?values[idx]+amount:amount;
   if(idx>prev)values.fill(0n,prev+1,idx);
   else if(idx<prev){values.fill(0n,prev+1);values.fill(0n,0,idx);}
   imbalance=values.reduce((a,b)=>a+b,0n);
  }
  if(imbalance<0n)imbalance=-imbalance;
  const threshold=bi(p.deltaImbalanceThresholdDecimal);
  if(imbalance>threshold){
   if(threshold<=0n)throw new Error('invalid Jupiter impact threshold');
   const power=BigInt(p.exponent),ratio=ceil(imbalance**power,threshold**power);
   bps+=ceil(ratio,bi(p.feeFactor));
   if(bps>bi(p.maxFeeBps))bps=bi(p.maxFeeBps);
  }
 }
 const total=ceil(amount*bps,10000n),baseFee=amount*base/10000n;
 return {fee:Number(total)/1e6,impactFee:Number(total-baseFee)/1e6};
}
export async function perpMarkets(){
 const [s,prices]=await Promise.all([state(),Promise.all(Object.values(ASSETS).map(a=>api(`market-stats?mint=${a.mint}`)))]);
 return Object.entries(ASSETS).map(([market,a],i)=>{
  const c=s.custodies[a.custody];
  if(c.mint.toBase58()!==a.mint||c.pool.toBase58()!==POOL)throw new Error('Jupiter custody mint/pool mismatch');
  const markPrice=Number(prices[i].price);
  if(!(markPrice>0))throw new Error('Jupiter mark price unavailable');
  return {market,mint:a.mint,custody:a.custody,markPrice,borrowRateHourly:hourlyBorrowRate(c),
   shortBorrowRateHourly:hourlyBorrowRate(s.custodies[USDC_CUSTODY]),poolLiquidityUsd:num(s.pool.aumUsd)/1e6,
   availableTokens:Math.max(0,num(c.assets.owned)-num(c.assets.locked))/10**c.decimals,
   maxLeverage:num(c.pricing.maxLeverage)/10000,slot:s.slot,observedAt:new Date().toISOString()};
 });
}
export const markets=perpMarkets;
/** Same on-chain fee math as T1, frozen at observation time for historical replay. */
export async function backtestFees(market,notionalUsd) {
 const m=(await perpMarkets()).find(m=>m.market===market);
 if(!m)throw new Error(`invalid Jupiter Perps market: ${market}`);
 const s=await state(),c=s.custodies[m.custody],amount=BigInt(Math.floor(notionalUsd*1e6));
 return {entryRate:positionFees(c,amount).fee/notionalUsd,
  exitRate:positionFees({...c,increasePositionBps:c.decreasePositionBps},amount).fee/notionalUsd,
  slot:s.slot,observedAt:new Date().toISOString()};
}
export async function perpQuote({market,side,usd,leverage}){
 market=String(market||'').toUpperCase().replace(/-PERP$/,'');usd=Number(usd);leverage=Number(leverage);
 if(!['long','short'].includes(side))throw new Error('side must be long or short');
 if(!Number.isFinite(usd)||usd<=0||!Number.isFinite(leverage)||leverage<1||!Number.isSafeInteger(Math.floor(usd*leverage*1e6)))throw new Error('invalid size or leverage');
 const m=(await perpMarkets()).find(m=>m.market===market);
 if(!m)throw new Error(`unknown Jupiter Perps market: ${market}`);
 if(leverage>m.maxLeverage)throw new Error(`leverage exceeds Jupiter maximum ${m.maxLeverage}`);
 const s=await state(),c=s.custodies[m.custody],collateral=side==='long'?c:s.custodies[USDC_CUSTODY],notionalUsd=usd*leverage;
 if(!c.permissions.allowIncreasePosition||!collateral.permissions.allowIncreasePosition)throw new Error('Jupiter increases are disabled');
 if(notionalUsd>num(c.maxPositionSizeUsd)/1e6)throw new Error('size exceeds Jupiter position maximum');
 const available=side==='long'?m.availableTokens*m.markPrice:Math.max(0,num(collateral.assets.owned)-num(collateral.assets.locked))/1e6;
 if(notionalUsd>available)throw new Error('insufficient Jupiter pool liquidity');
 const fees=positionFees(c,BigInt(Math.floor(notionalUsd*1e6)));
 return {venue:id,cluster:'mainnet-beta',market,side,collateralUsd:usd,leverage,notionalUsd,
  entryPrice:m.markPrice,markPrice:m.markPrice,baseUnits:notionalUsd/m.markPrice,...fees,
  priceImpactPct:fees.impactFee/notionalUsd*100,liquidity:m.poolLiquidityUsd,liquidityUnit:'USD JLP AUM',
  borrowRateHourly:side==='long'?m.borrowRateHourly:m.shortBorrowRateHourly,slot:m.slot,
  quoteBasis:'indicative oracle-price quote with current on-chain position/impact fees; excludes collateral swap, rent and network fees; unsigned API build re-simulates for funded owner'};
}
function ownerKey(owner){
 if(!owner)throw new Error('Setup required: JUPPERPS_AUTHORITY (funded wallet public key)');
 const k=new PublicKey(owner);if(!PublicKey.isOnCurve(k.toBytes()))throw new Error('owner must be an on-curve wallet public key');return k.toBase58();
}
function unsigned(j,owner){
 const tx=VersionedTransaction.deserialize(Buffer.from(j.serializedTxBase64,'base64'));
 if(tx.message.staticAccountKeys[0].toBase58()!==owner||tx.signatures.some(s=>s.some(b=>b!==0)))throw new Error('Jupiter API did not return an unsigned transaction for this owner');
 return {unsignedTx:j.serializedTxBase64,signWith:owner,signing:'external',cluster:'mainnet-beta',quote:j.quote,...j.txMetadata};
}
export async function buildOpen({owner,authority,market,side,usd,leverage,slippageBps=100}){
 owner=ownerKey(owner||authority);await perpQuote({market,side,usd,leverage});
 if(!Number.isInteger(slippageBps)||slippageBps<0||slippageBps>9999)throw new Error('invalid slippageBps');
 return unsigned(await api('positions/increase',{asset:market.toUpperCase().replace(/-PERP$/,''),inputToken:'USDC',
  inputTokenAmount:String(Math.floor(Number(usd)*1e6)),side,leverage:String(leverage),maxSlippageBps:String(slippageBps),walletAddress:owner}),owner);
}
// API decimal USD fields use 6 places; no inferred liquidation or leverage.
export function positionRow(p,owner) {
 const usd=v=>typeof v==='string' && /^-?\d+$/.test(v) && Number.isSafeInteger(Number(v))?Number(v)/1e6:null;
 const number=v=>typeof v==='string' && v.trim() && Number.isFinite(Number(v))?Number(v):null;
 return {authority:owner,position:p.positionPubkey,market:p.asset,side:p.side,
  entryPrice:usd(p.entryPriceUsd),markPrice:usd(p.markPriceUsd),liquidationPrice:usd(p.liquidationPriceUsd),
  leverage:number(p.leverage),notionalUsd:usd(p.sizeUsd),unrealizedPnlUsd:usd(p.pnlAfterFeesUsd),
  nextFunding:null,cluster:'mainnet-beta'};
}
async function rawPositions(owner) {
 const rows=await api(`positions?walletAddress=${owner}`);
 if(!Array.isArray(rows.dataList))throw Error('Jupiter positions unavailable');
 return rows.dataList;
}
export async function positions(owner=process.env.JUPPERPS_AUTHORITY||process.env.SOLANA_ADDRESS) {
 owner=ownerKey(owner);return (await rawPositions(owner)).map(p=>positionRow(p,owner)).filter(p=>p.notionalUsd>0);
}
export function decreaseSize(sizeUsd,reducePct=100) {
 if(![50,100].includes(reducePct) || typeof sizeUsd!=='string' || !/^\d+$/.test(sizeUsd))throw Error('invalid reduce size');
 const n=BigInt(sizeUsd)*BigInt(reducePct)/100n;
 if(n<=0n)throw Error('reduce size rounds to zero');return n.toString();
}
export async function buildClose({owner,position,slippageBps=100,reducePct=100,expectedSide,expectedNotionalUsd}){
 owner=ownerKey(owner);
 if(!Number.isInteger(slippageBps)||slippageBps<0||slippageBps>9999)throw Error('invalid slippageBps');
 const p=(await rawPositions(owner)).find(p=>p.positionPubkey===position);
 if(!p)throw Error('no Jupiter position for this owner');
 assertCloseSnapshot(positionRow(p,owner),{expectedSide,expectedNotionalUsd});
 const sizeUsdDelta=decreaseSize(p.sizeUsd,reducePct);
 const result=await api('positions/decrease',{positionPubkey:position,receiveToken:'USDC',entirePosition:reducePct===100,
  ...(reducePct===50?{sizeUsdDelta,collateralUsdDelta:'0'}:{}),maxSlippageBps:String(slippageBps)});
 return {...unsigned(result,owner),reduceOnly:true,reducePct,sizeUsdDelta};
}
export async function quoteClose(input) {
 const p=(await positions(input.owner)).find(p=>p.position===input.position);
 if(!p)throw Error('no Jupiter position for this owner');
 assertCloseSnapshot(p,input);
 const built=await buildClose(input),q=built.quote,price=p.markPrice;
 // Live API mark reference only; exact decrease is reviewed in transaction bytes.
 return {...built,quoteBasis:'live API mark reference; decrease API does not expose an execution price',entryPrice:Number.isFinite(price)&&price>0?price:null,
  notionalUsd:Number(built.sizeUsdDelta)/1e6,fee:q?.totalFeeUsd==null?null:Number(q.totalFeeUsd)/1e6};
}
export const available=()=>true;
export async function info(){const rows=await perpMarkets();return {cluster:'mainnet-beta',marketCount:rows.length,signing:'external',mode:'indicative quotes / unsigned API builds'};}
export async function swap(){throw new Error('jupperps: the desk never signs or submits');}
