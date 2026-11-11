/** Real HTTP server + memory + live quotes; no mocked responses. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Memory} from '../main/memory.mjs';
process.env.PAD_TOKEN='xorrpad-t1-http-test';
const {createServer,state}=await import('../main/server.mjs');
const unavailable=e=>/fetch failed|ECONN|ENOTFOUND|timeout|timed out|HTTP (408|429|5\d\d)/i.test(e.message);
test('authenticated router, venue health, four pad keys, propose and acceptance re-gate',{timeout:180000},async t=>{
 const mem=new Memory({db:`/tmp/xorrpad-aggregate-${process.pid}.db`}),server=createServer(mem);
 await new Promise((r,j)=>{server.once('error',j);server.listen(8717,'127.0.0.1',r);});
 const base='http://127.0.0.1:8717',headers={authorization:'Bearer xorrpad-t1-http-test','content-type':'application/json'};
 const post=async(path,body)=>{const r=await fetch(base+path,{method:'POST',headers,body:JSON.stringify(body)});assert.equal(r.status,200);return r.json();};
 try{
  for(const path of ['/route','/venues','/propose'])assert.equal((await fetch(base+path)).status,401);
  assert.equal((await fetch(base+'/route',{method:'POST',headers})).status,405);
  assert.equal((await fetch(base+'/propose',{headers})).status,405);
  assert.equal((await fetch(base+'/route?kind=spot&market=SOL&side=short&size=1',{headers})).status,400);
  const health=await (await fetch(base+'/venues',{headers})).json();
  assert.deepEqual(health.venues.map(v=>v.venue),['jupiter','meteora','phoenix','jupperps','pmamm']);
  for(const v of health.venues){if(!v.ok)throw new Error(v.error);assert.ok(v.marketCount>=0);}
  console.log(`REAL /venues counts: ${health.venues.map(v=>`${v.venue}=${v.marketCount}`).join(', ')}`);
  await mem.setReference('risk/limits',{allow:['SOL'],max_trade_usd:10,max_day_usd:100,max_leverage:2});
  await mem.setEntity('position','SOL',{qty:1,avg_entry_usd:80});
  for(const id of ['buy','sell','long','short']){
   const r=await post('/key',{id,market:'SOL',leverage:2});
   if(!r.routing?.best){const errors=r.routing?.alternatives?.map(a=>a.error).join('; ');if(errors)throw new Error(errors);}
   assert.equal(r.verdict.action,'EXECUTE',JSON.stringify(r));assert.ok(r.routing.best);
   assert.equal(r.verdict.sizeUsd,10);assert.equal(r.signal.venue,r.routing.best.venue);
   console.log(`REAL pad ${id}: ${r.signal.venue}, $${r.verdict.sizeUsd} gated`);
  }
  const proposal=await post('/propose',{kind:'perp',market:'SOL',side:'long',size:20,leverage:2});
  assert.ok(proposal.routing.best);assert.equal(proposal.verdict.sizeUsd,10);
  await mem.setReference('risk/limits',{allow:[],max_trade_usd:10,max_day_usd:100,max_leverage:2});
  const accepted=await post('/key',{id:'yes'});
  assert.equal(accepted.ok,false);assert.equal(accepted.verdict.action,'REJECT');assert.equal(accepted.transaction,undefined);
  assert.equal(state.pending,null);console.log('REAL YES: refreshed allowlist refused pending proposal');
 }catch(e){if(!unavailable(e))throw e;console.log(`SKIP: aggregate HTTP live dependency unreachable: ${e.message}`);t.skip(`venue unreachable: ${e.message}`);}
 finally{await new Promise(r=>server.close(r));mem.stop();state.pending=null;}
});
