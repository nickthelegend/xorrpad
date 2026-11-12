/** Live, keyless pinned-root smoke check. Never broadcasts or reads credentials. */
import https from 'node:https';
import {readFileSync,writeFileSync} from 'node:fs';
import {X509Certificate} from 'node:crypto';
const certs=readFileSync(new URL('../../firmware/xorrpad/certs.h',import.meta.url),'utf8');
const ca=certs.match(/JUPITER_ROOT_CA\[\] = R"CERT\(([\s\S]*?)\)CERT"/)[1];
const root=new X509Certificate(ca);
if(root.fingerprint256!=='8E:CD:E6:88:4F:3D:87:B1:12:5B:A3:1A:C3:FC:B1:3D:70:16:DE:7F:57:CC:90:4F:E1:CB:97:C6:AE:98:19:6E')throw Error('Jupiter root changed');
const mint='So11111111111111111111111111111111111111112';
const body=await new Promise((resolve,reject)=>{
 const request=https.get(`https://api.jup.ag/price/v3?ids=${mint}`,{ca,timeout:10000},response=>{
  if(response.statusCode!==200){response.resume();reject(Error(`Price API HTTP ${response.statusCode}`));return;}
  let text='';response.on('data',chunk=>{text+=chunk;if(text.length>16384)request.destroy(Error('price response too large'));});
  response.on('end',()=>resolve(text));response.on('error',reject);
 });request.on('timeout',()=>request.destroy(Error('price timeout')));request.on('error',reject);
});
const price=JSON.parse(body)[mint];
if(!Number.isFinite(price?.usdPrice)||price.usdPrice<=0||!Number.isSafeInteger(price.blockId))throw Error('missing live SOL price');
if(process.argv[2]==='--capture')writeFileSync(new URL('../../firmware/test/fixtures/jupiter-price-v3.json',import.meta.url),body+'\n');
console.log('PASS live Jupiter Price v3, pinned Amazon Root CA 1; price and block validated; no trade');
