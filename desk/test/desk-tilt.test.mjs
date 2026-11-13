// MIT · Copyright (c) 2026 Nivesh Gajengi
// Local policy vectors and production native pad reports; no external API substitutes.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import {PadLink} from '../main/padlink.mjs';
import {SignalQueue} from '../main/signals.mjs';
import {DEFAULT_TILT} from '../main/tilt-guard.mjs';
import {TiltPadSimulator} from '../../tools/padsim/tilt.mjs';
import {Memory} from '../main/memory.mjs';
import {Executor} from '../main/executor.mjs';
const report=(patch={})=>({type:'tilt_state',blocked:false,reason:'Ready',remainingSeconds:0,durationSeconds:0,tradesHour:0,
 realizedPnlUsd:0,losingCloses:0,unknownCloses:0,clockReady:true,healthy:true,settings:{...DEFAULT_TILT},...patch});
const proposal=(autoAccept=false,extra={})=>({signal:{kind:'spot',symbol:'LOCAL F10 POLICY VECTOR',side:'BUY',venue:'jupiter',sizeUsd:1,...extra},
 verdict:{action:'EXECUTE',sizeUsd:1,autoAccept,ruleId:'local.f10',why:['Local acceptance policy vector; no market quote or trade']},routing:null});
async function until(fn){for(let i=0;i<600;i++){if(await fn())return;await delay(10);}throw Error('F10 state timeout');}
async function peer(link,device='f10-local'){
 const p=link.peer('usb',()=>{});Object.assign(p,{device,secure:{retry:()=>[]},verified:true});await link.receive(p,report());return p;
}
test('F10 all paired pads hold the desk guard through stale state, disconnect, restart and a zero countdown',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'xorr-f10-state-'));let link=new PadLink({dir});
 try{
  assert.equal(link.tiltStatus(),null);
  const a=await peer(link),b=await peer(link,'f10-second');
  await link.receive(a,report({blocked:true,reason:'Trades per hour',remainingSeconds:3589}));
  assert.match(link.tiltRefusal({}),/^Tilt guard: Trades per hour — 59:49 left on the pad$/);
  assert.equal(link.tiltRefusal({reduceOnly:true}),null);
  assert.equal(link.tiltStatus(Date.now()+3600000).blocked,true);
  await link.receive(b,report());assert.equal(link.tiltStatus().device,a.device);
  await assert.rejects(link.receive(a,report({remainingSeconds:-1})),/invalid/);
  assert.equal(link.tiltStatus().blocked,true);
  link.remove(a);assert.equal(link.tiltStatus().unknown,true);
  link.close();link=new PadLink({dir});assert.equal(link.tiltStatus().unknown,true);
  const restored=await peer(link);assert.equal(link.tiltStatus().device,'f10-second');
  const second=await peer(link,'f10-second');assert.equal(link.tiltStatus(),null);
  await link.receive(restored,report({healthy:false}));assert.equal(link.tiltStatus().unknown,true);
  await link.receive(restored,report({clockReady:false}));assert.equal(link.tiltStatus().unknown,true);
  await link.receive(restored,report());assert.equal(link.tiltStatus(),null);
  second.tiltGuard.observedAt=new Date(Date.now()-15001).toISOString();assert.equal(link.tiltStatus().unknown,true);
 }finally{link.close();await rm(dir,{recursive:true,force:true});}
});
test('F10 failed device-state persistence holds unknown and retries before allowing exposure',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'xorr-f10-storage-')),link=new PadLink({dir});
 try{
  const p=link.peer('usb',()=>{});Object.assign(p,{device:'f10-storage',secure:{retry:()=>[]},verified:true});
  const file=link.tiltFile;link.tiltFile=path.join(dir,'missing','state.json');
  await assert.rejects(link.receive(p,report()),/ENOENT/);assert.equal(link.tiltStatus().unknown,true);
  link.tiltFile=file;await link.receive(p,report());assert.equal(link.tiltStatus(),null);
  const restored=new PadLink({dir});try{assert.equal(restored.tiltStatus().unknown,true);}finally{restored.close();}
 }finally{link.close();await rm(dir,{recursive:true,force:true});}
});
test('F10 manual and automatic acceptance stop before announcement, recheck after async gates, and resume only on a ready report',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'xorr-f10-queue-')),link=new PadLink({dir});
 let announced=0,executed=0;
 const q=new SignalQueue({acceptGuard:s=>link.tiltRefusal(s),announce:()=>{announced++;},onAccepted:()=>{executed++;}});
 try{
  const p=await peer(link);
  await link.receive(p,report({blocked:true,reason:'Trades per hour',remainingSeconds:3589}));
  for(const auto of [false,true]){
   const e=await q.create(proposal(auto)),r=auto?e:await q.accept(e.id);
   assert.equal(r.state,'refused');assert.equal(r.ruleId,'signals.tilt_guard');assert.match(r.proposal.verdict.why[0],/59:49 left on the pad/);
  }
  assert.equal(announced,0);assert.equal(executed,0);
  for(const extra of [{reduceOnly:true,reducePct:50},{reduceOnly:true,source:'pad-flatten',flattenAction:'cancel'}]){
   const e=await q.create(proposal(false,extra));assert.equal((await q.accept(e.id)).state,'accepted');
  }
  await link.receive(p,report());
  for(const auto of [false,true]){
   const e=await q.create(proposal(auto));assert.equal((auto?e:await q.accept(e.id)).state,'accepted');
  }
  assert.equal(announced,1);assert.equal(executed,4);
  q.gate=async e=>{await link.receive(p,report({blocked:true,reason:'Daily loss limit',remainingSeconds:10}));return e.proposal;};
  const race=await q.create(proposal());assert.equal((await q.accept(race.id)).ruleId,'signals.tilt_guard');assert.equal(executed,4);
 }finally{q.close();link.close();await rm(dir,{recursive:true,force:true});}
});
test('F10 a cooldown starting after acceptance also stops the executor before wallet setup',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'xorr-f10-executor-')),link=new PadLink({dir}),q=new SignalQueue();
 const mem=new Memory({db:path.join(dir,'memory.db')}),executor=new Executor({mem,signals:q,dir,guard:s=>link.tiltRefusal(s)});
 try{
  const p=await peer(link),e=await q.create(proposal());await q.accept(e.id);
  await link.receive(p,report({blocked:true,reason:'Trades per hour',remainingSeconds:3589}));
  const result=await executor.execute(e.id);assert.equal(result.ok,false);assert.match(result.error,/Tilt guard: Trades per hour/);
  assert.equal(q.get(e.id).state,'failed');
 }finally{q.close();link.close();mem.stop();await rm(dir,{recursive:true,force:true});}
});
process.env.PAD_TOKEN='f10-public-test';
const {createServer,state}=await import('../main/server.mjs');
test('F10 encrypted native cooldown disables the desktop click and refuses API/auto accept; native expiry restores the existing gates',{timeout:120000},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'xorr-f10-http-'));process.env.XORR_USER_DATA=dir;
 const mem=new Memory({db:path.join(dir,'memory.db')}),server=createServer(mem),pad=new TiltPadSimulator({device:'f10-native-pad',serial:true,sessionStateFile:path.join(dir,'public-accounting.json')});let browser;
 try{
  state.armed=true;state.pending=null;
  await mem.setReference('risk/limits',{allow:[],max_trade_usd:10,max_day_usd:100});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  const addr=await pad.listen(8729),p=server.padlink.attach(net.createConnection(addr.port,'127.0.0.1'),'usb');
  await until(()=>p.candidate);server.padlink.pair(pad.pairing);await until(()=>p.verified&&pad.verified&&p.tiltGuard);await pad.tiltWork;
  clearInterval(server.padlink.heartbeat);
  const nativeNow=Math.floor(Date.now()/1000);
  await pad.tiltDriver.call({command:'settings',now:nativeNow,settings:{...DEFAULT_TILT,maxTradesHour:1}});
  await pad.tiltDriver.call({command:'accept',now:nativeNow,id:'local-native-f10-reservation'});
  const blocked=await pad.tiltDriver.call({command:'status',now:nativeNow+11});assert.equal(blocked.blocked,true);
  pad.send({...blocked,type:'tilt_state'});await until(()=>p.tiltGuard.blocked);
  const headers={authorization:'Bearer f10-public-test','content-type':'application/json'};
  const accept=async id=>(await fetch(`${base}/signals/${id}/accept`,{method:'POST',headers,body:'{}'})).json();
  const apiSignal=await server.signals.create(proposal());assert.equal((await accept(apiSignal.id)).ruleId,'signals.tilt_guard');
  assert.equal((await server.signals.create(proposal(true))).ruleId,'signals.tilt_guard');
  const reduce=await server.signals.create(proposal(false,{reduceOnly:true,reducePct:50}));
  assert.equal((await accept(reduce.id)).ruleId,'memory.allowlist');
  browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[],clicks=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/\/signals\/[^/]+\/accept$/.test(r.url()))clicks.push(r.url());});
  await page.goto(base+'/?token=f10-public-test#agent');
  const ui=await server.signals.create(proposal());
  const card=page.locator('.signal-toast .signal-card');await card.getByRole('button',{name:'Cooldown'}).waitFor();
  const button=card.getByRole('button',{name:'Cooldown'});assert.equal(await button.isDisabled(),true);
  await button.click({force:true});assert.equal(clicks.length,0);assert.equal(server.signals.get(ui.id).state,'awaiting');
  await card.getByRole('status').filter({hasText:/Tilt guard: Trades per hour — \d+:\d{2} left on the pad/}).waitFor();
  const shots=new URL('../../firmware/build/',import.meta.url);await mkdir(shots,{recursive:true});
  for(const width of [1440,375]){await page.setViewportSize({width,height:960});await page.screenshot({path:fileURLToPath(new URL(`f10-tilt-${width}.png`,shots)),fullPage:true,animations:'disabled'});}
  // Only the production C++ timer, advanced by the native test clock, releases it.
  const ready=await pad.tiltDriver.call({command:'status',now:nativeNow+3601});assert.equal(ready.blocked,false);
  pad.send({...ready,type:'tilt_state'});await until(()=>!p.tiltGuard.blocked);
  const enabled=card.getByRole('button',{name:'Accept'});await until(async()=>await enabled.count() && await enabled.isEnabled());await enabled.click();
  await until(()=>server.signals.get(ui.id).state==='refused');assert.equal(clicks.length,1);assert.equal(server.signals.get(ui.id).ruleId,'memory.allowlist');
  for(const extra of [{},{reduceOnly:true,reducePct:50}]){
   const e=await server.signals.create(proposal(false,extra)),r=await accept(e.id);assert.equal(r.ruleId,'memory.allowlist');
  }
  // A real server auto-accept now reaches its existing speech/permission gate, not tilt.
  const auto=await server.signals.create(proposal(true));assert.notEqual(auto.ruleId,'signals.tilt_guard');
  assert.deepEqual(errors,[]);assert(!server.signals.list().some(e=>['accepted','signed','executed'].includes(e.state)));
 }finally{await browser?.close();server.padlink.close();await pad.close();await new Promise(r=>server.close(r));mem.stop();state.pending=null;state.armed=true;delete process.env.XORR_USER_DATA;await rm(dir,{recursive:true,force:true});}
});
