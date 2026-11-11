/** Read only public keeper metadata and published resolutions. Never loads its key. */
import { readFile,readdir,lstat } from "node:fs/promises";
import { PublicKey } from "@solana/web3.js";
const publicFile=new URL("../../keeper/.creator-devnet.json",import.meta.url);
const resolutionDir=new URL("../../keeper/resolutions/",import.meta.url);
export async function keeperCreator() {
  let value=process.env.KEEPER_PUBLIC_KEY;
  if(!value) {
    try {
      if(!(await lstat(publicFile)).isFile())throw new Error("keeper creator metadata must be a regular public file");
      const metadata=JSON.parse(await readFile(publicFile,"utf8"));
      if(metadata.cluster!=="devnet")throw new Error("keeper public metadata must name devnet");
      value=metadata.publicKey;
    } catch(e) {
      if(e.code==="ENOENT")throw new Error("Setup required: KEEPER_PUBLIC_KEY (or run the separate keeper keygen to publish its public metadata)");
      throw e;
    }
  }
  try {return new PublicKey(value).toBase58();}catch{throw new Error("invalid KEEPER_PUBLIC_KEY");}
}
export async function keeperResolutions() {
  const creator=await keeperCreator();
  let files;
  try {files=await readdir(resolutionDir,{withFileTypes:true});}catch(e){if(e.code!=="ENOENT")throw e;files=[];}
  const resolutions=[];
  for(const f of files) {
    if(!f.isFile() || !/^[1-9A-HJ-NP-Za-km-z]{32,44}\.json$/.test(f.name))continue;
    const record=JSON.parse(await readFile(new URL(f.name,resolutionDir),"utf8"));
    if(record.cluster!=="devnet" || record.creator!==creator || record.market!==f.name.slice(0,-5) || !record.resolveSignature || !record.hermes?.binary?.data?.length)
      throw new Error(`resolution evidence is invalid or belongs to another keeper: ${f.name}`);
    resolutions.push(record);
  }
  resolutions.sort((a,b)=>b.endTs-a.endTs);
  return {creator,cluster:"devnet",source:"keeper public resolution evidence files",resolutions};
}
