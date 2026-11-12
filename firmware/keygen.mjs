#!/usr/bin/env node
// Never emits private material. Refuses every output path inside the repository.
import {generateKeyPairSync} from 'node:crypto';
import {mkdirSync,writeFileSync,realpathSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
const repo=realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
const out=path.resolve(process.argv[2]||path.join(os.homedir(),'.local/share/xorrpad/signing'));
mkdirSync(out,{recursive:true,mode:0o700});const actual=realpathSync(out);
if(actual===repo||actual.startsWith(repo+path.sep))throw Error('Signing keys must stay outside the repository');
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
writeFileSync(path.join(out,'firmware-ed25519.pem'),privateKey.export({format:'pem',type:'pkcs8'}),{mode:0o600,flag:'wx'});
writeFileSync(path.join(out,'firmware-ed25519-public.pem'),publicKey.export({format:'pem',type:'spki'}),{mode:0o644,flag:'wx'});
console.log('Created signing key outside the repository; use XORR_SIGNING_KEY and XORR_PUBLIC_KEY paths.');
