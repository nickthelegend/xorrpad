#!/usr/bin/env node
// Never reads a private key. Sign the request with your external developer signer.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {abilityText,verifyAbility} from '../../../desk/main/wasm-abilities.mjs';
const [command,wasmPath,manifestPath,value,output]=process.argv.slice(2);
if(!['prepare','finalize'].includes(command)||!output)throw Error('Usage: bundle.mjs prepare module.wasm descriptor.json DEVELOPER_PUBLIC_KEY OUTPUT_PREFIX | finalize module.wasm draft.json SIGNATURE_HEX bundle.json');
const wasm=readFileSync(wasmPath),descriptor=JSON.parse(readFileSync(manifestPath,'utf8'));
if(command==='prepare'){
  const manifest={abi:1,id:descriptor.id,name:descriptor.name,version:descriptor.version,capabilities:descriptor.capabilities,memoryPages:descriptor.memoryPages,fuel:descriptor.fuel,sha256:createHash('sha256').update(wasm).digest('hex'),size:wasm.length,developerPublicKey:value,signature:'0'.repeat(128)};
  const request=abilityText(manifest);
  writeFileSync(output+'.signing.txt',request,{flag:'wx'});
  writeFileSync(output+'.draft.json',JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
}else{
  const bundle={manifest:{...descriptor,signature:value},wasm:wasm.toString('hex')};
  verifyAbility(bundle);
  writeFileSync(output,JSON.stringify(bundle,null,2)+'\n',{flag:'wx'});
}
