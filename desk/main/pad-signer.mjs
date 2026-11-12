/** Bind a hardware signature to the exact accepted message; never rebuild it. */
import {createHash,createPublicKey,verify} from 'node:crypto';
import {assertSigningCluster} from './session-wallet.mjs';
export function attachPadSignature(tx,result,owner){
  if(!result?.ok || result.publicKey!==owner || tx.message.header.numRequiredSignatures!==1 ||
    tx.message.staticAccountKeys[0].toBase58()!==owner || tx.signatures.some(s=>s.some(Boolean)))throw Error('pad signer identity or unsigned message mismatch');
  const bytes=tx.message.serialize(),hash=createHash('sha256').update(bytes).digest('hex');
  if(result.messageHash!==hash || typeof result.signature!=='string' || !/^[0-9a-f]{128}$/.test(result.signature))throw Error('pad signed a different message');
  const pub=createPublicKey({format:'der',type:'spki',key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),tx.message.staticAccountKeys[0].toBuffer()])});
  const signature=Buffer.from(result.signature,'hex');
  if(!verify(null,bytes,pub,signature))throw Error('invalid pad Ed25519 signature');
  tx.signatures[0]=signature;return tx;
}
export class PadSigner {
  constructor(link){this.link=link;}
  async info(device){const state=await this.link.sessionStatus(device);if(!state.configured || !state.publicKey)throw Error('Setup required: approve signing policy on pad');return state;}
  async sign(tx,{device,owner,signalId,expiresAt,cluster,inputMint,recheck}){
    assertSigningCluster(cluster);await recheck();
    const result=await this.link.signSession(device,{unsignedTx:Buffer.from(tx.serialize()).toString('base64'),signalId,
      remainingMs:Math.max(1,Math.min(120000,expiresAt-Date.now())),cluster,inputMint});
    await recheck();assertSigningCluster(cluster);
    if(Date.now()>=expiresAt)throw Error('pad signature arrived after signal expiry');
    return attachPadSignature(tx,result,owner);
  }
}
