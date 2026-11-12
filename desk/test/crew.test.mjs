import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {VersionedTransaction} from '@solana/web3.js';
import {PadLink} from '../main/padlink.mjs';
import {CrewGate,validateCrew,verifyCrewApproval} from '../main/crew.mjs';
import {clearSignFrames} from '../main/clear-sign.mjs';
import {CrewPadSimulator,CrewDriver} from '../../tools/padsim/crew.mjs';
import {rawPublic} from '../main/pad-v2.mjs';
const fixture=JSON.parse(readFileSync(new URL('../../firmware/test/fixtures/session-usdc-transfer.json',import.meta.url)));
const transaction=()=>VersionedTransaction.deserialize(Buffer.from(fixture.unsignedTx,'base64'));
const request=(id='crew-test')=>({signalId:id,remainingMs:10000,message:fixture.message,tables:[],cosign:true});
const prepared=id=>{const r=request(id);return {request:r,...clearSignFrames(r)};};
async function until(fn){for(let i=0;i<500;i++){if(fn())return;await delay(10);}throw Error('crew simulator timeout');}
async function lab(fn){
 const dir=mkdtempSync(path.join(tmpdir(),'xorr-crew-')),link=new PadLink({dir}),events=[];
 const pads=[new CrewPadSimulator({device:'crew-alpha',serial:true}),new CrewPadSimulator({device:'crew-beta',serial:true})];
 try{
  for(let i=0;i<2;++i){await pads[i].listen(8726+i);const p=link.attach(net.createConnection(8726+i,'127.0.0.1'),'usb');await until(()=>p.candidate);link.pair(pads[i].pairing);await until(()=>p.verified&&pads[i].verified);}
  const members=pads.map((p,i)=>({device:p.device,publicKey:rawPublic(p.identity.publicKey),name:i?'Bob':'Alice'}));
  const gate=new CrewGate({dir,link,publish:e=>events.push(structuredClone(e))});gate.write({enabled:true,aboveUsd:100,required:2,members});
  await fn({pads,link,gate,dir,events,members});
 }finally{link.close();await Promise.all(pads.map(p=>p.close()));rmSync(dir,{recursive:true,force:true});}
}
const collecting=(gate,more={})=>gate.collect(transaction(),{usd:101,signalId:'accepted-trade',expiresAt:Date.now()+10000,cluster:'devnet',prepared:prepared('crew-test'),recheck:async()=>{},...more});
test('crew policy requires distinct identities, real quorum, finite threshold and paired members',async()=>lab(async({gate,members})=>{
 for(const policy of [true,[],1,{enabled:true,required:1,members},{enabled:true,required:3,members},{enabled:true,members:[members[0],members[0]]},{aboveUsd:NaN},{members:[{...members[0],device:'injected\n'}]}])assert.throws(()=>validateCrew(policy));
 assert.throws(()=>gate.write({enabled:true,members:members.map(m=>({...m,publicKey:'00'.repeat(32)}))}));
 assert.equal(new CrewGate({dir:path.dirname(gate.file)}).read().enabled,true);
}));
test('two real encrypted pads clear review and co-sign the same SDK transaction before release',async()=>lab(async({pads,gate,events,link})=>{
 let released=false;
 const pending=collecting(gate).then(r=>{released=true;return r;});
 await until(()=>pads.every(p=>p.review));assert.equal(released,false);assert.ok(pads.every(p=>p.review.ok));
 const first=await pads[0].approveCrew();await until(()=>events.some(e=>e.approvals.length===1));assert.equal(released,false);
 await pads[1].approveCrew();const receipt=await pending;assert.equal(released,true);assert.equal(receipt.approvals.length,2);
 gate.assert(transaction(),101,receipt);assert.deepEqual(events.at(-1).approvals.map(a=>a.name).sort(),['Alice','Bob']);
 assert.equal(transaction().signatures.some(s=>s.some(Boolean)),false);
 assert.throws(()=>gate.assert(transaction(),101,null),/required/);
 const changed=transaction();changed.message.recentBlockhash='11111111111111111111111111111111';assert.throws(()=>gate.assert(changed,101,receipt),/required/);
 assert.throws(()=>gate.assert(transaction(),101,{...receipt,expiresAt:Date.now()-1}),/expired/);
 await assert.rejects(link.receive(link.sessionPeer(pads[0].device),first),/unsolicited/);
 gate.write({...gate.read(),aboveUsd:99});assert.throws(()=>gate.assert(transaction(),101,receipt),/required/);
}));
test('one pad refusal leaves no quorum and does not release signing',async()=>lab(async({pads,gate})=>{
 const pending=collecting(gate);const rejected=assert.rejects(pending,/quorum/);
 await until(()=>pads.every(p=>p.review));await pads[0].approveCrew();await pads[1].approveCrew({yes:false});await rejected;
 assert.equal(gate.status().at(-1).state,'refused');
}));
test('disconnect during crew review invalidates pending approval',async()=>lab(async({pads,gate,link})=>{
 const pending=collecting(gate);const rejected=assert.rejects(pending,/quorum/);
 await until(()=>pads.every(p=>p.review));await pads[0].approveCrew();link.remove(link.sessionPeer(pads[1].device));await rejected;
}));
test('crew threshold is strictly above X; offline missing quorum fails closed',async()=>lab(async({pads,gate,link})=>{
 assert.equal(await collecting(gate,{usd:100}),null);
 link.remove(link.sessionPeer(pads[1].device));await assert.rejects(collecting(gate),/Setup required/);
}));
test('policy or permission changes while waiting prevent crew release',async()=>lab(async({pads,gate})=>{
 const pending=collecting(gate,{recheck:async()=>{throw Error('disarmed');}});const rejected=assert.rejects(pending,/disarmed/);
 await until(()=>pads.every(p=>p.review));await pads[0].approveCrew();await pads[1].approveCrew();await rejected;
}));
test('crew expiry cancels both pending encrypted requests',async()=>lab(async({pads,gate,link})=>{
 const pending=collecting(gate,{expiresAt:Date.now()+100});await assert.rejects(pending,/quorum/);
 assert.ok([...link.peers].every(p=>!p.sessionRequest));
}));
test('device approval rejects signature/hash/identity/hold substitution',()=>{
 const pair=generateKeyPairSync('ed25519'),member={device:'unit',publicKey:rawPublic(pair.publicKey),name:'Alice'};
 const hash=createHash('sha256').update(Buffer.from(fixture.message,'hex')).digest('hex');
 const result={ok:true,device:'unit',messageHash:hash,signature:sign(null,Buffer.from(hash,'hex'),pair.privateKey).toString('hex'),heldMs:800,blind:false};
 verifyCrewApproval(member,result,hash);
 for(const change of [{messageHash:'00'.repeat(32)},{device:'other'},{signature:'00'.repeat(64)},{heldMs:799},{blind:true},{ok:false}])assert.throws(()=>verifyCrewApproval(member,{...result,...change},hash));
});
test('native crew driver refuses unreviewed, short, stale, expired and replay approvals',async()=>{
 const driver=new CrewDriver();
 const offer=async(id='native-crew',remainingMs=10000)=>{const r={...request(id),remainingMs};for(const f of clearSignFrames(r).frames){const c={clear_begin:'begin',clear_chunk:'chunk',clear_end:'end'}[f.type];const result=await driver.call({...f,command:c});assert.equal(result.ok,true);}};
 try{
  await offer();assert.equal((await driver.call({command:'approve',reviewed:false,heldMs:800})).ok,false);
  await offer();assert.equal((await driver.call({command:'approve',reviewed:true,heldMs:799})).ok,false);
  await offer();assert.equal((await driver.call({command:'approve',reviewed:true,heldMs:800})).ok,true);assert.equal((await driver.call({command:'approve',reviewed:true,heldMs:800})).ok,false);
  await offer();await driver.call({command:'disconnect'});assert.equal((await driver.call({command:'approve',reviewed:true,heldMs:800})).ok,false);
  await offer('expired',1);await driver.call({command:'advance',ms:1});assert.equal((await driver.call({command:'approve',reviewed:true,heldMs:800})).ok,false);
 }finally{driver.close();}
});

test('changing persisted crew policy during review invalidates the completed quorum',async()=>lab(async({pads,gate})=>{
 const pending=collecting(gate);const rejected=assert.rejects(pending,/required/);
 await until(()=>pads.every(p=>p.review));gate.write({...gate.read(),aboveUsd:99});
 await pads[0].approveCrew();await pads[1].approveCrew();await rejected;
}));
