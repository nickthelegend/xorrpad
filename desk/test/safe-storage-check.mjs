/** Run by Electron, without a window. Exercises the real OS encryption backend. */
import {app} from 'electron';
import {randomBytes} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Credentials} from '../main/credentials.mjs';
app.whenReady().then(async () => {
const dir=await mkdtemp(path.join(tmpdir(),'xorr-t3-storage-'));
try {
  const credentials=new Credentials({dir}),key=randomBytes(32).toString('hex');
  try{await credentials.storage();}catch(e){console.log('SKIP: '+e.message);app.exit(0);}
  await credentials.set('anthropic',key);
  assert.equal(await credentials.get('anthropic'),key);
  assert.equal(await credentials.masked('anthropic'),'••••'+key.slice(-4));
  assert.equal((await readFile(credentials.file('anthropic'))).includes(Buffer.from(key)),false);
  await credentials.set('anthropic','');assert.equal(await credentials.get('anthropic'),'');
  console.log('PASS: real Electron safeStorage round trip, masked listing, ciphertext and removal');
}catch(e){console.error(e.message);process.exitCode=1;}
finally{await rm(dir,{recursive:true,force:true});app.exit(process.exitCode || 0);}

}).catch(e => {console.error(e.message);app.exit(1);});
