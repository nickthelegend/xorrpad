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
import {journalEntry,journalRecord} from '../main/pad-journal.mjs';
import {AmbientDriver} from '../../tools/padsim/ambient.mjs';
import {JournalPadSimulator} from '../../tools/padsim/journal.mjs';
const row={id:'local-test',time:0,action:'BUY',market:'LOCAL TEST',size:'1',venue:'local vector',result:'refused',signature:'',reason:'Local policy refusal vector'};
test('F7 authenticated journal assembler rejects partial mixed duplicate and oversized histories',()=>{
 const peer={};const begin={type:'journal_begin',revision:1,count:1,healthy:true};
 assert.throws(()=>journalRecord(peer,{...begin,count:33}));assert.equal(journalRecord(peer,begin),null);
 assert.throws(()=>journalRecord(peer,{type:'journal_end',revision:1}));
 assert.throws(()=>journalRecord(peer,{type:'journal_entry',revision:2,index:0,entry:row}));
 assert.throws(()=>journalRecord(peer,{type:'journal_entry',revision:1,index:1,entry:row}));
 assert.equal(journalRecord(peer,{type:'journal_entry',revision:1,index:0,entry:row}),null);
 const r=journalRecord(peer,{type:'journal_end',revision:1});assert.deepEqual(r.entries,[row]);assert.equal(r.healthy,true);
 for(const entry of [{...row,result:'filled'},{...row,secret:'not allowed'},{...row,reason:'x'.repeat(193)},{...row,time:1},{...row,size:1}])assert.throws(()=>journalEntry(entry));
});
test('F7 production C++ journal persists exactly 32 decisions across process restart, with all outcomes',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'xorr-journal-native-')),file=path.join(dir,'public-journal.json');let d=new AmbientDriver(file);
 try{
  for(let i=0;i<40;i++)await d.call({command:'journal',epoch:1800000000,message:{type:'journal_decision',signalId:'local-'+i,side:'BUY',market:'LOCAL TEST',venue:'local vector',sizeUsd:1,state:'refused',reason:'local native vector'}});
  let r=await d.call({command:'snapshot'});assert.equal(r.journal.entries.length,32);assert.equal(r.journal.entries[0].id,'local-8');
  for(const result of ['expired','failed','blocked'])await d.call({command:'result',id:'local-39',result,reason:'local reason'});
  d.close();d=new AmbientDriver(file);r=await d.call({command:'snapshot'});assert.equal(r.journal.entries.length,32);assert.equal(r.journal.entries.at(-1).result,'blocked');assert.equal(r.journal.entries.at(-1).reason,'local reason');
  await d.call({command:'journal',message:{type:'receipt',signalId:'local-39',signature:'LOCAL-PUBLIC-TEST-SIGNATURE'}});
  r=await d.call({command:'snapshot'});assert.equal(r.journal.entries.at(-1).result,'filled');assert.equal(r.journal.entries.at(-1).signature,'LOCAL-PUBLIC-TEST-SIGNATURE');
 }finally{d.close();await rm(dir,{recursive:true,force:true});}
});
process.env.PAD_TOKEN='f7-public-test';delete process.env.SOLANA_ADDRESS;delete process.env.PHOENIX_AUTHORITY;delete process.env.JUPPERPS_AUTHORITY;
const {createServer}=await import('../main/server.mjs');const {Memory}=await import('../main/memory.mjs');
async function until(fn){for(let i=0;i<700;i++){if(fn())return;await delay(10);}throw Error('F7 condition timeout');}
test('F7 actual encrypted pad syncs NVS driver, knob opens read-only journal, HTTP and Activity show honest state',{timeout:120000},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'xorr-f7-'));process.env.XORR_USER_DATA=dir;
 const mem=new Memory({db:path.join(dir,'memory.db')}),server=createServer(mem),pad=new JournalPadSimulator({device:'f7-journal',serial:true,sessionStateFile:path.join(dir,'public-session.json')});let browser;
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`,headers={authorization:'Bearer f7-public-test'};
  assert.equal((await fetch(base+'/pad/journal')).status,401);
  const initial=await (await fetch(base+'/pad/journal',{headers})).json();assert.equal(initial.capacity,32);assert.match(initial.message,/Setup required/);
  assert.equal((await fetch(base+'/pad/journal',{method:'POST',headers:{...headers,'content-type':'application/json'},body:'{}'})).status,405);
  await pad.listen(8726);const peer=server.padlink.attach(net.createConnection(8726,'127.0.0.1'),'usb');
  await until(()=>peer.candidate);server.padlink.pair(pad.pairing);await until(()=>peer.verified && pad.verified);await pad.tiltWork;
  await until(()=>server.padlink.journal().devices.length===1);assert.deepEqual(server.padlink.journal().devices[0].entries,[]);
  await pad.pressKnob();await until(()=>peer.view?.screen==='journal');assert.equal(server.signals.list().length,0);
  assert.deepEqual(await pad.key('yes'),{dismissed:true});assert.equal(server.signals.list().length,0);
  browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(base+'/?token=f7-public-test#activity');await page.getByRole('heading',{name:'Pad journal',exact:true}).waitFor();await page.getByText('No decisions recorded on this pad.',{exact:true}).waitFor();
  const out=new URL('../../docs/screens/v4/',import.meta.url);await mkdir(out,{recursive:true});
  for(const width of [1440,375]){await page.setViewportSize({width,height:960});await page.getByRole('heading',{name:'Pad journal',exact:true}).scrollIntoViewIfNeeded();await delay(300);await page.screenshot({path:fileURLToPath(new URL(`journal-activity-${width}.png`,out)),animations:'disabled'});}
  await pad.journalWork;await writeFile(new URL('../../firmware/build/f7-journal.json',import.meta.url),JSON.stringify({type:'journal',...pad.journal},null,2));
  // A deliberately refused local queue vector: no executable quote, signature or trade is fabricated.
  const decision=await server.signals.create({signal:{kind:'spot',symbol:'LOCAL JOURNAL TEST',side:'BUY',venue:'local policy vector'},verdict:{action:'REJECT',sizeUsd:1,autoAccept:false,why:['Local policy validation'],ruleId:'local.journal_test'}});
  assert.equal(decision.state,'refused');await until(()=>server.padlink.journal().devices[0].entries.some(r=>r.id===decision.id && r.result==='refused'));
  const entry=server.padlink.journal().devices[0].entries[0];assert.equal(entry.market,'LOCAL JOURNAL TEST');assert.equal(entry.signature,'');assert.equal(entry.reason,'local.journal_test');
  await pad.pressKnob();await pad.scrollJournal(1);assert.equal(server.signals.list().filter(e=>['accepted','signed','executed'].includes(e.state)).length,0);
  const received=await (await fetch(base+'/pad/journal?device='+pad.device,{headers})).json();assert.equal(received.devices[0].entries[0].id,decision.id);
  if(pad.journalVisible)await pad.key('no');
  pad.kill(2000);await until(()=>server.padlink.killed.has(pad.device));
  await assert.rejects(pad.key('buy'),/killed/i);
  const killedDecision=await server.signals.create({signal:{kind:'spot',symbol:'LOCAL KILLED JOURNAL TEST',side:'BUY',venue:'local policy vector'},verdict:{action:'REJECT',sizeUsd:1,autoAccept:false,why:['Local killed policy validation'],ruleId:'local.killed_journal_test'}});
  assert.equal(killedDecision.state,'refused');
  await until(()=>server.padlink.journal().devices[0].entries.some(r=>r.id===killedDecision.id && r.result==='refused'));
  assert.equal(server.padlink.killed.has(pad.device),true);assert.equal(server.signals.list().filter(e=>['accepted','signed','executed'].includes(e.state)).length,0);
 }finally{await browser?.close();server.padlink.close();await pad.close();await new Promise(r=>server.close(r));mem.stop();delete process.env.XORR_USER_DATA;await rm(dir,{recursive:true,force:true});}
});
