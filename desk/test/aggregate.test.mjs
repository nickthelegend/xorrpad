import {test} from 'node:test';
import assert from 'node:assert/strict';
import {route} from '../main/aggregate.mjs';
import {propose,buildRouted} from '../main/propose.mjs';
import {decide} from '../main/decide.mjs';
import * as meteora from '../main/chains/meteora.mjs';
import * as jupperps from '../main/chains/jupperps.mjs';
const brief={limits:{allow:['SOL'],venues:['phoenix'],max_trade_usd:10,max_day_usd:20,max_leverage:2},positions:{},rules:[],spent_today:0};
const signal={kind:'perp',side:'LONG',symbol:'SOL',sizeUsd:30,leverage:2,venue:'phoenix'};
test('router rejects invalid intents before contacting venues',async()=>{
 for(const input of [{kind:'unknown'}, {kind:'spot',market:'SOL',side:'short',size:1},
  {kind:'perp',market:'SOL',side:'long',size:-1}, {kind:'perp',market:'SOL',side:'long',size:1,leverage:Infinity},
  {kind:'spot',market:'stORE',side:'buy',size:1}])await assert.rejects(route(input));
});
test('routed proposals retain market, venue, leverage, daily and remembered-rule gates',async()=>{
 assert.equal(decide(signal,brief).sizeUsd,10);
 for(const sig of [{...signal,venue:'jupperps'},{...signal,leverage:3},{...signal,symbol:'BTC'}, {...signal,sizeUsd:NaN}])assert.equal(decide(sig,brief).action,'REJECT');
 assert.equal(decide(signal,{...brief,spent_today:20}).action,'REJECT');
 assert.equal(decide(signal,{...brief,rules:[{id:'no-long',symbol:'SOL',side:'LONG'}]}).action,'REJECT');
 assert.equal(decide(signal,{...brief,limits:{...brief.limits,cooldown_seconds:60},journal_recent:[{ts:new Date().toISOString(),acted:{executed:true}}]}).action,'REJECT');
 assert.equal(decide({...signal,leverage:2},{...brief,limits:{...brief.limits,max_leverage:undefined}}).action,'REJECT');
 const refused=await propose({...signal,leverage:3},brief);
 assert.equal(refused.verdict.action,'REJECT');assert.equal(refused.routing,null);
 await assert.rejects(buildRouted(refused),/not approved/);
});
test('new builders require explicit owners and never sign or submit',async()=>{
 await assert.rejects(meteora.buildSwap({}),/Setup required: SOLANA_ADDRESS/);
 for(const fn of [jupperps.buildOpen,jupperps.buildClose])await assert.rejects(fn({}),/Setup required: JUPPERPS_AUTHORITY/);
 await assert.rejects(meteora.swap(),/never signs/);await assert.rejects(jupperps.swap(),/never signs/);
});
