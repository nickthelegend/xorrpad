/** Real venue APIs/RPC only. No signing, transaction submission or fake quotes. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {PublicKey,Transaction} from '@solana/web3.js';
import {route} from '../main/aggregate.mjs';
import * as pmamm from '../main/chains/pmamm.mjs';
import * as meteora from '../main/chains/meteora.mjs';
const unreachable=e=>/fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|timeout|timed out|HTTP (408|429|5\d\d)|\b(429|502|503|504)\b/i.test(e.message);
function live(name,fn){test(name,{timeout:60000},async t=>{
 try{await fn(t);}catch(e){if(!unreachable(e))throw e;console.log(`SKIP: ${name}: venue unreachable: ${e.message}`);t.skip(`venue unreachable: ${e.message}`);}
});}
let spot,perp;
for(const venue of ['jupiter','meteora'])live(`SOL spot quote on ${venue}`,async()=>{
 spot??=route({kind:'spot',market:'SOL',side:'buy',size:10});
 const r=await spot,q=[r.best,...r.alternatives].find(q=>q?.venue===venue);
 assert.ok(q,`${venue} must never disappear`);
 if(q.error)throw new Error(q.error);
 assert.equal(q.status,'quoted');assert.ok(q.price>0&&q.quote.amountOut>0);
 assert.ok(Number.isFinite(q.impact));assert.ok(q.fees.usd===null||q.fees.usd>=0);assert.ok(q.why.length);
 assert.equal(q.network,'mainnet-beta');assert.equal(q.quote.amountIn,10);
 console.log(`REAL ${venue}: SOL $${q.price}, output ${q.quote.amountOut}, fees ${JSON.stringify(q.fees)}, liquidity ${q.liquidity}`);
});
for(const venue of ['phoenix','jupperps'])live(`SOL perp quote on ${venue} for long and short`,async()=>{
 perp??=Promise.all(['long','short'].map(side=>route({kind:'perp',market:'SOL',side,size:10,leverage:2})));
 for(const r of await perp){
  const q=[r.best,...r.alternatives].find(q=>q?.venue===venue);
  assert.ok(q,`${venue} must never disappear`);
  if(q.error)throw new Error(q.error);
  assert.equal(q.status,'quoted');assert.ok(q.price>0&&q.quote.baseUnits>0);
  assert.ok(Number.isFinite(q.fees.usd)&&q.fees.usd>=0);assert.ok(q.liquidity>0);
  assert.equal(q.quote.collateralUsd,10);assert.equal(q.quote.leverage,2);
  if(venue==='jupperps'){assert.ok(q.quote.borrowRateHourly>=0);assert.match(q.quote.quoteBasis,/indicative/);}
  console.log(`REAL ${venue} ${r.side}: entry $${q.price}, fees $${q.fees.usd}, liquidity ${q.liquidity}`);
 }
});
live('pm-AMM lists real devnet outcome markets and routes an available outcome',async()=>{
 const rows=await pmamm.markets();assert.ok(Array.isArray(rows));
 for(const m of rows){new PublicKey(m.market);assert.ok(m.endTs>Date.now()/1000);assert.ok(m.liquidity===null||m.liquidity>=0);}
 console.log(`REAL pm-AMM: ${rows.length} live devnet markets`);
 // RPC account order is arbitrary; select actual depth rather than the first
 // funded vault, whose current curve can refuse a small outcome purchase.
 const m=rows.filter(m=>m.liquidity>1).sort((a,b)=>b.effectiveLiquidity-a.effectiveLiquidity)[0];
 if(m){const r=await route({kind:'predict',market:m.market,side:'yes',size:0.1});
  if(!r.best)throw new Error(r.alternatives.map(a=>a.error).join('; '));
  assert.equal(r.best.venue,'pmamm');assert.equal(r.best.network,'devnet');assert.ok(r.best.quote.expectedShares>0);
 }
});
live('Meteora builds a real unsigned swap for an explicit public owner',async()=>{
 let bytes;do{bytes=randomBytes(32);}while(!PublicKey.isOnCurve(bytes));
 const owner=new PublicKey(bytes).toBase58(),q=await meteora.quote('USDC','SOL',10);
 const built=await meteora.buildSwap(q,owner,{request:false});
 const tx=Transaction.from(Buffer.from(built.unsignedTx,'base64'));
 assert.equal(tx.feePayer.toBase58(),owner);assert.ok(tx.signatures.every(s=>s.signature===null));
 assert.ok(tx.instructions.length>0);console.log(`REAL Meteora unsigned swap: ${Buffer.from(built.unsignedTx,'base64').length} bytes, ${tx.instructions.length} instructions; unfunded public owner, no send`);
});
live('router reports every failed venue without substituting a quote',async()=>{
 const r=await route({kind:'spot',market:'SOL',side:'buy',size:0.00000001});
 assert.equal(r.best,null);assert.deepEqual(r.alternatives.map(a=>a.venue).sort(),['jupiter','meteora']);
 for(const a of r.alternatives){assert.equal(a.status,'error');assert.ok(a.error);assert.equal(a.quote,undefined);}
 console.log('REAL rejected sub-unit input: both venue errors retained');
});
