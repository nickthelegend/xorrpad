/** Real unsigned SPL builder, live devnet collateral mint and blockhash; no wallet. */
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const require=createRequire(new URL('../../desk/package.json',import.meta.url));
const {Connection,PublicKey,Transaction,VersionedTransaction}=require('@solana/web3.js');
const {getMint,getAssociatedTokenAddressSync,createTransferCheckedInstruction}=require('@solana/spl-token');
const c=new Connection('https://api.devnet.solana.com',{commitment:'confirmed',disableRetryOnRateLimit:true,
 fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(20000)})});
if(await c.getGenesisHash()!=='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')throw Error('devnet genesis mismatch');
const collateral=new PublicKey('3WQ8hCqTNwjrh8WzE2XyoZoUrd1miPcwWfMkmFPUMEWZ'),mint=await getMint(c,collateral);
if(mint.decimals!==6 || !mint.isInitialized)throw Error('collateral mint changed');
const original=JSON.parse(await readFile(new URL('./fixtures/system-legacy.json',import.meta.url)));
const payer=VersionedTransaction.deserialize(Buffer.from(original.unsignedTx,'base64')).message.staticAccountKeys[0];
const destination=getAssociatedTokenAddressSync(collateral,new PublicKey('So11111111111111111111111111111111111111112'),true);
const tx=new Transaction({feePayer:payer,...await c.getLatestBlockhash()}).add(createTransferCheckedInstruction(
 getAssociatedTokenAddressSync(collateral,payer,true),collateral,destination,payer,123456n,6));
const unsignedTx=tx.serialize({requireAllSignatures:false,verifySignatures:false}).toString('base64');
const bytes=Buffer.from(VersionedTransaction.deserialize(Buffer.from(unsignedTx,'base64')).message.serialize());
await writeFile(new URL('./fixtures/session-usdc-transfer.json',import.meta.url),JSON.stringify({name:'session-usdc-transfer',cluster:'devnet',
 provenance:'@solana/spl-token transferChecked; verified live devnet collateral mint/decimals and blockhash; unfunded unsigned parser exercise',
 capturedAt:new Date().toISOString(),unsignedTx,message:bytes.toString('hex'),sha256:createHash('sha256').update(bytes).digest('hex'),tables:[]},null,2)+'\n');
console.log('Captured unsigned devnet session transfer from the real SPL builder.');
