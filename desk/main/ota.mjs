import {sha, publicKey} from './pad-v2.mjs';
import {verify} from 'node:crypto';
export const deltaText = d => `${d.format}\n${d.fromVersion}\n${d.baseSha256}\n${d.baseSize}\n${d.sha256}\n${d.size}`;
export const patchText = m => `xorrpad-delta-v1\n${m.version}\n${m.sha256}\n${m.size}\n${m.channel}\n${m.rolloutPercent}\n${deltaText(m.delta)}`;
export function rolloutBucket(deviceId) {
  if (typeof deviceId !== 'string' || !deviceId.length) throw Error('OTA device ID required');
  return Number(BigInt('0x' + sha(deviceId).toString('hex')) % 100n);
}
export function otaEligible(m, deviceId, channel = 'stable') {
  return ['stable','beta'].includes(channel) && (!m.channel ||
    ((m.channel === 'stable' || channel === 'beta') && rolloutBucket(deviceId) < m.rolloutPercent));
}
export function verifyPatch(m, patch, pk) {
  const d = m.delta;
  if (!d || patch.length !== d.size || sha(patch).toString('hex') !== d.sha256) throw Error('OTA patch hash mismatch');
  if (!verify(null, Buffer.from(patchText(m)), publicKey(pk, 'ed25519'), Buffer.from(d.signature,'hex'))) throw Error('OTA patch signature mismatch');
  return true;
}
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
// Index 64-byte blocks of the previous app and greedily copy matching runs.
// Scanning target bytes also finds unchanged regions shifted by new code/data.
export function makeDelta(base, image) {
  const block=64,index=new Map(),out=[Buffer.from('XORRD1\r\n')];
  for(let at=0;at+block<=base.length;at+=block) {
    const key=base.subarray(at,at+block).toString('hex');
    if(!index.has(key)) index.set(key,at);
  }
  let at=0,literal=0;
  const add=end=>{if(end>literal)out.push(Buffer.from([1]),u32(end-literal),image.subarray(literal,end));};
  while(at+block<=image.length) {
    const pos=index.get(image.subarray(at,at+block).toString('hex'));
    if(pos===undefined){++at;continue;}
    let n=block;
    while(pos+n<base.length && at+n<image.length && base[pos+n]===image[at+n])++n;
    add(at);out.push(Buffer.from([0]),u32(pos),u32(n));at+=n;literal=at;
  }
  add(image.length);out.push(Buffer.from([255]));return Buffer.concat(out);
}
export function applyDelta(base, patch, size) {
  if (!Number.isInteger(size) || size < 1 || size > 0x300000 || patch.length > 0x300000 ||
      patch.subarray(0,8).toString() !== 'XORRD1\r\n') throw Error('OTA delta format');
  const out = Buffer.alloc(size); let at = 8, written = 0;
  const word = () => { if(at+4 > patch.length) throw Error('OTA delta truncated'); const n=patch.readUInt32LE(at);at+=4;return n; };
  while(at < patch.length) {
    const op = patch[at++];
    if(op === 255 && at === patch.length && written === size) return out;
    if(op !== 0 && op !== 1) throw Error('OTA delta opcode');
    const offset = op === 0 ? word() : 0, n = word();
    if(!n || n > size-written) throw Error('OTA delta output bounds');
    const src = op === 0 ? base : patch, pos = op === 0 ? offset : at;
    if(pos > src.length || n > src.length-pos) throw Error('OTA delta input bounds');
    src.copy(out,written,pos,pos+n); written+=n; if(op === 1) at+=n;
  }
  throw Error('OTA delta incomplete');
}
