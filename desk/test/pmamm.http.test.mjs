/** Exercise the actual server and actual devnet adapter; no API doubles. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Memory } from "../main/memory.mjs";
process.env.PAD_TOKEN="xorrpad-dev";
const { createServer } = await import("../main/server.mjs");
test("pm-AMM routes enforce auth, methods, setup errors, and return real devnet markets", async t => {
  const mem=new Memory({db:"/tmp/xorrpad-pm-http.db"});
  const server=createServer(mem);
  await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(8711,"127.0.0.1",resolve);});
  const base="http://127.0.0.1:8711", headers={authorization:"Bearer xorrpad-dev","content-type":"application/json"};
  try {
    assert.equal((await fetch(base+"/pm/markets")).status,401);
    const wrong=await fetch(base+"/pm/swap",{headers});
    assert.equal(wrong.status,405); assert.equal(wrong.headers.get("allow"),"POST");
    const expired=await fetch(base+"/pm/request/"+"a".repeat(48));
    assert.equal(expired.status,410);
    const invalid=await fetch(base+"/pm/quote?side=invalid&usdc=1",{headers});
    assert.equal(invalid.status,400);
    const malformed=await fetch(base+"/pm/swap",{method:"POST",headers,body:"{"});
    assert.equal(malformed.status,400);
    const missing=await fetch(base+"/pm/claim",{method:"POST",headers,body:JSON.stringify({owner:"invalid"})});
    assert.equal(missing.status,400);
    const response=await fetch(base+"/pm/markets",{headers});
    const body=await response.json();
    if(response.status===502 && /429|fetch failed|timeout|timed out|ECONN|ENOTFOUND|503/.test(body.error)) {
      console.log(`SKIP live HTTP markets: devnet unreachable: ${body.error}`);
      return t.skip(`devnet unreachable: ${body.error}`);
    }
    assert.equal(response.status,200,JSON.stringify(body));
    assert.ok(Array.isArray(body.markets)); assert.equal(body.cluster,"devnet"); assert.equal(body.pollAfterMs,15000);
    // The actual local route handles a real chain-built transaction. TLS routing
    // from a phone still requires the operator's public HTTPS deployment.
    const old=process.env.PMAMM_PUBLIC_URL;
    process.env.PMAMM_PUBLIC_URL="https://localhost:8711";
    try {
      const { PublicKey, VersionedTransaction }=await import("@solana/web3.js");
      const { randomBytes }=await import("node:crypto");
      let bytes; do { bytes=randomBytes(32); } while(!PublicKey.isOnCurve(bytes));
      const owner=new PublicKey(bytes).toBase58();
      const buildResponse=await fetch(base+"/pm/create",{method:"POST",headers,body:JSON.stringify({owner,name:"xorrpad unsigned wallet request",durationSecs:300,depositUsdc:1})});
      const built=await buildResponse.json();
      assert.equal(buildResponse.status,200,JSON.stringify(built));
      assert.match(built.requestUrl,/^solana:https%3A/);
      assert.match(built.qrSvg,/<svg/);
      const route=new URL(decodeURIComponent(built.requestUrl.slice(7))).pathname;
      const metadata=await fetch(base+route);
      assert.equal(metadata.status,200);
      assert.match((await metadata.json()).label,/devnet/);
      const mismatched=await fetch(base+route,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({account:PublicKey.default.toBase58()})});
      assert.equal(mismatched.status,400);
      const wallet=await fetch(base+route,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({account:owner})});
      assert.equal(wallet.status,200);
      const tx=VersionedTransaction.deserialize(Buffer.from((await wallet.json()).transaction,"base64"));
      assert.equal(tx.message.staticAccountKeys[0].toBase58(),owner);
      assert.ok(tx.signatures.every(s=>s.every(b=>b===0)));
      const verb=await fetch(base+route,{method:"PUT"}); assert.equal(verb.status,405);
    } finally { if(old===undefined) delete process.env.PMAMM_PUBLIC_URL; else process.env.PMAMM_PUBLIC_URL=old; }

  } finally { await new Promise(resolve=>server.close(resolve)); mem.stop(); }
});
