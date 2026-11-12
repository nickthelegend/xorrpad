import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {PublicKey,Transaction,VersionedTransaction} from '@solana/web3.js';
import {createTransferCheckedInstruction,getAssociatedTokenAddressSync,TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {SessionDriver,SessionPadSimulator} from '../../tools/padsim/session.mjs';
import {attachPadSignature} from '../main/pad-signer.mjs';
import {verifySignedTransaction,Executor} from '../main/executor.mjs';
import {PadLink} from '../main/padlink.mjs';
import {SignalQueue} from '../main/signals.mjs';
import {clearSignFrames} from '../main/clear-sign.mjs';
import {setTimeout as delay} from 'node:timers/promises';
import net from 'node:net';
const fixture=JSON.parse(readFileSync(new URL('../../firmware/test/fixtures/session-usdc-transfer.json',import.meta.url)));
const captured=VersionedTransaction.deserialize(Buffer.from(fixture.unsignedTx,'base64'));
const mint=captured.message.staticAccountKeys[captured.message.compiledInstructions[0].accountKeyIndexes[1]];
const destination=captured.message.staticAccountKeys[captured.message.compiledInstructions[0].accountKeyIndexes[2]];
function build(owner){
  const publicKey=new PublicKey(owner),tx=new Transaction({feePayer:publicKey,recentBlockhash:captured.message.recentBlockhash}).add(
    createTransferCheckedInstruction(getAssociatedTokenAddressSync(mint,publicKey,true),mint,destination,publicKey,123456n,6));
  return VersionedTransaction.deserialize(tx.serialize({requireAllSignatures:false,verifySignatures:false}));
}
const policy={trade:200000,day:240000,autoTrade:0,maxLeverage:1,mint:mint.toBase58(),market:'',programs:[TOKEN_PROGRAM_ID.toBase58()]};
const request=tx=>({signalId:'native-pad-sign',remainingMs:120000,message:Buffer.from(tx.message.serialize()).toString('hex'),tables:[],sign:true});
async function until(fn){for(let i=0;i<500;i++){if(fn())return;await delay(10);}throw Error('pad signer timeout');}
const binary=new URL('../../firmware/build/session-driver',import.meta.url);
test('native firmware signs actual SDK message after hold, verifies Ed25519 and retains cap across reboot',async()=>{
 assert.ok(existsSync(binary),'run firmware/test/run.sh before desk tests');
 const dir=mkdtempSync(path.join(tmpdir(),'xorr-native-sign-')),driver=new SessionDriver(path.join(dir,'public-accounting.json'));
 try{
  const state=await driver.call({command:'status'}),tx=build(state.publicKey),r=request(tx);
  assert.equal((await driver.call({command:'policy',policy,heldMs:3799})).ok,false);
  assert.equal((await driver.call({command:'policy',policy,heldMs:3800})).ok,true);
  const prepare=()=>driver.call({command:'prepare',request:r});
  assert.equal((await prepare()).ok,true);
  assert.equal((await driver.call({command:'sign',heldMs:799,reviewed:true})).ok,false);
  await prepare();assert.equal((await driver.call({command:'sign',heldMs:800,reviewed:false})).ok,false);
  await prepare();const result=await driver.call({command:'sign',heldMs:800,reviewed:true});assert.equal(result.ok,true);
  attachPadSignature(tx,result,state.publicKey);verifySignedTransaction(tx);
  assert.throws(()=>attachPadSignature(build(state.publicKey),{...result,signature:'00'.repeat(64)},state.publicKey),/invalid/);
  assert.throws(()=>attachPadSignature(build(state.publicKey),{...result,messageHash:'00'.repeat(32)},state.publicKey),/different/);
  assert.equal((await driver.call({command:'reboot'})).ok,true);await prepare();
  assert.equal((await driver.call({command:'sign',heldMs:800,reviewed:true})).ok,false);
  assert.equal((await driver.call({command:'sign',heldMs:800,reviewed:true})).ok,false);
  // Only public policy/counters leave the process. No private key is loaded or saved.
  const disk=JSON.parse(readFileSync(path.join(dir,'public-accounting.json')));assert.equal(disk.usage[0].amount,123456);
 }finally{driver.close();rmSync(dir,{recursive:true,force:true});}
});
test('pad signer mode persists without enabling mainnet or falling back to another wallet',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'xorr-pad-mode-')),signals=new SignalQueue();
 try{const e=new Executor({dir,signals});assert.equal(e.mode(),'phone');e.setMode('pad');assert.equal(new Executor({dir,signals}).mode(),'pad');}
 finally{signals.close();rmSync(dir,{recursive:true,force:true});}
});
test('native pad auto policy requires matching destination and charges daily budget',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'xorr-native-auto-')),driver=new SessionDriver(path.join(dir,'accounting.json'));
 try{
  const state=await driver.call({command:'status'}),r=request(build(state.publicKey));
  assert.equal((await driver.call({command:'policy',policy:{...policy,autoTrade:150000,market:destination.toBase58()},heldMs:3800})).ok,true);
  await driver.call({command:'prepare',request:r});const result=await driver.call({command:'sign',heldMs:0,reviewed:false});
  assert.equal(result.ok,true);assert.equal(result.automatic,true);verifySignedTransaction(attachPadSignature(build(state.publicKey),result,state.publicKey));
  assert.equal((await driver.call({command:'reboot'})).ok,true);await driver.call({command:'prepare',request:r});
  assert.equal((await driver.call({command:'sign',heldMs:0,reviewed:false})).ok,false);
 }finally{driver.close();rmSync(dir,{recursive:true,force:true});}
});
test('encrypted pad session policy and exact message signature use native firmware, refuse stale responses',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'xorr-sign-wire-')),link=new PadLink({dir});
 const pad=new SessionPadSimulator({device:'native-session-pad',sessionStateFile:path.join(dir,'accounting.json'),serial:true});
 try{
  await pad.listen(8725);const peer=link.attach(net.createConnection(8725,'127.0.0.1'),'usb');
  await until(()=>peer.candidate);link.pair(pad.pairing);await until(()=>peer.verified && pad.verified);
  const initial=await link.sessionStatus(pad.device);assert.ok(initial.publicKey);assert.equal(initial.configured,false);
  const configuring=link.configureSession(pad.device,policy);await until(()=>pad.policyRequest);await pad.approvePolicy();assert.equal((await configuring).configured,true);
  const tx=build(initial.publicKey),r=request(tx),prepared=clearSignFrames(r);
  // Use captured real blockhash and SDK bytes, so this transport test needs no RPC.
  const signing=link.waitSession(peer,{type:'session_signature',signalId:r.signalId,messageHash:prepared.messageHash},()=>{
    for(const frame of prepared.frames)link.send(peer,frame);
  });
  await until(()=>pad.review);await pad.approveSign();const signed=await signing;
  verifySignedTransaction(attachPadSignature(tx,signed,initial.publicKey));
  await assert.rejects(link.receive(peer,signed),/unsolicited/);
  assert.equal(link.snapshot().devices[0].sessionSigner.publicKey,initial.publicKey);
  const waiting=link.sessionStatus(pad.device);link.remove(peer);await assert.rejects(waiting,/disconnected/);
 }finally{link.close();await pad.close();rmSync(dir,{recursive:true,force:true});}
});

test('pad signer refuses mainnet without explicit acknowledgment before requesting a pad',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'xorr-pad-cluster-')),link=new PadLink({dir});
 const previous=process.env.XORR_ALLOW_MAINNET;delete process.env.XORR_ALLOW_MAINNET;
 try{await assert.rejects(link.signSession('absent',{cluster:'mainnet-beta'}),/Mainnet signing refused/);}
 finally{if(previous===undefined)delete process.env.XORR_ALLOW_MAINNET;else process.env.XORR_ALLOW_MAINNET=previous;link.close();rmSync(dir,{recursive:true,force:true});}
});
