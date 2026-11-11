/** Creates this keeper's devnet key once. Stdout contains ONLY its public key. */
import { Keypair } from "@solana/web3.js";
import { access, open, writeFile } from "node:fs/promises";
import { KEY_FILE,CREATOR_FILE } from "./paths.mjs";
try {
  try {await access(CREATOR_FILE);throw new Error("keeper public metadata already exists; refusing to overwrite");}
  catch(e){if(e.code!=="ENOENT")throw e;}
  const file=await open(KEY_FILE,"wx",0o600);
  try {
    const keypair=Keypair.generate(), publicKey=keypair.publicKey.toBase58();
    await file.writeFile(JSON.stringify(Array.from(keypair.secretKey))+"\n");
    await file.sync();
    await writeFile(CREATOR_FILE,JSON.stringify({publicKey,cluster:"devnet"})+"\n",{flag:"wx",mode:0o644});
    process.stdout.write(publicKey+"\n");
  } finally {await file.close();}
} catch(e) {console.error(e.code==="EEXIST"?"keeper key already exists; refusing to overwrite":e.message);process.exitCode=1;}
