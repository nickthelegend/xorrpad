/** Real key generation/import, filesystem permissions and cryptography; no send. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,chmod,stat,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {Keypair,TransactionMessage,VersionedTransaction,SystemProgram} from '@solana/web3.js';
import {SessionWallet,authorizeSigning} from '../main/session-wallet.mjs';
import {verifySignedTransaction} from '../main/executor.mjs';
import {validatePolicy} from '../main/permissions.mjs';
import {decide} from '../main/decide.mjs';
function transaction(owner) {return new VersionedTransaction(new TransactionMessage({payerKey:owner,
 recentBlockhash:SystemProgram.programId.toBase58(),instructions:[SystemProgram.transfer({fromPubkey:owner,toPubkey:owner,lamports:1})]}).compileToV0Message());}
const signal = {symbol:'SOL',side:'BUY',kind:'spot',sizeUsd:1,venue:'jupiter'};
const brief = {limits:{max_trade_usd:100,max_day_usd:300,allow:['SOL']},spent_today:0};
const policy = validatePolicy({});
const accepted = () => ({state:'accepted',cluster:'devnet',expiresAt:Date.now()+60000,proposal:{signal,verdict:decide(signal,brief,{policy})}});
test('Node wallet creates/imports once, shows only public key and uses ignored 0600 storage',async () => {
 const dir = await mkdtemp(path.join(tmpdir(),'xorr-wallet-')),other = await mkdtemp(path.join(tmpdir(),'xorr-import-'));
 const keypair = Keypair.generate();
 try {
  const wallet = new SessionWallet({dir}), created = await wallet.create();
  assert.deepEqual(Object.keys(created),['publicKey']); assert.deepEqual(await wallet.info(),created);
  const file = path.join(dir,'session-wallet.node.key'); assert.equal((await stat(file)).mode & 0o777,0o600);
  await assert.rejects(wallet.create(),/EEXIST/);
  const imported = new SessionWallet({dir:other});
  assert.deepEqual(await imported.import([...keypair.secretKey]),{publicKey:keypair.publicKey.toBase58()});
  assert.equal((await imported.info()).publicKey,keypair.publicKey.toBase58());
  await assert.rejects(imported.import([1,2,3]),/64-byte/);
  const ignored = execFileSync('git',['check-ignore','desk/test/session-wallet.node.key','desk/test/session-wallet.encrypted'],{cwd:new URL('../../',import.meta.url),encoding:'utf8'});
  assert.match(ignored,/session-wallet.node.key/); assert.match(ignored,/session-wallet.encrypted/);
 } finally {keypair.secretKey.fill(0); await Promise.all([rm(dir,{recursive:true,force:true}),rm(other,{recursive:true,force:true})]);}
});
test('wallet refuses world/group-readable storage and symlinks before reading its key',async () => {
 const dir = await mkdtemp(path.join(tmpdir(),'xorr-wallet-mode-')),links = await mkdtemp(path.join(tmpdir(),'xorr-wallet-link-'));
 try {
  const wallet = new SessionWallet({dir}); await wallet.create(); const file = path.join(dir,'session-wallet.node.key');
  for (const mode of [0o644,0o604,0o640]) {await chmod(file,mode); await assert.rejects(wallet.info(),/0600/);}
  await chmod(file,0o600);
  await symlink(file,path.join(links,'session-wallet.node.key'));
  await assert.rejects(new SessionWallet({dir:links}).info(),/ELOOP/);
 } finally {await Promise.all([rm(dir,{recursive:true,force:true}),rm(links,{recursive:true,force:true})]);}
});
test('mainnet signing refuses the exact missing acknowledgement before any key/RPC access',async () => {
 const previous = process.env.XORR_ALLOW_MAINNET;
 try {
  delete process.env.XORR_ALLOW_MAINNET;
  await assert.rejects(new SessionWallet({dir:'/no-wallet-here'}).sign(null,{cluster:'mainnet-beta'}),/XORR_ALLOW_MAINNET=I_ACKNOWLEDGE_REAL_FUNDS/);
  process.env.XORR_ALLOW_MAINNET = 'yes';
  await assert.rejects(new SessionWallet().sign(null,{cluster:'mainnet-beta'}),/XORR_ALLOW_MAINNET=I_ACKNOWLEDGE_REAL_FUNDS/);
  process.env.XORR_ALLOW_MAINNET = 'I_ACKNOWLEDGE_REAL_FUNDS';
  await assert.rejects(new SessionWallet().sign(transaction(Keypair.generate().publicKey),{cluster:'mainnet-beta'}),/fresh gate capability/);
 } finally {if (previous === undefined) delete process.env.XORR_ALLOW_MAINNET; else process.env.XORR_ALLOW_MAINNET=previous;}
});
test('signing capabilities require accepted, unexpired, exact-size policy approval and bind the message',async () => {
 const pair = Keypair.generate(),tx = transaction(pair.publicKey),entry = accepted();
 try {
  for (const state of ['awaiting','refused','expired','executed']) assert.throws(() => authorizeSigning(tx,{...entry,state},brief,policy),/not accepted/);
  assert.throws(() => authorizeSigning(tx,{...entry,expiresAt:Date.now()-1},brief,policy),/expired/);
  assert.throws(() => authorizeSigning(tx,entry,brief,validatePolicy({maxTradeUsd:0})),/gate refused/);
  assert.throws(() => authorizeSigning(tx,entry,{...brief,limits:{...brief.limits,max_trade_usd:.5}},policy),/gate refused/);
  assert.throws(() => authorizeSigning(tx,{...entry,automatic:true},brief,policy),/gate refused/);
  const permit = authorizeSigning(tx,entry,brief,policy);
  tx.message.recentBlockhash = pair.publicKey.toBase58();
  await assert.rejects(new SessionWallet().sign(tx,{cluster:'devnet',permit}),/exact transaction/);
  await assert.rejects(new SessionWallet().sign(tx,{cluster:'devnet',permit:{}}),/fresh gate capability/);
 } finally {pair.secretKey.fill(0);}
});
test('phone transaction verifier checks every real Ed25519 signature against the exact message',() => {
 const pair = Keypair.generate(),tx = transaction(pair.publicKey);
 try {
  assert.throws(() => verifySignedTransaction(tx),/invalid transaction signature/);
  tx.sign([pair]); assert.doesNotThrow(() => verifySignedTransaction(tx));
  tx.message.recentBlockhash = pair.publicKey.toBase58(); assert.throws(() => verifySignedTransaction(tx),/invalid transaction signature/);
 } finally {pair.secretKey.fill(0);}
});
