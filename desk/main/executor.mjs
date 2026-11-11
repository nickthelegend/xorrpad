/** Shared executor. The venue adapters remain unsigned builders. */
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { Connection, VersionedTransaction } from '@solana/web3.js';
import { Permissions, appDataDir } from './permissions.mjs';
import { SessionWallet, authorizeSigning, assertSigningCluster } from './session-wallet.mjs';
import { decide } from './decide.mjs';
import { propose, buildRouted } from './propose.mjs';
import { walletHandoff } from './wallet-requests.mjs';
import { withTradeLock } from './lock.mjs';

const GENESIS = {devnet:'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
  'mainnet-beta':'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'};
const hash = tx => createHash('sha256').update(tx.message.serialize()).digest('hex');
const decode = text => VersionedTransaction.deserialize(Buffer.from(text,'base64'));
export function verifySignedTransaction(tx) {
  const message = tx.message.serialize(), required = tx.message.header.numRequiredSignatures;
  if (tx.signatures.length !== required) throw new Error('missing transaction signatures');
  for (let i = 0; i < required; i++) {
    const publicKey = createPublicKey({format:'der',type:'spki',key:Buffer.concat([
      Buffer.from('302a300506032b6570032100','hex'),tx.message.staticAccountKeys[i].toBuffer()])});
    if (!verify(null,message,publicKey,tx.signatures[i])) throw new Error('invalid transaction signature');
  }
}
function readJson(file, fallback) {
  try { return JSON.parse(readFileSync(file,'utf8')); } catch(e) { if (e.code === 'ENOENT') return fallback; throw e; }
}
function saveJson(file, value) {
  mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600}); renameSync(tmp,file);
}
export class Executor {
  #pending = new Map(); #ledger; #file; #settings;
  constructor({mem,signals,dir = appDataDir(),isArmed = () => true} = {}) {
    Object.assign(this,{mem,signals,isArmed});
    this.permissions = new Permissions({dir}); this.wallet = new SessionWallet({dir});
    this.#file = path.join(dir,'execution-ledger.json'); this.#settings = path.join(dir,'wallet-mode.json');
    this.#ledger = readJson(this.#file,{});
    signals.on('event',e => {
      if (e.type === 'signal' && ['refused','expired'].includes(e.signal.state)) this.#pending.delete(e.signal.id);
    });
  }
  mode() { return readJson(this.#settings,{mode:'phone'}).mode; }
  setMode(mode) {
    if (!['phone','session'].includes(mode)) throw new Error('wallet mode must be phone or session');
    saveJson(this.#settings,{mode}); return {mode};
  }
  #save() { saveJson(this.#file,this.#ledger); }
  #connection(cluster,venue) {
    if (!(cluster in GENESIS)) throw new Error('unsupported transaction cluster');
    const endpoint = cluster === 'devnet' ? process.env.PMAMM_RPC || 'https://api.devnet.solana.com'
      : (venue === 'phoenix' ? process.env.PHOENIX_RPC : process.env.SOLANA_RPC) || 'https://api.mainnet-beta.solana.com';
    return new Connection(endpoint,{commitment:'confirmed',disableRetryOnRateLimit:true,
      fetch:(url,options) => fetch(url,{...options,signal:AbortSignal.timeout(20000)})});
  }
  #budget(brief,id) {
    const today = new Date(); today.setHours(0,0,0,0);
    const records = Object.entries(this.#ledger).filter(([k]) => k !== id).map(([,v]) => v);
    const spent = records.filter(v => v.status === 'executed' && v.at >= +today).reduce((n,v) => n+v.usd,0);
    const reservedUsd = records.filter(v => v.status !== 'executed' && v.status !== 'released').reduce((n,v) => n+v.usd,0);
    const held = new Set(records.filter(v => v.status !== 'released' && v.side !== 'SELL' && !brief.positions?.[v.symbol]).map(v => v.symbol));
    return {brief:{...brief,spent_today:Math.max(brief.spent_today || 0,spent)},context:{reservedUsd,reservedPositions:held.size,
      lastTradeAt:Math.max(0,...records.filter(v => v.status !== 'released').map(v => v.at))}};
  }
  async #gate(id, proposal) {
    const entry = this.signals.get(id);
    if (!this.isArmed()) throw new Error('disarmed — re-arm before trading');
    if (entry?.state !== 'accepted' || Date.now() >= entry.expiresAt) throw new Error('signal is not accepted or has expired');
    const {brief,context} = this.#budget(await this.mem.recallBrief(),id), policy = this.permissions.read();
    const verdict = decide({...proposal.signal,sizeUsd:proposal.verdict.sizeUsd},brief,{policy,...context});
    if (verdict.action !== 'EXECUTE' || verdict.sizeUsd !== proposal.verdict.sizeUsd || (entry.automatic && !verdict.autoAccept))
      throw new Error(`execution gate refused: ${verdict.ruleId}: ${verdict.why.at(-1)}`);
    return {entry,brief,context,policy};
  }
  execute(id) { return withTradeLock(async () => {
    const entry = this.signals.get(id);
    if (!entry || entry.state !== 'accepted') return entry;
    if (this.#pending.has(id)) return this.#pending.get(id).public;
    try {
      await this.#gate(id,entry.proposal);
      const mode = this.mode(), cluster = entry.proposal.routing?.best?.network;
      if (mode === 'session') assertSigningCluster(cluster);
      const owner = mode === 'session' ? (await this.wallet.info()).publicKey
        : entry.proposal.signal.kind === 'perp' ? (entry.proposal.signal.venue === 'phoenix' ? process.env.PHOENIX_AUTHORITY : process.env.JUPPERPS_AUTHORITY) || process.env.SOLANA_ADDRESS : process.env.SOLANA_ADDRESS;
      if (!owner) throw new Error('Setup required: SOLANA_ADDRESS (phone wallet public key)');
      const fresh = await propose({...entry.proposal.signal,sizeUsd:entry.proposal.verdict.sizeUsd},await this.mem.recallBrief());
      if (fresh.verdict.action !== 'EXECUTE' || fresh.verdict.sizeUsd !== entry.proposal.verdict.sizeUsd || fresh.signal.venue !== entry.proposal.signal.venue)
        throw new Error('accepted size or venue changed; create a fresh signal');
      const built = await buildRouted(fresh,{owner,request:false});
      const tx = decode(built.unsignedTx), connection = this.#connection(cluster,fresh.signal.venue);
      if (built.cluster && built.cluster !== cluster) throw new Error('builder returned a different cluster');
      if (tx.message.staticAccountKeys[0].toBase58() !== owner || tx.signatures.some(s => s.some(b => b !== 0))) throw new Error('builder must return an unsigned transaction for the approved owner');
      if (await connection.getGenesisHash() !== GENESIS[cluster]) throw new Error('execution RPC genesis mismatch');
      const gated = await this.#gate(id,fresh);
      this.#ledger[id] = {usd:fresh.verdict.sizeUsd,symbol:fresh.signal.symbol,side:fresh.signal.side,at:Date.now(),status:'reserved',cluster}; this.#save();
      const record = {proposal:fresh,built,tx,connection,cluster,owner,mode}; this.#pending.set(id,record);
      if (mode === 'session') {
        const permit = authorizeSigning(tx,{...gated.entry,proposal:fresh,cluster},gated.brief,gated.policy,gated.context);
        const signed = await this.wallet.sign(tx,{permit,cluster,connection,recheck:() => this.#gate(id,fresh)});
        return await this.#submit(id,record,signed);
      }
      const variable = fresh.signal.venue === 'pmamm' ? 'PMAMM_PUBLIC_URL' : fresh.signal.venue === 'phoenix' ? 'PHOENIX_PUBLIC_URL' : 'SOLANA_PAY_PUBLIC_URL';
      const handoff = walletHandoff(owner,async () => withTradeLock(async () => {
        await this.#gate(id,fresh);
        // Keep the exact message so a submitted phone signature can be bound to it.
        if (!this.#pending.has(id)) throw new Error('signal handoff is no longer active');
        return built;
      }),{label:`xorrpad ${fresh.signal.venue} · ${cluster}`,variable});
      record.public = {ok:true,handoff:true,signalId:id,quote:fresh.routing.best.quote,routing:fresh.routing,
        transaction:{unsignedTx:built.unsignedTx,signWith:owner,...handoff},setupRequired:handoff.setupRequired || null,
        note:'Sign with the phone wallet; POST signedTx or its submitted signature to /signals/:id/sign.'};
      this.signals.publish({type:'wallet_request',id,...record.public});
      return record.public;
    } catch(error) { return this.#fail(id,error); }
  }); }
  completePhone(id,{signedTx,signature} = {}) { return withTradeLock(async () => {
    const record = this.#pending.get(id);
    if (!record || record.mode !== 'phone') throw new Error('no pending phone wallet transaction');
    try {
      await this.#gate(id,record.proposal);
      if (signedTx) {
        const tx = decode(signedTx);
        if (hash(tx) !== hash(record.tx)) throw new Error('signed message differs from the accepted transaction');
        verifySignedTransaction(tx);
        return await this.#submit(id,record,tx);
      }
      if (typeof signature !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature)) throw new Error('provide signedTx or a submitted Solana signature');
      const chain = await record.connection.getTransaction(signature,{commitment:'confirmed',maxSupportedTransactionVersion:0});
      if (!chain) throw new Error('submitted transaction is not confirmed yet');
      if (chain.transaction.signatures[0] !== signature || hash({message:chain.transaction.message}) !== hash(record.tx)) throw new Error('confirmed signature does not match the accepted transaction');
      if (chain.meta?.err) throw new Error(`transaction failed: ${JSON.stringify(chain.meta.err)}`);
      await this.signals.transition(id,'signed',{signature});
      return this.#receipt(id,record,signature);
    } catch(error) { return this.#fail(id,error); }
  }); }
  async #submit(id,record,tx) {
    verifySignedTransaction(tx);
    await this.#gate(id,record.proposal);
    // Record signed before the network call: an ambiguous timeout must retain its reservation.
    await this.signals.transition(id,'signed');
    this.#ledger[id].status = 'signed'; this.#save();
    const signature = await record.connection.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:3});
    this.#ledger[id].signature = signature; this.#save();
    this.signals.publish({type:'submitted',id,signature});
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(),60000);
    try {
      const result = await record.connection.confirmTransaction({signature,blockhash:tx.message.recentBlockhash,
        lastValidBlockHeight:record.built.lastValidBlockHeight ?? await record.connection.getBlockHeight()+150,abortSignal:controller.signal},'confirmed');
      if (result.value.err) throw new Error(`transaction failed: ${JSON.stringify(result.value.err)}`);
    } finally { clearTimeout(timer); }
    return this.#receipt(id,record,signature);
  }
  async #receipt(id,record,signature) {
    if (Object.entries(this.#ledger).some(([key,v]) => key !== id && v.signature === signature)) throw new Error('signature already belongs to another signal');
    const explorer = `https://explorer.solana.com/tx/${signature}${record.cluster === 'devnet' ? '?cluster=devnet' : ''}`;
    const receipt = {signalId:id,signature,explorer,cluster:record.cluster,venue:record.proposal.signal.venue,usd:record.proposal.verdict.sizeUsd,confirmedAt:new Date().toISOString()};
    Object.assign(this.#ledger[id],{status:'executed',signature,receipt,at:Date.now()}); this.#save();
    await this.mem.journal({evaluated:{signal:record.proposal.signal,verdict:record.proposal.verdict},
      acted:{action:'EXECUTED',executed:true,usd:receipt.usd,signature,explorer,ruleId:record.proposal.verdict.ruleId},forward:{receipt}});
    await this.mem.setEntity('receipt',id,receipt);
    await this.signals.transition(id,'executed',{receipt});
    this.signals.publish({type:'receipt',receipt}); this.#pending.delete(id);
    return {ok:true,receipt};
  }
  async #fail(id,error) {
    const entry = this.signals.get(id);
    if (entry && ['accepted','signed'].includes(entry.state)) await this.signals.transition(id,'failed',{error:error.message,ruleId:'executor.failed'});
    this.#pending.delete(id);
    return {ok:false,error:error.message,signature:this.#ledger[id]?.signature || null};
  }
}
