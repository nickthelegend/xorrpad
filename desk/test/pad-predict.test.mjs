/** F1: pure record boundaries and actual authenticated desk + encrypted native padsim. No API mocks. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import {predictRecord,outcomePositionsRecord,predictProposal} from '../main/pad-predict.mjs';
import {PredictPadSimulator} from '../../tools/padsim/predict.mjs';
import {Memory} from '../main/memory.mjs';
import {propose} from '../main/propose.mjs';
const market='So11111111111111111111111111111111111111112';
test('Predict records bound public data, never invent change, and reject wrong clusters',()=>{
 const row={market,name:'Question?',yesPrice:0.42,endTs:110};
 const p=predictRecord({cluster:'devnet',markets:[row,{...row,yesPrice:NaN},{...row,endTs:90}]},{now:100000});
 assert.equal(p.markets.length,1);assert.equal(p.markets[0].change24h,null);assert.equal(p.markets[0].closesIn,10);
 assert.throws(()=>predictRecord({cluster:'mainnet-beta',markets:[]}));
 const many=predictRecord({cluster:'devnet',markets:Array(20).fill({...row,name:'é'.repeat(180)})},{now:100000});
 assert.equal(many.markets.length,6);assert.ok(Buffer.byteLength(JSON.stringify(many))<3000);
 assert.match(predictRecord({cluster:'devnet',markets:[]}).message,/Setup required/);
 assert.equal(outcomePositionsRecord({cluster:'devnet',positions:[{name:'Question',yes:2,no:3}]}).positions[0].no,3);
 assert.throws(()=>outcomePositionsRecord({cluster:'mainnet-beta',positions:[]}));
});
test('Predict proposals require live displayed market, encrypted profile, no pending decision and never contain acceptance',()=>{
 const peer={secure:{},verified:true,predictAt:100000,predict:{markets:[{market,closesIn:60}]}};
 const args={peer,message:{action:'predict:no',market},enabled:true,killed:false,pending:false,now:100001,size:1};
 const proposal=predictProposal(args);assert.deepEqual(proposal,{kind:'predict',market,side:'no',size:1,source:'pad-predict'});
 for(const change of [{pending:true},{killed:true},{enabled:false},{now:130000},{size:0},{peer:{...peer,secure:null}},
  {message:{action:'yes',market}},{message:{action:'predict:yes',market:'other'}}])assert.throws(()=>predictProposal({...args,...change}));
});
test('manual confirmation survives gate rejection and never auto-accepts',async()=>{
 const result=await propose({kind:'predict',side:'BUY',symbol:`pmamm:${market}:yes`,market,outcomeSide:'yes',sizeUsd:1,manualConfirmation:true},
  {limits:{allow:[],max_trade_usd:0,max_day_usd:0},spent_today:0});
 assert.equal(result.verdict.autoAccept,false);assert.notEqual(result.verdict.action,'EXECUTE');
});
process.env.PAD_TOKEN='f1-public-test';
delete process.env.SOLANA_ADDRESS;
const {createServer}=await import('../main/server.mjs');
async function until(fn){for(let i=0;i<500;i++){if(fn())return;await delay(10);}throw Error('encrypted pad timeout');}
test('Predictor profile streams live-or-Setup to encrypted padsim; PORTFOLIO and desktop use the actual routes',{timeout:120000},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'xorr-f1-'));process.env.XORR_USER_DATA=dir;
 const mem=new Memory({db:path.join(dir,'memory.db')}),server=createServer(mem);
 const pad=new PredictPadSimulator({device:'f1-predict-pad',serial:true,fragmentBytes:19,sessionStateFile:path.join(dir,'public-accounting.json')});
 let browser;
 try {
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  await pad.listen(8724);const peer=server.padlink.attach(net.createConnection(8724,'127.0.0.1'),'usb');
  await until(()=>peer.candidate);server.padlink.pair(pad.pairing);await until(()=>peer.verified&&pad.verified);
  const headers={authorization:'Bearer f1-public-test','content-type':'application/json'};
  const selected=await fetch(base+'/desk/profiles',{method:'POST',headers,body:JSON.stringify({name:'Predictor'})});assert.equal(selected.status,200);
  const record=await pad.waitFor(m=>m.type==='predict'&&m.enabled,{timeout:40000});
  assert.equal(record.cluster,'devnet');assert.equal(server.signals.list().length,0,'selecting Predictor never proposes or accepts');
  if(record.markets.length){
    pad.scroll(-1);await until(()=>pad.predict.offset+pad.selected===record.total-1);assert.equal(pad.predict.offset+pad.selected,record.total-1);
    // A real proposal is deliberately stopped by the empty allowlist. No accept/sign/send occurs.
    const id=pad.key('no');await pad.waitFor(m=>m.type==='result'&&m.id===id,{timeout:60000});
    assert.ok(server.signals.list().every(e=>!['accepted','signed','executed'].includes(e.state)));
  } else {assert.match(record.message,/Setup required/);assert.throws(()=>pad.key('yes'),/Setup required/);}
  const after=pad.history.length,id=pad.key('portfolio');
  const positions=await pad.waitFor(m=>m.type==='outcome_positions',{after,timeout:40000});
  await pad.waitFor(m=>m.type==='result'&&m.id===id,{timeout:40000});assert.equal(positions.cluster,'devnet');assert.deepEqual(positions.positions,[]);assert.match(positions.message,/Setup required/);
  await mkdir(new URL('../../firmware/build/',import.meta.url),{recursive:true});
  await writeFile(new URL('../../firmware/build/f1-predict.json',import.meta.url),JSON.stringify(record,null,2));
  await writeFile(new URL('../../firmware/build/f1-outcome-positions.json',import.meta.url),JSON.stringify(positions,null,2));
  const out=new URL('../../docs/screens/v4/',import.meta.url);await mkdir(out,{recursive:true});
  browser=await chromium.launch({headless:true});const page=await browser.newPage();
  await page.goto(base+'/?token=f1-public-test#markets');await page.getByRole('button',{name:'Predict on pad',exact:true}).waitFor();
  for(const width of [1440,375]){await page.setViewportSize({width,height:960});await delay(1000);await page.screenshot({path:fileURLToPath(new URL(`predict-markets-${width}.png`,out)),fullPage:true,animations:'disabled'});}
  const changed=await fetch(base+'/desk/profiles',{method:'POST',headers,body:JSON.stringify({name:'Scalper'})});assert.equal(changed.status,200);
  await pad.waitFor(m=>m.type==='predict'&&!m.enabled,{after});
 } finally {await browser?.close();server.padlink.close();await pad.close();await new Promise(r=>server.close(r));mem.stop();delete process.env.XORR_USER_DATA;await rm(dir,{recursive:true,force:true});}
});
