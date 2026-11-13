import {sign, createHash} from 'node:crypto';
import {manifestText} from '../desk/main/pad-v2.mjs';
import {makeDelta, patchText} from '../desk/main/ota.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
// Caller supplies an in-memory signer; this module never loads key files.
export function releaseManifest(image, signer, {version='4.0.0',channel='stable',rolloutPercent=100,notes='Firmware v4 F1-F4: Predict; perps cockpit; liquidation guard; persistent firmware tilt guard; manual reduce-only proposals; panic flatten with physical YES and retained KILL latch',base,fromVersion,legacy=false}={}) {
  if(!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version) || version.length>48 || !['stable','beta'].includes(channel) ||
     !Number.isInteger(rolloutPercent) || rolloutPercent<0 || rolloutPercent>100 ||
     typeof notes!=='string' || notes.length>512 || notes.includes('\n') || !image.length || image.length>0x300000) throw Error('Invalid release metadata');
  if(legacy && (version!=='2.0.0' || channel!=='stable' || rolloutPercent!==100 || base!==undefined)) throw Error('Legacy bootstrap requires 2.0.0, stable, 100%, full image');
  const manifest={version,channel,rolloutPercent,sha256:hash(image),size:image.length,minDeskVersion:'1.0.0',notes};
  if(legacy){delete manifest.channel;delete manifest.rolloutPercent;}
  let patch;
  if(base !== undefined) {
    if(!base.length || base.length>0x300000 || typeof fromVersion!=='string' || fromVersion.length>48 || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(fromVersion)) throw Error('Previous image/version required');
    patch=makeDelta(base,image);
    if(patch.length<image.length) {
      manifest.delta={format:'xorr-delta-v1',fromVersion,baseSize:base.length,baseSha256:hash(base),sha256:hash(patch),size:patch.length};
      manifest.delta.signature=sign(null,Buffer.from(patchText(manifest)),signer).toString('hex');
    } else patch=undefined;
  }
  manifest.signature=sign(null,Buffer.from(manifestText(manifest)),signer).toString('hex');
  return {manifest,patch};
}
