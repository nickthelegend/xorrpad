import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash,sign} from 'node:crypto';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {abilityText,verifyAbility} from '../main/abilities.mjs';
import {AbilityDriver,AbilityPadSimulator} from '../../tools/padsim/abilities.mjs';
import {PadLink} from '../main/padlink.mjs';
// Test signing keys exist only in process memory; only signed public inputs cross to C++.
function bundle(name='market-pulse',caps=['alerts.price','tft.widget'],keys=generateKeyPairSync('ed25519')){
  const wasm=readFileSync(new URL(`../../sdk/abilities/out/${name}.wasm`,import.meta.url));
  const manifest={abi:1,id:name,name,version:'1.0.0',capabilities:caps,memoryPages:2,fuel:10000,sha256:createHash('sha256').update(wasm).digest('hex'),size:wasm.length,developerPublicKey:keys.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex'),signature:'0'.repeat(128)};
  manifest.signature=sign(null,Buffer.from(abilityText(manifest)),keys.privateKey).toString('hex');
  return {manifest,wasm:wasm.toString('hex')};
}
const until=async fn=>{for(let i=0;i<500;i++){if(fn())return;await delay(10);}throw Error('ability protocol timeout');};
test('developer signature binds exact bytes, capabilities and limits',()=>{
  const b=bundle();assert.ok(verifyAbility(b));
  assert.throws(()=>verifyAbility({...b,manifest:{...b.manifest,fuel:10001}}),/signature/);
  assert.throws(()=>verifyAbility({...b,wasm:'01'+b.wasm.slice(2)}),/digest/);
  assert.throws(()=>verifyAbility(b,'00'.repeat(32)),/trusted/);
  assert.throws(()=>verifyAbility({...b,manifest:{...b.manifest,capabilities:['wallet.sign']}}),/capability/);
});
test('desk refuses signing, trade and undeclared imports even when developer-signed',()=>{
  assert.throws(()=>verifyAbility(bundle('sign-escape',['tft.widget'])),/capability/);
  assert.throws(()=>verifyAbility(bundle('trade-escape',['keys.macro'])),/capability/);
  assert.throws(()=>verifyAbility(bundle('market-pulse',['tft.widget'])),/capability/);
});
test('both SDK templates execute on the real embedded interpreter',async()=>{
  const driver=new AbilityDriver();
  try{for(const name of ['ability','assemblyscript']){
    const b=bundle(name,['tft.widget']);const result=await driver.call({...b,trustedDeveloper:b.manifest.developerPublicKey,ticks:[0]});
    assert.equal(result.ok,true,result.error);assert.equal(result.widget,'My ability');assert.equal(result.heapUsed,0);
  }}finally{driver.close();}
});
test('native sandbox traps malicious pointer, memory, fuel, recursion, macro and host flooding',async()=>{
  const driver=new AbilityDriver();
  try{
    for(const [name,caps] of [['pointer-escape',['tft.widget']],['memory-escape',['tft.widget']],['spin',['tft.widget']],['recurse',['keys.macro']],['macro-escape',['keys.macro']],['flood',['tft.widget']]]){
      const b=bundle(name,caps),result=await driver.call({...b,trustedDeveloper:b.manifest.developerPublicKey,ticks:[1]});
      assert.equal(result.ok,false,name);assert.equal(result.widget,'',name);assert.equal(result.macro,-1,name);assert.equal(result.heapUsed,0,name);
    }
  }finally{driver.close();}
});
test('encrypted developer-approved install, two real samples, signed sandbox escape and removal',async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'xorr-abilities-')),link=new PadLink({dir});
  const pad=new AbilityPadSimulator({device:'native-abilities-pad',serial:true});
  const keys=generateKeyPairSync('ed25519'),pulse=bundle('market-pulse',['alerts.price','tft.widget'],keys),timer=bundle('pomodoro',['audio.chime','tft.widget'],keys);
  const errors=[];pad.on('protocol_error',e=>errors.push(e.message));
  try{
    await pad.listen(8725);const peer=link.attach(net.createConnection(8725,'127.0.0.1'),'usb');
    await until(()=>peer.candidate);link.pair(pad.pairing);await until(()=>peer.verified&&pad.verified);
    await assert.rejects(link.installAbility(pad.device,0,pulse),/trusted/);
    await link.abilities(pad.device,{type:'ability_developer',developerPublicKey:pulse.manifest.developerPublicKey});
    await assert.rejects(pad.approveDeveloper(799),/hold/);assert.equal((await pad.approveDeveloper()).ok,true);
    assert.equal((await link.installAbility(pad.device,0,pulse)).slots[0].running,true);
    assert.equal((await link.installAbility(pad.device,1,timer)).slots[1].running,true);
    const result=await pad.driver.call({command:'tick',slot:0,seconds:0,price:0});assert.equal(result.ok,true);assert.match(result.widget,/unavailable/);
    // 0 means unavailable: no synthetic market prices enter this transport test.
    assert.equal((await pad.driver.call({command:'tick',slot:1,seconds:0})).ok,true);
    assert.equal((await pad.driver.call({command:'tick',slot:1,seconds:1500})).chime,1);
    // Bypass desk validation: send an authentic developer-signed forbidden import.
    const escape=bundle('sign-escape',['tft.widget'],keys);
    await link.abilities(pad.device,{type:'ability_begin',slot:0,manifest:escape.manifest});
    const bytes=Buffer.from(escape.wasm,'hex');
    for(let offset=0;offset<bytes.length;offset+=256)await link.abilities(pad.device,{type:'ability_chunk',offset,data:bytes.subarray(offset,offset+256).toString('hex')});
    await assert.rejects(link.abilities(pad.device,{type:'ability_end'}),/import/);
    const retained=await link.abilities(pad.device);assert.equal(retained.slots[0].running,true);assert.equal(retained.slots[0].name,'market-pulse');
    await link.abilities(pad.device,{type:'ability_remove',slot:1});assert.equal((await link.abilities(pad.device)).slots[1].installed,false);
    assert.deepEqual(errors,[]);
  }finally{link.close();await pad.close();rmSync(dir,{recursive:true,force:true});}
});
