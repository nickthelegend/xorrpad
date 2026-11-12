/** Public, unsigned captures only. Calls the shipped v1 builders; never loads a wallet. */
import { createRequire } from 'node:module';
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
const require=createRequire(new URL('../../desk/package.json',import.meta.url));
const {Connection,PublicKey,Transaction,TransactionMessage,VersionedTransaction,SystemProgram,ComputeBudgetProgram}=require('@solana/web3.js');
const spl=require('@solana/spl-token');
const pm=await import('../../desk/main/chains/pmamm.mjs');
const phoenix=await import('../../desk/main/chains/phoenix.mjs');
const jup=await import('../../desk/main/chains/solana.mjs');
const dir=new URL('./fixtures/',import.meta.url);await mkdir(dir,{recursive:true});
let point;do{point=randomBytes(32);}while(!PublicKey.isOnCurve(point));
const owner=new PublicKey(point); // Public point only; no corresponding private key generated.
const publicRpc=(url)=>new Connection(url,{commitment:'confirmed',disableRetryOnRateLimit:true,
 fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(20000)})});
async function capture(name,built,connection,provenance){
 const tx=VersionedTransaction.deserialize(Buffer.from(built.unsignedTx,'base64'));
 if(tx.signatures.some(s=>s.some(b=>b)))throw Error('refusing signed fixture');
 const tables=[];
 for(const l of tx.message.addressTableLookups||[]){
  const raw=await connection.getAccountInfo(l.accountKey);
  if(!raw)throw Error('lookup account unavailable');
  const {AddressLookupTableAccount}=require('@solana/web3.js');
  const state=AddressLookupTableAccount.deserialize(raw.data);
  tables.push({table:l.accountKey.toBase58(),owner:raw.owner.toBase58(),data:raw.data.toString('hex'),
   resolved:[...l.writableIndexes,...l.readonlyIndexes].map(i=>state.addresses[i].toBase58())});
 }
 const mintProofs=[];
 if(built.inputMint){
  const mint=new PublicKey(built.inputMint);
  const [account,bump]=PublicKey.findProgramAddressSync([owner.toBuffer(),spl.TOKEN_PROGRAM_ID.toBuffer(),mint.toBuffer()],spl.ASSOCIATED_TOKEN_PROGRAM_ID);
  mintProofs.push({account:account.toBase58(),mint:mint.toBase58(),owner:owner.toBase58(),program:spl.TOKEN_PROGRAM_ID.toBase58(),bump});
 }
 const bytes=Buffer.from(tx.message.serialize());
 const out={name,cluster:built.cluster,provenance,capturedAt:new Date().toISOString(),
  unsignedTx:built.unsignedTx,message:bytes.toString('hex'),sha256:createHash('sha256').update(bytes).digest('hex'),tables,mintProofs};
 await writeFile(new URL(`${name}.json`,dir),JSON.stringify(out,null,2)+'\n');
 console.log(`${name}: ${bytes.length} message bytes, ${tables.length} tables (${built.cluster})`);
}
const failures=[];
async function attempt(name,fn){try{await fn();}catch(e){failures.push(name);console.error(`${name}: Setup required: public provider/builder availability (${e.message.split('\n')[0]})`);}}
await attempt('devnet-primitives',async()=>{
 const c=publicRpc('https://api.devnet.solana.com'),latest=await c.getLatestBlockhash();
 const destination=new PublicKey('So11111111111111111111111111111111111111112');
 for(const v0 of [false,true]){
  const ix=[ComputeBudgetProgram.setComputeUnitLimit({units:200000}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:1000}),
   SystemProgram.transfer({fromPubkey:owner,toPubkey:destination,lamports:123456789n})];
  const tx=v0?new VersionedTransaction(new TransactionMessage({payerKey:owner,recentBlockhash:latest.blockhash,instructions:ix}).compileToV0Message()):new Transaction({feePayer:owner,...latest}).add(...ix);
  await capture(`system-${v0?'v0':'legacy'}`,{cluster:'devnet',unsignedTx:Buffer.from(tx.serialize({requireAllSignatures:false,verifySignatures:false})).toString('base64')},c,'@solana/web3.js SystemProgram + ComputeBudgetProgram; live devnet blockhash');
 }
 for(const programId of [spl.TOKEN_PROGRAM_ID,spl.TOKEN_2022_PROGRAM_ID])for(const checked of [false,true]){
  const ix=checked?spl.createTransferCheckedInstruction(owner,destination,pm.COLLATERAL,owner,123456n,6,[],programId):spl.createTransferInstruction(owner,pm.COLLATERAL,owner,123456n,[],programId);
  const tx=new Transaction({feePayer:owner,...latest}).add(ix);
  await capture(`${programId.equals(spl.TOKEN_PROGRAM_ID)?'spl':'token2022'}-${checked?'checked':'transfer'}`,{cluster:'devnet',unsignedTx:tx.serialize({requireAllSignatures:false,verifySignatures:false}).toString('base64')},c,'@solana/spl-token transfer builder; live devnet blockhash; unsigned parser exercise, not a funded transfer');
 }
});
await attempt('pmamm',async()=>{
 const rows=await pm.markets(),market=rows.filter(r=>r.liquidity>10 && r.yesPrice>.1 && r.yesPrice<.9).sort((a,b)=>b.liquidity-a.liquidity)[0];
 if(!market)throw Error('live liquid devnet pm-AMM market');
 for(const side of ['yes','no'])await capture(`pmamm-${side}`,await pm.buildSwap({owner:owner.toBase58(),market:market.market,side,usdc:1},{request:false}),await pm.devnetConnection(),'desk/main/chains/pmamm.mjs buildSwap; live devnet market, quote and blockhash');
});
await attempt('phoenix',async()=>{
 for(const side of ['long','short'])await capture(`phoenix-${side}`,await phoenix.buildOpen({authority:owner.toBase58(),market:'SOL',side,usd:10,leverage:1},{request:false}),await phoenix.simulationConnection(),'desk/main/chains/phoenix.mjs buildOpen; real read-only mainnet builder (no devnet deployment); never signed or submitted');
});
await attempt('jupiter',async()=>{
 const q=await jup.quote('SOL','USDC',.01);
 await capture('jupiter-route', {...await jup.buildSwap(q,owner.toBase58(),{request:false}),cluster:'mainnet-beta'},publicRpc('https://api.mainnet-beta.solana.com'),'desk/main/chains/solana.mjs quote + buildSwap; Jupiter v6 mainnet routing; never signed or submitted');
});
await attempt('jupiter-known',async()=>{
 const q=await jup.quote('SOL','USDC',.01);
 const url=new URL('https://lite-api.jup.ag/swap/v1/quote');
 for(const [k,v] of Object.entries({inputMint:q.raw.inputMint,outputMint:q.raw.outputMint,amount:q.raw.inAmount,slippageBps:50,dexes:'Raydium',onlyDirectRoutes:true}))url.searchParams.set(k,v);
 const response=await fetch(url,{signal:AbortSignal.timeout(20000)}),raw=await response.json();
 if(!response.ok || !raw.routePlan?.length)throw Error('live Raydium route unavailable');
 await capture('jupiter-known-route',{...await jup.buildSwap({...q,raw},owner.toBase58(),{request:false}),cluster:'mainnet-beta',inputMint:raw.inputMint},publicRpc('https://api.mainnet-beta.solana.com'),'desk/main/chains/solana.mjs buildSwap; live Jupiter Raydium-only quote; never signed or submitted');
});
if(failures.length)process.exitCode=1;
