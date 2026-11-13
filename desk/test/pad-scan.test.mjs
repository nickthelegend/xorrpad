// MIT · Copyright (c) 2026 Nivesh Gajengi
// Real SCAN routes and encrypted native pad; no intercepted external API responses.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {scanRecord} from '../main/pad-scan.mjs';
import {AmbientDriver} from '../../tools/padsim/ambient.mjs';
import {ScanPadSimulator} from '../../tools/padsim/scan.mjs';
test('F8 bounded public SCAN record preserves verdict, unavailable markets and top setup without acceptance fields',()=>{
 const r=scanRecord({summary:'Local record boundary vector',markets:[{symbol:'LOCAL',error:'Setup required: local vector',secret:'discard'}],signals:[{symbol:'LOCAL',side:'BUY',strategy:'local',rationale:'Local parser vector',secret:'discard'}],secret:'discard'});
 assert.deepEqual(r,{type:'scan',summary:'Local record boundary vector',checkedCount:0,unavailableCount:1,markets:[{symbol:'LOCAL',error:'Setup required: local vector'}],top:{symbol:'LOCAL',side:'BUY',strategy:'local',rationale:'Local parser vector'}});
 assert.equal(scanRecord({}).top,null);assert.match(scanRecord({}).summary,/Setup required/);
 assert.ok(Buffer.byteLength(JSON.stringify(scanRecord({summary:'x'.repeat(800),markets:Array(20).fill({symbol:'LOCAL',error:'x'.repeat(200)}),signals:[]})))<3000);
});
test('F8 native SCAN timer consumes dismissal and expires exactly at eight seconds',async()=>{
 const d=new AmbientDriver();try{
  const record=scanRecord({summary:'Setup required: local native timeout vector'});
  let r=await d.call({command:'scan',record,now:100});assert.equal(r.valid,true);assert.equal(r.scanVisible,true);
  assert.equal((await d.call({command:'snapshot',now:8099})).scanVisible,true);
  assert.equal((await d.call({command:'snapshot',now:8100})).scanVisible,false);
  await d.call({command:'scan',record,now:200});assert.equal((await d.call({command:'scan_key',now:201})).dismissed,true);
  assert.equal((await d.call({command:'scan_key',now:202})).dismissed,false);
 }finally{d.close();}
});
process.env.PAD_TOKEN='f8-public-test';delete process.env.SOLANA_ADDRESS;delete process.env.PHOENIX_AUTHORITY;delete process.env.JUPPERPS_AUTHORITY;
const {createServer}=await import('../main/server.mjs');const {Memory}=await import('../main/memory.mjs');
async function until(fn){for(let i=0;i<700;i++){if(fn())return;await delay(10);}throw Error('F8 condition timeout');}
test('F8 both live SCAN entry points reach encrypted pad, Markets and one Activity row each; YES only dismisses',{timeout:240000},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'xorr-f8-'));process.env.XORR_USER_DATA=dir;
 const mem=new Memory({db:path.join(dir,'memory.db')}),server=createServer(mem),pad=new ScanPadSimulator({device:'f8-scan',serial:true,sessionStateFile:path.join(dir,'public-session.json')});let browser;
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`,headers={authorization:'Bearer f8-public-test','content-type':'application/json'};
  assert.equal((await fetch(base+'/scan/history')).status,401);
  assert.equal((await fetch(base+'/scan/history',{method:'POST',headers,body:'{}'})).status,405);
  await pad.listen(8726);const peer=server.padlink.attach(net.createConnection(8726,'127.0.0.1'),'usb');
  await until(()=>peer.candidate);server.padlink.pair(pad.pairing);await until(()=>peer.verified && pad.verified);await pad.tiltWork;
  browser=await chromium.launch({headless:true});const page=await browser.newPage({reducedMotion:"reduce"});await page.goto(base+'/?token=f8-public-test#markets');
  const card=page.getByRole('region',{name:'Last scan',exact:true});await card.getByText('Setup required: press SCAN on the pad to read live markets.',{exact:true}).waitFor();
  const first=await (await fetch(base+'/scan',{headers})).json();assert.ok(first.summary);await until(()=>pad.scanVisible && peer.view?.screen==='scan');
  assert.equal(pad.scan.summary,first.summary);assert.deepEqual(pad.scan.markets,scanRecord(first).markets);
  assert.deepEqual(await pad.key('yes'),{dismissed:true});assert.equal(server.signals.list().filter(s=>['accepted','signed','executed'].includes(s.state)).length,0);
  const after=pad.history.length,id=await pad.key('base');await pad.waitFor(m=>m.type==='result' && m.id===id,{after,timeout:150000});
  await until(()=>pad.scanVisible);const last=await (await fetch(base+'/scan/last',{headers})).json();assert.equal(pad.scan.summary,last.summary);
  const history=await (await fetch(base+'/scan/history',{headers})).json();assert.equal(history.scans.length,2);assert.notEqual(history.scans[0].id,history.scans[1].id);
  assert.equal(history.scans[1].summary,last.summary);assert.ok(server.signals.list().every(s=>!['accepted','signed','executed'].includes(s.state)));
  await card.getByText(last.summary,{exact:true}).waitFor();
  const out=new URL('../../docs/screens/v4/',import.meta.url);await mkdir(out,{recursive:true});
  for(const width of [1440,375]){await page.setViewportSize({width,height:960});await card.scrollIntoViewIfNeeded();await delay(300);assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll("body *")].filter(e=>e.getBoundingClientRect().right>innerWidth+1 && e.getBoundingClientRect().width>0).slice(0,8).map(e=>({tag:e.tagName,cls:e.className,right:e.getBoundingClientRect().right}))),[]);await page.screenshot({path:fileURLToPath(new URL(`scan-markets-${width}.png`,out)),animations:'disabled'});}
  await page.goto(base+'/?token=f8-public-test#activity');await page.getByRole('button',{name:'Scans',exact:true}).click();await page.locator('.activity-timeline article').first().waitFor();assert.equal(await page.locator('.activity-timeline article').count(),2);
  for(const width of [1440,375]){await page.setViewportSize({width,height:960});await delay(300);assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll("body *")].filter(e=>e.getBoundingClientRect().right>innerWidth+1 && e.getBoundingClientRect().width>0).slice(0,8).map(e=>({tag:e.tagName,cls:e.className,right:e.getBoundingClientRect().right}))),[]);await page.screenshot({path:fileURLToPath(new URL(`scan-activity-${width}.png`,out)),animations:'disabled'});}
  await writeFile(new URL('scan-record.json',out),JSON.stringify({provenance:'Actual live /scan result or provider Setup required from the isolated F8 suite; no financial fixtures.',record:scanRecord(last)},null,2)+'\n');
  await pad.scanTick((Date.now()+8001)>>>0);assert.equal(pad.scanVisible,false);await until(()=>peer.view.screen==='home');
 }finally{await browser?.close();server.padlink.close();await pad.close();await new Promise(r=>server.close(r));mem.stop();delete process.env.XORR_USER_DATA;await rm(dir,{recursive:true,force:true});}
});
