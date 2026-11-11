/** Actual authenticated desk HTTP server, SQLite memory and tool routing. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Memory} from '../main/memory.mjs';
import {executeTool} from '../main/agent-tools.mjs';
process.env.PAD_TOKEN='xorr-t3-http';
const {createServer,state}=await import('../main/server.mjs');
const base='http://127.0.0.1:8727',headers={authorization:'Bearer xorr-t3-http','content-type':'application/json'};

test('chats, models, persona and agent tools use real authenticated desk routes',{timeout:30000},async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'xorr-t3-http-'));process.env.XORR_USER_DATA=dir;
  const mem=new Memory({db:path.join(dir,'memory.db')}),server=createServer(mem);
  await new Promise((r,j)=>{server.once('error',j);server.listen(8727,'127.0.0.1',r);});
  const call=async(route,body,method=body?'POST':'GET')=>{
    const response=await fetch(base+route,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,body:await response.json()};
  };
  const request=async(route,body)=>{const r=await call(route,body);if(r.status>=400)throw Object.assign(new Error(r.body.error),{status:r.status});return r.body;};
  try {
    for(const route of ['/chats','/chats/missing','/agent/settings','/agent/models','/agent/keys','/agent/chat'])assert.equal((await fetch(base+route)).status,401,route);
    assert.equal((await call('/chats',{},'PUT')).status,405);
    assert.equal((await call('/chats/missing',{},'PUT')).status,405);
    assert.equal((await call('/agent/models',{})).status,405);
    const created=await call('/chats',{title:'Gate notes'});assert.equal(created.status,201);const id=created.body.id;
    assert.equal((await call('/chats/'+id)).body.title,'Gate notes');
    assert.equal((await call('/chats/'+id,{title:'Renamed notes'},'PATCH')).body.title,'Renamed notes');
    assert.equal((await call('/chats?search=renamed')).body.length,1);
    const exported=await fetch(base+'/chats/'+id+'?export=markdown',{headers});assert.match(exported.headers.get('content-type'),/text\/markdown/);assert.match(await exported.text(),/# Renamed notes/);
    assert.equal((await call('/agent/settings',{provider:'anthropic',model:'claude-haiku-5-5',baseUrl:'https://api.anthropic.com/v1'})).status,200);
    assert.equal((await call('/agent/models')).status,503);
    const failure=await call('/chats/'+id,{message:'Show my positions',speak:false});assert.equal(failure.status,503);assert.match(failure.body.error,/anthropic API key/);
    const stored=(await call('/chats/'+id)).body;assert.equal(stored.messages.length,1);assert.equal(stored.messages[0].role,'user');assert.equal(stored.messages[0].model,'claude-haiku-5-5');
    assert.equal((await call('/agent/settings',{persona:'Short and calm.'})).body.persona,'Short and calm.');
    assert.match((await call('/agent/settings',{resetPersona:true})).body.persona,/desk-trader friend/);
    assert.equal((await call('/agent/settings',{key:'refused'})).status,400);
    const crossOrigin=await fetch(base+'/setup',{method:'POST',headers:{'content-type':'application/json',origin:'https://example.com'},body:JSON.stringify({deepgram:'storage-rejection-check'})});
    assert.equal(crossOrigin.status,403);
    assert.equal((await call('/setup',{deepgram:'storage-rejection-check'})).status,503);
    assert.ok(!(await readdir(dir)).includes('.env'));
    assert.equal((await call('/agent/keys',{provider:'openai',key:'storage-rejection-check'})).status,503);
    await mem.setReference('risk/limits',{allow:[],max_trade_usd:1,max_day_usd:1});
    const proposed=await executeTool('propose_trade',{kind:'spot',market:'SOL',side:'buy',size:10,reason:'test gate refusal'},{request,signals:server.signals});
    assert.equal(proposed.signalState,'refused');assert.equal(proposed.routing,null);
    const explanation=await executeTool('explain_refusal',{signalId:proposed.signalId},{request,signals:server.signals});assert.equal(explanation.ruleId,'memory.allowlist');
    assert.equal(server.signals.get(proposed.signalId).state,'refused');assert.equal(server.signals.get(proposed.signalId).receipt,undefined);
    assert.equal((await call('/backtest')).status,200);
    await assert.rejects(executeTool('backtest',{symbol:'SOL',strategy:'momentum',from:1,to:2,venue:'jupiter'},{request,signals:server.signals}),/invalid strategy/);
    assert.equal((await call('/chats/'+id,undefined,'DELETE')).status,200);assert.equal((await call('/chats/'+id)).status,404);
    assert.equal((await call('/chats/missing',{})).status,404);
  }finally{
    await new Promise(r=>server.close(r));mem.stop();state.pending=null;state.armed=true;
    delete process.env.XORR_USER_DATA;await rm(dir,{recursive:true,force:true});
  }
});
