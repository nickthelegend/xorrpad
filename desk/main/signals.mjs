/** Signal state machine. Snapshots are copies; callers cannot edit queue state. */
import {trustedSignal,fingerprint} from './pad-v2.mjs';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

const NEXT = {
  proposed:['auto_accepted','awaiting','refused'], auto_accepted:['accepted','refused','expired'],
  awaiting:['accepted','refused','expired'], accepted:['signed','refused','expired','failed'],
  signed:['executed','failed'], refused:[], expired:[], executed:[], failed:[],
};
export class SignalQueue extends EventEmitter {
  #entries = new Map(); #timers = new Map(); #tail = Promise.resolve();
  constructor({ ttlSeconds = 60, gate, journal, announce, onAccepted, acceptGuard } = {}) {
    super();
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > 86400) throw new Error('invalid signal expiry');
    Object.assign(this, {ttlSeconds, gate, journal, announce, onAccepted, acceptGuard});
  }
  serial(fn) { const p = this.#tail.then(fn); this.#tail = p.catch(() => {}); return p; }
  get(id) { const e = this.#entries.get(id); if(!e)return null;const copy=structuredClone(e);try{copy.trusted=trustedSignal(copy);copy.fingerprint=fingerprint(copy.trusted);}catch{copy.trustedUnavailable='Refresh executable price and fee quote';}return copy; }
  list() { return [...this.#entries.values()].map(e => this.get(e.id)); }
  publish(event) { this.emit('event', {at:new Date().toISOString(), ...event}); }
  async #move(e, state, extra = {}) {
    if (!NEXT[e.state]?.includes(state)) throw new Error(`invalid signal transition ${e.state} → ${state}`);
    await this.journal?.({evaluated:{signal:e.proposal.signal,signalId:e.id},
      acted:{action:state,executed:false,ruleId:extra.ruleId || e.proposal.verdict.ruleId},forward:{...extra}});
    Object.assign(e, extra, {state, updatedAt:new Date().toISOString()});
    if (['refused','expired','signed','failed'].includes(state)) { clearTimeout(this.#timers.get(e.id)); this.#timers.delete(e.id); }
    this.publish({type:'signal', signal:this.get(e.id)});
    return this.get(e.id);
  }
  async create(proposal) {
    return this.serial(async () => {
      if (this.#entries.size >= 256) {
        for (const [id,e] of this.#entries) if (!NEXT[e.state].length) { this.#entries.delete(id); break; }
        if (this.#entries.size >= 256) throw new Error('signal queue is full');
      }
      const now = Date.now(), e = {id:randomUUID(), state:'proposed', proposal:structuredClone(proposal),
        createdAt:new Date(now).toISOString(), expiresAt:now + this.ttlSeconds * 1000};
      await this.journal?.({evaluated:{signal:proposal.signal,signalId:e.id},
        acted:{action:'proposed',executed:false,ruleId:proposal.verdict.ruleId},forward:{why:proposal.verdict.why}});
      this.#entries.set(e.id,e); this.publish({type:'signal',signal:this.get(e.id)});
      if (proposal.verdict.action !== 'EXECUTE') return this.#move(e,'refused',{ruleId:proposal.verdict.ruleId});
      const timer = setTimeout(() => this.expire(e.id).catch(error => this.publish({type:'signal_error',id:e.id,error:error.message})), this.ttlSeconds * 1000);
      timer.unref(); this.#timers.set(e.id,timer);
      if (proposal.verdict.autoAccept) {
        const blocked = await this.#refuseBlocked(e);
        if (blocked) return blocked;
        try { await this.announce?.(this.get(e.id)); }
        catch (error) { return this.#move(e,'awaiting',{setupRequired:error.message,ruleId:'signals.speech_required'}); }
        await this.#move(e,'auto_accepted',{ruleId:proposal.verdict.ruleId});
        return this.#accept(e,true);
      }
      return this.#move(e,'awaiting');
    });
  }
  async #refuseBlocked(e) {
    const reason = this.acceptGuard?.(e.proposal.signal);
    if (!reason) return null;
    e.proposal.verdict = {...e.proposal.verdict, action:'REJECT', autoAccept:false,
      ruleId:'signals.tilt_guard', why:[reason]};
    return this.#move(e,'refused',{ruleId:'signals.tilt_guard'});
  }
  async #accept(e, automatic = false, expectedFingerprint) {
    if (Date.now() >= e.expiresAt) return this.#move(e,'expired',{ruleId:'signals.expiry'});
    let blocked = await this.#refuseBlocked(e);
    if (blocked) return blocked;
    const fresh = this.gate ? await this.gate(this.get(e.id)) : e.proposal;
    if (Date.now() >= e.expiresAt) return this.#move(e,'expired',{ruleId:'signals.expiry'});
    blocked = await this.#refuseBlocked(e);
    if (blocked) return blocked;
    let original;try{original=fingerprint(trustedSignal(e));}catch{}
    if(expectedFingerprint&&original!==expectedFingerprint)throw Error('displayed signal fingerprint changed');
    if(expectedFingerprint){let updated;try{updated=fingerprint(trustedSignal({...e,proposal:fresh}));}catch{}if(updated!==original)return this.#move(e,'refused',{ruleId:'signals.quote_changed'});}
    e.proposal = structuredClone(fresh);
    if (fresh.verdict.action !== 'EXECUTE' || (automatic && !fresh.verdict.autoAccept))
      return this.#move(e,'refused',{ruleId:fresh.verdict.ruleId});
    const result = await this.#move(e,'accepted',{automatic,ruleId:fresh.verdict.ruleId});
    // Execution has its own trade lock. Do not await it while holding the queue lock.
    if (this.onAccepted) queueMicrotask(() => Promise.resolve(this.onAccepted(result)).catch(error => this.publish({type:'execution_error',id:e.id,error:error.message})));
    return result;
  }
  accept(id, expectedFingerprint) { return this.serial(async () => { const e = this.#require(id); if (e.state !== 'awaiting') throw new Error(`signal is ${e.state}`); return this.#accept(e,false,expectedFingerprint); }); }
  refuse(id, ruleId = 'signals.operator_refused') { return this.serial(async () => {
    const e = this.#require(id);
    if (!['awaiting','auto_accepted','accepted'].includes(e.state)) throw new Error(`signal is ${e.state}`);
    return this.#move(e, Date.now() >= e.expiresAt ? 'expired' : 'refused', {ruleId});
  }); }
  expire(id) { return this.serial(async () => {
    const e = this.#require(id);
    return ['awaiting','auto_accepted','accepted'].includes(e.state) && Date.now() >= e.expiresAt
      ? this.#move(e,'expired',{ruleId:'signals.expiry'}) : this.get(id);
  }); }
  transition(id, state, extra) { return this.serial(() => this.#move(this.#require(id),state,extra)); }
  #require(id) { const e = this.#entries.get(id); if (!e) throw new Error('signal not found'); return e; }
  async cancelAll(ruleId = 'signals.panic') {
    for (const e of this.list()) if (['awaiting','auto_accepted','accepted'].includes(e.state)) await this.refuse(e.id,ruleId);
  }
  close() { for (const t of this.#timers.values()) clearTimeout(t); this.#timers.clear(); }
}

/** Bearer/x-pad-token for native clients; token subprotocol for browser WebSocket. */
export function attachEvents(server, queue, token) {
  const wss = new WebSocketServer({noServer:true, maxPayload:1024,
    handleProtocols:protocols => protocols.has('xorrpad') ? 'xorrpad' : false});
  server.on('upgrade', (req,socket,head) => {
    const url = new URL(req.url,'http://localhost');
    if (url.pathname === '/padlink') return; // owned by the pad protocol bridge
    const auth = req.headers.authorization || '';
    const protocols = String(req.headers['sec-websocket-protocol'] || '').split(',').map(s => s.trim());
    const given = auth.startsWith('Bearer ') ? auth.slice(7) : req.headers['x-pad-token'] ||
      protocols.find(s => s.startsWith('pad-token.'))?.slice(10);
    if (url.pathname !== '/events' || given !== token) {
      socket.end(`HTTP/1.1 ${url.pathname === '/events' ? '401 Unauthorized' : '404 Not Found'}\r\nConnection: close\r\n\r\n`); return;
    }
    wss.handleUpgrade(req,socket,head,ws => {
      ws.on('error',() => {});
      ws.send(JSON.stringify({type:'snapshot',signals:queue.list()}));
    });
  });
  const broadcast = e => {
    const data = JSON.stringify(e,(_k,v) => typeof v === 'bigint' ? v.toString() : v);
    for (const ws of wss.clients) if (ws.readyState === WebSocket.OPEN) {
      if (ws.bufferedAmount > 1024 * 1024) ws.terminate(); else ws.send(data);
    }
  };
  queue.on('event',broadcast);
  server.on('close',() => { queue.off('event',broadcast); queue.close(); for (const ws of wss.clients) ws.terminate(); wss.close(); });
  return wss;
}
