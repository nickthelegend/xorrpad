// Real isolated HTTP app and browser; no intercepted routes or synthetic prices.
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const dir=await mkdtemp(path.join(tmpdir(),'xorr-ability-ui-'));
process.env.XORR_USER_DATA=dir;process.env.PAD_TOKEN='isolated-ability-ui-test';
const {createServer}=await import('../main/server.mjs');
const {Memory}=await import('../main/memory.mjs');
const memory=new Memory({db:path.join(dir,'memory.db')}),server=createServer(memory);
let browser;
try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(8727,'127.0.0.1',resolve);});
  const base='http://127.0.0.1:8727';
  assert.equal((await fetch(base+'/pad/abilities')).status,401);
  assert.equal((await fetch(base+'/ui/abilities.mjs')).status,200);
  const headers={authorization:'Bearer isolated-ability-ui-test','content-type':'application/json'};
  assert.equal((await fetch(base+'/pad/abilities',{method:'DELETE',headers})).status,405);
  assert.equal((await fetch(base+'/pad/abilities',{method:'POST',headers,body:JSON.stringify({action:'developer',developerPublicKey:'bad'})})).status,400);
  browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await mkdir('firmware/build/v4-ui',{recursive:true});
  for(const [name,width,height] of [['desktop',1440,1100],['mobile',390,844]]){
    await page.setViewportSize({width,height});
    await page.goto(base+'/?token=isolated-ability-ui-test#abilities');
    await page.waitForSelector('#content[data-ready="abilities"]');
    await page.evaluate(()=>document.fonts.ready);
    await page.getByRole('heading',{name:'Install an ability',exact:true}).waitFor();
    assert.equal(await page.locator('#ability-install button').isDisabled(),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name+' overflow');
    await page.screenshot({path:`firmware/build/v4-ui/${name}.png`,fullPage:true});
  }
  assert.deepEqual(errors,[]);console.log('Abilities HTTP authorization, route validation and desktop/mobile UI passed.');
}finally{
  await browser?.close();await new Promise(resolve=>server.close(resolve));server.padlink.close();memory.stop();await rm(dir,{recursive:true,force:true});
}
