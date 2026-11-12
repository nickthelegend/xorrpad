/** Real TCP endpoints; only delivery faults and clock boundaries are injected. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { PadLink } from '../main/padlink.mjs';
import { wire, rawPublic } from '../main/pad-v2.mjs';
import { PadSimulatorV2 } from '../../tools/padsim/v2.mjs';
import { PadSimulator } from '../../tools/padsim/index.mjs';
async function until(fn) {
  for(let i=0;i<500;i++) { if(fn()) return; await delay(10); }
  throw Error('condition timeout');
}
async function lab(fn) {
  const dir=await mkdtemp(path.join(tmpdir(),'xorr-s2-'));
  const link=new PadLink({dir});
  const pads=[];
  async function connect(name, identity) {
    const pad=new PadSimulatorV2({device:'s2-test',serial:name==='usb',fragmentBytes:17,...identity});
    pads.push(pad); pad.on('protocol_error',e=>{pad.lastError=e;});
    const port=8725+pads.length;
    await pad.listen(port);
    const stream=net.createConnection(port,'127.0.0.1');
    const peer=link.attach(stream,name);
    await until(()=>peer.candidate);
    if (!link.pairings.has(pad.device)) link.pair(pad.pairing);
    await pad.waitFor(m=>m.type==='keymap');
    await until(()=>peer.verified&&!peer.secure.pending.size&&!pad.session.pending.size);
    return {pad,peer};
  }
  try {await fn({link,connect});}
  finally {link.close(); for(const p of pads) await p.close(); await rm(dir,{recursive:true,force:true});}
}
test('real TCP lost ACK recovers by re-ACKing authenticated retry, once only',async()=>lab(async({link,connect})=>{
  const {pad,peer}=await connect('usb');
  let dropped=false;
  const write=pad.write.bind(pad);
  pad.write=line=>{
    // The next encrypted output is the immediate acknowledgment.
    if(!dropped&&JSON.parse(line).type==='encrypted') {dropped=true;return;}
    write(line);
  };
  const after=pad.history.length;
  link.send(peer,{type:'config',...link.options,brightness:91});
  await pad.waitFor(m=>m.type==='config'&&m.brightness===91,{after});
  await until(()=>dropped&&!peer.secure.pending.size);
  assert.equal(pad.history.slice(after).filter(m=>m.type==='config').length,1);
  assert.equal(pad.lastError,undefined);
}));
test('watchdog expires a peer during backend work and reconnect requires fresh session keys',async()=>lab(async({link,connect})=>{
  const {pad,peer}=await connect('wifi');
  const oldSession=peer.secure;
  // An outstanding backend task must not suppress the link watchdog.
  peer.streams.set('work',{at:Date.now(),answering:true});
  peer.last=Date.now()-15000;
  link.maintain();
  assert(!link.peers.has(peer));
  await until(()=>!pad.session);
  assert.throws(()=>pad.key('buy'),/offline/);
  const identity={identity:pad.identity,exchange:pad.exchange};
  await pad.close();
  const next=await connect('wifi',identity);
  assert.notDeepEqual(next.peer.secure.tx,oldSession.tx);
  assert.equal(link.snapshot().devices[0].secure,true);
}));
test('USB to BLE to Wi-Fi policy rejects standby trade inputs and never stores offline input',async()=>lab(async({link,connect})=>{
  const {pad,peer}=await connect('usb');
  const identity={identity:pad.identity,exchange:pad.exchange};
  const {peer:ble}=await connect('ble',identity);
  const {peer:wifi}=await connect('wifi',identity);
  assert.equal(link.preferred(pad.device),peer);
  await assert.rejects(link.receive(ble,{type:'key',id:'standby',action:'buy'}),/inactive/);
  link.remove(peer); assert.equal(link.preferred(pad.device),ble);
  link.remove(ble); assert.equal(link.preferred(pad.device),wifi);
  link.remove(wifi); assert.equal(link.preferred(pad.device),undefined);
  await until(()=>!pad.session);
  assert.throws(()=>pad.key('buy'),/offline/);
  assert.equal(pad.out.length,0);
}));
test('v1 remains accepted while v2-only transports reject plaintext',async()=>lab(async({link})=>{
  const pad=new PadSimulator({device:'v1-test'});
  try {
    await pad.listen(8728);
    const p=link.attach(net.createConnection(8728,'127.0.0.1'),'usb');
    await pad.waitFor(m=>m.type==='keymap');
    assert.equal(p.firmware,'1.0.0'); assert.equal(p.secure,undefined);
    p.v2Only=true;
    assert.throws(()=>p.lines.feed('{"v":1,"type":"hello","device":"bad","fw":"1.0.0"}\n'),/v2/);
  } finally {await pad.close();}
}));

test('replayed pairing offer cannot reset an established pad nonce counter',async()=>lab(async({connect})=>{
  const {pad,peer}=await connect('usb');
  const before=pad.session;
  const h=peer.handshake;
  peer.write(wire({v:2,type:'pair',deskpk:rawPublic(h.keys.publicKey),challenge:h.challenge,nonce:h.candidate.nonce},true));
  await until(()=>pad.lastError);
  assert.match(pad.lastError.message,/stale pairing/);
  assert.equal(pad.session,before);
  assert(pad.verified);
}));
test('expired signal queued behind unacknowledged data is discarded',async()=>lab(async({link,connect})=>{
  const {pad,peer}=await connect('usb');
  const before=pad.history.length;
  link.send(peer,{type:'config',...link.options});
  assert.equal(peer.secure.pending.size,1);
  link.send(peer,{type:'signal',signalId:'expired-protocol-fixture',remainingMs:0});
  await delay(20);
  assert(!pad.history.slice(before).some(m=>m.type==='signal'));
  assert.equal(peer.secure.pending.size,0);
}));
