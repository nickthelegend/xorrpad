/** Funding reads public metadata only; no signing key is loaded. */
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { pathToFileURL } from "node:url";
import { guard,connectionFor,DEVNET_RPC,MINT } from "./guards.mjs";
import { publicCreator,readJson,writePublicJson,FUNDING_FILE } from "./paths.mjs";
export async function ensureFunding({depositUsdc = 50} = {}) {
  const connection=connectionFor();await guard(connection);
  const publicKey=await publicCreator(), owner=new PublicKey(publicKey);
  const ledger=await readJson(FUNDING_FILE,{});
  let lamports=await connection.getBalance(owner);
  if(lamports<500000000 && !ledger.airdropAttemptedAt) {
    ledger.airdropAttemptedAt=new Date().toISOString();await writePublicJson(FUNDING_FILE,ledger);
    const faucetConnection=connectionFor(DEVNET_RPC);await guard(faucetConnection);
    try {
      const signature=await faucetConnection.requestAirdrop(owner,1000000000);
      ledger.airdropSignature=signature;await writePublicJson(FUNDING_FILE,ledger);
      // A successful request still has to be observed on chain; never infer funding.
      for(let n=0;n<4;n++) {
        await new Promise(r=>setTimeout(r,15000));lamports=await connection.getBalance(owner);
        if(lamports>=500000000)break;
      }
    } catch(e) {
      ledger.airdropError=/410/.test(e.message)?"HTTP 410: devnet RPC faucet is closed":"devnet RPC airdrop failed";
      await writePublicJson(FUNDING_FILE,ledger);
    }
  }
  if(lamports<500000000)throw new Error(`Setup required: fund ${publicKey} with ≥0.5 devnet SOL${ledger.airdropError?` (${ledger.airdropError})`:""}`);
  const ata=getAssociatedTokenAddressSync(new PublicKey(MINT),owner);
  const balance=async()=>{const a=await connection.getAccountInfo(ata);return a?Number(a.data.readBigUInt64LE(64))/1e6:0;};
  let usdc=await balance();
  if(usdc<depositUsdc && Date.now()-Number(ledger.musdcFaucetAt || 0)>=3600000) {
    ledger.musdcFaucetAt=Date.now();await writePublicJson(FUNDING_FILE,ledger);
    const response=await fetch("https://pm-amm-devnet.vercel.app/api/faucet",{method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({wallet:publicKey}),signal:AbortSignal.timeout(20000)});
    ledger.musdcFaucetHttp=response.status;await writePublicJson(FUNDING_FILE,ledger);
    if(response.ok) {
      const body=await response.json();if(body.signature)ledger.musdcFaucetSignature=body.signature;
      await writePublicJson(FUNDING_FILE,ledger);
      await new Promise(r=>setTimeout(r,15000));usdc=await balance();
    }
  }
  if(usdc<depositUsdc)throw new Error(`Setup required: fund ${publicKey} with ≥${depositUsdc} devnet mUSDC; faucet calls are limited to one per hour`);
  return {publicKey,lamports,musdc:usdc,connection};
}
if(process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url) {
  try {const result=await ensureFunding({depositUsdc:Number(process.env.KEEPER_DEPOSIT_USDC || 50)});console.log(`devnet funding confirmed: ${result.publicKey}`);}
  catch(e){console.error(e.message);process.exitCode=1;}
}
