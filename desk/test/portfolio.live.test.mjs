/** Real devnet reads and actual v1/v2 padsim links; no funding or submission. */
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
process.env.PAD_TOKEN='portfolio-w1-test';
process.env.SOLANA_RPC='https://api.devnet.solana.com';
delete process.env.SOLANA_ADDRESS;
const {createServer}=await import('../main/server.mjs');
const headers={authorization:'Bearer portfolio-w1-test','content-type':'application/json'};
async function until(fn) {for(let i=0;i<500;i++){if(fn())return;await delay(10);}throw Error('pairing timeout');}
async function lab(secure,fn) {
 const dir=await mkdtemp(path.join(tmpdir(),'xorr-portfolio-'));process.env.XORR_USER_DATA=dir;
 const mem=new Memory({db:path.join(dir,'memory.db')}),server=createServer(mem);
 const pad=secure?new SessionPadSimulator({device:'wallet-pad',serial:true,sessionStateFile:path.join(dir,'public-accounting.json')}):new PadSimulator({fragmentBytes:7});
 let stream;
 try {
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  await pad.listen(8727);stream=net.createConnection(8727,'127.0.0.1');const peer=server.padlink.attach(stream,secure?'usb':'tcp');
  if(secure){await until(()=>peer.candidate);server.padlink.pair(pad.pairing);await until(()=>peer.verified&&pad.verified);}
  else await pad.waitFor(m=>m.type==='keymap');
  const wire=[];if(secure)pad.stream.on('data',chunk=>wire.push(chunk));
  const post=async(route,body)=>{await delay(3000);const r=await fetch(base+route,{method:'POST',headers,body:JSON.stringify(body)});const j=await r.json();assert.equal(r.status,200,JSON.stringify(j));return j;};
  await fn({server,pad,post,base,peer,wire});
 } finally {stream?.destroy();await pad.close();await new Promise(r=>server.close(r));mem.stop();delete process.env.XORR_USER_DATA;delete process.env.SOLANA_ADDRESS;await rm(dir,{recursive:true,force:true});}
}
test('PORTFOLIO honestly reports no wallet over HTTP and fragmented TCP, then falls back to desk wallet', {timeout:90000},async()=>lab(false,async({server,pad,post,base})=>{
 const empty=await post('/key',{id:'portfolio'});
 assert.equal(empty.message,'Create your agent wallet in XOR Desktop');assert.equal(empty.setupRequired,true);
 assert.deepEqual(empty.portfolio.rows,[]);assert.equal(empty.totalUsd,null);
 let after=pad.history.length,id=pad.key('portfolio');
 const missing=await pad.waitFor(m=>m.type==='portfolio',{after});
 assert.equal(missing.message,empty.message);await pad.waitFor(m=>m.type==='result'&&m.id===id);
 const wallet=await post('/agent-wallet',{action:'create'});
 const p=await post('/key',{id:'portfolio'});
 assert.equal(p.wallet.address,wallet.address);assert.equal(p.wallet.source,'desk');assert.equal(p.chain.cluster,'devnet');
 assert.equal(p.chain.slot,p.wallet.slot);assert.ok(p.chain.slot>0);assert.equal(p.chain.chainId,501);
 assert.deepEqual(p.portfolio.rows.map(r=>r.symbol),['SOL','USDC']);
 after=pad.history.length;id=pad.key('portfolio');
 const record=await pad.waitFor(m=>m.type==='portfolio',{after});await pad.waitFor(m=>m.type==='result'&&m.id===id);
 assert.equal(record.address,wallet.address);assert.equal(record.cluster,'devnet');
 assert.equal((await (await fetch(base+'/portfolio',{headers})).json()).wallet.address,wallet.address);
 // Explicit phone address still takes precedence, without replacing the agent identity.
 process.env.SOLANA_ADDRESS='11111111111111111111111111111111';
 const phone=await post('/key',{id:'portfolio'});assert.equal(phone.wallet.source,'phone');assert.equal(phone.wallet.address,process.env.SOLANA_ADDRESS);
 assert.equal((await server.executor.agentWalletIdentity()).address,wallet.address);delete process.env.SOLANA_ADDRESS;
 await mkdir(new URL('../../firmware/build/',import.meta.url),{recursive:true});
 await writeFile(new URL('../../firmware/build/w1-portfolio-devnet.json',import.meta.url),JSON.stringify(record,null,2));
 await writeFile(new URL('../../firmware/build/w1-portfolio-no-wallet.json',import.meta.url),JSON.stringify(missing,null,2));
 console.log(`REAL TCP PORTFOLIO: agent ${wallet.address}; no-wallet message and phone precedence verified`);
}));
test('encrypted v2 PORTFOLIO uses selected native pad session key even before signing policy approval', {timeout:90000},async()=>lab(true,async({server,pad,post,peer,wire})=>{
 await delay(10000); // Keep the public devnet RPC below its per-IP method limits.
 const {publicKey:deskAddress}=await server.executor.wallet.create();
 await post('/wallet/mode',{mode:'pad',device:pad.device});
 const state=await server.padlink.sessionStatus(pad.device);assert.equal(state.configured,false);
 const wallet=await (await fetch(server.padlink.baseUrl+'/agent-wallet',{headers})).json();
 assert.equal(wallet.source,'pad');assert.equal(wallet.address,state.publicKey);assert.notEqual(wallet.address,deskAddress);
 assert.equal((await post('/agent-wallet',{action:'create'})).address,state.publicKey);
 const after=pad.history.length,id=pad.key('portfolio');
 const record=await pad.waitFor(m=>m.type==='portfolio',{after});await pad.waitFor(m=>m.type==='result'&&m.id===id);
 assert.equal(record.address,state.publicKey);assert.equal(record.source,'pad');assert.ok(peer.secure);
 const transport=Buffer.concat(wire).toString();assert.match(transport,/"type":"encrypted"/);
 assert.ok(!transport.includes(state.publicKey));assert.ok(!transport.includes('"type":"portfolio"'));
 assert.equal((await server.executor.wallet.info()).publicKey,deskAddress);
 console.log(`REAL encrypted v2 PORTFOLIO: native pad ${state.publicKey}; desk identity preserved; no policy change or signing`);
}));
