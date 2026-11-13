// MIT · Copyright (c) 2026 Nivesh Gajengi
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {FW_VERSION,FW_NOTES,releaseMetadata} from '../../firmware/release-manifest.mjs';
import {verifyManifestSignature} from '../main/pad-v2.mjs';
import {OTA_PUBLIC_KEY} from '../main/firmware-release.mjs';
test('4.0.0 compile-only metadata hashes public bytes but cannot authorize OTA',()=>{
  const image=Buffer.from('public release metadata validation vector');
  const m=releaseMetadata(image);
  assert.equal(m.version,FW_VERSION);assert.equal(m.version,'4.0.0');
  assert.equal(m.size,image.length);assert.equal(m.sha256,createHash('sha256').update(image).digest('hex'));
  assert.equal(m.signature,undefined);assert.throws(()=>verifyManifestSignature(m,OTA_PUBLIC_KEY),/invalid OTA manifest/);
  for(const feature of ['Predict','perps','liquidation','tilt','flatten','earcons','ambient','journal','desktop'])assert(FW_NOTES.includes(feature));
  for(const options of [{version:'4.0.0\n'},{channel:'nightly'},{rolloutPercent:101},{notes:'a\nb'}])assert.throws(()=>releaseMetadata(image,options));
  assert.throws(()=>releaseMetadata(Buffer.alloc(0)));
});
