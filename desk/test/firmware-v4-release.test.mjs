// MIT · Copyright (c) 2026 Nivesh Gajengi
// Real HTTP + encrypted native padsim + browser; no intercepted API responses.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import {JournalPadSimulator} from '../../tools/padsim/journal.mjs';
process.env.PAD_TOKEN='f7-release-public-test';
delete process.env.SOLANA_ADDRESS;
delete process.env.PHOENIX_AUTHORITY;
delete process.env.JUPPERPS_AUTHORITY;
const {createServer}=await import('../main/server.mjs');
const {Memory}=await import('../main/memory.mjs');
async function until(fn){for(let i=0;i<1000;i++){if(await fn())return;await delay(10);}throw Error('Release state timeout');}
test('F7 existing desktop controls persist together, Predict only selects profile, all release screens fit 1440/375',{timeout:180000},async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'xorr-f7-release-'));process.env.XORR_USER_DATA=dir;
  const mem=new Memory({db:path.join(dir,'memory.db')}),server=createServer(mem);
  const pad=new JournalPadSimulator({device:'v4-release',serial:true,sessionStateFile:path.join(dir,'public-session.json')});
  const out=new URL('../../docs/screens/v4/',import.meta.url),captures=[],errors=[];let browser;
  try{
    await mkdir(out,{recursive:true});
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
    const headers={authorization:'Bearer f7-release-public-test'};
    await pad.listen(8726);const peer=server.padlink.attach(net.createConnection(8726,'127.0.0.1'),'usb');
    await until(()=>peer.candidate);server.padlink.pair(pad.pairing);await until(()=>peer.verified && pad.verified);await pad.tiltWork;
    browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'});
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/?token=f7-release-public-test#device');
    await page.getByRole('heading',{name:'Sounds',exact:true}).waitFor();
    await page.getByLabel('Sound volume (%)',{exact:true}).fill('55');
    await page.getByLabel('Ambient desk clock').selectOption('true');
    await page.getByLabel('Mute').selectOption('false');
    await page.getByLabel('Knob detent tick').selectOption('false');
    await page.getByLabel('Quiet hours (UTC)').selectOption('true');
    await page.getByLabel('Quiet start (UTC)',{exact:true}).fill('22:00');
    await page.getByLabel('Quiet end (UTC)',{exact:true}).fill('07:00');
    await page.getByLabel('Daily loss limit (USD)',{exact:true}).fill('25');
    await page.getByLabel('Max trades per hour',{exact:true}).fill('4');
    await page.getByLabel('Consecutive losing closes',{exact:true}).fill('3');
    await page.getByLabel('Cooldown (minutes)',{exact:true}).fill('15');
    await page.getByRole('button',{name:'Save pad options',exact:true}).click();
    await until(()=>pad.sounds.volume===55);
    const options=await fetch(base+'/pad/options',{headers}).then(r=>r.json());
    assert.equal(options.ambient,true);assert.deepEqual(options.tiltGuard,{dailyLossUsd:25,maxTradesHour:4,losingCloses:3,cooldownMinutes:15});
    assert.deepEqual(options.sounds,{volume:55,mute:false,knobTick:false,quietHours:{startMinute:1320,endMinute:420}});
    await page.reload();await page.getByRole('heading',{name:'Sounds',exact:true}).waitFor();
    assert.equal(await page.getByLabel('Sound volume (%)',{exact:true}).inputValue(),'55');
    assert.equal(await page.getByLabel('Daily loss limit (USD)',{exact:true}).inputValue(),'25');
    async function capture(name,width,heading){
      await page.setViewportSize({width,height:960});
      if(heading)await page.getByRole('heading',{name:heading,exact:true}).scrollIntoViewIfNeeded();else await page.evaluate(()=>scrollTo(0,0));
      await delay(700);await page.evaluate(()=>document.fonts.ready);
      const bounds=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,controls:[...document.querySelectorAll('main input,main select,main textarea')].filter(e=>e.getClientRects().length).map(e=>({name:e.name,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right})).filter(e=>e.left<0 || e.right>innerWidth)}));
      assert(bounds.document<=width,JSON.stringify({name,width,bounds}));assert.deepEqual(bounds.controls,[],JSON.stringify({name,width,bounds}));
      const file=`release-${name}-${width}.png`;await page.screenshot({path:fileURLToPath(new URL(file,out)),fullPage:!heading,animations:'disabled'});
      captures.push({file,width,height:960,fullPage:!heading,bounds});
    }
    for(const width of [1440,375]){
      await capture('device',width);
      for(const heading of ['Ambient','Sounds','Tilt guard'])await capture(heading.toLowerCase().replace(' ','-'),width,heading);
    }
    for(const [route,heading] of [['markets','Outcome markets.'],['agent','Tilt guard'],['activity','Pad journal']]){
      await page.goto(base+'/?token=f7-release-public-test#'+route);await page.getByRole('heading',{name:heading,exact:true}).waitFor();
      if(route==='markets'){
        await page.getByRole('button',{name:'Predict on pad',exact:true}).click();
        await until(async()=> (await fetch(base+'/desk/profiles',{headers}).then(r=>r.json())).active==='Predictor');
        await until(()=>pad.predict?.enabled);
        assert.equal(server.signals.list().length,0,'Predict on pad only selects the profile');
      }
      for(const width of [1440,375])await capture(route,width);
    }
    assert.deepEqual(errors,[]);
    await writeFile(new URL('release-captures.json',out),JSON.stringify({captures,runtimeErrors:errors,apiMocks:false,provenance:'Real local desk, verified encrypted native padsim; public live reads or explicit Setup/empty states. No trades accepted or submitted.'},null,2)+'\n');
  }catch(error){
    console.error(error);
    throw error;
  }finally{
    await browser?.close();server.padlink.close();await pad.close();await new Promise(r=>server.close(r));mem.stop();delete process.env.XORR_USER_DATA;await rm(dir,{recursive:true,force:true});
  }
});
