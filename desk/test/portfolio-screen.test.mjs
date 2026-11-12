/** Native firmware frames and shipped WASM agree for explicit portfolio layout cases. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir,homedir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import jsQR from 'jsqr';
const repo=fileURLToPath(new URL('../..',import.meta.url));
test('Fund QR decodes to its URI; funding and Portfolio frames match native firmware byte for byte',{timeout:90000},async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'xorr-portfolio-screen-'));
 const gfx=process.env.GFX||path.join(homedir(),'Documents/Arduino/libraries/Adafruit_GFX_Library');
 let server,browser;
 try {
  const binary=path.join(dir,'screen');
  const compile=spawnSync('c++',['-std=c++17','-include','cmath','-O1','-w','-DARDUINO=10819','-DSCREEN_NATIVE_TEST',
   '-I'+path.join(repo,'tools/uipreview/shim'),'-I'+gfx,path.join(repo,'tools/uipreview/firmware-screen.cpp'),path.join(gfx,'Adafruit_GFX.cpp'),'-o',binary],{encoding:'utf8'});
  assert.equal(compile.status,0,compile.stderr);
  server=http.createServer(async(req,res)=>{
   const name=req.url.slice(1);
   if(!['firmware-screen.js','firmware-screen.wasm'].includes(name)){res.end('<!doctype html><title>Portfolio parity</title>');return;}
   res.setHeader('content-type',name.endsWith('.wasm')?'application/wasm':'text/javascript');res.end(await readFile(path.join(repo,'desk/app/public',name)));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const full={ok:'1',portfolioVisible:'1',portfolioCluster:'mainnet-beta',portfolioTotal:'125.50'};
  for(let i=0;i<5;i++)Object.assign(full,{[`portfolioRow${i}Symbol`]:['SOL','USDC','TOKEN A','TOKEN B','UNKNOWN TOKEN'][i],[`portfolioRow${i}Amount`]:'1.25',[`portfolioRow${i}Usd`]:i===4?'':'25.10'});
  const hashes=[];
  const address='11111111111111111111111111111111',uri=`solana:${address}?label=xorrpad%20agent`;
  for(const state of [full,{ok:'1',portfolioVisible:'1',portfolioCluster:'devnet',portfolioTotal:'',portfolioRow0Symbol:'SOL',portfolioRow0Amount:'2',portfolioRow0Usd:''},
   {ok:'1',portfolioVisible:'1',portfolioMessage:'Create your agent wallet in XOR Desktop'},
   ...['devnet','mainnet-beta'].map(fundCluster=>({ok:'1',fundVisible:'1',fundAddress:address,fundUri:uri,fundCluster})),
   {ok:'1',fundVisible:'1',fundAddress:'So11111111111111111111111111111111111111112',fundUri:'solana:So11111111111111111111111111111111111111112?label=xorrpad%20agent',fundCluster:'devnet'}]){
   const native=spawnSync(binary,['--state',...Object.entries(state).map(([k,v])=>`${k}=${v}`)]);
   assert.equal(native.status,0);assert.equal(native.stdout.length,320*240*2);
   if(state.fundUri) {
    const rgba=new Uint8ClampedArray(320*240*4);
    for(let i=0;i<320*240;i++) {
     const px=native.stdout.readUInt16LE(i*2);
     rgba.set([((px>>11)&31)*255/31,((px>>5)&63)*255/63,(px&31)*255/31,255],i*4);
    }
    assert.equal(jsQR(rgba,320,240)?.data,state.fundUri,'the actual native frame contains a readable funding QR');
   }
   const hash=createHash('sha256').update(native.stdout).digest('hex');hashes.push(hash);
   const bytes=await page.evaluate(async(state)=>{
    const {default:create}=await import('/firmware-screen.js');const m=await create();m._screen_reset();
    for(const [k,v] of Object.entries(state))m.ccall('screen_set',null,['string','string'],[k,v]);
    const pointer=m._screen_render();return Array.from(new Uint8Array(m.HEAPU16.buffer,pointer,320*240*2));
   },state);
   assert.equal(createHash('sha256').update(Buffer.from(bytes)).digest('hex'),hash);
  }
  assert.equal(new Set(hashes).size,6,'each screen state renders a distinct actual frame');
 } finally {await browser?.close();if(server)await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
