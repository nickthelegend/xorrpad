import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {SignalQueue} from '../main/signals.mjs';
import {decide} from '../main/decide.mjs';
import {validatePolicy} from '../main/permissions.mjs';
const brief = {limits:{max_trade_usd:100,max_day_usd:300,allow:['SOL']},spent_today:0};
const signal = {symbol:'SOL',kind:'spot',side:'BUY',venue:'jupiter',sizeUsd:1};
function proposal(auto=false) {
 const policy = validatePolicy(auto ? {autoAccept:{venues:{jupiter:true},kinds:{spot:true}}} : {});
 return {signal,verdict:decide(signal,brief,{policy}),routing:null};
}
test('manual state machine publishes each state and rejects terminal transitions',async () => {
 const q = new SignalQueue(), states = []; q.on('event',e => states.push(e.signal.state));
 try {
  const e = await q.create(proposal()); assert.equal(e.state,'awaiting');
  const snapshot = q.get(e.id); snapshot.state = 'executed'; assert.equal(q.get(e.id).state,'awaiting');
  await assert.rejects(q.transition(e.id,'executed'),/invalid signal transition/);
  assert.equal((await q.accept(e.id)).state,'accepted');
  await assert.rejects(q.accept(e.id),/accepted/);
  await q.transition(e.id,'signed'); await q.transition(e.id,'executed');
  await assert.rejects(q.refuse(e.id),/executed/);
  await assert.rejects(q.transition(e.id,'signed'),/invalid signal transition/);
  assert.deepEqual(states,['proposed','awaiting','accepted','signed','executed']);
 } finally {q.close();}
});
test('auto-accept traverses auto_accepted and accepted; speech failure waits for operator',async () => {
 const q = new SignalQueue(), states=[]; q.on('event',e => states.push(e.signal.state));
 try {const e = await q.create(proposal(true)); assert.equal(e.automatic,true); assert.deepEqual(states,['proposed','auto_accepted','accepted']);}
 finally {q.close();}
 const blocked = new SignalQueue({announce:() => {throw new Error('Setup required: speech');}});
 try {const e = await blocked.create(proposal(true)); assert.equal(e.state,'awaiting'); assert.match(e.setupRequired,/Setup required/);}
 finally {blocked.close();}
});
test('refused, failed and expired signals cannot sign; unanswered timer expires',async () => {
 const q = new SignalQueue({ttlSeconds:.03});
 try {
  const e = await q.create(proposal()); await delay(60); assert.equal(q.get(e.id).state,'expired');
  await assert.rejects(q.accept(e.id),/expired/); await assert.rejects(q.transition(e.id,'signed'),/invalid/);
  const r = await q.create(proposal()); await q.refuse(r.id); await assert.rejects(q.accept(r.id),/refused/);
  const f = await q.create(proposal()); await q.accept(f.id); await q.transition(f.id,'failed'); await assert.rejects(q.transition(f.id,'signed'),/invalid/);
  const rejected = proposal(); rejected.verdict = {...rejected.verdict,action:'REJECT',ruleId:'unit.refused'};
  assert.equal((await q.create(rejected)).state,'refused');
 } finally {q.close();}
});
test('acceptance re-gates, rechecks expiry after gate wait and serializes conflicting answers',async () => {
 let b = brief;
 const q = new SignalQueue({gate:e => ({...e.proposal,verdict:decide(e.proposal.signal,b,{policy:validatePolicy({})})})});
 try {
  const e = await q.create(proposal()); b = {...brief,limits:{...brief.limits,allow:[]}};
  assert.equal((await q.accept(e.id)).state,'refused'); assert.equal(q.get(e.id).ruleId,'memory.allowlist');
  b = brief; const r = await q.create(proposal());
  const results = await Promise.allSettled([q.accept(r.id),q.refuse(r.id)]);
  assert.equal(results[0].status,'fulfilled'); assert.equal(q.get(r.id).state,'refused');
  await assert.rejects(q.accept('missing'),/not found/);
 } finally {q.close();}
 const slow = new SignalQueue({ttlSeconds:.02,gate:async e => {await delay(40); return e.proposal;}});
 try {const e = await slow.create(proposal()); assert.equal((await slow.accept(e.id)).state,'expired');}
 finally {slow.close();}
});
test('panic refuses every waiting/accepted entry and queue requires positive bounded expiry',async () => {
 for (const n of [0,-1,NaN,Infinity,86401]) assert.throws(() => new SignalQueue({ttlSeconds:n}));
 const q = new SignalQueue();
 try {await q.create(proposal()); const e = await q.create(proposal()); await q.accept(e.id); await q.cancelAll(); assert.ok(q.list().every(e => e.state === 'refused'));}
 finally {q.close();}
});

test('trusted confirmation binds the displayed quote through the acceptance gate',async () => {
 const quoted = {...proposal(),routing:{best:{venue:'jupiter',effectivePrice:150,fees:{usd:0.25}}}};
 let changed = false;
 const q = new SignalQueue({gate:e => changed ? {...e.proposal,routing:{best:{...e.proposal.routing.best,effectivePrice:151}}} : e.proposal});
 try {
  const same = await q.create(quoted);
  assert.equal(typeof same.fingerprint,'string');
  await assert.rejects(q.accept(same.id,'wrong!'),/fingerprint changed/);
  assert.equal(q.get(same.id).state,'awaiting');
  assert.equal((await q.accept(same.id,same.fingerprint)).state,'accepted');
  const stale = await q.create(quoted);
  changed = true;
  const refused = await q.accept(stale.id,stale.fingerprint);
  assert.equal(refused.state,'refused');
  assert.equal(refused.ruleId,'signals.quote_changed');
  assert.equal(q.get(stale.id).fingerprint,stale.fingerprint);
 } finally {q.close();}
});
