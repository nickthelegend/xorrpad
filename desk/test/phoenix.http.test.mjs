/** Actual HTTP server, real Rise/API/RPC builds; no mocked service responses. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PublicKey,VersionedTransaction } from "@solana/web3.js";
import { Memory } from "../main/memory.mjs";
process.env.PAD_TOKEN="xorrpad-dev";
const {createServer}=await import("../main/server.mjs");
const unavailable=message=>/fetch failed|timeout|timed out|HTTP (429|50[0234]|403)|ECONN|ENOTFOUND|429|503|502/.test(message);
test("perps routes and Solana Pay enforce auth, owner, methods and fresh unsigned mainnet builds",{timeout:60000},async t=>{
  const mem=new Memory({db:"/tmp/xorrpad-phoenix-http.db"}),server=createServer(mem);
  await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(8712,"127.0.0.1",resolve);});
  const base="http://127.0.0.1:8712", headers={authorization:"Bearer xorrpad-dev","content-type":"application/json"};
  const old=process.env.PHOENIX_PUBLIC_URL;
  try {
    assert.equal((await fetch(base+"/perps/markets")).status,401);
    assert.equal((await fetch(base+"/hedge")).status,401);
    assert.equal((await fetch(base+"/perps/open",{headers})).status,405);
    assert.equal((await fetch(base+"/perps/request/"+"b".repeat(48))).status,410);
    assert.equal((await fetch(base+"/perps/open",{method:"POST",headers,body:"null"})).status,400);
    assert.equal((await fetch(base+"/perps/quote?side=buy&usd=10&leverage=2",{headers})).status,400);
    const noOwner=await fetch(base+"/perps/positions?authority=invalid",{headers});assert.equal(noOwner.status,400);
    const hedge=await fetch(base+"/hedge?authority=invalid",{headers});assert.equal(hedge.status,400);
    const list=await fetch(base+"/perps/markets",{headers}),data=await list.json();
    if(list.status===502 && unavailable(data.error)) {console.log(`SKIP: Phoenix API unavailable: ${data.error}`);return t.skip(data.error);}
    assert.equal(list.status,200,JSON.stringify(data));assert.ok(data.markets.length>0);assert.equal(data.pollAfterMs,15000);
    let bytes;do{bytes=randomBytes(32);}while(!PublicKey.isOnCurve(bytes));
    const authority=new PublicKey(bytes).toBase58();
    // Local protocol test only; public TLS/phone verification remains external setup.
    process.env.PHOENIX_PUBLIC_URL="https://localhost:8712";
    const response=await fetch(base+"/perps/open",{method:"POST",headers,body:JSON.stringify({authority,market:"SOL",side:"long",usd:10,leverage:2})});
    const built=await response.json();
    if(response.status===502 && unavailable(built.error)) {console.log(`SKIP: Phoenix RPC unavailable: ${built.error}`);return t.skip(built.error);}
    assert.equal(response.status,200,JSON.stringify(built));assert.match(built.requestUrl,/^solana:/);assert.match(built.qrSvg,/<svg/);
    assert.ok(built.setupRequirements.some(s=>s.startsWith("Setup required: PHOENIX_AUTHORITY")));
    const route=new URL(decodeURIComponent(built.requestUrl.slice(7))).pathname;
    const metadata=await fetch(base+route);assert.equal(metadata.status,200);assert.match((await metadata.json()).label,/mainnet/);
    const bad=await fetch(base+route,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({account:PublicKey.default.toBase58()})});assert.equal(bad.status,400);
    const wallet=await fetch(base+route,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({account:authority})});
    const txBody=await wallet.json();assert.equal(wallet.status,200,JSON.stringify(txBody));
    const tx=VersionedTransaction.deserialize(Buffer.from(txBody.transaction,"base64"));
    assert.equal(tx.message.staticAccountKeys[0].toBase58(),authority);assert.ok(tx.signatures.every(s=>s.every(b=>!b)));
    assert.equal((await fetch(base+route,{method:"PUT"})).status,405);
  } finally {
    if(old===undefined)delete process.env.PHOENIX_PUBLIC_URL;else process.env.PHOENIX_PUBLIC_URL=old;
    await new Promise(resolve=>server.close(resolve));mem.stop();
  }
});
