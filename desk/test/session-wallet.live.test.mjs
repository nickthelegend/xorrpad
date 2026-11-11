/** Real devnet transaction construction/signature only. Never broadcasts or requests funds. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {VersionedTransaction} from '@solana/web3.js';
import {SessionWallet,authorizeSigning} from '../main/session-wallet.mjs';
import {verifySignedTransaction} from '../main/executor.mjs';
import {validatePolicy} from '../main/permissions.mjs';
import {decide} from '../main/decide.mjs';
import * as pm from '../main/chains/pmamm.mjs';
const unavailable = e => /fetch failed|timeout|timed out|ECONN|ENOTFOUND|HTTP (429|5\d\d)|429\s*:|429 Too Many|503 Service/i.test(e.message);
test('session wallet signs a gate-accepted real devnet pm-AMM message once, without submitting',{timeout:90000},async t => {
 const dir = await mkdtemp(path.join(tmpdir(),'xorr-wallet-live-'));
 try {
  const wallet = new SessionWallet({dir}),{publicKey} = await wallet.create();
  const connection = await pm.devnetConnection();
  const market = (await pm.markets()).filter(m => m.liquidity > 10 && m.yesPrice > .1 && m.yesPrice < .9 && m.endTs > Date.now()/1000+120).sort((a,b) => b.liquidity-a.liquidity)[0];
  if (!market) return t.skip('Setup required: live liquid pm-AMM devnet market');
  const built = await pm.buildSwap({owner:publicKey,market:market.market,side:'yes',usdc:1},{request:false});
  const tx = VersionedTransaction.deserialize(Buffer.from(built.unsignedTx,'base64'));
  const signal = {symbol:`pmamm:${market.market}:yes`,market:market.market,venue:'pmamm',kind:'predict',side:'BUY',sizeUsd:1};
  const brief = {limits:{allow:[signal.symbol],max_trade_usd:1,max_day_usd:1},spent_today:0},policy = validatePolicy({maxTradeUsd:1,maxDayUsd:1});
  const entry = {state:'accepted',cluster:'devnet',expiresAt:Date.now()+60000,proposal:{signal,verdict:decide(signal,brief,{policy})}};
  const permit = authorizeSigning(tx,entry,brief,policy);
  await wallet.sign(tx,{permit,cluster:'devnet',connection}); assert.doesNotThrow(() => verifySignedTransaction(tx));
  await assert.rejects(wallet.sign(tx,{permit,cluster:'devnet',connection}),/fresh gate capability/);
  const second = VersionedTransaction.deserialize(Buffer.from(built.unsignedTx,'base64'));
  const denied = authorizeSigning(second,entry,brief,policy);
  let lateRefusal;
  try { await wallet.sign(second,{permit:denied,cluster:'devnet',connection,recheck:async () => {
   assert.equal(decide(signal,brief,{policy:validatePolicy({marketDenylist:[signal.symbol]})}).action,'REJECT');
   throw new Error('policy changed before signing');
  }}); } catch(e) {if (unavailable(e)) throw e; lateRefusal=e;}
  assert.match(lateRefusal?.message || '',/policy changed/);
  assert.ok(second.signatures.every(s => s.every(n => n === 0)));
  console.log(`REAL devnet pm-AMM message signed for ${publicKey}; signature verified locally; not submitted`);
 } catch(e) {
  if (!unavailable(e)) throw e;
  console.log(`SKIP: session wallet live devnet dependency: ${e.message}`); t.skip(e.message);
 } finally {await rm(dir,{recursive:true,force:true});}
});
