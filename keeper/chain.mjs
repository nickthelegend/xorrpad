/** The only transaction signer. Never imported by desk code. */
import { createRequire } from "node:module";
import { lstat,open } from "node:fs/promises";
import { constants } from "node:fs";
import { Keypair,PublicKey,Transaction,ComputeBudgetProgram } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction,getAssociatedTokenAddressSync } from "@solana/spl-token";
import { guard,assertMint,MINT,PROGRAM } from "./guards.mjs";
import { publicCreator,KEY_FILE } from "./paths.mjs";
const {PmAmmClient}=createRequire(import.meta.url)("@pm-amm/sdk");
export async function signingContext(connection) {
  await guard(connection); // Refuse the network/mint before even reading the devnet key.
  const permissions=await lstat(KEY_FILE);
  if(!permissions.isFile() || (permissions.mode&0o777)!==0o600)throw new Error("keeper key must be a regular file with mode 0600");
  const file=await open(KEY_FILE,constants.O_RDONLY|constants.O_NOFOLLOW);
  let keypair;
  try {keypair=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await file.readFile("utf8"))));}
  catch {throw new Error("keeper devnet key could not be loaded; inspect its format locally without printing it");}
  finally {await file.close();}
  if(keypair.publicKey.toBase58()!==await publicCreator())throw new Error("keeper public metadata does not match the devnet key");
  const client=PmAmmClient.readOnly(connection,new PublicKey(PROGRAM),new PublicKey(MINT));
  async function send(instructions,onPrepared=async()=>{}) {
    await guard(connection);
    const latest=await connection.getLatestBlockhash("confirmed");
    const tx=new Transaction({feePayer:keypair.publicKey,...latest}).add(ComputeBudgetProgram.setComputeUnitLimit({units:1400000}),...instructions);
    // Recheck immediately before signing and submission; never delegate to a desktop provider.
    await guard(connection);tx.sign(keypair);
    const signature=createRequire(import.meta.url)("bs58").encode(tx.signature);
    await onPrepared(signature);
    await guard(connection);
    const returned=await connection.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:2});
    if(returned!==signature)throw new Error("RPC returned a different transaction signature");
    // Poll by signature, without a WebSocket process or implicit infinite retries.
    for(let attempt=0;attempt<12;attempt++) {
      const status=(await connection.getSignatureStatuses([signature],{searchTransactionHistory:true})).value[0];
      if(status?.err)throw new Error(`keeper transaction failed: ${JSON.stringify(status.err)}`);
      if(status && ["confirmed","finalized"].includes(status.confirmationStatus))return signature;
      await new Promise(r=>setTimeout(r,5000));
    }
    throw new Error(`transaction confirmation pending: ${signature}; inspect before retrying`);
  }
  async function create({marketId,endTs,name,depositRaw},onPrepared) {
    assertMint(MINT);
    const market=client.marketPda(marketId),owner=keypair.publicKey;
    const instructions=[await client.ix.initializeMarket({authority:owner,marketId,endTs,name,initialPriceBps:5000}),
      createAssociatedTokenAccountIdempotentInstruction(owner,getAssociatedTokenAddressSync(new PublicKey(MINT),owner),owner,new PublicKey(MINT)),
      await client.ix.depositLiquidity({signer:owner,market,amount:depositRaw})];
    return {market:market.toBase58(),signature:await send(instructions,onPrepared)};
  }
  return {client,owner:keypair.publicKey,create,send};
}
