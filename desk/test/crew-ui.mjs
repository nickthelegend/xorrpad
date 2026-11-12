// Real HTTP app, encrypted two-pad crew, native review gates and browser UI.
import {mkdtemp,rm,mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';import {tmpdir} from 'node:os';
import net from 'node:net';import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {VersionedTransaction} from '@solana/web3.js';
import {CrewPadSimulator} from '../../tools/padsim/crew.mjs';
import {rawPublic} from '../main/pad-v2.mjs';import {clearSignFrames} from '../main/clear-sign.mjs';
const dir=await mkdtemp(path.join(tmpdir(),'xorr-crew-ui-'));process.env.XORR_USER_DATA=dir;process.env.PAD_TOKEN='isolated-crew-ui-test';
const {createServer}=await import('../main/server.mjs');const {Memory}=await import('../main/memory.mjs');
const mem=new Memory({db:path.join(dir,'memory.db')}),server=createServer(mem),pads=[];let browser;
async function until(fn){for(let i=0;i<500;i++){if(fn())return;await delay(10);}throw Error('crew UI timeout');}
try{
 await new Promise((r,j)=>{server.once('error',j);server.listen(8727,'127.0.0.1',r);});
 const base='http://127.0.0.1:8727',headers={authorization:'Bearer isolated-crew-ui-test','content-type':'application/json'};
 assert.equal((await fetch(base+'/pad/crew')).status,401);
 assert.equal((await fetch(base+'/pad/crew',{headers,method:'DELETE'})).status,405);
 assert.equal((await fetch(base+'/pad/crew',{headers,method:'POST',body:JSON.stringify({enabled:true,required:1})})).status,400);
 for(let i=0;i<2;++i){
  const p=new CrewPadSimulator({device:'ui-crew-'+i,serial:true});pads.push(p);await p.listen(8724+i);
  const peer=server.padlink.attach(net.createConnection(8724+i,'127.0.0.1'),'usb');await until(()=>peer.candidate);server.padlink.pair(p.pairing);await until(()=>peer.verified&&p.verified);
 }
 const policy={enabled:true,aboveUsd:100,required:2,members:pads.map((p,i)=>({device:p.device,publicKey:rawPublic(p.identity.publicKey),name:i?'Bob':'Alice'}))};
 assert.equal((await fetch(base+'/pad/crew',{headers,method:'POST',body:JSON.stringify(policy)})).status,200);
 const fixture=JSON.parse(await readFile(new URL('../../firmware/test/fixtures/session-usdc-transfer.json',import.meta.url),'utf8'));
 const tx=VersionedTransaction.deserialize(Buffer.from(fixture.unsignedTx,'base64'));
 const request={signalId:'ui-crew-trade',remainingMs:10000,message:fixture.message,tables:[],cosign:true};
 const pending=server.executor.crew.collect(tx,{usd:101,signalId:'ui-crew-trade',cluster:'devnet',expiresAt:Date.now()+10000,prepared:{request,...clearSignFrames(request)},recheck:async()=>{}});
 await until(()=>pads.every(p=>p.review));await pads[0].approveCrew();await pads[1].approveCrew();await pending;
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await mkdir('firmware/build/v5-ui',{recursive:true});
 for(const [name,width,height] of [['desktop',1440,1100],['mobile',390,844]]){
  await page.setViewportSize({width,height});await page.goto(base+'/?token=isolated-crew-ui-test#link');
  await page.waitForSelector('#content[data-ready="link"]');await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('#crew-policy').count(),1,await page.locator('#content').innerText());
  await page.locator('#crew-rounds').getByText(/Alice/).waitFor();
  await page.locator('#crew-rounds').getByText(/Bob/).waitFor();
  assert.equal(await page.locator('#crew-policy [name="enabled"]').isChecked(),true);
  assert.equal(await page.locator('#crew-policy [name="member"]:checked').count(),2);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name+' overflow');
  await page.screenshot({path:`firmware/build/v5-ui/${name}.png`,fullPage:true});
 }
 assert.deepEqual(errors,[]);console.log('PASS crew HTTP auth/method/policy checks, real 2-of-2 approvals, names and desktop/mobile UI');
}finally{await browser?.close();server.padlink.close();server.signals.close();await Promise.all(pads.map(p=>p.close()));await new Promise(r=>server.close(r));mem.stop();await rm(dir,{recursive:true,force:true});}
