import {createHash, createPublicKey, verify} from 'node:crypto';
export const CAPABILITIES=Object.freeze(['alerts.price','audio.chime','keys.macro','tft.widget']);
const fields=['abi','id','name','version','capabilities','memoryPages','fuel','sha256','size','developerPublicKey','signature'];
const hex=(s,n)=>typeof s==='string'&&new RegExp(`^[0-9a-f]{${n*2}}$`).test(s);
export function abilityText(m){
  if(!m || typeof m!=='object' || Array.isArray(m) || Object.keys(m).length!==fields.length || fields.some(f=>!Object.hasOwn(m,f)))throw Error('Invalid ability manifest fields');
  if(m.abi!==1 || ['id','name','version'].some(f=>typeof m[f]!=='string') || !/^[A-Za-z0-9._-]{1,32}$/.test(m.id) || !/^[A-Za-z0-9 ._-]{1,32}$/.test(m.name) || !/^[A-Za-z0-9._-]{1,16}$/.test(m.version))throw Error('Invalid ability identity');
  if(!Array.isArray(m.capabilities) || !m.capabilities.length || m.capabilities.some((c,i)=>!CAPABILITIES.includes(c)||(i&&m.capabilities[i-1]>=c)))throw Error('Invalid or forbidden ability capability');
  if(!Number.isInteger(m.memoryPages)||m.memoryPages<1||m.memoryPages>4 || !Number.isInteger(m.fuel)||m.fuel<100||m.fuel>100000 || !Number.isInteger(m.size)||m.size<8||m.size>32768 || !hex(m.sha256,32)||!hex(m.developerPublicKey,32)||!hex(m.signature,64))throw Error('Invalid ability limits or signature encoding');
  return `xorrpad-ability-v1\n${m.id}\n${m.name}\n${m.version}\n${m.capabilities.join(',')}\n${m.memoryPages}\n${m.fuel}\n${m.sha256}\n${m.size}\n${m.developerPublicKey}`;
}
export function verifyAbility(bundle,trustedDeveloper){
  const m=bundle?.manifest,text=abilityText(m);
  if(trustedDeveloper!==undefined&&m.developerPublicKey!==trustedDeveloper)throw Error('Developer has not been trusted on the pad');
  if(typeof bundle.wasm!=='string'||!hex(bundle.wasm,m.size))throw Error('Invalid ability wasm size or encoding');
  const wasm=Buffer.from(bundle.wasm,'hex');
  if(createHash('sha256').update(wasm).digest('hex')!==m.sha256)throw Error('Ability digest mismatch');
  const key=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(m.developerPublicKey,'hex')]),format:'der',type:'spki'});
  if(!verify(null,Buffer.from(text),key,Buffer.from(m.signature,'hex')))throw Error('Ability developer signature refused');
  if(!WebAssembly.validate(wasm))throw Error('Ability WebAssembly validation failed');
  // Firmware repeats all authoritative import/capability checks.
  for(const imp of WebAssembly.Module.imports(new WebAssembly.Module(wasm))){
    const cap={widget:'tft.widget',macro:'keys.macro',price:'alerts.price',chime:'audio.chime'}[imp.name];
    if(imp.module!=='xorr'||imp.kind!=='function'||!cap||!m.capabilities.includes(cap))throw Error('Ability import capability refused');
  }
  return wasm;
}
