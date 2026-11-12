import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validatePriceAlerts} from '../main/price-alerts.mjs';
const mint='So11111111111111111111111111111111111111112';
const rule={id:'sol',mint,usd:100,above:true};
test('desk price alerts validate bounded public rules and clear list',()=>{
 assert.deepEqual(validatePriceAlerts([rule]),[rule]);assert.deepEqual(validatePriceAlerts([]),[]);
 for(const value of [null,{},Array(9).fill(rule),[rule,rule],[{...rule,usd:NaN}],[{...rule,usd:0}],[{...rule,above:'buy'}],[{...rule,mint:'https://evil.invalid'}],[{...rule,action:'buy'}]])assert.throws(()=>validatePriceAlerts(value));
});
test('captured price fixture is a real Jupiter v3 response and pinned CA stays public',()=>{
 const data=JSON.parse(readFileSync(new URL('../../firmware/test/fixtures/jupiter-price-v3.json',import.meta.url)));
 assert.ok(data[mint].usdPrice>0);assert.ok(Number.isSafeInteger(data[mint].blockId));
 const certs=readFileSync(new URL('../../firmware/xorrpad/certs.h',import.meta.url),'utf8');
 assert.ok(certs.includes('JUPITER_ROOT_CA'));assert.ok(certs.includes('AmazonRootCA1.pem'));
});
