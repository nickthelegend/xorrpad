// MIT · Copyright (c) 2026 Nivesh Gajengi
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {DEFAULT_SOUNDS,validateSounds,parseEarcons,renderEarcon,soundAllowed} from '../renderer/ui/earcons.mjs';
import {PadLink} from '../main/padlink.mjs';
import {PadSimulatorV2} from '../../tools/padsim/v2.mjs';
const table=parseEarcons(await readFile(new URL('../../firmware/xorrpad/logic/earcons-table.h',import.meta.url),'utf8'));
test('one shared table renders every native PCM sample within one quantization unit of WebAudio input',async()=>{
 const child=spawn(fileURLToPath(new URL('../../firmware/build/earcon-driver',import.meta.url)));const pending=[];
 createInterface({input:child.stdout}).on('line',line=>pending.shift()(JSON.parse(line)));
 const call=d=>new Promise(resolve=>{pending.push(resolve);child.stdin.write(JSON.stringify(d)+'\n');});
 try{
  assert.equal(Object.keys(table).length,8);const signatures=new Set();
  for(const [kind,e] of Object.entries(table)){
   const sounds={...DEFAULT_SOUNDS,volume:65,knobTick:true};const native=await call({kind,sounds,minute:720});assert.equal(native.ok,true);
   const js=renderEarcon(e,65);assert.equal(native.pcm.length,js.length);assert(js.length>0);
   for(let i=0;i<js.length;i++)assert(Math.abs(native.pcm[i]-js[i])<=1,kind+' sample '+i);
   signatures.add(Buffer.from(js.buffer).toString('base64'));
  }assert.equal(signatures.size,8);
  for(const sounds of [{...DEFAULT_SOUNDS,mute:true},{...DEFAULT_SOUNDS,volume:0},{...DEFAULT_SOUNDS,quietHours:{startMinute:1320,endMinute:420}}]){
   assert.deepEqual((await call({kind:'kill',sounds,minute:10})).pcm,[]);
  }
  assert.deepEqual((await call({kind:'tick',sounds:DEFAULT_SOUNDS,minute:720})).pcm,[]);
 }finally{child.stdin.end();}
});
test('sound policy and persistent pad options validate mute detents and UTC quiet boundaries',async()=>{
 assert.equal(soundAllowed('tick'),false);
 const q={...DEFAULT_SOUNDS,quietHours:{startMinute:1320,endMinute:420}};
 for(const m of [-1,0,419,1320,1439])assert.equal(soundAllowed('kill',q,m),false);
 for(const m of [420,1000,1319])assert.equal(soundAllowed('kill',q,m),true);
 for(const patch of [{volume:101},{volume:1.2},{volume:NaN},{mute:1},{knobTick:'true'},{quietHours:{}},{quietHours:{startMinute:0,endMinute:1440}},{extra:true}])assert.throws(()=>validateSounds({...DEFAULT_SOUNDS,...patch}));
 const dir=await mkdtemp(path.join(tmpdir(),'xorr-sounds-'));let link=new PadLink({dir});
 try{link.setOptions({sounds:q});link.close();link=new PadLink({dir});assert.deepEqual(link.options.sounds,q);assert.throws(()=>link.setOptions({sounds:{...q,mute:'yes'}}));assert.deepEqual(link.options.sounds,q);}
 finally{link.close();await rm(dir,{recursive:true,force:true});}
});
async function until(fn){for(let i=0;i<500;i++){if(fn())return;await delay(10);}throw Error('earcon condition timeout');}
process.env.PAD_TOKEN='f5-public-test';
delete process.env.SOLANA_ADDRESS;delete process.env.PHOENIX_AUTHORITY;delete process.env.JUPPERPS_AUTHORITY;
const {createServer}=await import('../main/server.mjs');const {Memory}=await import('../main/memory.mjs');
test('encrypted pad event reaches real mirror WebAudio; options persist and desktop remains approved',{timeout:120000},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'xorr-f5-'));process.env.XORR_USER_DATA=dir;
 const mem=new Memory({db:path.join(dir,'memory.db')}),server=createServer(mem);
 const stateFile=path.join(dir,'pad-public.json'),pad=new PadSimulatorV2({device:'f5-sound-pad',serial:true,stateFile});pad.firmware='4.0.0';let browser;
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  await pad.listen(8726);const peer=server.padlink.attach(net.createConnection(8726,'127.0.0.1'),'usb');
  await until(()=>peer.candidate);server.padlink.pair(pad.pairing);await until(()=>peer.verified && pad.verified);
  const headers={authorization:'Bearer f5-public-test','content-type':'application/json'};
  const set=sounds=>fetch(base+'/pad/options',{method:'POST',headers,body:JSON.stringify({sounds})});
  assert.equal((await set({...DEFAULT_SOUNDS,mute:'bad'})).status,400);
  assert.equal((await set({...DEFAULT_SOUNDS,volume:65})).status,200);await until(()=>pad.sounds.volume===65);
  browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.pcmStarts=[];
   const original=AudioBufferSourceNode.prototype.start;
   AudioBufferSourceNode.prototype.start=function(...args){window.pcmStarts.push({rate:this.buffer.sampleRate,pcm:Array.from(this.buffer.getChannelData(0))});return original.apply(this,args);};
  });
  await page.goto(base+'/?token=f5-public-test#device');await page.getByRole('heading',{name:'Sounds',exact:true}).waitFor();
  await page.locator('.model-access').waitFor();
  await page.getByRole('heading',{name:'Sounds',exact:true}).click();await delay(1000);
  // A local firmware event, not a fake external price, fill or executed trade.
  pad.chime('accept');await page.waitForFunction(()=>window.pcmStarts.length>0);
  const played=await page.evaluate(()=>window.pcmStarts.at(-1));assert.equal(played.rate,16000);assert.equal(played.pcm.length,renderEarcon(table.accept,65).length);
  assert.equal(Math.round(Math.max(...played.pcm)*32768),Math.max(...renderEarcon(table.accept,65)));
  const before=await page.evaluate(()=>window.pcmStarts.length);
  assert.equal((await set({...DEFAULT_SOUNDS,mute:true})).status,200);await until(()=>pad.sounds.mute);pad.chime('kill');await delay(300);assert.equal(await page.evaluate(()=>window.pcmStarts.length),before);
  await page.getByLabel('Sound volume (%)').fill('45');await page.getByLabel('Mute').selectOption('false');await page.getByLabel('Knob detent tick').selectOption('true');
  await page.getByLabel('Quiet hours (UTC)').selectOption('true');
  await page.getByRole('button',{name:'Save pad options',exact:true}).click();await until(()=>pad.sounds.volume===45 && pad.sounds.knobTick && !pad.sounds.mute && pad.sounds.quietHours);
  const reboot=new PadSimulatorV2({stateFile});assert.deepEqual(reboot.sounds,pad.sounds);
  const out=new URL('../../docs/screens/v4/',import.meta.url);await mkdir(out,{recursive:true});
  for(const width of [1440,375]){await page.setViewportSize({width,height:960});await page.getByRole('heading',{name:'Sounds',exact:true}).scrollIntoViewIfNeeded();await delay(500);await page.screenshot({path:fileURLToPath(new URL(`sounds-device-${width}.png`,out)),fullPage:false,animations:'disabled'});}
  assert.deepEqual(errors,[]);assert.equal(server.signals.list().length,0);
 }finally{await browser?.close();server.padlink.close();await pad.close();await new Promise(r=>server.close(r));mem.stop();delete process.env.XORR_USER_DATA;await rm(dir,{recursive:true,force:true});}
});
