// MIT · Copyright (c) 2026 Nivesh Gajengi
// Native counter vectors + actual encrypted link/HTTP/browser. No external API mocks.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {DEFAULT_TILT,validateTilt,tiltState,tiltReceipt} from '../main/tilt-guard.mjs';
import {TiltDriver,TiltPadSimulator} from '../../tools/padsim/tilt.mjs';
test('tilt settings reject malformed limits and desk state cannot replace counters or deadlines',()=>{
 assert.deepEqual(validateTilt(DEFAULT_TILT),DEFAULT_TILT);
 for(const patch of [{dailyLossUsd:-1},{dailyLossUsd:NaN},{maxTradesHour:1.2},{maxTradesHour:1001},{losingCloses:-1},{cooldownMinutes:0},{cooldownMinutes:10081},{clear:true},{remainingSeconds:0}])assert.throws(()=>validateTilt({...DEFAULT_TILT,...patch}));
 assert.throws(()=>tiltState({}));
});
test('close receipt transport preserves known realized PnL and leaves unavailable values null',()=>{
 assert.deepEqual(tiltReceipt({signature:'native-layout',realizedPnlUsd:-5},{reduceOnly:true},'4.0.0'),{signature:'native-layout',realizedPnlUsd:-5,closed:true});
 assert.equal(tiltReceipt({realizedPnlUsd:0},{kind:'spot',side:'SELL'},'4.0.0').realizedPnlUsd,0);
 for(const value of [undefined,null,'-5',NaN,Infinity])assert.equal(tiltReceipt({realizedPnlUsd:value},{reduceOnly:true},'4.0.0').realizedPnlUsd,null);
 assert.equal(tiltReceipt({},{kind:'perp',side:'SHORT'},'4.0.0').closed,false);
 for(const fw of [undefined,'1.0.0','2.0.0','3.0.0'])assert.deepEqual(tiltReceipt({signature:'legacy'},{reduceOnly:true},fw),{signature:'legacy'});
});
test('native tilt driver persists reservations and refuses new exposure across reboot and UTC midnight',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'xorr-tilt-native-')),file=path.join(dir,'public-tilt.json');let driver=new TiltDriver(file);
 const now=1794528000+86390;
 try {
  assert.equal((await driver.call({command:'settings',settings:{...DEFAULT_TILT,dailyLossUsd:10,maxTradesHour:1},now})).ok,true);
  assert.equal((await driver.call({command:'accept',id:'native-vector',now})).ok,true);
  assert.equal((await driver.call({command:'fill',id:'native-close-vector',pnl:-10,closed:true,now})).blocked,true);
  driver.close();driver=new TiltDriver(file);
  assert.equal((await driver.call({command:'accept',id:'another',now:now+1})).ok,false);
  const relaxed=await driver.call({command:'settings',settings:DEFAULT_TILT,now:now+2});assert.equal(relaxed.blocked,true);
  const midnight=await driver.call({command:'reboot',now:now+10});assert.equal(midnight.realizedPnlUsd,0);assert.equal(midnight.blocked,true);
  assert.equal((await driver.call({command:'accept',id:'reduce-vector',reduceOnly:true,now:now+11})).ok,true);
  assert.equal((await driver.call({command:'status',now:now+3600})).blocked,false);
 }finally{driver.close();await rm(dir,{recursive:true,force:true});}
});
process.env.PAD_TOKEN='f3-public-test';
delete process.env.SOLANA_ADDRESS;delete process.env.PHOENIX_AUTHORITY;delete process.env.JUPPERPS_AUTHORITY;
const {createServer}=await import('../main/server.mjs');const {Memory}=await import('../main/memory.mjs');
async function until(fn){for(let i=0;i<500;i++){if(fn())return;await delay(10);}throw Error('encrypted tilt timeout');}
test('verified native padsim reports actual tilt settings to Agent and Device without desktop restyling',{timeout:120000},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'xorr-f3-'));process.env.XORR_USER_DATA=dir;
 const mem=new Memory({db:path.join(dir,'memory.db')}),server=createServer(mem);
 const pad=new TiltPadSimulator({device:'f3-tilt-pad',serial:true,fragmentBytes:19,sessionStateFile:path.join(dir,'public-accounting.json')});let browser;
 try {
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  await pad.listen(8725);const peer=server.padlink.attach(net.createConnection(8725,'127.0.0.1'),'usb');
  await until(()=>peer.candidate);server.padlink.pair(pad.pairing);await until(()=>peer.verified&&pad.verified&&peer.tiltGuard);
  const headers={authorization:'Bearer f3-public-test','content-type':'application/json'};
  const set=tiltGuard=>fetch(base+'/pad/options',{method:'POST',headers,body:JSON.stringify({tiltGuard})});
  assert.equal((await set({...DEFAULT_TILT,remainingSeconds:0})).status,400);
  const settings={...DEFAULT_TILT,maxTradesHour:1};assert.equal((await set(settings)).status,200);
  await until(()=>peer.tiltGuard?.settings.maxTradesHour===1);
  assert.equal(peer.tiltGuard.tradesHour,0);assert.equal(peer.tiltGuard.blocked,false);
  const out=new URL('../../docs/screens/v4/',import.meta.url);await mkdir(out,{recursive:true});
  browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const route of ['agent','device']){
   await page.goto(base+'/?token=f3-public-test#'+route);await page.getByRole('heading',{name:'Tilt guard',exact:true}).waitFor();
   for(const width of [1440,375]){await page.setViewportSize({width,height:960});await delay(500);await page.screenshot({path:fileURLToPath(new URL(`tilt-${route}-${width}.png`,out)),fullPage:true,animations:'disabled'});}
  }
  assert.deepEqual(errors,[]);
  // Explicit native accounting vector, not an external fill or real executed trade.
  await pad.tiltDriver.call({command:'accept',id:'native-test-reservation'});await pad.reportTilt();await until(()=>peer.tiltGuard.blocked);
  await assert.rejects(pad.key('yes'),/Tilt guard/);assert.equal(server.signals.list().length,0);
  assert.equal((await set(DEFAULT_TILT)).status,200);await until(()=>peer.tiltGuard?.settings.maxTradesHour===0);assert.equal(peer.tiltGuard.blocked,true);
  const reboot=await pad.tiltDriver.call({command:'reboot'});assert.equal(reboot.blocked,true);
  assert.equal((await pad.tiltDriver.call({command:'accept',id:'native-reduce-vector',reduceOnly:true})).ok,true);
  await writeFile(new URL('../../firmware/build/f3-tilt-public.json',import.meta.url),JSON.stringify(peer.tiltGuard,null,2));
 }finally{await browser?.close();server.padlink.close();await pad.close();await new Promise(r=>server.close(r));mem.stop();delete process.env.XORR_USER_DATA;await rm(dir,{recursive:true,force:true});}
});
