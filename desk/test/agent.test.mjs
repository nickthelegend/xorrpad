/** T3 unit/integration checks use real disk, real queue and real providers; no mocks. */
import {test} from 'node:test';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {mkdtemp,rm,readdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Credentials} from '../main/credentials.mjs';
import {LLM,providerConfig} from '../main/llm.mjs';
import {AgentSettings} from '../main/agent-settings.mjs';
import {Chats} from '../main/chats.mjs';
import {DEFAULT_PERSONA,assemblePrompt,proposalSpeech} from '../main/persona.mjs';
import {TOOLS,validateTool,executeTool} from '../main/agent-tools.mjs';
import {SignalQueue} from '../main/signals.mjs';
import {decide} from '../main/decide.mjs';
import {validatePolicy} from '../main/permissions.mjs';
import {DeepgramVoice} from '../main/voice-deepgram.mjs';
const temporary=async fn=>{const dir=await mkdtemp(path.join(tmpdir(),'xorr-t3-'));try{return await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}};

test('provider defaults, arbitrary compatible URL and URL credential rejection',()=>{
  assert.deepEqual(providerConfig(),{provider:'ollama',baseUrl:'http://localhost:11434',model:''});
  assert.equal(providerConfig({provider:'anthropic'}).model,'claude-haiku-5-5');
  assert.equal(providerConfig({provider:'openai',baseUrl:'https://openrouter.ai/api/v1/'}).baseUrl,'https://openrouter.ai/api/v1');
  for(const config of [{provider:'unknown'},{baseUrl:'file:///tmp/model'},{baseUrl:'https://user:password@example.com'},{baseUrl:'https://example.com?key=blocked'},{provider:'anthropic',baseUrl:'https://example.com'},{model:42}])assert.throws(()=>providerConfig(config));
});
test('missing provider keys fail before network access',async()=>{
  for(const provider of ['anthropic','openai']) {
    const llm=new LLM({provider});
    await assert.rejects(llm.models(),new RegExp(`Setup required: ${provider} API key`));
    await assert.rejects(llm.chat({messages:[{role:'user',content:'Hello'}]}),/Setup required:/);
  }
});
test('keys cannot be saved as plaintext in a Node backend',async()=>temporary(async dir=>{
  const credentials=new Credentials({dir});
  assert.equal(await credentials.masked('anthropic'),'');
  await assert.rejects(credentials.set('anthropic','storage-rejection-check'),/Setup required: Electron safeStorage encryption/);
  assert.deepEqual(await readdir(dir),[]);
  await assert.rejects(credentials.get('../escape'),/invalid credential/);
}));
test('settings persist provider, model and editable persona; reset preserves provider',async()=>temporary(async dir=>{
  const settings=new AgentSettings({dir});assert.equal(settings.read().persona,DEFAULT_PERSONA);
  settings.update({provider:'anthropic',model:'claude-haiku-5-5',baseUrl:'https://api.anthropic.com/v1'});
  settings.update({persona:'Keep it calm, ser.'});
  const restored=new AgentSettings({dir});assert.equal(restored.read().provider,'anthropic');assert.equal(restored.read().persona,'Keep it calm, ser.');
  assert.equal(restored.update({resetPersona:true}).persona,DEFAULT_PERSONA);
  assert.equal(restored.read().model,'claude-haiku-5-5');
  for(const body of [{apiKey:'must-not-persist'},{persona:''},{persona:'x'.repeat(8001)}])assert.throws(()=>settings.update(body));
  assert.ok(!(await readFile(settings.file,'utf8')).includes('must-not-persist'));
}));
test('persona prompt preserves exact decimals, unknown values and fixed trading truth',()=>{
  const prompt=assemblePrompt({persona:'Speak quietly.',brief:{limits:{max_trade_usd:'23.456789'}},market:{price:'0.000012345678901',fees:null,liquidation:null}});
  for(const value of ['Speak quietly.','23.456789','0.000012345678901','"fees":null','"liquidation":null','venue and risk','confirmed signature','propose_trade','unavailable'])assert.ok(prompt.includes(value),value);
  assert.match(assemblePrompt(),/ser/);assert.match(assemblePrompt(),/we're so back/);
});
test('spoken proposal uses gated size, exact quote values, venue and risk',()=>{
  const text=proposalSpeech({signal:{side:'LONG',symbol:'SOL',kind:'perp'},verdict:{sizeUsd:'1.23456789',why:['permission cap']},routing:{best:{venue:'phoenix',price:'23.45678901',fees:{usd:'0.000001234'},quote:{liquidationPrice:'21.123456789'}}}});
  for(const number of ['1.23456789','23.45678901','0.000001234','21.123456789'])assert.ok(text.includes(number));
  assert.match(text,/phoenix/);assert.match(text,/Risk: leverage/);assert.match(text,/No confirmed execution without a signature/);
  const unknown=proposalSpeech({signal:{side:'BUY',symbol:'SOL'},verdict:{sizeUsd:0},routing:null});assert.match(unknown,/Fees unavailable/);assert.match(unknown,/Liquidation unavailable/);
});
test('chat persistence, tool/result metadata, search, rename, delete and Markdown export',async()=>temporary(async dir=>{
  const chats=new Chats({dir});const c=chats.create({title:'Desk notes',provider:'ollama',model:'operator-selected'});
  chats.append(c.id,{role:'user',content:'Explain my limits'});
  const result=decide({side:'BUY',symbol:'SOL',kind:'spot',venue:'jupiter',sizeUsd:1000},{limits:{allow:['SOL'],max_trade_usd:1,max_day_usd:1},spent_today:1},{policy:validatePolicy({})});
  chats.append(c.id,{role:'assistant',content:'Checking the gate.',model:'operator-selected',provider:'ollama',toolCalls:[{id:'refusal-read',name:'explain_refusal',arguments:{signalId:'local-rule-check'}}]});
  chats.append(c.id,{role:'tool',name:'explain_refusal',toolCallId:'refusal-read',content:JSON.stringify(result),model:'operator-selected',provider:'ollama'});
  const disk=new Chats({dir});assert.equal(disk.get(c.id).messages.length,3);assert.equal(disk.get(c.id).model,'operator-selected');
  assert.equal(disk.list('explain_refusal')[0].id,c.id);assert.equal(disk.list('missing-search-term').length,0);
  assert.match(disk.markdown(c.id),/explain_refusal/);assert.ok(disk.markdown(c.id).includes(result.ruleId));
  disk.rename(c.id,'Limits · ser');assert.equal(new Chats({dir}).get(c.id).title,'Limits · ser');
  assert.throws(()=>disk.rename(c.id,''));assert.throws(()=>disk.get('../escape'));
  disk.delete(c.id);assert.equal(disk.list().length,0);assert.throws(()=>disk.get(c.id),/not found/);
}));
test('chat turn lock rejects overlapping mutations and repairs an interrupted tool pair',async()=>temporary(async dir=>{
  const chats=new Chats({dir}),c=chats.create();
  chats.append(c.id,{role:'assistant',content:'',toolCalls:[{id:'interrupted',name:'positions',arguments:{venue:'spot'}}]});
  await chats.turn(c.id,async stored=>{
    assert.equal(stored.messages.at(-1).role,'tool');assert.match(stored.messages.at(-1).content,/interrupted/);
    assert.throws(()=>chats.delete(c.id),/answering/);assert.throws(()=>chats.rename(c.id,'x'),/answering/);
    await assert.rejects(chats.turn(c.id,()=>{}),/answering/);
  });
  chats.rename(c.id,'Recovered');assert.equal(chats.get(c.id).title,'Recovered');
}));
test('agent tools reject gate bypass fields and signing tools',()=>{
  assert.deepEqual(TOOLS.map(t=>t.name),['route','propose_trade','positions','pm_markets','pm_stats','backtest','explain_refusal']);
  const proposal={kind:'spot',market:'SOL',side:'buy',size:1,reason:'operator request'};
  validateTool('propose_trade',proposal);
  for(const extra of [{autoAccept:true},{signature:'not-a-receipt'},{verdict:{action:'EXECUTE'}},{size:0},{size:NaN},{size:'1'},{leverage:0}])assert.throws(()=>validateTool('propose_trade',{...proposal,...extra}));
  for(const name of ['sign','accept','execute','set_policy'])assert.throws(()=>validateTool(name,{}),/unknown/);
});
test('explain_refusal reads the actual gate and queue; no execution receipt appears',async()=>{
  const policy=validatePolicy({}),signal={side:'BUY',kind:'spot',venue:'jupiter',symbol:'SOL',sizeUsd:10};
  const verdict=decide(signal,{limits:{allow:[],max_trade_usd:1,max_day_usd:1}},{policy});
  const signals=new SignalQueue();
  try {
    const entry=await signals.create({signal,verdict,routing:null});
    assert.equal(entry.state,'refused');const result=await executeTool('explain_refusal',{signalId:entry.id},{signals});
    assert.equal(result.ruleId,verdict.ruleId);assert.deepEqual(result.why,verdict.why);assert.equal(result.signature,undefined);
  }finally{signals.close();}
});
test('Deepgram missing key is actionable for STT and TTS',async()=>{
  const voice=new DeepgramVoice();await assert.rejects(voice.transcribeLive(),/Setup required: Deepgram API key/);
  await assert.rejects(voice.speak('Ser, check the venue and risk.'),/Setup required: Deepgram API key/);
});
test('real localhost Ollama model list and provider chat', {timeout:90000},async t=>{
  try {
    const probe=await fetch('http://localhost:11434/api/tags',{signal:AbortSignal.timeout(2000)});
    if(!probe.ok)throw new Error('localhost Ollama HTTP '+probe.status);
  }catch(e){return t.skip('Ollama is not reachable on localhost: '+e.message);}
  const llm=new LLM(),models=await llm.models();
  if(!models.length)return t.skip('Setup required: pull an Ollama model');
  assert.ok(models.every(m=>typeof m.id==='string'));
  const configured=new LLM({model:models[0].id});
  const response=await configured.chat({messages:[{role:'user',content:'Say hello in one short sentence.'}],system:assemblePrompt()});
  assert.equal(response.role,'assistant');assert.ok(response.content.trim());assert.equal(response.provider,'ollama');
});
test('live Anthropic /models and specified default model', {timeout:90000},async t=>{
  if(!process.env.ANTHROPIC_API_KEY)return t.skip('ANTHROPIC_API_KEY is not set in the environment; no config files read');
  const llm=new LLM({provider:'anthropic'},{getKey:async()=>process.env.ANTHROPIC_API_KEY});
  const models=await llm.models();assert.ok(models.length);
  const response=await llm.chat({system:assemblePrompt(),messages:[{role:'user',content:'Say hello in one short sentence.'}]});
  assert.ok(response.content.trim());assert.equal(response.provider,'anthropic');
});
test('live Deepgram Aura PCM streams back through Nova-3', {timeout:120000},async t=>{
  if(!process.env.DEEPGRAM_API_KEY)return t.skip('DEEPGRAM_API_KEY is not set in the environment; no config files read');
  const voice=new DeepgramVoice({getKey:async()=>process.env.DEEPGRAM_API_KEY}),audio=[];
  const pcm=await voice.speak('Hello ser. Check the venue and risk before trading.',{onAudio:c=>audio.push(c)});
  assert.ok(pcm.length>3200);assert.notEqual(pcm.subarray(0,4).toString(),'RIFF');
  assert.ok(audio.length>1);assert.equal(audio.at(-1).end,true);assert.ok(audio.every((c,i)=>c.seq===i&&c.pcm.length<=512&&c.pcm.length%2===0));
  assert.deepEqual(Buffer.concat(audio.map(c=>c.pcm)),pcm);
  const updates=[],live=await voice.transcribeLive({onTranscript:t=>updates.push(t)});
  try {for(let i=0;i<pcm.length;i+=512)live.write(pcm.subarray(i,i+512));const text=await live.finish();assert.match(text,/venue|risk|trading/i);assert.ok(updates.some(t=>t.final));}
  finally{live.abort();}
});

test('real Electron safeStorage encrypts keys and only lists last four characters',{timeout:30000},async t=>{
  const require=createRequire(import.meta.url);let binary;
  try{
    const pkg=path.dirname(require.resolve('electron'));
    if(!existsSync(path.join(pkg,'path.txt')))return t.skip('Electron binary is not installed');
    const executable=readFileSync(path.join(pkg,'path.txt'),'utf8').trim();
    binary=path.join(pkg,'dist',executable);
    if(!existsSync(binary))return t.skip('Electron binary is not installed');
  }catch{return t.skip('Electron is not installed');}
  const result=await new Promise((resolve,reject)=>{
    const child=spawn(binary,[fileURLToPath(new URL('./safe-storage-check.mjs',import.meta.url))],{stdio:['ignore','pipe','pipe'],env:{...process.env,ELECTRON_RUN_AS_NODE:''}});
    let output='';child.stdout.on('data',b=>{output+=b;});child.stderr.resume();child.on('error',reject);
    const timer=setTimeout(()=>{child.kill('SIGTERM');reject(new Error('Electron safeStorage check timed out'));},25000);
    child.on('close',code=>{clearTimeout(timer);resolve({code,output});});
  });
  if(result.output.includes('SKIP:'))return t.skip(result.output.trim());
  assert.equal(result.code,0,'Electron safeStorage check failed');assert.match(result.output,/PASS: real Electron safeStorage/);
});
