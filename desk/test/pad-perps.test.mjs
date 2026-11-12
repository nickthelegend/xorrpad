/** F2: pure boundary vectors plus actual HTTP/encrypted padsim; no external API mocks. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {liquidationDistance,cockpitPosition,guardRecord,guardKey,reducePosition} from '../main/perps-cockpit.mjs';
import {positionRow,decreaseSize} from '../main/chains/jupperps.mjs';
import {assertCloseSnapshot} from '../main/chains/perp-close.mjs';
import {closeLots} from '../main/chains/phoenix.mjs';
import {propose,buildRouted} from '../main/propose.mjs';
import {SignalQueue} from '../main/signals.mjs';
import {PredictPadSimulator} from '../../tools/padsim/predict.mjs';
import {Memory} from '../main/memory.mjs';
const row={id:'boundary-only',market:'TEST',venue:'jupperps',side:'long',mark:100,liq:90,distancePct:10,notionalUsd:100};
test('liquidation distance is directional, inclusive, unknown-safe and alarms beyond liquidation',()=>{
 assert.equal(liquidationDistance(100,90,'long'),10);assert.equal(liquidationDistance(100,110,'short'),10);
 assert.equal(liquidationDistance(89,90,'long'),0);assert.equal(liquidationDistance(111,110,'short'),0);
 for(const v of [0,-1,NaN,null,undefined])assert.equal(liquidationDistance(v,90,'long'),null);
 assert.equal(liquidationDistance(100,90,'spot'),null);
 assert.equal(guardRecord([row]).active,true);assert.equal(guardRecord([{...row,distancePct:10.00001}]).active,false);
 assert.equal(guardRecord([{...row,distancePct:null}]).active,false);assert.throws(()=>guardRecord([row],NaN));
 assert.deepEqual(guardRecord([row]).proposal,{kind:'perp',market:'TEST',side:'short',venue:'jupperps',positionId:row.id,reduceOnly:true,reducePct:50,size:50,leverage:1,source:'pad-liq-guard'});
});
test('API fields retain decimals and missing values; half close rounds down integer lots and micro USD',()=>{
 const p=positionRow({positionPubkey:'public',asset:'SOL',side:'long',entryPriceUsd:'123456789',markPriceUsd:'125000000',liquidationPriceUsd:'113450000',sizeUsd:'100000001',leverage:'21.30'},'public-owner');
 const c=cockpitPosition(p,'jupperps');assert.equal(c.entry,123.456789);assert.equal(c.liq,113.45);assert.equal(c.leverage,21.3);assert.equal(c.nextFunding,null);
 const unknown=cockpitPosition({authority:'public',market:'SOL',traderPdaIndex:0,subaccountIndex:0,side:'short',markPrice:100},'phoenix');
 assert.equal(unknown.liq,null);assert.equal(unknown.distancePct,null);assert.equal(unknown.leverage,null);
 assert.equal(closeLots('-101',50),50n);assert.equal(decreaseSize('100000001',50),'50000000');
 for(const pct of [0,49,51,101,NaN]){assert.throws(()=>closeLots('10',pct));assert.throws(()=>decreaseSize('100',pct));}
 assert.throws(()=>closeLots('1',50));assert.throws(()=>decreaseSize('1',50));
});
test('guard keys bind the encrypted peer, displayed episode, freshness, kill and pending decision',()=>{
 const liqGuard={...guardRecord([row]),id:'boundary-only'},peer={secure:{},verified:true,liqGuard,perpsAt:1000};
 const args={peer,message:{action:'liq:yes',guardId:liqGuard.id},pending:false,killed:false,now:1001};
 assert.equal(guardKey(args).reduceOnly,true);assert.equal(guardKey({...args,message:{...args.message,action:'liq:no'}}),null);
 for(const change of [{pending:true},{killed:true},{now:31000},{peer:{...peer,secure:null}},{peer:{...peer,verified:false}},
  {message:{action:'yes',guardId:liqGuard.id}},{message:{action:'liq:yes',guardId:'old'}}])assert.throws(()=>guardKey({...args,...change}));
});
test('half-close selection cannot switch position, side, venue or size, and the first pad YES only proposes',()=>{
 const sig={kind:'perp',market:'TEST',side:'SHORT',venue:'jupperps',positionId:row.id,reducePct:50,sizeUsd:50};
 const input=reducePosition(sig,[row],50);assert.equal(input.reducePct,50);assert.equal(input.expectedSide,'long');assert.equal(input.expectedNotionalUsd,100);
 assert.doesNotThrow(()=>assertCloseSnapshot({side:'long',notionalUsd:100},input));
 assert.throws(()=>assertCloseSnapshot({side:'short',notionalUsd:100},input));
 assert.throws(()=>assertCloseSnapshot({side:'long',notionalUsd:80},input));
 assert.throws(()=>assertCloseSnapshot({side:'long',notionalUsd:NaN},input));
 for(const change of [{positionId:'other'},{market:'other'},{venue:'phoenix'},{side:'LONG'},{sizeUsd:60},{reducePct:100}])
  assert.throws(()=>reducePosition({...sig,...change},[row],change.sizeUsd || 50));
 assert.throws(()=>reducePosition(sig,[row],49));assert.throws(()=>reducePosition(sig,[{...row,notionalUsd:80}],50));
 const sent=[],state={liqGuard:{...guardRecord([row]),id:'boundary'},guardAt:Date.now(),verified:true,seq:0,device:'test',send:m=>sent.push(m)};
 PredictPadSimulator.prototype.key.call(state,'yes');assert.equal(sent[0].action,'liq:yes');assert.equal(sent[0].signalId,undefined);
 PredictPadSimulator.prototype.key.call(state,'no');assert.equal(sent[1].action,'liq:no');
});
test('reduce-only proposals keep all permission gates and cannot auto-accept or build on mainnet by default',async()=>{
 const result=await propose({kind:'perp',side:'SHORT',symbol:'TEST',market:'TEST',venue:'jupperps',reduceOnly:true,reducePct:50,positionId:'boundary-only',sizeUsd:50},
  {limits:{allow:[],max_trade_usd:0,max_day_usd:0},spent_today:0});
 assert.equal(result.verdict.autoAccept,false);assert.equal(result.verdict.action,'REJECT');
 const q=new SignalQueue();try{const e=await q.create(result);assert.equal(e.state,'refused');}finally{q.close();}
 const previous=process.env.XORR_ALLOW_MAINNET;delete process.env.XORR_ALLOW_MAINNET;
 try {await assert.rejects(buildRouted({signal:{reduceOnly:true},verdict:{action:'EXECUTE'},routing:{best:{network:'mainnet-beta'}}}),/mainnet/i);}
 finally {if(previous!==undefined)process.env.XORR_ALLOW_MAINNET=previous;}
});
process.env.PAD_TOKEN='f2-public-test';
delete process.env.SOLANA_ADDRESS;delete process.env.PHOENIX_AUTHORITY;delete process.env.JUPPERPS_AUTHORITY;
const {createServer}=await import('../main/server.mjs');
async function until(fn){for(let i=0;i<500;i++){if(fn())return;await delay(10);}throw Error('encrypted pad timeout');}
test('actual empty perp feed and guard options reach encrypted padsim and approved desktop',{timeout:90000},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'xorr-f2-'));process.env.XORR_USER_DATA=dir;
 const mem=new Memory({db:path.join(dir,'memory.db')}),server=createServer(mem);
 const pad=new PredictPadSimulator({device:'f2-perps-pad',serial:true,fragmentBytes:19,sessionStateFile:path.join(dir,'public-accounting.json')});
 let browser;
 try {
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  await pad.listen(8724);const peer=server.padlink.attach(net.createConnection(8724,'127.0.0.1'),'usb');
  await until(()=>peer.candidate);server.padlink.pair(pad.pairing);await until(()=>peer.verified&&pad.verified);
  const record=await pad.waitFor(m=>m.type==='perps');assert.deepEqual(record.positions,[]);assert.match(record.message,/Setup required/);
  const guard=await pad.waitFor(m=>m.type==='liq_guard');assert.equal(guard.active,false);assert.equal(server.signals.list().length,0);
  const headers={authorization:'Bearer f2-public-test','content-type':'application/json'};
  const get=()=>fetch(base+'/pad/options',{headers}).then(r=>r.json());assert.equal((await get()).liqGuardPct,10);
  for(const value of [0,101,'10',null]){const r=await fetch(base+'/pad/options',{method:'POST',headers,body:JSON.stringify({liqGuardPct:value})});assert.equal(r.status,400);}
  const saved=await fetch(base+'/pad/options',{method:'POST',headers,body:JSON.stringify({liqGuardPct:7.5})});assert.equal(saved.status,200);assert.equal((await get()).liqGuardPct,7.5);
  const id=pad.device+':'+(++pad.seq);pad.send({type:'key',id,edge:'down',action:'liq:yes',guardId:'absent'});
  const refused=await pad.waitFor(m=>m.type==='result'&&m.id===id);assert.equal(refused.ok,false);assert.equal(server.signals.list().length,0);
  await mkdir(new URL('../../firmware/build/',import.meta.url),{recursive:true});
  await writeFile(new URL('../../firmware/build/f2-perps.json',import.meta.url),JSON.stringify(record,null,2));
  const out=new URL('../../docs/screens/v4/',import.meta.url);await mkdir(out,{recursive:true});
  browser=await chromium.launch({headless:true});const page=await browser.newPage();
  await page.goto(base+'/?token=f2-public-test#device');await page.getByText('Liquidation guard distance (%)',{exact:true}).waitFor();
  for(const width of [1440,375]){await page.setViewportSize({width,height:960});await delay(1000);await page.screenshot({path:fileURLToPath(new URL(`perps-device-${width}.png`,out)),fullPage:true,animations:'disabled'});}
 }finally{await browser?.close();server.padlink.close();await pad.close();await new Promise(r=>server.close(r));mem.stop();delete process.env.XORR_USER_DATA;await rm(dir,{recursive:true,force:true});}
});
