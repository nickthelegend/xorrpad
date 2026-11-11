/** Policy inputs are pure unit parameters; no venue/network responses are substituted. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Permissions,DEFAULT_POLICY,checkPolicy,validatePolicy} from '../main/permissions.mjs';
import {decide} from '../main/decide.mjs';
const now = Date.parse('2026-11-12T23:30:00Z');
const signal = {symbol:'SOL',venue:'phoenix',kind:'perp',side:'LONG',sizeUsd:10,leverage:2};
const brief = {limits:{max_trade_usd:1000,max_day_usd:10000,max_leverage:50,allow:['SOL']},spent_today:0,positions:{},journal_recent:[]};
const policy = extra => validatePolicy({...DEFAULT_POLICY,...extra});
const verdict = (p,b=brief,s=signal) => decide(s,b,{policy:p,now});
const cases = [
 ['per_trade',{maxTradeUsd:9}], ['per_day',{maxDayUsd:9}], ['leverage',{maxLeverage:1}],
 ['positions',{maxOpenPositions:0}], ['allowlist',{marketAllowlist:['ETH']}],
 ['denylist',{marketDenylist:['SOL'],marketAllowlist:['SOL']}], ['venue',{venueAllowlist:[]}],
 ['cooldown',{cooldownSeconds:60},{...brief,journal_recent:[{ts:new Date(now-1000).toISOString(),acted:JSON.stringify({executed:true})}]}],
 ['quiet_hours',{quietHours:{start:'23:00',end:'01:00',timeZone:'UTC'}}],
];
for (const [rule,extra,b] of cases) test(`permission ${rule} refuses independently`,() => {
 const v = verdict(policy(extra),b); assert.equal(v.action,'REJECT'); assert.equal(v.ruleId,`permissions.${rule}`); assert.equal(v.autoAccept,false);
 assert.deepEqual(v.rules,['memory.allowed',`permissions.${rule}`]);
});
test('auto-accept requires venue AND kind; always-ask forces manual acceptance',() => {
 assert.equal(verdict(policy({})).autoAccept,false);
 assert.equal(verdict(policy({autoAccept:{venues:{phoenix:true}}})).autoAccept,false);
 assert.equal(verdict(policy({autoAccept:{kinds:{perp:true}}})).autoAccept,false);
 const auto = {autoAccept:{venues:{phoenix:true},kinds:{perp:true}}};
 assert.equal(verdict(policy(auto)).autoAccept,true);
 const ask = verdict(policy({...auto,alwaysAskAboveUsd:9}));
 assert.equal(ask.action,'EXECUTE'); assert.equal(ask.ruleId,'permissions.always_ask'); assert.equal(ask.autoAccept,false);
 assert.equal(verdict(policy({...auto,alwaysAskAboveUsd:10})).autoAccept,true);
});
test('policy counts executed daily spend, pending reservations and position reservations',() => {
 assert.equal(verdict(policy({maxDayUsd:15}),{...brief,spent_today:6}).ruleId,'permissions.per_day');
 assert.equal(checkPolicy(signal,brief,policy({maxDayUsd:15}),{reservedUsd:6}).ruleId,'permissions.per_day');
 assert.equal(checkPolicy(signal,brief,policy({maxOpenPositions:1}),{reservedPositions:1}).ruleId,'permissions.positions');
 assert.equal(verdict(policy({maxOpenPositions:1}),{...brief,positions:{SOL:{qty:1}}}).action,'EXECUTE');
 assert.equal(verdict(policy({maxOpenPositions:0}),{...brief,positions:{SOL:{qty:1}}},{...signal,kind:'spot',side:'SELL'}).action,'EXECUTE');
});
test('quiet hours handle timezone, midnight wrapping, boundaries and a full day',() => {
 const p = policy({quietHours:{start:'23:00',end:'01:00',timeZone:'UTC'}});
 assert.equal(checkPolicy(signal,brief,p,{now:Date.parse('2026-11-12T23:00Z')}).action,'REJECT');
 assert.equal(checkPolicy(signal,brief,p,{now:Date.parse('2026-11-13T01:00Z')}).action,'EXECUTE');
 assert.equal(verdict(policy({quietHours:{start:'04:00',end:'06:00',timeZone:'Asia/Kolkata'}})).ruleId,'permissions.quiet_hours');
 assert.equal(verdict(policy({quietHours:{start:'00:00',end:'00:00'}})).action,'REJECT');
});
test('memory veto runs before policy and size clamp cannot be expanded by permissions',() => {
 const v = verdict(policy({}),{...brief,rules:[{id:'veto',symbol:'SOL',text:'no SOL'}]});
 assert.equal(v.ruleId,'memory.rule.veto'); assert.deepEqual(v.rules,['memory.rule.veto']);
 assert.equal(verdict(policy({}),{...brief,limits:{...brief.limits,max_trade_usd:5}}).sizeUsd,5);
 assert.equal(verdict(policy({maxTradeUsd:4}),{...brief,limits:{...brief.limits,max_trade_usd:5}}).ruleId,'permissions.per_trade');
 assert.equal(verdict(policy({}),brief,{...signal,sizeUsd:NaN}).ruleId,'memory.invalid_size');
});
test('policy persists public fields, rejects secrets/invalid values, and fails closed when corrupt',async () => {
 const dir = await mkdtemp(path.join(tmpdir(),'xorr-policy-'));
 try {
  const store = new Permissions({dir}); assert.deepEqual(store.read(),validatePolicy(DEFAULT_POLICY));
  const p = policy({marketAllowlist:['SOL'],cooldownSeconds:9}); store.write(p);
  assert.deepEqual(new Permissions({dir}).read(),p);
  const data = await readFile(store.file,'utf8'); assert.deepEqual(JSON.parse(data),p);
  for (const bad of [{secretKey:'forbidden'},{constructor:'forbidden'},{maxTradeUsd:NaN},{maxDayUsd:-1},{maxOpenPositions:1.5},
   {marketDenylist:null},{autoAccept:{venues:{phoenix:1}}},{quietHours:{start:'25:00',end:'02:00'}},
   {quietHours:{start:'01:00',end:'02:00',timeZone:'invalid'}}]) assert.throws(() => store.write(bad));
  const previous = process.env.XORR_USER_DATA; process.env.XORR_USER_DATA = dir;
  try {
   await writeFile(store.file,'{');
   assert.throws(() => store.read());
   assert.equal(decide(signal,brief).ruleId,'permissions.invalid_policy');
   assert.equal(decide({...signal,sizeUsd:0},brief).ruleId,'memory.invalid_size');
  } finally {if (previous === undefined) delete process.env.XORR_USER_DATA; else process.env.XORR_USER_DATA = previous;}
 } finally { await rm(dir,{recursive:true,force:true}); }
});
