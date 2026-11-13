// MIT · Copyright (c) 2026 Nivesh Gajengi
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {AmbientDriver,AmbientPadSimulator} from '../../tools/padsim/ambient.mjs';
import {PadLink} from '../main/padlink.mjs';
test('F6 native idle and wake driver consumes YES and a whole knob hold at the exact boundary',async()=>{
 const d=new AmbientDriver();try{
  await d.call({command:'wake',now:0});assert.equal((await d.call({command:'tick',home:true,now:59999})).visible,false);
  assert.equal((await d.call({command:'tick',home:true,now:60000})).visible,true);
  assert.equal((await d.call({command:'key',pressed:true,bit:1,now:60000})).consumed,true);
  assert.equal((await d.call({command:'key',pressed:false,bit:1,now:60001})).consumed,true);
  assert.equal((await d.call({command:'key',pressed:true,bit:1,now:60002})).consumed,false);
  await d.call({command:'tick',home:true,now:120002});
  assert.equal((await d.call({command:'knob',down:true,now:120002})).consumed,true);
  assert.equal((await d.call({command:'knob',down:true,event:true,now:120802})).consumed,true);
  assert.equal((await d.call({command:'knob',ended:true,event:true,now:120902})).consumed,true);
  assert.equal((await d.call({command:'knob',event:true,now:120903})).consumed,false);
 }finally{d.close();}
});
test('F6 ambient options persist and reject nonboolean input',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'xorr-ambient-options-'));let l=new PadLink({dir});try{assert.equal(l.options.ambient,true);l.setOptions({ambient:false});l.close();l=new PadLink({dir});assert.equal(l.options.ambient,false);assert.throws(()=>l.setOptions({ambient:'true'}));}finally{l.close();await rm(dir,{recursive:true,force:true});}
});
process.env.PAD_TOKEN='f6-public-test';delete process.env.SOLANA_ADDRESS;delete process.env.PHOENIX_AUTHORITY;delete process.env.JUPPERPS_AUTHORITY;
const {createServer}=await import('../main/server.mjs');const {Memory}=await import('../main/memory.mjs');
async function until(fn){for(let i=0;i<700;i++){if(fn())return;await delay(10);}throw Error('F6 condition timeout');}
test('F6 encrypted pad consumes first input, reports ambient view and saves real Device options',{timeout:120000},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'xorr-f6-'));process.env.XORR_USER_DATA=dir;
 const mem=new Memory({db:path.join(dir,'memory.db')}),server=createServer(mem),pad=new AmbientPadSimulator({device:'f6-clock',serial:true,sessionStateFile:path.join(dir,'public-session.json')});let browser;
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  await pad.listen(8726);const peer=server.padlink.attach(net.createConnection(8726,'127.0.0.1'),'usb');
  await until(()=>peer.candidate);server.padlink.pair(pad.pairing);await until(()=>peer.verified && pad.verified);await pad.tiltWork;
  await pad.ambientDriver.call({command:'wake',now:0});
  assert.equal((await pad.idle(60000)).visible,true);await until(()=>peer.view?.screen==='ambient');
  assert.deepEqual(await pad.key('yes',{now:60001}),{woke:true});await until(()=>peer.view.screen==='home');assert.equal(server.signals.list().length,0);
  browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(base+'/?token=f6-public-test#device');await page.getByRole('heading',{name:'Ambient',exact:true}).waitFor();
  await page.getByLabel('Ambient desk clock').selectOption('false');await page.getByRole('button',{name:'Save pad options',exact:true}).click();await until(()=>pad.ambientEnabled===false);
  const out=new URL('../../docs/screens/v4/',import.meta.url);await mkdir(out,{recursive:true});
  for(const width of [1440,375]){await page.setViewportSize({width,height:960});await page.getByRole('heading',{name:'Ambient',exact:true}).scrollIntoViewIfNeeded();await delay(300);await page.screenshot({path:fileURLToPath(new URL(`ambient-device-${width}.png`,out)),animations:'disabled'});}
  // No substituted feed: the preview uses a real desk record, or explicit missing feeds.
  const record=peer.ambient || {type:'ambient',epoch:Math.floor(Date.now()/1000),price:null,pnl:null,nextFunding:null,closes:[],hours:'NY hours: unavailable',crew:'Crew: unavailable'};
  await writeFile(new URL('../../firmware/build/f6-ambient.json',import.meta.url),JSON.stringify(record,null,2));
 }finally{await browser?.close();server.padlink.close();await pad.close();await new Promise(r=>server.close(r));mem.stop();delete process.env.XORR_USER_DATA;await rm(dir,{recursive:true,force:true});}
});
