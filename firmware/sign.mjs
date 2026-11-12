#!/usr/bin/env node
import {readFileSync,writeFileSync} from 'node:fs';
import {createPrivateKey,createPublicKey,sign} from 'node:crypto';
import {sha,manifestText} from '../desk/main/pad-v2.mjs';
const [imagePath,out]=process.argv.slice(2);
if(!process.env.XORR_SIGNING_KEY)throw Error('Setup required: XORR_SIGNING_KEY path outside repository');
const privateKey=createPrivateKey(readFileSync(process.env.XORR_SIGNING_KEY));
const image=readFileSync(imagePath),publicKey=createPublicKey(privateKey);
const pinned=readFileSync(new URL('./ota-public-key.hex',import.meta.url),'utf8').trim();
if(publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex')!==pinned)throw Error('Signing key does not match baked public key');
const m={version:'2.0.0',sha256:sha(image).toString('hex'),size:image.length,minDeskVersion:'1.0.0',notes:process.env.XORR_RELEASE_NOTES||'Product-grade firmware v2'};
if(m.notes.length>512||m.notes.includes('\n'))throw Error('Release notes must fit one line');
m.signature=sign(null,Buffer.from(manifestText(m)),privateKey).toString('hex');
writeFileSync(out+'/manifest.json',JSON.stringify(m,null,2)+'\n');
writeFileSync(out+'/app.sha256',m.sha256+'  app.bin\n');
writeFileSync(out+'/app.sig',m.signature+'\n');
