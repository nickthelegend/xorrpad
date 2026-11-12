import { test } from "node:test";
import assert from "node:assert/strict";
import { lstat,readdir,readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertGenesis,assertMint,guard,connectionFor,DEVNET_GENESIS,MINT } from "../guards.mjs";
import { KEY_FILE } from "../paths.mjs";
import { classifyOutcome } from "../resolve.mjs";
import { TEMPLATES,nextEnd,strikeFor,questionFor,marketIdFor,depositAmount } from "../markets.mjs";
const root=fileURLToPath(new URL("../../",import.meta.url));
test("keeper rejects non-devnet genesis hashes and every other collateral",()=>{
  assert.doesNotThrow(()=>assertGenesis(DEVNET_GENESIS));
  for(const hash of ["5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d","unknown",undefined])assert.throws(()=>assertGenesis(hash),/not Solana devnet/);
  assert.doesNotThrow(()=>assertMint(MINT));
  for(const mint of ["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","",undefined])assert.throws(()=>assertMint(mint),/only devnet mUSDC/);
});
test("keeper guard checks a real devnet genesis hash",{timeout:25000},async t=>{
  try {await guard(connectionFor());}
  catch(e){if(!/fetch failed|timeout|timed out|ECONN|ENOTFOUND|429|503|502/.test(e.message))throw e;console.log(`SKIP: devnet unreachable: ${e.message}`);t.skip(e.message);}
});
test("confidence crossing or touching the strike cannot resolve; strict outcomes use exact integers",()=>{
  const p=(rawPrice,rawConfidence,exponent=-2)=>({rawPrice,rawConfidence,exponent});
  assert.equal(classifyOutcome(p("11000","100"),"100"),"yes");
  assert.equal(classifyOutcome(p("9000","100"),"100"),"no");
  for(const price of [p("10000","100"),p("10100","100"),p("9900","100")])assert.equal(classifyOutcome(price,"100"),"unresolved");
  assert.equal(classifyOutcome(p("10000","0"),"100"),"no");
  assert.equal(classifyOutcome(p("10000000000000000001","0",-17),"100"),"yes");
  assert.throws(()=>classifyOutcome(p("1","-1"),"100"),/invalid exact settlement/);
});
test("UTC hourly/daily schedules, sensible ticks and deterministic ids prevent duplicate markets",()=>{
  const now=Date.parse("2026-11-12T20:00:00Z")/1000;
  assert.equal(nextEnd(TEMPLATES[0],now),now+3600);
  assert.equal(nextEnd(TEMPLATES[0],now+3300),now+7200);
  assert.equal(new Date(nextEnd(TEMPLATES[2],now)*1000).toISOString(),"2026-11-13T00:00:00.000Z");
  assert.equal(strikeFor({rawPrice:"8529000000",exponent:-8},1),"85");
  assert.equal(strikeFor({rawPrice:"8574900000000",exponent:-8},100),"85700");
  assert.equal(questionFor("SOL","85",now+3600),"SOL above $85 at 21:00 UTC?");
  assert.equal(depositAmount("50").raw,50000000n);
  assert.equal(depositAmount("1.000001").raw,1000001n);
  assert.throws(()=>depositAmount("0.0000001"),/six decimals/);
  const id=marketIdFor("creator",TEMPLATES[0],now+3600);
  assert.equal(id,marketIdFor("creator",TEMPLATES[0],now+3600));
  assert.notEqual(id,marketIdFor("creator",TEMPLATES[1],now+3600));
});
test("the keeper key is gitignored, untracked, mode 0600 and cannot be overwritten",async t=>{
  assert.equal(spawnSync("git",["check-ignore","--quiet","keeper/.keeper-devnet.json"],{cwd:root}).status,0);
  assert.notEqual(spawnSync("git",["ls-files","--error-unmatch","keeper/.keeper-devnet.json"],{cwd:root,stdio:"ignore"}).status,0);
  let before;
  try {before=await lstat(KEY_FILE);}catch(e){if(e.code!=="ENOENT")throw e;return t.skip("Setup required: run node keeper/keygen.mjs to inspect actual key permissions");}
  assert.ok(before.isFile());assert.equal(before.mode&0o777,0o600);
  const child=spawnSync(process.execPath,["keeper/keygen.mjs"],{cwd:root,encoding:"utf8"});
  assert.notEqual(child.status,0);assert.equal(child.stdout,"");assert.match(child.stderr,/refusing to overwrite/);
  const after=await lstat(KEY_FILE);assert.equal(after.mtimeMs,before.mtimeMs);assert.equal(after.size,before.size);
});
test("desk modules do not load keeper signing code or its key",async()=>{
  async function inspect(dir) {
    for(const item of await readdir(dir,{withFileTypes:true})) {
      const file=new URL(item.name+(item.isDirectory()?"/":""),dir);
      if(item.isDirectory())await inspect(file);
      else if(item.name.endsWith(".mjs")) {
        const source=await readFile(file,"utf8");
        assert.doesNotMatch(source,/\.keeper-devnet\.json|keeper\/(?:chain|run|keygen|fund)\.mjs/);
        // v1 (T2) adds exactly two opt-in signing modules to the desk, covered by the session-wallet tests.
        // Every other desk module must still never sign or send.
        if(!["executor.mjs","session-wallet.mjs"].includes(item.name)) assert.doesNotMatch(source,/\.sign\(|\.partialSign\(|\.sendRawTransaction\(/);
      }
    }
  }
  await inspect(new URL("../../desk/main/",import.meta.url));
});

test("keeper questions retain exact payout/expiry meaning in desk hedge proposals",async()=>{
  const {parseOutcome,losingSide}=await import("../../desk/main/hedge.mjs");
  const endTs=Date.parse("2026-11-12T21:00:00Z")/1000;
  const outcome=parseOutcome({name:questionFor("SOL","85",endTs),endTs});
  assert.deepEqual(outcome,{symbol:"SOL",operator:">",threshold:85,endTs});
  assert.equal(losingSide({market:"SOL",side:"long",entryPrice:90},outcome),"no");
  assert.equal(parseOutcome({name:questionFor("SOL","85",endTs),endTs:endTs+1}),null);
});
