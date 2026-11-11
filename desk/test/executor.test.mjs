/** Gate/ledger integration with real SQLite and public local policy state; no fake RPC. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {Memory} from '../main/memory.mjs';
import {Executor} from '../main/executor.mjs';
import {SignalQueue} from '../main/signals.mjs';
import {Permissions,validatePolicy} from '../main/permissions.mjs';
import {decide} from '../main/decide.mjs';
const signal = {symbol:'SOL',kind:'spot',side:'BUY',sizeUsd:10,venue:'jupiter'};
async function setup() {
 const dir = await mkdtemp(path.join(tmpdir(),'xorr-executor-')),mem = new Memory({db:path.join(dir,'memory.db')}),signals = new SignalQueue({journal:e => mem.journal(e)});
 await mem.setReference('risk/limits',{allow:['SOL'],max_trade_usd:100,max_day_usd:1000});
 const proposal = {signal,verdict:decide(signal,await mem.recallBrief(),{policy:validatePolicy({})}),routing:null};
 const e = await signals.create(proposal); await signals.accept(e.id);
 return {dir,mem,signals,e,close:async () => {signals.close();mem.stop();await rm(dir,{recursive:true,force:true});}};
}
test('executor defaults to phone, persists opt-in mode and refuses disarmed execution before building',async () => {
 const x = await setup();
 try {
  const executor = new Executor({...x,isArmed:() => false}); assert.equal(executor.mode(),'phone');
  assert.throws(() => executor.setMode('unknown'));
  executor.setMode('session'); assert.equal(new Executor(x).mode(),'session');
  const r = await executor.execute(x.e.id); assert.equal(r.ok,false); assert.match(r.error,/disarmed/);
  assert.equal(x.signals.get(x.e.id).state,'failed');
  await assert.rejects(executor.completePhone(x.e.id,{signature:'invalid'}),/no pending/);
 } finally {await x.close();}
});
test('fresh permissions and remembered rules veto previously accepted execution without chain access',async () => {
 const x = await setup();
 try {
  new Permissions({dir:x.dir}).write({marketDenylist:['SOL']});
  const r = await new Executor(x).execute(x.e.id); assert.match(r.error,/permissions.denylist/); assert.equal(r.ok,false);
  assert.equal(x.signals.get(x.e.id).state,'failed');
 } finally {await x.close();}
 const y = await setup();
 try {
  await y.mem.setEntity('rule','stop-sol',{accepted:true,symbol:'SOL',text:'no SOL'});
  assert.match((await new Executor(y).execute(y.e.id)).error,/memory.rule.stop-sol/);
 } finally {await y.close();}
});
for (const status of ['reserved','signed','executed']) test(`persisted ${status} ledger prevents cap bypass after executor restart`,async () => {
 const x = await setup();
 try {
  new Permissions({dir:x.dir}).write({maxDayUsd:15});
  // Public permission accounting parameters, not a manufactured chain result.
  await writeFile(path.join(x.dir,'execution-ledger.json'),JSON.stringify({prior:{usd:10,at:Date.now(),status,symbol:'ETH',side:'BUY'}}));
  const executor = new Executor(x), r = await executor.execute(x.e.id);
  assert.equal(r.ok,false); assert.match(r.error,/permissions.per_day/);
 } finally {await x.close();}
});
test('persisted open-position reservation blocks another market independently of daily cap',async () => {
 const x = await setup();
 try {
  new Permissions({dir:x.dir}).write({maxOpenPositions:1});
  await writeFile(path.join(x.dir,'execution-ledger.json'),JSON.stringify({prior:{usd:1,at:Date.now(),status:'reserved',symbol:'ETH',side:'BUY'}}));
  assert.match((await new Executor(x).execute(x.e.id)).error,/permissions.positions/);
 } finally {await x.close();}
});
