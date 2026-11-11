/** Actual HTTP/WebSocket server and SQLite memory. No market APIs are mocked. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {WebSocket} from 'ws';
import {Memory} from '../main/memory.mjs';
import {decide} from '../main/decide.mjs';
import {validatePolicy} from '../main/permissions.mjs';
process.env.PAD_TOKEN = 'xorrpad-t2-test';
const {createServer,state} = await import('../main/server.mjs');
const headers = {authorization:'Bearer xorrpad-t2-test','content-type':'application/json'};
const base = 'http://127.0.0.1:8718';
const rejectedSocket = (url,options) => new Promise((resolve,reject) => {
 const ws = new WebSocket(url,options); ws.on('unexpected-response',(_req,res) => {res.resume();ws.terminate();resolve(res.statusCode);});
 ws.on('open',() => {ws.close();reject(new Error('unauthorized WebSocket opened'));}); ws.on('error',() => {});
});
test('signals and policy use pad auth; WebSocket headers/subprotocols stream actual queue events', {timeout:30000},async () => {
 const dir = await mkdtemp(path.join(tmpdir(),'xorr-t2-http-')); process.env.XORR_USER_DATA = dir;
 const mem = new Memory({db:path.join(dir,'memory.db')}),server = createServer(mem); const sockets=[];
 await new Promise((r,j) => {server.once('error',j);server.listen(8718,'127.0.0.1',r);});
 const post = async (url,body={}) => {const r = await fetch(base+url,{method:'POST',headers,body:JSON.stringify(body)}); return {status:r.status,body:await r.json()};};
 try {
  for (const url of ['/signals','/permissions','/session-wallet','/wallet/mode','/signals/missing/accept','/signals/missing/refuse','/signals/missing/sign']) {
   assert.equal((await fetch(base+url)).status,401,url);
   assert.equal((await fetch(base+url,{headers:{'x-pad-token':'wrong'}})).status,401,url);
  }
  assert.equal((await fetch(base+'/signals',{headers:{'x-pad-token':'xorrpad-t2-test'}})).status,200);
  assert.equal((await fetch(base+'/events',{headers})).status,426);
  for (const action of ['accept','refuse','sign']) assert.equal((await fetch(`${base}/signals/missing/${action}`,{headers})).status,405);
  assert.equal((await post('/signals/missing/accept')).status,404);
  assert.equal((await fetch(base+'/permissions',{method:'POST',headers,body:'{'})).status,400);
  assert.equal((await post('/permissions',{secretKey:'not-a-key'})).status,400);
  assert.equal((await post('/permissions',{marketAllowlist:['SOL']})).status,200);
  assert.equal((await (await fetch(base+'/wallet/mode',{headers})).json()).mode,'phone');
  assert.equal((await post('/wallet/mode',{mode:'invalid'})).status,400);
  assert.equal((await fetch(base+'/session-wallet',{headers})).status,503);
  const created = await post('/session-wallet'); assert.deepEqual(Object.keys(created.body),['publicKey']);
  assert.equal((await post('/wallet/mode',{mode:'session'})).body.mode,'session');
  assert.equal((await post('/wallet/mode',{mode:'phone'})).body.mode,'phone');
  assert.equal(await rejectedSocket('ws://127.0.0.1:8718/events'),401);
  assert.equal(await rejectedSocket('ws://127.0.0.1:8718/events?token=xorrpad-t2-test'),401);
  const ws = new WebSocket('ws://127.0.0.1:8718/events',{headers}); sockets.push(ws);
  const first = once(ws,'message'); await once(ws,'open'); assert.equal(JSON.parse((await first)[0]).type,'snapshot');
  const browser = new WebSocket('ws://127.0.0.1:8718/events',['xorrpad','pad-token.xorrpad-t2-test']); sockets.push(browser);
  const snapshot = once(browser,'message'); await once(browser,'open'); await snapshot; assert.equal(browser.protocol,'xorrpad');
  const brief = {limits:{allow:['SOL'],max_trade_usd:100,max_day_usd:300},spent_today:0};
  const signal = {symbol:'SOL',kind:'spot',side:'BUY',venue:'jupiter',sizeUsd:1};
  const proposal = {signal,verdict:decide(signal,brief,{policy:validatePolicy({})}),routing:null};
  const event = once(ws,'message'), e = await server.signals.create(proposal);
  assert.equal(JSON.parse((await event)[0]).signal.state,'proposed');
  assert.equal((await post(`/signals/${e.id}/refuse`)).body.state,'refused');
  assert.equal((await post(`/signals/${e.id}/accept`)).status,409);
  const second = await server.signals.create(proposal);
  await mem.setReference('risk/limits',{allow:[],max_trade_usd:100,max_day_usd:300});
  const accepted = await post(`/signals/${second.id}/accept`); assert.equal(accepted.body.state,'refused'); assert.equal(accepted.body.ruleId,'memory.allowlist');
  const refused = await post('/signals',{kind:'spot',market:'SOL',side:'buy',size:1}); assert.equal(refused.body.signalState,'refused');
  const waiting = await server.signals.create(proposal); await post('/panic'); assert.equal(server.signals.get(waiting.id).state,'refused');
  const journal = await mem.events(100); assert.ok(journal.some(e => (typeof e.acted === 'string' ? JSON.parse(e.acted) : e.acted)?.ruleId === 'memory.allowlist'));
 } finally {
  for (const ws of sockets) ws.terminate();
  await new Promise(r => server.close(r)); mem.stop(); state.pending=null; state.armed=true;
  delete process.env.XORR_USER_DATA; await rm(dir,{recursive:true,force:true});
 }
});
