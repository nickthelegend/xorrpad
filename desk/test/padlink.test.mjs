/** Real loopback HTTP/WS/TCP + real memory. No external service is substituted. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {WebSocket} from 'ws';
import {PadSimulator} from '../../tools/padsim/index.mjs';
import {Lines,validateKeymap,DEFAULT_KEYMAP,PadLink} from '../main/padlink.mjs';
import {Memory} from '../main/memory.mjs';
process.env.PAD_TOKEN='xorr-t4-test';
const {createServer,state}=await import('../main/server.mjs');
const headers={authorization:'Bearer xorr-t4-test','content-type':'application/json'};
const base='http://127.0.0.1:8720';

export async function lab(fn,{serial=false}={}) {
 const dir=await mkdtemp(path.join(tmpdir(),'xorr-pad-'));process.env.XORR_USER_DATA=dir;
 const mem=new Memory({db:path.join(dir,'memory.db')}),server=createServer(mem);
 const pad=new PadSimulator({fragmentBytes:7});
 let stream,socat;
 try {
  await new Promise((r,j) => {server.once('error',j);server.listen(8720,'127.0.0.1',r);});
  await mem.setReference('risk/limits',{allow:['SOL'],max_trade_usd:10,max_day_usd:100});
  state.market='SOL';state.armed=true;state.sizeUsd=1;state.pending=null;
  if(serial) {
   const {spawn}=await import('node:child_process');
   const {SerialPort}=await import('serialport');
   socat=spawn('python3',[fileURLToPath(new URL('../../tools/padsim/pty_bridge.py',import.meta.url))]);
   const [line]=await Promise.race([once(socat.stdout,'data'),once(socat,'close').then(([code])=>{throw new Error('PTY helper exited '+code);})]);const [first,second]=JSON.parse(line.toString());
   const a=new SerialPort({path:first,baudRate:115200}),b=new SerialPort({path:second,baudRate:115200});
   pad.attach(a);stream=b;server.padlink.attach(b,'usb');
  } else {
   await pad.listen(8721);stream=net.createConnection(8721,'127.0.0.1');server.padlink.attach(stream,'tcp');
  }
  await pad.waitFor(m => m.type==='keymap');
  await fn({dir,mem,server,pad,base});
 } finally {
  if(stream?.isOpen && !stream.closing)await new Promise(r=>stream.close(r));stream?.destroy();await pad.close();if(socat && socat.exitCode===null && socat.signalCode===null){const closed=once(socat,'close');socat.kill('SIGTERM');await closed;}
  if(server.listening)await new Promise(r => server.close(r));else {server.padlink.close();server.signals.close();}mem.stop();state.pending=null;state.armed=true;
  delete process.env.XORR_USER_DATA;await rm(dir,{recursive:true,force:true});
 }
}

test('framing handles fragmented Unicode, multiple lines, diagnostics and limits',() => {
 const got=[],lines=new Lines(m => got.push(m));
 const wire=Buffer.from('boot log\n{"v":1,"type":"ping","text":"✓"}\r\n{"v":1,"type":"ping"}\n');
 for(const byte of wire)lines.feed(Buffer.from([byte]));
 assert.equal(got.length,2);assert.equal(got[0].text,'✓');
 for(const bad of ['{"v":2,"type":"ping"}\n','{broken}\n','x'.repeat(4096)])assert.throws(() => new Lines(()=>{}).feed(bad));
});
test('keymap validation preserves all measured controls and every cell',() => {
 assert.deepEqual(validateKeymap(DEFAULT_KEYMAP),DEFAULT_KEYMAP);
 assert.equal(DEFAULT_KEYMAP.keys.find(k=>k.action==='base').label,'SCAN');
 for(const change of [m=>m.keys.pop(),m=>m.keys[0].label='bad\nlabel',m=>m.keys[0].action='kill',m=>m.keys[0].row=7,m=>m.keys[0]=m.keys[1],m=>m.revision=-1]){
  const m=structuredClone(DEFAULT_KEYMAP);change(m);assert.throws(() => validateKeymap(m));
 }
});
test('TCP: keymap push/persistence, key and knob use actual desk routes; duplicates do not replay',{timeout:30000},async () => lab(async ({dir,mem,server,pad}) => {
 const map=structuredClone(DEFAULT_KEYMAP);map.revision=1;map.keys[0]={...map.keys[0],action:'risk',label:'RISK CHECK'};
 assert.equal((await fetch(base+'/pad/keymap')).status,401);
 assert.equal((await fetch(base+'/pad/keymap',{method:'DELETE',headers})).status,405);
 const index=pad.history.length;
 assert.equal((await fetch(base+'/pad/keymap',{method:'POST',headers,body:JSON.stringify(map)})).status,200);
 await pad.waitFor(m=>m.type==='keymap'&&m.revision===1,{after:index});assert.deepEqual(pad.keymap,map);
 const restored=new PadLink({dir});assert.deepEqual(restored.keymap,map);restored.close();
 assert.equal((await fetch(base+'/pad/keymap',{method:'POST',headers,body:JSON.stringify(map)})).status,400);
 const events=[],watch=e=>{if(e.type==='pad')events.push(e);};server.signals.on('event',watch);
 const id=pad.key('risk');assert.equal((await pad.waitFor(m=>m.type==='result'&&m.id===id)).ok,true);
 assert.equal((await mem.recallBrief()).baton.agent,'risk');
 const after=pad.history.length;pad.key('risk',{id});assert.match((await pad.waitFor(m=>m.type==='result'&&m.id===id,{after})).error,/duplicate/);
 assert.equal(events.filter(e=>e.message.id===id).length,1);
 pad.send({type:'knob',id:'knob-1',sizeUsd:1000});assert.equal((await pad.waitFor(m=>m.id==='knob-1')).ok,true);assert.equal(state.sizeUsd,10);
 const kill=pad.key('kill');await pad.waitFor(m=>m.type==='result'&&m.id===kill);assert.equal(state.armed,false);
 server.signals.off('event',watch);
}));
test('real serialport over a PTY receives keymap and sends a key',{timeout:30000},async t => {
 await lab(async ({pad,mem}) => {const id=pad.key('dca');assert.equal((await pad.waitFor(m=>m.type==='result'&&m.id===id)).ok,true);assert.equal((await mem.recallBrief()).baton.agent,'dca');},{serial:true});
});
test('voice chunks reach actual voice module; missing key reports Setup required',{timeout:30000},async () => {
 const saved=process.env.DEEPGRAM_API_KEY;delete process.env.DEEPGRAM_API_KEY;
 try {await lab(async ({pad,server}) => {
  const events=[];server.signals.on('event',e=>{if(e.type==='pad'&&e.message.type==='voice')events.push(e);});
  const id=pad.voice(Buffer.alloc(1024));const result=await pad.waitFor(m=>m.type==='result'&&m.id===id);
  assert.equal(result.ok,false);assert.equal(result.status,'Setup required');assert.match(result.error,/Setup required: DEEPGRAM_API_KEY/);
  assert.equal(events.length,2);assert.deepEqual(events.map(e=>e.message.bytes),[512,512]);assert.ok(events.every(e=>e.message.pcm===undefined));
  assert.equal(pad.history.some(m=>m.type==='tts'),false);
  pad.send({type:'voice',id:'bad-seq',stream:'gap',seq:2,end:true,sampleRate:16000,pcm:''});
  assert.match((await pad.waitFor(m=>m.id==='bad-seq')).error,/sequence/);
 });}finally {if(saved===undefined)delete process.env.DEEPGRAM_API_KEY;else process.env.DEEPGRAM_API_KEY=saved;}
});
test('Wi-Fi NDJSON/WS authenticates and forwards actual queue events to /events',{timeout:30000},async () => lab(async ({server}) => {
 const payload={v:1,type:'hello',device:'wifi-lab',fw:'1.0.0',caps:['keys']};
 assert.equal((await fetch(base+'/padlink?device=wifi-lab',{method:'POST',body:JSON.stringify(payload)+'\n'})).status,401);
 const response=await fetch(base+'/padlink?device=wifi-lab',{method:'POST',headers:{...headers,'content-type':'application/x-ndjson'},body:JSON.stringify(payload)+'\n'});
 assert.equal(response.status,200);assert.ok((await response.text()).split('\n').some(s=>s&&JSON.parse(s).type==='caps'));
 const denied=new WebSocket(base.replace('http:','ws:')+'/padlink?token=xorr-t4-test');denied.on('error',()=>{});
 assert.equal(await new Promise(r=>denied.on('unexpected-response',(_req,res)=>{res.resume();denied.terminate();r(res.statusCode);})),401);
 const ws=new WebSocket(base.replace('http:','ws:')+'/padlink',['xorrpad','pad-token.xorr-t4-test']);
 const events=new WebSocket(base.replace('http:','ws:')+'/events',{headers});
 try {
  await Promise.all([once(ws,'open'),once(events,'open')]);
  const received=[];ws.on('message',m=>received.push(...m.toString().trim().split('\n').map(JSON.parse)));
  ws.send(JSON.stringify({...payload,device:'ws-lab'})+'\n');
  const event=new Promise(resolve=>{events.on('message',function handler(data){const m=JSON.parse(data);if(m.type==='pad'){events.off('message',handler);resolve(m);}});});
  const result=new Promise(resolve=>{ws.on('message',function handler(data){for(const line of data.toString().trim().split('\n')){const m=JSON.parse(line);if(m.type==='result'&&m.id==='ws-risk'){ws.off('message',handler);resolve(m);}}});});ws.send('{"v":1,"type":"key","id":"ws-risk","action":"risk","edge":"down"}\n');
  assert.equal((await event).type,'pad');assert.equal((await result).ok,true);
  assert.ok(server.padlink.peers.size>=3);
 }finally {ws.terminate();events.terminate();}
}));

const unavailable=e=>/fetch failed|ECONN|ENOTFOUND|timeout|timed out|HTTP (408|429|5\d\d)|429\s*:|429 Too Many/i.test(e.message);
async function outcomeKey({mem,server,pad}) {
 const pm=await import('../main/chains/pmamm.mjs');
 const market=(await pm.markets()).filter(m=>m.liquidity>10&&m.yesPrice>.1&&m.yesPrice<.9&&m.endTs>Date.now()/1000+180).sort((a,b)=>b.liquidity-a.liquidity)[0];
 if(!market)throw new Error('Setup required: live liquid devnet pm-AMM market');
 const action=`pmamm:${market.market}:yes`;
 await mem.setReference('risk/limits',{allow:[action],max_trade_usd:1,max_day_usd:1});state.sizeUsd=1;
 const id=pad.key(action),result=await pad.waitFor(m=>m.type==='result'&&m.id===id,{timeout:90000});
 if(!result.ok)throw new Error(result.error);
 const signal=await pad.waitFor(m=>m.type==='signal'&&m.market===action);
 assert.equal(server.signals.get(signal.signalId).proposal.routing.best.network,'devnet');
 assert.equal(signal.sizeUsd,1);return signal;
}
test('key → live devnet signal → accept is gated; missing phone setup cannot produce a receipt',{timeout:120000},async t => {
 const saved=process.env.SOLANA_ADDRESS;delete process.env.SOLANA_ADDRESS;
 try {await lab(async ctx=>{
  const {pad,server}=ctx,signal=await outcomeKey(ctx);
  const id=pad.key('yes',{signalId:signal.signalId});
  const result=await pad.waitFor(m=>m.type==='result'&&m.id===id,{timeout:90000});assert.equal(result.ok,false);
  assert.match(result.error,/Setup required: SOLANA_ADDRESS/);
  assert.equal(server.signals.get(signal.signalId).state,'failed');
  assert.ok(pad.history.some(m=>m.type==='signal_state'&&m.signalId===signal.signalId&&m.state==='accepted'));
  assert.equal(pad.history.some(m=>m.type==='receipt'),false);
  console.log('REAL devnet quote, key, signal and accept; missing phone key refused execution; no receipt fabricated');
 });}catch(e){if(!unavailable(e))throw e;t.skip(e.message);}
 finally {if(saved===undefined)delete process.env.SOLANA_ADDRESS;else process.env.SOLANA_ADDRESS=saved;}
});
test('key → live devnet signal → accept → actual confirmed receipt (funded test wallet required)',{timeout:180000},async t => {
 const {SessionWallet}=await import('../main/session-wallet.mjs');
 const {PublicKey}=await import('@solana/web3.js');
 const pm=await import('../main/chains/pmamm.mjs');
 const wallet=new SessionWallet({dir:fileURLToPath(new URL('../.t4-devnet',import.meta.url))});
 let identity;try {identity=await wallet.info();}catch(e){if(!e.message.startsWith('Setup required:'))throw e;identity=await wallet.create();}
 try {
  const connection=await pm.devnetConnection();const owner=new PublicKey(identity.publicKey);
  const sol=await connection.getBalance(owner);
  const {getAssociatedTokenAddressSync}=await import('@solana/spl-token');
  const account=await connection.getAccountInfo(getAssociatedTokenAddressSync(pm.COLLATERAL,owner));
  const musdc=account ? Number(account.data.readBigUInt64LE(64))/1e6 : 0;
  console.log(`REAL T4 devnet wallet ${identity.publicKey}: ${sol/1e9} SOL, ${musdc} mUSDC`);
  if(sol<10000000 || musdc<1)return t.skip(`Setup required: fund ${identity.publicKey} with 0.01 devnet SOL and 1 mUSDC; no transaction sent`);
  await lab(async ctx=>{
   ctx.server.executor.wallet=wallet;ctx.server.executor.setMode('session');
   const signal=await outcomeKey(ctx);const id=ctx.pad.key('yes',{signalId:signal.signalId});
   const result=await ctx.pad.waitFor(m=>m.type==='result'&&m.id===id,{timeout:120000});assert.equal(result.ok,true,JSON.stringify(result));
   const receipt=await ctx.pad.waitFor(m=>m.type==='receipt'&&m.signalId===signal.signalId,{timeout:120000});
   const confirmed=await connection.getTransaction(receipt.signature,{commitment:'confirmed',maxSupportedTransactionVersion:0});
   assert.ok(confirmed);assert.equal(confirmed.meta.err,null);assert.match(receipt.explorer,/cluster=devnet/);
   assert.equal(ctx.server.signals.get(signal.signalId).state,'executed');
   console.log(`REAL T4 pad receipt: ${receipt.explorer}`);
  });
 }catch(e){if(!unavailable(e))throw e;t.skip(e.message);}
});
test('receipt delivery replays a verified historical devnet confirmation, not a new fill',{timeout:60000},async t => {
 const pm=await import('../main/chains/pmamm.mjs');
 const signature='5hFEx7T33RLSekreevbuEZ1khnJojRi97eJ3EWndjpACwvxcFhtBfyPbRS8NQrcRtTW7ACcaCo2Be5kyxsqPnoKU';
 try {
  const connection=await pm.devnetConnection();
  const tx=await connection.getTransaction(signature,{commitment:'confirmed',maxSupportedTransactionVersion:0});
  assert.ok(tx,'historical confirmation must exist');assert.equal(tx.meta.err,null);
  await lab(async ({server,pad})=>{
   const receipt={signalId:'historical-replay',signature,explorer:`https://explorer.solana.com/tx/${signature}?cluster=devnet`};
   server.signals.publish({type:'receipt',receipt});
   assert.deepEqual(await pad.waitFor(m=>m.type==='receipt'),{v:1,type:'receipt',...receipt});
  });
  console.log('Verified historical devnet receipt delivered through TCP; this is not evidence of a new pad trade');
 }catch(e){if(!unavailable(e))throw e;t.skip(e.message);}
});

// No live price request should be needed to refuse a stopped trade key.
test('KILL refuses every proposal key at HTTP and pad ingress without creating signals', {timeout:30000}, async () => lab(async ({server,pad}) => {
 const kill=pad.key('kill'); await pad.waitFor(m=>m.type==='result' && m.id===kill);
 const before=server.signals.list().length;
 for (const id of ['buy','sell','long','short','base','scan']) {
  const response=await fetch(base+'/key',{method:'POST',headers,body:JSON.stringify({id})});
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{ok:false,error:'Killed: re-arm on the pad to trade',armed:false});
  const key=pad.key(id);
  const result=await pad.waitFor(m=>m.type==='result' && m.id===key);
  assert.equal(result.ok,false); assert.equal(result.error,'Killed: re-arm on the pad to trade');
  assert.equal(server.signals.list().length,before); assert.equal(state.pending,null);
 }
}));
