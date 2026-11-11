/** Public metadata paths never cause the desk to load the signing key. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
export const KEY_FILE = new URL(".keeper-devnet.json",import.meta.url);
export const CREATOR_FILE = new URL(".creator-devnet.json",import.meta.url);
export const FUNDING_FILE = new URL(".funding.json",import.meta.url);
export const STATE_DIR = new URL("state/",import.meta.url);
export const RESOLUTIONS_DIR = new URL("resolutions/",import.meta.url);
export async function publicCreator() {
  try {
    const j=JSON.parse(await readFile(CREATOR_FILE,"utf8"));
    if (j.cluster !== "devnet" || typeof j.publicKey !== "string") throw new Error("invalid keeper public metadata");
    return j.publicKey;
  } catch(e) {
    if(e.code==="ENOENT") throw new Error("Setup required: run node keeper/keygen.mjs to create the devnet keeper");
    throw e;
  }
}
export async function readJson(file, fallback) {
  try {return JSON.parse(await readFile(file,"utf8"));}catch(e){if(e.code==="ENOENT")return fallback;throw e;}
}
export async function writePublicJson(file,value) {
  await writeFile(file,JSON.stringify(value,null,2)+"\n",{mode:0o644});
}
export async function ensureDirectories() {
  await mkdir(STATE_DIR,{recursive:true});await mkdir(RESOLUTIONS_DIR,{recursive:true});
}
