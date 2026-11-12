/** Explicit RPC/price protocol fixtures for aggregation and failure cases. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {AgentWallet} from '../main/agent-wallet.mjs';
import {SOL,USDC} from '../main/xstocks.mjs';
import {portfolioSnapshot} from '../main/portfolio.mjs';
const address = '11111111111111111111111111111111';
const mint = 'So11111111111111111111111111111111111111112';
async function fixture(fn) {
 let failRpc=false,failPrices=false,extraTokens=false;
 const methods=[];
 const account=(mint,amount,decimals)=>({pubkey:address,account:{executable:false,owner:'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',lamports:1,rentEpoch:1,
  data:{program:'spl-token',space:165,parsed:{type:'account',info:{mint,tokenAmount:{amount,decimals,uiAmount:null}}}}}});
 const rpc=http.createServer(async(req,res)=>{
  res.setHeader('content-type','application/json');
  if(req.method==='GET') {if(failPrices){res.writeHead(503);res.end('{}');return;}res.end(JSON.stringify({[SOL.mint]:{usdPrice:100},[USDC.mint]:{usdPrice:.99}}));return;}
  let body='';for await (const c of req)body+=c;
  const {method,params,id}=JSON.parse(body);methods.push(method);
  if(failRpc && method==='getTokenAccountsByOwner'){res.end(JSON.stringify({jsonrpc:'2.0',id,error:{code:-32000,message:'fixture read failure'}}));return;}
  const result = method==='getGenesisHash' ? '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d' : {context:{slot:1},value:method==='getBalance'?2e9:
   params[1].programId.startsWith('Tokenkeg') ? [account(USDC.mint,'1000000',6),account(USDC.mint,'2500000',6),account(mint,'500000000',9)] : [account(address,'700',2),...(extraTokens?[2,3,4,5].map(n=>account('1111111111111111111111111111111'+n,String(n*100),2)):[])]};
  res.end(JSON.stringify({jsonrpc:'2.0',id,result}));
 });
 await new Promise(r=>rpc.listen(0,'127.0.0.1',r));
 const saved={rpc:process.env.SOLANA_RPC,jup:process.env.JUPITER_API};
 process.env.SOLANA_RPC=process.env.JUPITER_API=`http://127.0.0.1:${rpc.address().port}`;
 try {await fn({wallet:new AgentWallet({agentWalletIdentity:async()=>({address,source:'desk'})}),methods,
  failRpc:()=>{failRpc=true;},failPrices:()=>{failPrices=true;},extra:()=>{extraTokens=true;}});}
 finally {for(const [key,v] of [['SOLANA_RPC',saved.rpc],['JUPITER_API',saved.jup]]){if(v===undefined)delete process.env[key];else process.env[key]=v;}await new Promise(r=>rpc.close(r));}
}
test('balances aggregate raw SPL units, preserve unknown mints and do not double-count wrapped SOL',async()=>fixture(async({wallet,methods})=>{
 const w=await wallet.get();
 assert.equal(w.balances.SOL.amount,2);assert.equal(w.balances.USDC.amount,3.5);
 assert.equal(w.balances.USDC.usd,3.5*.99);assert.equal(w.balances[mint].amount,.5);
 assert.equal(w.balances[address].amount,7);assert.equal(w.balances[address].usd,null);
 assert.equal(w.totalUsd,null);assert.equal(w.pricedTotalUsd,253.465);
 assert.deepEqual(w.unpricedMints,[address]);assert.equal(methods.filter(m=>m==='getTokenAccountsByOwner').length,2);
}));
test('RPC failure refuses a fabricated partial balance and pricing failure retains honest units',async()=>fixture(async({wallet,failRpc,failPrices})=>{
 failPrices();const w=await wallet.get();assert.equal(w.balances.SOL.amount,2);assert.equal(w.balances.SOL.usd,null);
 assert.equal(w.totalUsd,null);assert.ok(w.priceErrors.length);
 failRpc();await assert.rejects(wallet.get(),/Solana RPC read failed/);
}));
test('portfolio keeps SOL and USDC plus only the top three other holdings',async()=>fixture(async({extra})=>{
 const saved=process.env.SOLANA_ADDRESS;delete process.env.SOLANA_ADDRESS;
 try {
  extra();const p=await portfolioSnapshot({recallBrief:async()=>({})},{agentWalletIdentity:async()=>({address,source:'desk'})});
  assert.equal(p.portfolio.rows.length,5);assert.equal(Object.keys(p.balances).length,8);
  assert.deepEqual(p.portfolio.rows.map(r=>r.symbol).slice(0,2),['SOL','USDC']);
  assert.deepEqual(p.portfolio.rows.slice(2).map(r=>r.amount),[.5,7,5]);
  assert.equal(p.totalUsd,null);
  assert.equal(p.chain.chainId,501);assert.equal(p.chain.slot,1);
 } finally {if(saved!==undefined)process.env.SOLANA_ADDRESS=saved;}
}));
