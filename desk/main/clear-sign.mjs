/** Message bytes and public lookup evidence only. No signing or submission. */
import {createHash} from 'node:crypto';
import {Connection,PublicKey,VersionedTransaction,AddressLookupTableAccount} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,TOKEN_2022_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {base58} from './pad-v2.mjs';
const digest=bytes=>createHash('sha256').update(bytes).digest();
export function clearSignFrames(request) {
  if(typeof request.signalId!=='string' || !/^[\w-]{1,96}$/.test(request.signalId) ||
    !Number.isInteger(request.remainingMs) || request.remainingMs<1 || request.remainingMs>86400000 ||
    typeof request.message!=='string' || !/^(?:[0-9a-f]{2}){1,1232}$/.test(request.message) ||
    !Array.isArray(request.tables) || request.tables.length>32)throw Error('invalid clear-sign request');
  const bytes=Buffer.from(JSON.stringify(request));
  if(bytes.length>96000)throw Error('clear-sign evidence exceeds bounded upload');
  const hash=digest(Buffer.from(request.message,'hex'));
  const frames=[{type:'clear_begin',size:bytes.length,sha256:digest(bytes).toString('hex')}];
  for(let offset=0;offset<bytes.length;offset+=768)frames.push({type:'clear_chunk',offset,data:bytes.subarray(offset,offset+768).toString('hex')});
  frames.push({type:'clear_end'});
  return {frames,fingerprint:base58(hash).slice(0,6),messageHash:hash.toString('hex')};
}
export async function prepareClearSign({unsignedTx,cluster,signalId,remainingMs=120000,inputMint}) {
  if(!['devnet','mainnet-beta'].includes(cluster))throw Error('clear-sign cluster must be devnet or mainnet-beta');
  if(typeof unsignedTx!=='string' || unsignedTx.length>1644)throw Error('invalid unsigned transaction');
  const raw=Buffer.from(unsignedTx,'base64');
  if(raw.toString('base64')!==unsignedTx)throw Error('noncanonical unsigned transaction');
  const tx=VersionedTransaction.deserialize(raw);
  if(tx.signatures.some(s=>s.some(b=>b)))throw Error('clear-sign requires an unsigned transaction');
  const rpc=cluster==='devnet'?process.env.PMAMM_RPC||'https://api.devnet.solana.com':process.env.SOLANA_RPC||'https://api.mainnet-beta.solana.com';
  const c=new Connection(rpc,{commitment:'confirmed',disableRetryOnRateLimit:true,
    fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(20000)})});
  const genesis=await c.getGenesisHash();
  if(genesis!==(cluster==='devnet'?'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG':'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'))throw Error('clear-sign RPC cluster mismatch');
  const tables=[];
  for(const lookup of tx.message.addressTableLookups||[]){
    const account=await c.getAccountInfo(lookup.accountKey);
    if(!account || account.owner.toBase58()!=='AddressLookupTab1e1111111111111111111111111')throw Error('lookup table unavailable');
    const table=AddressLookupTableAccount.deserialize(account.data);
    tables.push({table:lookup.accountKey.toBase58(),owner:account.owner.toBase58(),data:account.data.toString('hex'),
      resolved:[...lookup.writableIndexes,...lookup.readonlyIndexes].map(i=>{if(!table.addresses[i])throw Error('lookup index out of bounds');return table.addresses[i].toBase58();})});
  }
  const mintProofs=[];
  if(inputMint){
    const mint=new PublicKey(inputMint),owner=tx.message.staticAccountKeys[0];
    for(const program of [TOKEN_PROGRAM_ID,TOKEN_2022_PROGRAM_ID]){
      const [account,bump]=PublicKey.findProgramAddressSync([owner.toBuffer(),program.toBuffer(),mint.toBuffer()],ASSOCIATED_TOKEN_PROGRAM_ID);
      mintProofs.push({account:account.toBase58(),owner:owner.toBase58(),mint:mint.toBase58(),program:program.toBase58(),bump});
    }
  }
  const request={signalId,remainingMs,message:Buffer.from(tx.message.serialize()).toString('hex'),tables,mintProofs};
  return {request,...clearSignFrames(request)};
}
