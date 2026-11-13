// MIT · Copyright (c) 2026 Nivesh Gajengi
// Local protocol/layout vectors only; no external API or financial response is substituted.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,mkdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir,homedir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {firmwareFields} from '../app/src/three/screen.mjs';
import {PadLink} from '../main/padlink.mjs';
const repo=fileURLToPath(new URL('../..',import.meta.url));
const now=1800000000000,stamp=new Date(now).toISOString();
const record=r=>({...r,observedAt:stamp});
const input=(screen,records={},extra={})=>({now,device:{link:'usb',killed:false,view:{screen,selected:0,millis:1000,observedAt:stamp},screenRecords:records,...extra}});
let dir,binary,server,browser,page;
before(async()=>{
 dir=await mkdtemp(path.join(tmpdir(),'xorr-f9-'));binary=path.join(dir,'screen');
 const gfx=process.env.GFX || path.join(homedir(),'Documents/Arduino/libraries/Adafruit_GFX_Library');
 const compile=spawnSync('c++',['-std=c++17','-include','cmath','-O1','-w','-DARDUINO=10819','-DSCREEN_NATIVE_TEST','-I'+path.join(repo,'tools/uipreview/shim'),'-I'+gfx,path.join(repo,'tools/uipreview/firmware-screen.cpp'),path.join(gfx,'Adafruit_GFX.cpp'),'-o',binary],{encoding:'utf8'});
 assert.equal(compile.status,0,compile.stderr);
 server=http.createServer(async(req,res)=>{
  const p=new URL(req.url,'http://local').pathname;
  const files={'/desktop/firmware-screen.js':'desk/app/public/firmware-screen.js','/desktop/firmware-screen.wasm':'desk/app/public/firmware-screen.wasm','/screen.mjs':'desk/app/src/three/screen.mjs'};
  if(!files[p])return res.end('<!doctype html><canvas></canvas>');
  res.setHeader('content-type',p.endsWith('.wasm')?'application/wasm':'text/javascript');res.end(await readFile(path.join(repo,files[p])));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true});page=await browser.newPage({reducedMotion:'reduce'});await page.goto(`http://127.0.0.1:${server.address().port}`);
});
after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));if(dir)await rm(dir,{recursive:true,force:true});});
async function parity(args,expected){
 const state={ok:1,link:'usb',frameMillis:1000,...expected};
 const native=spawnSync(binary,['--state',...Object.entries(state).map(([k,v])=>`${k}=${v}`)]);
 assert.equal(native.status,0,native.stderr.toString());assert.equal(native.stdout.length,320*240*2);
 const actual=await page.evaluate(async args=>{const {drawFirmware}=await import('/screen.mjs');const c=document.querySelector('canvas');await drawFirmware(c,args);return Array.from(c.getContext('2d').getImageData(0,0,320,240).data);},args);
 const expectedPixels=Buffer.alloc(320*240*4);
 for(let i=0;i<320*240;i++){const px=native.stdout.readUInt16LE(i*2);expectedPixels.set([Math.round((px>>11)*255/31),Math.round(((px>>5)&63)*255/63),Math.round((px&31)*255/31),255],i*4);}
 assert.equal(createHash('sha256').update(Buffer.from(actual)).digest('hex'),createHash('sha256').update(expectedPixels).digest('hex'),JSON.stringify({expected:state,actual:firmwareFields(args)}));
}
test('F9 Home uses the status record written to the pad over stale desktop status',async()=>{
 const args=input('home',{status:record({armed:true,market:'LOCAL',venue:'Local vector',agent:'Custom',remembers:true})});args.status={armed:false,venue:'Jupiter'};
 await parity(args,{armed:1,market:'LOCAL',venue:'Local vector',agent:'Custom',remembers:1});
});
test('F9 Fund renders the sent funding URI as the firmware QR',async()=>{
 const fund=record({address:'11111111111111111111111111111111',uri:'solana:11111111111111111111111111111111?label=xorrpad%20agent',cluster:'devnet'});
 await parity(input('fund',{fund}),{fundVisible:1,fundAddress:fund.address,fundUri:fund.uri,fundCluster:'devnet'});
 await parity(input('home',{fund}),{}); // A cached record does not reopen a dismissed screen.
});
test('F9 Portfolio preserves devnet unpriced balances and missing-wallet Setup',async()=>{
 await parity(input('portfolio',{portfolio:record({cluster:'devnet',rows:[{symbol:'LOCAL',amount:2,usd:null}],totalUsd:null})}),{portfolioVisible:1,portfolioCluster:'devnet',portfolioRow0Symbol:'LOCAL',portfolioRow0Amount:2,portfolioRow0Usd:''});
 await parity(input('portfolio',{portfolio:record({message:'Create your agent wallet in XOR Desktop'})}),{portfolioVisible:1,portfolioMessage:'Create your agent wallet in XOR Desktop'});
});
test('F9 SCAN renders summary, checked markets and top setup; expires after eight seconds',async()=>{
 const scan=record({summary:'Local parser vector only',checkedCount:1,unavailableCount:1,markets:[{symbol:'LOCAL'},{symbol:'MISSING',error:'Setup required'}],top:{side:'BUY',symbol:'LOCAL',strategy:'local'}});
 const args=input('scan',{scan});
 await parity(args,{scanSummary:scan.summary,scanAt:1000,scanChecked:1,scanUnavailable:1,scanMarket0:'LOCAL',scanMarket1:'MISSING',scanError1:'Setup required',scanTop:'BUY LOCAL / local'});
 args.now+=8000;await parity(args,{frameMillis:9000});
});
test('F9 Predict renders the selected market, correct page and stale-quote Setup',async()=>{
 const predict=record({enabled:true,sizeUsd:1,total:2,offset:0,validForMs:10000,markets:[{question:'Local unselected vector',probability:0.1,closesIn:100},{question:'Local selected vector',probability:0.6,closesIn:900,change24h:2}]});
 const args=input('predict',{predict});args.device.view.selected=1;
 await parity(args,{predictEnabled:1,predictAt:1000,predictValidFor:10000,predictSize:1,predictTotal:2,predictOffset:1,predictQuestion:'Local selected vector',predictProbability:0.6,predictClosesIn:900,predictChange:2});
 args.now+=10000;await parity(args,{frameMillis:11000,predictEnabled:1,predictAt:1000,predictValidFor:10000});
});
test('F9 outcome Portfolio follows pad uptime for page two and closes on Home',async()=>{
 const positions=Array.from({length:4},(_,i)=>({name:`Local outcome layout ${i}`,yes:i,no:0}));
 const args=input('outcomes',{outcome_positions:record({positions})});args.device.view.millis=13000;
 const fields={frameMillis:13000,outcomeVisible:1};positions.forEach((p,i)=>Object.assign(fields,{[`outcomeRow${i}Question`]:p.name,[`outcomeRow${i}Yes`]:p.yes,[`outcomeRow${i}No`]:p.no}));
 await parity(args,fields);args.device.view.screen='home';await parity(args,{frameMillis:13000});
});
test('F9 Positions renders perp cockpit from the sent pulse/perps with automatic firmware paging',async()=>{
 const args=input('positions',{pulse:record({positions:0}),perps:record({positions:[{market:'LOCAL',venue:'jupperps',side:'long',mark:100,entry:null,leverage:null,liq:null,distancePct:null,nextFunding:null}]})});args.device.view.millis=18000;
 await parity(args,{frameMillis:18000,perpsAt:18000,positionCount:0,perpRow0Market:'LOCAL',perpRow0Venue:'jupperps',perpRow0Side:'long',perpRow0Mark:100});
 args.device.screenRecords.pulse=record({positions:1,positionDetails:[{market:'LOCAL',qty:2,pnl:null}]});args.device.view.millis=6000;
 await parity(args,{frameMillis:6000,perpsAt:6000,positionCount:1,spotRow0Market:'LOCAL',spotRow0Qty:2,perpRow0Market:'LOCAL',perpRow0Venue:'jupperps',perpRow0Side:'long',perpRow0Mark:100});
});
test('F9 LIQ GUARD uses the guard record and yields when it expires',async()=>{
 const args=input('liq_guard',{liq_guard:record({active:true,market:'LOCAL',mark:100,liq:95,distancePct:5,proposal:{venue:'jupperps'}})});
 await parity(args,{liqActive:1,liqAt:1000,liqMarket:'LOCAL',liqMark:100,liqPrice:95,liqDistance:5,liqVenue:'jupperps'});
 args.now+=30000;await parity(args,{frameMillis:31000});
});
test('F9 Cooldown renders pad tilt countdown and preserves reduce-only decision access',async()=>{
 const args=input('cooldown',{}, {tiltGuard:record({blocked:true,reason:'Trades per hour',remainingSeconds:60,durationSeconds:120})});args.now+=2000;
 await parity(args,{frameMillis:3000,tiltBlocked:1,tiltReason:'Trades per hour',tiltRemaining:58,tiltDuration:120});
 args.now+=16000;await parity(args,{frameMillis:19000,tiltBlocked:1,tiltReason:'Setup required: refresh pad state',tiltRemaining:42,tiltDuration:120});
});
test('F9 Flatten follows the pad plan page, and rearm returns to the latched screen',async()=>{
 const args=input('flatten',{flatten:record({id:'local-plan',state:'awaiting',remainingMs:60000,orders:0,perps:0,outcomes:0,rows:['Local 0','Local 1','Local 2','Local 3','Local page two']})},{killed:true});args.device.view.selected=1;
 await parity(args,{killed:1,flattenId:'local-plan',flattenState:'awaiting',flattenRemaining:60000,flattenAt:1000,flattenPage:1,flattenRow0:'Local 0',flattenRow1:'Local 1',flattenRow2:'Local 2',flattenRow3:'Local 3',flattenRow4:'Local page two'});
 args.device.screenRecords.status=record({rearmRequested:true});await parity(args,{killed:1,rearmRequested:1});
});
test('F9 Journal renders the selected stored decision and honest unhealthy state',async()=>{
 const args=input('journal',{}, {journal:{healthy:true,entries:[{id:'local-0',action:'BUY',market:'LOCAL',size:'1',venue:'Local',time:1800000000,result:'refused',reason:'Local parser vector'},{id:'local-1',action:'SELL',market:'LOCAL',size:'2',venue:'Local',time:1800000001,result:'failed',reason:'Setup required'}]}});args.device.view.selected=1;
 const fields={journalVisible:1,journalHealthy:1,journalSelected:1};args.device.journal.entries.forEach((r,i)=>{for(const [k,v] of Object.entries(r))fields[`journalRow${i}${k[0].toUpperCase()+k.slice(1)}`]=v;});await parity(args,fields);
 await parity(input('journal'),{journalVisible:1,journalHealthy:0});
});
test('F9 ambient clock advances from record epoch and pad uptime with honest missing feeds',async()=>{
 const args=input('ambient',{ambient:record({epoch:1800000000,price:null,pnl:null,nextFunding:null,closes:[],hours:'NY hours: unavailable',crew:'Crew: unavailable'})});args.now+=2000;
 await parity(args,{frameMillis:3000,ambientVisible:1,ambientAt:1000,ambientEpoch:1800000000,ambientPrice:'',ambientPnl:'',ambientFunding:'',ambientHours:'NY hours: unavailable',ambientCrew:'Crew: unavailable'});
 args.now+=90000;await parity(args,{frameMillis:93000,ambientVisible:1,ambientAt:1000,ambientEpoch:1800000000,ambientPrice:'',ambientPnl:'',ambientFunding:'',ambientHours:'NY hours: unavailable',ambientCrew:'Crew: unavailable'});
});
test('F9 decision uses exactly the sent trusted signal, even when pending proposal and desktop venue differ',async()=>{
 const signal=record({signalId:'local-decision',remainingMs:60000,market:'LOCAL',side:'buy',sizeUsd:5,venue:'Meteora',holdThreshold:100,fingerprint:'ABC123',why:'Local boundary vector',trusted:{side:'buy',size:'5',price:'81.44',fee:'0.01'}});
 const args=input('decision',{signal});args.status={venue:'Jupiter'};args.pending={id:'different',proposal:{signal:{symbol:'WRONG',side:'sell'},verdict:{why:['WRONG']}}};
 await parity(args,{pending:1,market:'LOCAL',venue:'Meteora',signalId:'local-decision',signalDeadline:61000,signalSide:'buy',signalSize:'5',signalPrice:'81.44',signalFee:'0.01',fingerprint:'ABC123',verdict:'buy $5.00 Local boundary vector'});
 delete args.device.screenRecords.signal;await parity(args,{venue:'Jupiter'});
});
test('F9 outbound screen records are captured after actual writes, views validate and publish promptly',async()=>{
 const stateDir=path.join(dir,'link'),events=[],writes=[];
 const link=new PadLink({dir:stateDir,signals:{on(){},off(){},publish:e=>events.push(e)},status:()=>({armed:true})});
 try{
  const peer=link.peer('usb',line=>writes.push(JSON.parse(line)));peer.device='local-mirror';peer.firmware='4.0.0';peer.secure={pending:new Map([[1,{}]]),seal:m=>JSON.stringify(m)};peer.verified=true;
  link.send(peer,{type:'fund',address:'public-vector'});assert.equal(peer.screenRecords,undefined);
  peer.secure.pending.clear();link.flush(peer);assert.equal(peer.screenRecords.fund.address,'public-vector');assert.equal(writes.at(-1).type,'fund');
  for(const screen of ['home','fund','portfolio','scan','predict','positions','outcomes','liq_guard','cooldown','flatten','journal','ambient','decision','killed']){
   await link.receive(peer,{type:'pad_view',screen,selected:0,millis:1234});assert.equal(link.snapshot().devices[0].view.screen,screen);
  }
  await assert.rejects(link.receive(peer,{type:'pad_view',screen:'fund',selected:0,millis:-1}),/invalid pad clock/);
  await assert.rejects(link.receive(peer,{type:'pad_view',screen:'untrusted',selected:0}),/invalid pad view/);
  link.send(peer,{type:'signal',signalId:'local',remainingMs:1000});assert.equal(peer.screenRecords.signal.signalId,'local');
  link.send(peer,{type:'signal_state',signalId:'local',state:'refused'});assert.equal(peer.screenRecords.signal,undefined);
  link.killed.add(peer.device);link.pushStatus(peer.device);assert.equal(writes.at(-1).killed,true);
  link.killed.delete(peer.device);link.pushStatus(peer.device);assert.equal(writes.at(-1).killed,false);assert.equal(writes.at(-1).armed,true);
  link.send(peer,{type:'session_signature',signature:'not-a-display-record'});assert.equal(peer.screenRecords.session_signature,undefined);
  assert.ok(events.some(e=>e.type==='pad_screen'));assert.ok(events.some(e=>e.type==='pad_link' && e.devices[0].killed===false));
 }finally{link.close();}
});
test('F9 every committed public v4 screen snapshot renders through the actual mirror',{timeout:90000},async()=>{
 const captures=[],out=path.join(repo,'docs/screens/v4');
 const sources=JSON.parse(await readFile(path.join(out,'release-pad-records.json'),'utf8'));
 const screens={predict:'predict',outcome_positions:'outcomes',perps:'positions',liq_guard:'liq_guard',tilt_state:'cooldown',flatten:'flatten',ambient:'ambient',journal:'journal'};
 for(const source of sources){
  const r=record(source.record),args=input(screens[r.type],{[r.type]:r});
  if(r.type==='flatten')args.device.killed=true;
  if(r.type==='perps')args.device.view.millis=null;
  if(r.type==='tilt_state')args.device.tiltGuard=r;
  if(r.type==='journal')args.device.journal={...r,healthy:true};
  await page.evaluate(async args=>{const {drawFirmware}=await import('/screen.mjs');await drawFirmware(document.querySelector('canvas'),args);},args);
  const file=`mirror-pad-${source.id}.png`;
  await page.locator('canvas').screenshot({path:path.join(out,file)});
  captures.push({file,source:'release-pad-records.json#'+source.id,provenance:source.provenance});
 }
 await writeFile(path.join(out,'mirror-pad-captures.json'),JSON.stringify({renderer:'Actual drawFirmware canvas / shipped firmware-screen.wasm; replayed public records, not new financial reads or trades.',captures},null,2)+'\n');
});
test('F9 real encrypted pad publishes kill/rearm status without a heartbeat and mirrors actual Setup records',{timeout:120000},async()=>{
 process.env.PAD_TOKEN='f9-public-test';delete process.env.SOLANA_ADDRESS;delete process.env.PHOENIX_AUTHORITY;delete process.env.JUPPERPS_AUTHORITY;
 const {createServer}=await import('../main/server.mjs'),{Memory}=await import('../main/memory.mjs');
 const {MirrorPadSimulator}=await import('../../tools/padsim/mirror.mjs');
 const {default:net}=await import('node:net');const {setTimeout:delay}=await import('node:timers/promises');
 const data=path.join(dir,'live');await mkdir(data,{recursive:true});process.env.XORR_USER_DATA=data;
 const mem=new Memory({db:path.join(data,'memory.db')}),desk=createServer(mem);
 const pad=new MirrorPadSimulator({device:'f9-mirror',serial:true,sessionStateFile:path.join(data,'public-session.json')});
 const until=async fn=>{for(let i=0;i<800;i++){if(fn())return;await delay(10);}throw Error('F9 live condition timeout');};
 let stage='connect';
 try{
  await new Promise(r=>desk.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${desk.address().port}`;
  await pad.listen(8726);const peer=desk.padlink.attach(net.createConnection(8726,'127.0.0.1'),'usb');
  await until(()=>peer.candidate);desk.padlink.pair(pad.pairing);await until(()=>peer.verified && pad.verified);await pad.tiltWork;
  clearInterval(desk.padlink.heartbeat); // The test must not depend on the next five-second tick.
  stage='kill status';const after=pad.history.length;pad.kill(2000);await pad.waitFor(m=>m.type==='status' && m.killed && !m.armed,{after});
  await until(()=>desk.padlink.snapshot().devices[0].killed===true);
  let snapshot=desk.padlink.snapshot().devices[0];
  assert.equal(firmwareFields({device:snapshot,now:Date.now(),status:{armed:true}}).armed,false);
  stage='rearm status';const rearmAfter=pad.history.length;desk.padlink.rearm(pad.device);await pad.waitFor(m=>m.type==='rearm_request',{after:rearmAfter});pad.pressConfirm();await delay(810);pad.confirm();
  await pad.waitFor(m=>m.type==='rearm_complete',{after:rearmAfter});
  await pad.waitFor(m=>m.type==='status' && !m.killed && m.armed,{after:rearmAfter});
  snapshot=desk.padlink.snapshot().devices[0];assert.equal(snapshot.killed,false);
  const fields=firmwareFields({device:snapshot,status:{armed:false},now:Date.now()});assert.equal(fields.armed,true);assert.equal(fields.killed,false);assert.equal(fields.pending,false);
  // The actual missing-wallet response travels over the existing authenticated link.
  stage='portfolio';await pad.key('portfolio');await pad.waitFor(m=>m.type==='portfolio');await until(()=>peer.view?.screen==='portfolio');
  snapshot=desk.padlink.snapshot().devices[0];assert.equal(firmwareFields({device:snapshot}).portfolioVisible,true);
  assert.ok(snapshot.screenRecords.portfolio.message || snapshot.screenRecords.portfolio.rows);
  assert.ok(desk.signals.list().every(s=>!['accepted','signed','executed'].includes(s.state)));
  await page.evaluate(async args=>{const {drawFirmware}=await import('/screen.mjs');await drawFirmware(document.querySelector('canvas'),args);},{device:snapshot,now:Date.now()});
  await page.locator('canvas').screenshot({path:path.join(repo,'docs/screens/v4/mirror-pad-portfolio.png')});
  stage='desktop';await page.goto(base+'/?token=f9-public-test#device');await page.getByRole('heading',{name:'Your edge, at your fingertips.',exact:true}).waitFor();
  await page.locator('[data-model-ready=webgl]').waitFor();
  const out=path.join(repo,'docs/screens/v4');await mkdir(out,{recursive:true});
  for(const width of [1440,375]){await page.setViewportSize({width,height:960});await delay(500);await page.screenshot({path:path.join(out,`mirror-device-${width}.png`),animations:'disabled'});}
  await writeFile(path.join(out,'mirror-record.json'),JSON.stringify({provenance:'Actual encrypted F9 pad link after real rearm and missing-wallet Portfolio request; heartbeat disabled during status assertions.',record:snapshot.screenRecords.portfolio},null,2)+'\n');
 }catch(error){throw Error(stage+': '+error.message+' / '+JSON.stringify(pad.history.slice(-12).map(m=>({type:m.type,killed:m.killed,armed:m.armed,error:m.error,state:m.state}))),{cause:error});}finally{await page.goto('about:blank');desk.padlink.close();await pad.close();await new Promise(r=>desk.close(r));mem.stop();delete process.env.XORR_USER_DATA;}
});
