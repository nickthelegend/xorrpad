import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {VersionedTransaction} from '@solana/web3.js';
import {clearSignFrames} from '../main/clear-sign.mjs';
import {PadLink} from '../main/padlink.mjs';
import {base58} from '../main/pad-v2.mjs';
const fixture=name=>JSON.parse(readFileSync(new URL(`../../firmware/test/fixtures/${name}.json`,import.meta.url)));
test('clear signing transports exact real builder bytes and complete public table evidence',()=>{
 for(const name of ['system-legacy','system-v0','pmamm-yes','phoenix-long','jupiter-route','jupiter-known-route']){
  const f=fixture(name),tx=VersionedTransaction.deserialize(Buffer.from(f.unsignedTx,'base64'));
  assert.equal(Buffer.from(tx.message.serialize()).toString('hex'),f.message);
  assert.ok(tx.signatures.every(s=>s.every(b=>b===0)));
  const request={signalId:'fixture-review',remainingMs:120000,message:f.message,tables:f.tables,mintProofs:f.mintProofs};
  const {frames,fingerprint,messageHash}=clearSignFrames(request);
  const chunks=frames.slice(1,-1),bytes=Buffer.concat(chunks.map(f=>Buffer.from(f.data,'hex')));
  assert.deepEqual(JSON.parse(bytes),request);
  assert.equal(frames[0].size,bytes.length);assert.equal(frames[0].sha256,createHash('sha256').update(bytes).digest('hex'));
  assert.equal(messageHash,f.sha256);assert.equal(fingerprint,base58(Buffer.from(f.sha256,'hex')).slice(0,6));
  let offset=0;for(const chunk of chunks){assert.equal(chunk.offset,offset);assert.ok(chunk.data.length<=1536);offset+=chunk.data.length/2;}
 }
});
test('clear signing rejects malformed and oversized message requests',()=>{
 const f=fixture('system-v0'),r={signalId:'review',remainingMs:120000,message:f.message,tables:[]};
 for(const patch of [{message:'xx'},{message:'00'.repeat(1233)},{remainingMs:0},{remainingMs:86400001},{signalId:''},{tables:null}])assert.throws(()=>clearSignFrames({...r,...patch}),/invalid/);
 assert.throws(()=>clearSignFrames({...r,tables:[{data:'a'.repeat(96001)}]}),/bounded/);
});
test('desk blind signing is off by default, validates booleans and survives settings reload',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'xorr-clear-test-'));let link;
 try{
  link=new PadLink({dir});assert.equal(link.options.allowBlindSigning,false);
  assert.throws(()=>link.setOptions({allowBlindSigning:'true'}),/invalid/);
  link.setOptions({allowBlindSigning:true});assert.equal(link.options.allowBlindSigning,true);
  await link.close();link=new PadLink({dir});assert.equal(link.options.allowBlindSigning,true);
 }finally{await link?.close();rmSync(dir,{recursive:true,force:true});}
});

test('real encrypted pad link delivers clear-sign upload and rejects blind short replayed approvals',async t=>{
 const net=await import('node:net'),{setTimeout:delay}=await import('node:timers/promises');
 const {PadSimulatorV2}=await import('../../tools/padsim/v2.mjs');
 const dir=mkdtempSync(path.join(tmpdir(),'xorr-clear-wire-')),link=new PadLink({dir});
 const pad=new PadSimulatorV2({device:'v3-clear-review',serial:true});
 async function until(fn){for(let i=0;i<500;i++){if(fn())return;await delay(10);}throw Error('clear-sign wire timeout');}
 try{
  await pad.listen(8724);const peer=link.attach(net.createConnection(8724,'127.0.0.1'),'usb');
  await until(()=>peer.candidate);link.pair(pad.pairing);await pad.waitFor(m=>m.type==='keymap');
  await until(()=>peer.verified && !peer.secure.pending.size && !pad.session.pending.size);
  const f=fixture('system-v0');let result;
  try{result=await link.clearSign(pad.device,{unsignedTx:f.unsignedTx,cluster:'devnet',signalId:'wire-review',remainingMs:120000});}
  catch(e){if(/fetch failed|timeout|429|503/i.test(e.message)){t.skip('public devnet RPC unavailable');return;}throw e;}
  await pad.waitFor(m=>m.type==='clear_end');
  const frames=pad.history.filter(m=>m.type==='clear_chunk'),bytes=Buffer.concat(frames.map(m=>Buffer.from(m.data,'hex')));
  assert.equal(JSON.parse(bytes).message,f.message);assert.equal(result.messageHash,f.sha256);
  const approvals=[];link.on('clear_approval',m=>approvals.push(m));
  const answer={type:'clear_approval',signalId:'wire-review',fingerprint:result.fingerprint,messageHash:result.messageHash,accepted:true,blind:true,heldMs:3800};
  await assert.rejects(link.receive(peer,answer),/refused/);
  link.setOptions({allowBlindSigning:true});
  await assert.rejects(link.receive(peer,{...answer,heldMs:3799}),/refused/);
  await assert.rejects(link.receive(peer,{...answer,fingerprint:'wrong'}),/refused/);
  await assert.rejects(link.receive(peer,{...answer,messageHash:'00'.repeat(32)}),/refused/);
  pad.send(answer);await until(()=>approvals.length===1);
  assert.equal(approvals[0].messageHash,f.sha256);
  await assert.rejects(link.receive(peer,answer),/refused/);
 }finally{link.close();await pad.close();rmSync(dir,{recursive:true,force:true});}
});
