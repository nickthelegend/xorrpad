/** Actual authenticated route and devnet RPC. No airdrop, signing or submission. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Connection,PublicKey} from '@solana/web3.js';
import {Memory} from '../main/memory.mjs';
process.env.PAD_TOKEN = 'agent-wallet-w1-test';
process.env.SOLANA_RPC = 'https://api.devnet.solana.com';
delete process.env.SOLANA_ADDRESS;
const {createServer} = await import('../main/server.mjs');
const headers = {authorization:'Bearer agent-wallet-w1-test','content-type':'application/json'};

test('agent-wallet authenticates, creates once and returns actual devnet SOL/SPL balances', {timeout:90000},async () => {
 const dir = await mkdtemp(path.join(tmpdir(),'xorr-agent-wallet-'));
 process.env.XORR_USER_DATA = dir;
 const mem = new Memory({db:path.join(dir,'memory.db')}), server = createServer(mem);
 await new Promise(r => server.listen(0,'127.0.0.1',r));
 const base = `http://127.0.0.1:${server.address().port}`;
 const post = body => fetch(base+'/agent-wallet',{method:'POST',headers,body:JSON.stringify(body)});
 try {
  for (const method of ['GET','POST']) {
   assert.equal((await fetch(base+'/agent-wallet',{method})).status,401);
   assert.equal((await fetch(base+'/agent-wallet',{method,headers:{authorization:'Bearer wrong'}})).status,401);
  }
  assert.equal((await fetch(base+'/agent-wallet',{method:'DELETE',headers})).status,405);
  const missing = await fetch(base+'/agent-wallet',{headers});
  assert.equal(missing.status,503);
  assert.equal((await missing.json()).error,'Create your agent wallet in XOR Desktop');
  assert.equal((await post({action:'export'})).status,400);
  assert.equal((await post({action:'create',secretKey:'refuse-extra-input'})).status,400);
  const response = await post({action:'create'}), created = await response.json();
  assert.equal(response.status,200,JSON.stringify(created));
  assert.equal(created.source,'desk'); assert.equal(created.cluster,'devnet');
  assert.equal(created.solanaPay,`solana:${created.address}?label=xorrpad%20agent`);
  const connection = new Connection(process.env.SOLANA_RPC,{commitment:'confirmed',disableRetryOnRateLimit:true});
  const owner = new PublicKey(created.address);
  assert.equal(created.balances.SOL.amount,await connection.getBalance(owner)/1e9);
  for (const id of ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA','TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb']) {
   const actual = await connection.getParsedTokenAccountsByOwner(owner,{programId:new PublicKey(id)});
   assert.equal(actual.value.length,0,'fresh disposable wallet has no token accounts');
  }
  const again = await post({action:'create'}); assert.equal(again.status,200);
  assert.equal((await again.json()).address,created.address);
  const read = await (await fetch(base+'/agent-wallet',{headers})).json();
  assert.equal(read.address,(await server.executor.wallet.info()).publicKey);
  assert.equal(read.address,created.address); assert.equal(read.balances.USDC.amount,0);
  assert.equal(read.balances.USDC.mint,'4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
  assert.doesNotMatch(JSON.stringify(read),/secret|private|encrypted|node\.key|https?:/i);
  console.log(`REAL devnet route: ${read.address}, SOL ${read.balances.SOL.amount}, USDC ${read.balances.USDC.amount}; both SPL programs independently checked; no funds requested`);
 } finally {await new Promise(r => server.close(r));mem.stop();delete process.env.XORR_USER_DATA;await rm(dir,{recursive:true,force:true});}
});
