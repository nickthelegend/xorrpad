/** An optional signer. Secret material never appears in this module's results. */
import { constants } from 'node:fs';
import { open, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Keypair } from '@solana/web3.js';
import { appDataDir } from './permissions.mjs';
import { decide } from './decide.mjs';

export const MAINNET_ACK = 'XORR_ALLOW_MAINNET=I_ACKNOWLEDGE_REAL_FUNDS';
const GENESIS = {devnet:'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
  'mainnet-beta':'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'};
const permits = new WeakMap();
const digest = tx => createHash('sha256').update(tx.message.serialize()).digest('hex');
export function assertSigningCluster(cluster) {
  if (!(cluster in GENESIS)) throw new Error('signing requires devnet or mainnet-beta');
  if (cluster === 'mainnet-beta' && process.env.XORR_ALLOW_MAINNET !== 'I_ACKNOWLEDGE_REAL_FUNDS')
    throw new Error(`Mainnet signing refused: ${MAINNET_ACK}`);
}
/** A single-use capability bound to the exact message and the gate's exact size. */
export function authorizeSigning(transaction, entry, brief, policy, context = {}) {
  if (entry.state !== 'accepted' || Date.now() >= entry.expiresAt) throw new Error('signal is not accepted or has expired');
  const proposal = entry.proposal;
  const verdict = decide({...proposal.signal,sizeUsd:proposal.verdict.sizeUsd},brief,{policy,...context});
  if (proposal.verdict.action !== 'EXECUTE' || verdict.action !== 'EXECUTE' || verdict.sizeUsd !== proposal.verdict.sizeUsd ||
    (entry.automatic && !verdict.autoAccept)) throw new Error(`signing gate refused: ${verdict.ruleId}`);
  const permit = Object.freeze({});
  permits.set(permit,{hash:digest(transaction),expiresAt:entry.expiresAt,cluster:entry.cluster});
  return permit;
}
export class SessionWallet {
  #dir; #storage;
  constructor({dir = appDataDir()} = {}) { this.#dir = dir; }
  async #backend() {
    if (!this.#storage) this.#storage = (async () => {
      if (process.versions.electron) {
        const {safeStorage} = await import('electron');
        if (!safeStorage.isEncryptionAvailable() || safeStorage.getSelectedStorageBackend?.() === 'basic_text')
          throw new Error('Setup required: Electron safeStorage encryption');
        return safeStorage;
      }
      return null;
    })();
    return this.#storage;
  }
  async #file() { return path.join(this.#dir,(await this.#backend()) ? 'session-wallet.encrypted' : 'session-wallet.node.key'); }
  async #load() {
    const file = await this.#file();
    let fd;
    try {
      fd = await open(file,constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat = await fd.stat();
      if (!stat.isFile() || (stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid()))
        throw new Error('session wallet file must be owned by this user with mode 0600; group/world-readable files are refused');
      const bytes = await fd.readFile();
      const storage = await this.#backend();
      const secret = storage ? Buffer.from(storage.decryptString(bytes),'base64') : bytes;
      try { return Keypair.fromSecretKey(secret); } finally { secret.fill(0); }
    } catch (e) {
      if (e.code === 'ENOENT') throw new Error('Setup required: create or import a session wallet');
      throw e;
    } finally { await fd?.close(); }
  }
  async create() { return this.#save(Keypair.generate()); }
  async import(secret) {
    let bytes;
    if (Array.isArray(secret) && secret.length === 64 && secret.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) bytes = Uint8Array.from(secret);
    else if (typeof secret === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(secret)) bytes = Uint8Array.from(Buffer.from(secret,'base64'));
    else throw new Error('import requires a 64-byte secret key as a JSON byte array or base64');
    try { if (bytes.length !== 64) throw new Error('import requires a 64-byte secret key'); return await this.#save(Keypair.fromSecretKey(bytes)); }
    finally { bytes.fill(0); }
  }
  async #save(keypair) {
    let secret;
    try {
      await mkdir(this.#dir,{recursive:true,mode:0o700});
      const storage = await this.#backend();
      secret = storage ? storage.encryptString(Buffer.from(keypair.secretKey).toString('base64')) : Buffer.from(keypair.secretKey);
      const fd = await open(await this.#file(),'wx',0o600);
      try { await fd.writeFile(secret); await fd.sync(); } finally { await fd.close(); }
      return {publicKey:keypair.publicKey.toBase58()};
    } finally { secret?.fill(0); keypair.secretKey.fill(0); }
  }
  async info() {
    const keypair = await this.#load();
    try { return {publicKey:keypair.publicKey.toBase58()}; } finally { keypair.secretKey.fill(0); }
  }
  async sign(transaction, {permit,cluster,connection} = {}) {
    assertSigningCluster(cluster);
    const grant = permits.get(permit);
    if (!grant || grant.hash !== digest(transaction) || grant.cluster !== cluster || Date.now() >= grant.expiresAt)
      throw new Error('session signing requires a fresh gate capability for this exact transaction');
    permits.delete(permit);
    if (!connection || await connection.getGenesisHash() !== GENESIS[cluster]) throw new Error('signing RPC genesis does not match the permitted cluster');
    const keypair = await this.#load();
    try {
      if (!transaction.message.staticAccountKeys[0].equals(keypair.publicKey)) throw new Error('session wallet must be the approved fee payer');
      transaction.sign([keypair]);
      return transaction;
    } finally { keypair.secretKey.fill(0); }
  }
}
