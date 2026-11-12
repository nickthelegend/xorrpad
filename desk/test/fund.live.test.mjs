/** Actual public devnet reads and fragmented TCP/encrypted v2. Never funds or signs. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {Memory} from '../main/memory.mjs';
import {PadSimulator} from '../../tools/padsim/index.mjs';
import {SessionPadSimulator} from '../../tools/padsim/session.mjs';
process.env.PAD_TOKEN='fund-w2-test';
process.env.SOLANA_RPC='https://api.devnet.solana.com';
delete process.env.SOLANA_ADDRESS;
const {createServer}=await import('../main/server.mjs');
const headers={authorization:'Bearer fund-w2-test','content-type':'application/json'};
async function until(fn) {for(let i=0;i<500;i++){if(fn())return;await delay(10);}throw Error('pairing timeout');}
for(const secure of [false,true])test(`Fund reaches padsim over ${secure?'encrypted v2':'fragmented v1 TCP'} from desktop and pad key`,{timeout:120000},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'xorr-fund-'));process.env.XORR_USER_DATA=dir;
 const mem=new Memory({db:path.join(dir,'memory.db')}),server=createServer(mem);
 const pad=secure?new SessionPadSimulator({device:'fund-wallet-pad',serial:true,fragmentBytes:7,sessionStateFile:path.join(dir,'public-accounting.json')}):new PadSimulator({fragmentBytes:7});
 let stream,heartbeat;
 try {
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  const post=async(body,expected=200)=>{
   const res=await fetch(base+'/agent-wallet',{method:'POST',headers,body:JSON.stringify(body)}),data=await res.json();
   assert.equal(res.status,expected,JSON.stringify(data));return data;
  };
  assert.equal((await fetch(base+'/agent-wallet',{method:'POST',body:'{"action":"fund"}'})).status,401);
  assert.equal((await post({action:'fund'},503)).error,'Create your agent wallet in XOR Desktop');
  // Configuration lives only in the disposable test directory.
  const desk=await server.executor.wallet.create();
  if(!secure)assert.match((await post({action:'fund'},409)).error,/Connect your pad/);
  await pad.listen(8727);stream=net.createConnection(8727,'127.0.0.1');const peer=server.padlink.attach(stream,secure?'usb':'tcp');
  if(secure) {
   await until(()=>peer.candidate);server.padlink.pair(pad.pairing);await until(()=>peer.verified&&pad.verified);
   server.executor.setMode('pad',pad.device);
  } else {
   await pad.waitFor(m=>m.type==='keymap');
   heartbeat=setInterval(()=>pad.hello(),5000);
  }
  const identity=await server.executor.agentWalletIdentity();
  if(secure)assert.notEqual(identity.address,desk.publicKey);
  const wire=[];pad.stream.on('data',chunk=>wire.push(chunk));
  await delay(10000); // Keep real public RPC reads below per-method limits.
  let after=pad.history.length;
  assert.equal((await post({action:'fund'})).sent,1);
  const record=await pad.waitFor(m=>m.type==='fund',{after});
  assert.deepEqual({type:record.type,address:record.address,uri:record.uri,cluster:record.cluster},
   {type:'fund',address:identity.address,uri:`solana:${identity.address}?label=xorrpad%20agent`,cluster:'devnet'});
  assert.deepEqual(pad.fund,record);
  await delay(10000);after=pad.history.length;const id=pad.key('fund');
  const held=await pad.waitFor(m=>m.type==='fund',{after});await pad.waitFor(m=>m.type==='result'&&m.id===id);
  assert.equal(held.address,identity.address);assert.equal(held.uri,record.uri);
  if(secure) {
   const transport=Buffer.concat(wire).toString();assert.match(transport,/"type":"encrypted"/);
   assert.ok(!transport.includes(identity.address));assert.ok(!transport.includes('"type":"fund"'));
  } else {
   await mkdir(new URL('../../firmware/build/',import.meta.url),{recursive:true});
   await writeFile(new URL('../../firmware/build/w2-fund-devnet.json',import.meta.url),JSON.stringify(record,null,2));
  }
 } finally {
  clearInterval(heartbeat);stream?.destroy();await pad.close();await new Promise(r=>server.close(r));mem.stop();
  delete process.env.XORR_USER_DATA;await rm(dir,{recursive:true,force:true});
 }
});
