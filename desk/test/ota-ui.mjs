// Real Connect page, HTTP authorization and encrypted pad channel persistence.
import {mkdtemp,rm,mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';import {tmpdir} from 'node:os';
import net from 'node:net';import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {PadSimulatorV2} from '../../tools/padsim/v2.mjs';
const dir=await mkdtemp(path.join(tmpdir(),'xorr-ota-ui-'));process.env.XORR_USER_DATA=dir;process.env.PAD_TOKEN='isolated-ota-ui-test';
const {createServer}=await import('../main/server.mjs');const {Memory}=await import('../main/memory.mjs');
const mem=new Memory({db:path.join(dir,'memory.db')}),server=createServer(mem),pad=new PadSimulatorV2({device:'ota-ui-pad',serial:true,stateFile:path.join(dir,'pad-state.json')});let browser;
async function until(fn){for(let i=0;i<500;i++){if(fn())return;await delay(10);}throw Error('OTA UI timeout');}
try{
 await new Promise((r,j)=>{server.once('error',j);server.listen(8727,'127.0.0.1',r);});
 const base='http://127.0.0.1:8727',headers={authorization:'Bearer isolated-ota-ui-test','content-type':'application/json'};
 assert.equal((await fetch(base+'/pad/ota-channel?device='+pad.device)).status,401);
 assert.equal((await fetch(base+'/pad/ota-channel',{headers,method:'DELETE'})).status,405);
 assert.equal((await fetch(base+'/pad/ota-channel',{headers,method:'POST',body:JSON.stringify({device:pad.device,channel:'nightly'})})).status,400);
 await pad.listen(8724);const peer=server.padlink.attach(net.createConnection(8724,'127.0.0.1'),'usb');await until(()=>peer.candidate);server.padlink.pair(pad.pairing);await until(()=>peer.verified&&pad.verified);
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await mkdir('firmware/build/v6-ui',{recursive:true});
 for(const [name,width,height] of [['desktop',1440,1100],['mobile',390,844]]){
  await page.setViewportSize({width,height});await page.goto(base+'/?token=isolated-ota-ui-test#link');
  await page.waitForSelector('#content[data-ready="link"]');await page.evaluate(()=>document.fonts.ready);
  await page.locator('#read-ota-channel').click();await page.getByText('Pad channel: stable',{exact:true}).waitFor();
  await page.locator('#firmware-update [name="channel"]').selectOption('beta');await page.locator('#save-ota-channel').click();
  await page.getByText('Pad channel: beta · saved on this pad',{exact:true}).waitFor();assert.equal(pad.otaChannel,'beta');
  await page.locator('#firmware-update [name="manifest"]').setInputFiles('firmware/build/artifacts/manifest.json');
  await page.locator('#manifest-detail').getByText(/Verified firmware/).waitFor();
  assert.equal(await page.locator('#firmware-update [name="patch"]').count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name+' overflow');
  await page.screenshot({path:`firmware/build/v6-ui/${name}.png`,fullPage:true});
  await page.locator('#firmware-update [name="channel"]').selectOption('stable');await page.locator('#save-ota-channel').click();
  await page.getByText('Pad channel: stable · saved on this pad',{exact:true}).waitFor();
 }
 assert.equal(JSON.parse(await readFile(path.join(dir,'pad-state.json'),'utf8')).otaChannel,'stable');
 assert.deepEqual(errors,[]);console.log('PASS OTA channel auth/method/validation, encrypted per-pad persistence, manifest and desktop/mobile controls');
}finally{await browser?.close();server.padlink.close();server.signals.close();await pad.close();await new Promise(r=>server.close(r));mem.stop();await rm(dir,{recursive:true,force:true});}
