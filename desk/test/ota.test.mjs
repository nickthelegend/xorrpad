import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {releaseManifest} from '../../firmware/release-manifest.mjs';
import {manifestText,verifyManifest,verifyManifestSignature,rawPublic,sha} from '../main/pad-v2.mjs';
import {rolloutBucket,otaEligible,makeDelta,applyDelta,verifyPatch,patchText} from '../main/ota.mjs';
import {PadLink} from '../main/padlink.mjs';
import {PadSimulatorV2} from '../../tools/padsim/v2.mjs';
// Actual compiled ESP32 images, never signed with a repository/private file key.
const base=readFileSync(new URL('../../firmware/build/artifacts/app.bin',import.meta.url));
const image=readFileSync(process.env.XORR_OTA_TEST_IMAGE || new URL('../../firmware/build/v6-normal-out/xorrpad.ino.bin',import.meta.url));
const pair=generateKeyPairSync('ed25519'),pk=rawPublic(pair.publicKey);
const release=(options={})=>releaseManifest(image,pair.privateKey,{base,fromVersion:'2.0.0',...options});
const native=(manifest,options={})=>{
 const request={manifest,publicKey:pk,base:base.toString('hex'),patch:release().patch.toString('hex'),device:'pad',channel:'stable',version:'2.0.0',...options};
 request.base=request.base.match(/.{1,1024}/g)||[];request.patch=request.patch.match(/.{1,1024}/g)||[];
 const result=spawnSync(fileURLToPath(new URL('../../firmware/build/ota-driver',import.meta.url)),{input:JSON.stringify(request)+'\n',encoding:'utf8',maxBuffer:1024*1024});
 assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);
};
test('OTA release verifies real image plus patch signatures in desk and native firmware',()=>{
 const {manifest,patch}=release();assert.ok(patch.length<image.length);
 assert(verifyManifest(manifest,image,pk));assert(verifyPatch(manifest,patch,pk));
 assert.deepEqual(applyDelta(base,patch,image.length),image);assert.equal(native(manifest).ok,true);
});
test('OTA both verifiers reject tampered signed channel, rollout, base and patch metadata',()=>{
 const {manifest}=release();
 for(const change of [{channel:'beta'},{rolloutPercent:99},{version:'3.1.0'},{delta:{...manifest.delta,baseSha256:'00'.repeat(32)}},{delta:{...manifest.delta,signature:'00'.repeat(64)}},{delta:undefined}]){
  const bad={...manifest,...change};assert.throws(()=>verifyManifestSignature(bad,pk));assert.equal(native(bad).ok,false);
 }
});
test('OTA separately signed patch and final image are each mandatory',()=>{
 const {manifest}=release();
 const bad=structuredClone(manifest);bad.delta.signature='00'.repeat(64);
 bad.signature=sign(null,Buffer.from(manifestText(bad)),pair.privateKey).toString('hex');
 assert.throws(()=>verifyManifestSignature(bad,pk),/patch signature/);assert.equal(native(bad).ok,false);
 const wrong=structuredClone(manifest);wrong.sha256='00'.repeat(32);
 wrong.delta.signature=sign(null,Buffer.from(patchText(wrong)),pair.privateKey).toString('hex');
 wrong.signature=sign(null,Buffer.from(manifestText(wrong)),pair.privateKey).toString('hex');
 assert.throws(()=>verifyManifest(wrong,image,pk),/hash/);assert.equal(native(wrong).ok,false);
});
test('OTA native refuses wrong base version/hash and corrupted patch bytes',()=>{
 const {manifest,patch}=release();const corrupt=Buffer.from(patch);corrupt[10]^=1;
 assert.throws(()=>verifyPatch(manifest,corrupt,pk),/patch hash/);
 assert.equal(native(manifest,{patch:corrupt.toString('hex')}).ok,false);
 assert.equal(native(manifest,{base:Buffer.alloc(base.length).toString('hex')}).ok,false);
 assert.equal(native(manifest,{version:'1.0.0'}).ok,false);
});
test('OTA SHA256 rollout bucket and 0/100 percent agree across JS and C++',()=>{
 for(const device of ['pad','esp32-000000000001','esp32-000000000002','another-pad']){
  const bucket=rolloutBucket(device);
  for(const percent of [0,bucket,bucket+1,100]){
   const {manifest}=release({rolloutPercent:percent});const result=native(manifest,{device});
   assert.equal(result.bucket,bucket);assert.equal(otaEligible(manifest,device),bucket<percent);assert.equal(result.ok,bucket<percent);
  }
 }
});
test('OTA beta requires opt in; stable can install on both channels',()=>{
 const {manifest}=release({channel:'beta'});
 assert.equal(otaEligible(manifest,'pad','stable'),false);assert.equal(native(manifest).ok,false);
 assert.equal(otaEligible(manifest,'pad','beta'),true);assert.equal(native(manifest,{channel:'beta'}).ok,true);
});
test('OTA manifest and generator reject malformed percent, channels, versions and deltas',()=>{
 const {manifest}=release();
 for(const change of [{channel:null},{channel:''},{channel:'nightly'},{rolloutPercent:-1},{rolloutPercent:101},{rolloutPercent:1.5},{rolloutPercent:'10'},{rolloutPercent:null},{version:'3.0.0\nx'},{delta:null},{delta:{...manifest.delta,size:0}},{delta:{...manifest.delta,baseSize:-1}}]) {
  const bad={...manifest,...change};assert.throws(()=>verifyManifestSignature(bad,pk));assert.equal(native(bad).ok,false);
 }
 for(const options of [{channel:'unknown'},{rolloutPercent:NaN},{rolloutPercent:-1},{notes:'line\nbreak'},{fromVersion:undefined}])assert.throws(()=>release(options));
 const full=releaseManifest(image,pair.privateKey);assert.equal(full.patch,undefined);assert(verifyManifest(full.manifest,image,pk));
});
test('OTA patch format rejects bad headers, truncation, opcode, trailing and bound violations',()=>{
 const patch=makeDelta(base,image);
 for(const p of [patch.subarray(1),patch.subarray(0,-1),Buffer.concat([patch,Buffer.from([0])]),Buffer.from('XORRD1\r\n\x00\xff\xff\xff\xff\xff\xff\xff\xff','binary')])assert.throws(()=>applyDelta(base,p,image.length));
 assert.throws(()=>applyDelta(base,patch,0));assert.throws(()=>applyDelta(base,patch,0x300001));
 assert.deepEqual(applyDelta(base,makeDelta(base,base),base.length),base);
});
async function until(fn){for(let i=0;i<500;i++){if(fn())return;await delay(10);}throw Error('OTA simulator timeout');}
async function lab(fn){
 const dir=mkdtempSync(path.join(tmpdir(),'xorr-ota-')),link=new PadLink({dir}),stateFile=path.join(dir,'pad-state.json');
 const pad=new PadSimulatorV2({device:'ota-pad',serial:true,stateFile});pad.otaPublicKey=pk;pad.installedImage=base;pad.firmware='2.0.0';
 try{
  await pad.listen(8726);const peer=link.attach(net.createConnection(8726,'127.0.0.1'),'usb');
  await until(()=>peer.candidate);link.pair(pad.pairing);await until(()=>peer.verified&&pad.verified);
  await fn({pad,link,peer,stateFile});
 }finally{link.close();await pad.close();rmSync(dir,{recursive:true,force:true});}
}
test('OTA encrypted desk opt in persists across pad reboot and delta saves transfer bytes',async()=>lab(async({pad,link,peer,stateFile})=>{
 const {manifest,patch}=release({channel:'beta'});
 assert.equal((await link.otaChannel(pad.device)).channel,'stable');
 await assert.rejects(link.update(pad.device,manifest,image,pk,patch),/channel or rollout/);
 assert.equal((await link.otaChannel(pad.device,'beta')).channel,'beta');
 const rebooted=new PadSimulatorV2({device:pad.device,stateFile});assert.equal(rebooted.otaChannel,'beta');
 await link.update(pad.device,manifest,image,pk,patch);
 assert.equal(pad.installedHash,manifest.sha256);assert.equal(peer.otaStatus.state,'rebooting');
 const sent=pad.history.filter(m=>m.type==='ota_chunk').reduce((n,m)=>n+Buffer.from(m.data,'base64').length,0);
 assert.equal(sent,patch.length);assert.ok(sent<image.length);
}));
test('OTA encrypted pad independently refuses beta, rollout and bad base at begin',async()=>lab(async({pad,link,peer})=>{
 for(const [options,channel,error] of [[{channel:'beta'},'stable',/channel/],[{rolloutPercent:0},'stable',/rollout/],[{},'stable',/base/]]){
  const {manifest}=release(options);if(error.source==='base')pad.installedImage=Buffer.alloc(base.length);
  await assert.rejects(link.otaRequest(peer,{type:'ota_begin',manifest,delta:true}),error);
  assert.equal(pad.installedHash,undefined);
 }
}));
test('OTA desk falls back to full image when previous version does not match',async()=>lab(async({pad,link,peer})=>{
 const {manifest,patch}=release();peer.firmware='1.0.0';
 await link.update(pad.device,manifest,image,pk,patch);
 assert.equal(pad.history.find(m=>m.type==='ota_begin').delta,false);assert.equal(pad.installedHash,manifest.sha256);
 await assert.rejects(link.otaChannel(pad.device,'nightly'),/stable or beta/);
}));
test('OTA native rejects malformed patches even with valid patch and release signatures',()=>{
 const {manifest,patch}=release();
 for(const bytes of [patch.subarray(0,-1),Buffer.concat([patch,Buffer.from([0])]),Buffer.concat([patch.subarray(0,8),Buffer.from([254]),patch.subarray(9)])]){
  const m=structuredClone(manifest);m.delta.size=bytes.length;m.delta.sha256=sha(bytes).toString('hex');
  m.delta.signature=sign(null,Buffer.from(patchText(m)),pair.privateKey).toString('hex');
  m.signature=sign(null,Buffer.from(manifestText(m)),pair.privateKey).toString('hex');
  assert(verifyManifestSignature(m,pk));assert(verifyPatch(m,bytes,pk));
  assert.equal(native(m,{patch:bytes.toString('hex')}).ok,false);
 }
 const tiny=releaseManifest(image.subarray(0,8),pair.privateKey,{base:base.subarray(0,8),fromVersion:'2.0.0'});
 assert.equal(tiny.patch,undefined);assert.equal(tiny.manifest.delta,undefined);
});
test('OTA encrypted pad refuses patch corruption and independently verifies reconstructed image',async()=>lab(async({pad,link,peer})=>{
 const {manifest,patch}=release();
 const wrong=structuredClone(manifest);wrong.sha256='00'.repeat(32);
 wrong.delta.signature=sign(null,Buffer.from(patchText(wrong)),pair.privateKey).toString('hex');
 wrong.signature=sign(null,Buffer.from(manifestText(wrong)),pair.privateKey).toString('hex');
 for(const [m,bytes] of [[wrong,patch],[manifest,Buffer.from(patch)]]){
  if(m===manifest)bytes[bytes.length-2]^=1;
  await link.otaRequest(peer,{type:'ota_begin',manifest:m,delta:true});
  for(let offset=0;offset<bytes.length;offset+=512)await link.otaRequest(peer,{type:'ota_chunk',offset,data:bytes.subarray(offset,offset+512).toString('base64')});
  await assert.rejects(link.otaRequest(peer,{type:'ota_end'}),/hash/);assert.equal(pad.installedHash,undefined);
 }
}));

test('OTA legacy bootstrap preserves the existing full-image signature envelope',()=>{
 const {manifest,patch}=releaseManifest(image,pair.privateKey,{version:'2.0.0',legacy:true});
 assert.equal(manifest.channel,undefined);assert.equal(manifest.rolloutPercent,undefined);assert.equal(patch,undefined);
 assert(verifyManifest(manifest,image,pk));assert.equal(native(manifest).ok,true);
 for(const options of [{channel:'beta'},{rolloutPercent:10},{base},{version:'3.0.0'}])assert.throws(()=>releaseManifest(image,pair.privateKey,{version:'2.0.0',legacy:true,...options}));
});
