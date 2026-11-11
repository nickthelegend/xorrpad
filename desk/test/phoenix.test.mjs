import { test } from "node:test";
import assert from "node:assert/strict";
import { authorityKey,perpQuote,buildOpen,buildClose,swap } from "../main/chains/phoenix.mjs";
import { parseOutcome,losingSide } from "../main/hedge.mjs";
import { decide } from "../main/decide.mjs";
import { catalog,TOKENS,tokenOf } from "../main/spot-book.mjs";

test("Phoenix never signs, requires an on-curve public authority and validates sizing",async()=>{
  await assert.rejects(swap(),/never signs/);
  const old=process.env.PHOENIX_AUTHORITY;delete process.env.PHOENIX_AUTHORITY;
  try {
    assert.throws(()=>authorityKey(),/Setup required: PHOENIX_AUTHORITY/);
    for(const fn of [buildOpen,buildClose]) await assert.rejects(fn({}),/Setup required: PHOENIX_AUTHORITY/);
    assert.throws(()=>authorityKey("invalid"),/invalid PHOENIX_AUTHORITY/);
  } finally {if(old!==undefined)process.env.PHOENIX_AUTHORITY=old;}
  await assert.rejects(perpQuote({side:"buy",usd:10,leverage:2}),/side must/);
  await assert.rejects(perpQuote({side:"long",usd:-1,leverage:2}),/usd must/);
  await assert.rejects(perpQuote({side:"short",usd:10,leverage:Infinity}),/usd must/);
});
test("every catalog mint is allowlisted and ambiguous tickers never select a token",()=>{
  const mints=new Set(Object.values(TOKENS).map(t=>t.mint));
  for(const t of catalog.spotMarkets) if(t.jupiter)assert.ok(mints.has(t.mint),t.mint);
  for(const symbol of Object.keys(TOKENS))assert.match(symbol,/^[A-Za-z0-9._:@-]+$/);
  const duplicates=catalog.spotMarkets.filter(t=>t.symbol.toUpperCase()==="STORE");
  assert.ok(duplicates.length>1);
  assert.throws(()=>tokenOf("stORE"),/unambiguous/);
  for(const t of duplicates)assert.equal(tokenOf(t.mint).mint,t.mint);
  assert.equal(tokenOf("SOL").decimals,9);
});
test("numeric hedge payout is adverse to the actual position for every supported operator",()=>{
  const endTs=Date.parse("2026-12-01T08:00:00Z")/1000;
  for(const operator of [">",">=","<","<="]) {
    for(const side of ["long","short"]) {
      const threshold=side==="long"?90:110, price=side==="long"?85:115;
      const outcome=parseOutcome({name:`SOL${operator}${threshold} by 2026-12-01 08:00Z`,endTs});
      assert.ok(outcome);
      const selected=losingSide({market:"SOL",side,entryPrice:100},outcome);
      const yes=operator.startsWith(">")?price>threshold:price<threshold;
      assert.equal(selected==="yes"?yes:!yes,true);
      assert.ok((side==="long"?1:-1)*(price-100)<0);
      assert.equal(losingSide({market:"BTC",side,entryPrice:100},outcome),null);
    }
  }
  assert.equal(parseOutcome({name:"Will SOL win?",endTs}),null);
  assert.equal(parseOutcome({name:"SOL>90 by 2026-12-01 08:00Z",endTs:endTs+3600}),null);
});
test("the existing gate can refuse a hedge outcome and caps an explicitly allowed proposal",()=>{
  const signal={agent:"hedge",side:"BUY",symbol:"pmamm:market:yes",sizeUsd:100};
  const brief={limits:{allow:["SOL"],max_trade_usd:40,max_day_usd:100},spent_today:0,rules:[],positions:{}};
  assert.equal(decide(signal,brief).action,"REJECT");
  brief.limits.allow.push(signal.symbol);
  assert.equal(decide(signal,brief).sizeUsd,40);
  brief.spent_today=100;
  assert.equal(decide(signal,brief).action,"REJECT");
});
