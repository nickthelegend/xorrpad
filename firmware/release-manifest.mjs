import {sign, createHash} from 'node:crypto';
import {manifestText} from '../desk/main/pad-v2.mjs';
import {makeDelta, patchText} from '../desk/main/ota.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const FW_VERSION = '4.0.0';
export const FW_NOTES = 'Firmware 4.0.0: Predict on pad; perps cockpit and liquidation guard; persistent tilt guard; panic flatten with physical YES; eight synthesized earcons and LED cues; wake-only ambient clock; 32-decision NVS journal; desktop Sounds, Ambient, Tilt guard, Agent state and Activity events; SCAN answers, Last scan card and per-scan Activity';
// Compile-only releases use these fields without making an installable package.
export function releaseMetadata(image, {version=FW_VERSION,channel='stable',rolloutPercent=100,notes=FW_NOTES}={}) {
  if(!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version) || version.length>48 || !['stable','beta'].includes(channel) ||
     !Number.isInteger(rolloutPercent) || rolloutPercent<0 || rolloutPercent>100 ||
     typeof notes!=='string' || notes.length>512 || notes.includes('\n') || !image.length || image.length>0x300000) throw Error('Invalid release metadata');
  return {version,channel,rolloutPercent,sha256:hash(image),size:image.length,minDeskVersion:'1.0.0',notes};
}
// Caller supplies an in-memory signer; this module never loads key files.
export function releaseManifest(image, signer, {version=FW_VERSION,channel='stable',rolloutPercent=100,notes=FW_NOTES,base,fromVersion,legacy=false}={}) {
  const manifest=releaseMetadata(image,{version,channel,rolloutPercent,notes});
  if(legacy && (version!=='2.0.0' || channel!=='stable' || rolloutPercent!==100 || base!==undefined)) throw Error('Legacy bootstrap requires 2.0.0, stable, 100%, full image');
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
