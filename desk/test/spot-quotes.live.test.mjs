import test from 'node:test';
import assert from 'node:assert/strict';
import { SpotQuotes, SPOT_QUOTE_TTL } from '../main/spot-quotes.mjs';
test('directory rejects unbounded requests before any upstream call',async()=>{
  await assert.rejects(new SpotQuotes().get(Array(13).fill('SOL')),/1–12/);
});
test('real Jupiter spot directory quote shares a 15s cache',async t=>{
  const cache=new SpotQuotes(), first=await cache.get(['SOL']);
  if(first.quotes[0].error){t.skip('Jupiter unavailable: '+first.quotes[0].error);return;}
  assert.ok(first.quotes[0].price>0);
  assert.equal(first.cacheMs,SPOT_QUOTE_TTL);
  assert.equal(SPOT_QUOTE_TTL,15000);
  assert.deepEqual(await cache.get(['SOL']),first);
});
