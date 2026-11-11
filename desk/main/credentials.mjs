/** API credentials are persisted only by Electron's OS-backed safeStorage. */
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import { appDataDir } from './permissions.mjs';
const NAMES = new Set(['anthropic','openai','deepgram','groq','tailscale','pad-token']);
export class Credentials {
  constructor({dir = appDataDir()} = {}) { this.dir = dir; }
  file(name) {
    if (!NAMES.has(name)) throw new Error('invalid credential name');
    return path.join(this.dir, `${name}.encrypted`);
  }
  async storage() {
    if (!process.versions.electron) throw new Error('Setup required: Electron safeStorage encryption');
    const {safeStorage} = await import('electron');
    if (!safeStorage.isEncryptionAvailable() || safeStorage.getSelectedStorageBackend?.() === 'basic_text')
      throw new Error('Setup required: Electron safeStorage encryption');
    return safeStorage;
  }
  async get(name) {
    let bytes;
    try { bytes = await readFile(this.file(name)); }
    catch (e) { if (e.code === 'ENOENT') return ''; throw e; }
    return (await this.storage()).decryptString(bytes);
  }
  async set(name, value) {
    const file = this.file(name);
    if (typeof value !== 'string' || value.length > 16384 || /[\r\n]/.test(value)) throw new Error('invalid API key');
    if (!value.trim()) { await rm(file,{force:true}); return; }
    const encrypted = (await this.storage()).encryptString(value.trim());
    await mkdir(this.dir,{recursive:true,mode:0o700});
    const temp=file+'.'+randomUUID()+'.tmp';
    try {await writeFile(temp,encrypted,{mode:0o600,flag:'wx'});await rename(temp,file);}
    finally {encrypted.fill(0);await rm(temp,{force:true});}
  }
  async masked(name) { const key = await this.get(name); return key ? `••••${key.slice(-4)}` : ''; }
}
