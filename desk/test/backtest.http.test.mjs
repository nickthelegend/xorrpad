/** Actual authenticated server, SQLite and agent requests; no service stubs. */
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Memory} from '../main/memory.mjs';
import {executeTool} from '../main/agent-tools.mjs';
const dir=await mkdtemp(path.join(tmpdir(),'xorrpad-t6-http-'));
process.env.PAD_TOKEN='xorrpad-t6-test';process.env.XORR_USER_DATA=dir;
const {createServer}=await import('../main/server.mjs');
let mem,server;
const base='http://127.0.0.1:8728',headers={authorization:'Bearer xorrpad-t6-test','content-type':'application/json'};
const options={symbol:'SOL',from:1793491200,to:1794096000,strategy:'rule',venue:'phoenix',
  rule:{name:'positive price',entry:[{left:{indicator:'close'},op:'gt',right:0}],maxHoldMin:240}};
before(async()=>{mem=new Memory({db:path.join(dir,'memory.db')});await mem.ping();server=createServer(mem);await new Promise((r,j)=>{server.once('error',j);server.listen(8728,'127.0.0.1',r);});});
after(async()=>{if(server)await new Promise(r=>server.close(r));mem?.stop();delete process.env.XORR_USER_DATA;await rm(dir,{recursive:true,force:true});});
async function call(endpoint,body,method) {
  const r=await fetch(base+endpoint,{headers,method:method??(body?'POST':'GET'),...(body?{body:JSON.stringify(body)}:{})});
  return {status:r.status,body:await r.json()};
}
const request=async(endpoint,body)=>{const r=await call(endpoint,body);if(r.status!==200)throw Object.assign(new Error(r.body.error),{status:r.status});return r.body;};
test('backtest routes enforce auth, methods, validation and expose catalog without upstream data',async()=>{
  for(const endpoint of ['/backtest','/backtest/history','/backtest/predict'])assert.equal((await fetch(base+endpoint)).status,401);
  assert.equal((await call('/backtest',undefined,'DELETE')).status,405);
  assert.equal((await call('/backtest/history',{})).status,405);assert.equal((await call('/backtest/predict')).status,405);
  const catalog=await call('/backtest');assert.equal(catalog.status,200);assert.ok(catalog.body.strategies.includes('mr_band_fade'));assert.ok(catalog.body.venues.includes('jupperps'));
  assert.equal((await call('/backtest',{...options,strategy:'future'})).status,400);
  assert.equal((await call('/backtest',{...options,fees:{entryRate:0}})).status,400);
  assert.equal((await call('/backtest',{...options,from:options.to})).status,400);
  assert.equal((await call('/backtest/predict',{symbol:'SOL',from:options.from,to:options.to,strike:1})).status,400);
  assert.equal((await call('/backtest/history?symbol=SOL&from=bad&to=1794096000')).status,400);
  assert.equal((await call('/backtest/history?symbol=SOL&to=2')).status,400);
  await assert.rejects(executeTool('backtest',{...options,strategy:'future'},{request,signals:server.signals}),/invalid strategy/);
});
test('real Pyth HTTP strategy, prediction and agent tool round trips',{timeout:120000},async t=>{
  const r=await call('/backtest',options);
  if(r.status===502&&/^Pyth history unavailable:/.test(r.body.error)){console.log(`SKIP: ${r.body.error}`);t.skip(r.body.error);return;}
  assert.equal(r.status,200,JSON.stringify(r.body));assert.ok(r.body.history.barCount>0);assert.ok(r.body.trades.length>0);
  const tool=await executeTool('backtest',options,{request,signals:server.signals});assert.deepEqual(tool.trades,r.body.trades);
  const h=await call(`/backtest/history?symbol=SOL&from=${options.from}&to=${options.to}`);assert.equal(h.status,200);assert.equal(h.body.networkRequests,0);
  const prediction={kind:'predict',symbol:'SOL',from:options.from,to:options.to,strike:h.body.candles[0].close,liquidityUsdc:1000};
  const model=await executeTool('backtest',prediction,{request,signals:server.signals});assert.equal(model.kind,'predict');assert.match(model.model.pool,/Counterfactual/);
});
