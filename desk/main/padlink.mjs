/** v1 NDJSON bridge. All trade inputs use the existing authenticated/gated API. */
import {EventEmitter} from 'node:events';
import {Duplex} from 'node:stream';
import {readFileSync, mkdirSync, writeFileSync, renameSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {WebSocketServer, WebSocket} from 'ws';
import {appDataDir} from './permissions.mjs';

export const UART = '6e400001b5a3f393e0a9e50e24dcca9e';
export const CELLS = [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2],[2,3],[3,0],[3,1],[3,2],[3,3]];
const ACTIONS = ['momentum','grid','dca','risk','yield','rebalance','no','yes','buy','base','kill','mic','sell','portfolio'];
export const DEFAULT_KEYMAP = {revision:0,keys:CELLS.map(([row,col],i) => ({row,col,action:ACTIONS[i],label:ACTIONS[i].toUpperCase()}))};
export function validateKeymap(map) {
  if (!map || !Number.isSafeInteger(map.revision) || map.revision < 0 || map.revision > 0xffffffff || !Array.isArray(map.keys) || map.keys.length !== 14) throw new Error('invalid keymap');
  const cells = new Set();
  for (const k of map.keys) {
    const index = CELLS.findIndex(([r,c]) => r === k.row && c === k.col);
    if (index < 0 || cells.has(index) || !/^[a-zA-Z0-9_.:-]{1,96}$/.test(k.action) || !/^[\x20-\x7e]{1,16}$/.test(k.label)) throw new Error('invalid key binding');
    cells.add(index);
    for (const control of ['mic','kill','yes','no']) if ((k.action === control) !== (ACTIONS[index] === control)) throw new Error(`preserve ${control} control`);
  }
  return structuredClone({revision:map.revision,keys:map.keys.map(({row,col,action,label}) => ({row,col,action,label}))});
}
export class Lines {
  pending = Buffer.alloc(0);
  constructor(onLine) { this.onLine = onLine; }
  feed(data) {
    this.pending = Buffer.concat([this.pending,Buffer.from(data)]);
    let end;
    while ((end = this.pending.indexOf(10)) >= 0) {
      const line = this.pending.subarray(0,end); this.pending = this.pending.subarray(end+1);
      if (line.length > 4095) throw new Error('pad record too large');
      const text = line.toString('utf8').trim();
      if (!text.startsWith('{')) continue; // boot/telnet diagnostics on CDC
      const message = JSON.parse(text);
      if (message.v !== 1 || typeof message.type !== 'string') throw new Error('unsupported pad record');
      this.onLine(message);
    }
    if (this.pending.length > 4095) throw new Error('pad record too large');
  }
}
const encode = m => JSON.stringify({v:1,...m},(_k,v) => typeof v === 'bigint' ? v.toString() : v)+'\n';

export class PadLink extends EventEmitter {
  peers = new Set(); seen = new Map(); stopped = false;
  constructor({baseUrl,token,signals,voiceInput,status = () => ({}),dir = appDataDir()} = {}) {
    super(); Object.assign(this,{baseUrl,token,signals,status,voiceInput});
    this.keymapFile = path.join(dir,'pad-keymap.json');
    try { this.keymap = validateKeymap(JSON.parse(readFileSync(this.keymapFile,'utf8'))); }
    catch (e) { if (e.code !== 'ENOENT') throw e; this.keymap = structuredClone(DEFAULT_KEYMAP); }
    this.onEvent = e => this.forward(e);
    signals?.on('event',this.onEvent);
    this.heartbeat = setInterval(() => {
      for (const peer of this.peers) {
        if (!peer.streams.size && Date.now()-peer.last > 15000) this.remove(peer);
        else if (peer.device) this.send(peer,this.getStatus(peer));
      }
    },5000); this.heartbeat.unref();
  }
  getStatus(peer) {
    try {return {type:'status',...this.status(),link:peer.name};}
    catch {return {type:'status',armed:false,autoAccept:false,venue:'',link:peer.name};}
  }
  peer(name,write,close = () => {}) {
    if (this.stopped || this.peers.size >= 16) throw new Error('pad link unavailable');
    const p = {name,write,close,last:Date.now(),tail:Promise.resolve(),streams:new Map()};
    p.lines = new Lines(m => { p.tail = p.tail.then(() => this.receive(p,m)).catch(e => this.send(p,{type:'result',id:m.id,ok:false,error:e.message,status:e.message.startsWith('Setup required:')?'Setup required':undefined})); });
    this.peers.add(p); return p;
  }
  remove(p) { if (this.peers.delete(p)) { for(const s of p.streams.values())s.live?.abort(); p.streams.clear(); p.close(); } }
  send(p,m) {
    if (!this.peers.has(p)) return;
    const line = encode(m);
    if (Buffer.byteLength(line)>4096) throw new Error('outbound pad record too large');
    try { p.write(line); } catch { this.remove(p); }
  }
  attach(stream,name = 'usb') {
    const peer = this.peer(name,line => { if (stream.writableLength > 1024*1024) throw new Error('pad stalled'); stream.write(line); },() => {if(stream.isOpen && !stream.closing && typeof stream.close==='function')stream.close(() => stream.destroy());else stream.destroy();});
    stream.on('data',data => {try {peer.lines.feed(data);} catch {this.remove(peer);}});
    stream.on('error',() => this.remove(peer)); stream.on('close',() => this.remove(peer));
    this.send(peer,{type:'ping'}); return peer;
  }
  setKeymap(map) {
    const value = validateKeymap(map);
    if (value.revision <= this.keymap.revision) throw new Error('keymap revision must increase');
    mkdirSync(path.dirname(this.keymapFile),{recursive:true});
    writeFileSync(this.keymapFile+'.tmp',JSON.stringify(value)+'\n',{mode:0o600});
    renameSync(this.keymapFile+'.tmp',this.keymapFile); this.keymap = value;
    for (const p of this.peers) if (p.device) this.send(p,{type:'keymap',...value});
    return value;
  }
  signal(p,e) {
    const remainingMs = Math.max(0,e.expiresAt-Date.now());
    if (e.state === 'awaiting') {
      const {signal:s,verdict:v,routing} = e.proposal;
      this.send(p,{type:'signal',signalId:e.id,state:e.state,remainingMs,autoAccept:!!v.autoAccept,
        market:s.symbol,side:s.side,sizeUsd:v.sizeUsd,venue:s.venue || routing?.best?.venue || '',why:(v.why || []).join('; ').slice(0,180)});
    } else this.send(p,{type:'signal_state',signalId:e.id,state:e.state,remainingMs,autoAccept:!!e.automatic});
  }
  forward(e) {
    for (const p of this.peers) if (p.device) {
      if (e.type === 'signal') this.signal(p,e.signal);
      if (e.type === 'receipt') this.send(p,{type:'receipt',signalId:e.id || e.signalId,...e.receipt});
      if (e.type === 'speech_chunk') this.send(p,{type:'tts',stream:e.stream,seq:e.seq,end:e.end,sampleRate:16000,pcm:e.pcm});
      if (e.type === 'speech' && e.pcm) this.audio(p,Buffer.from(e.pcm,'base64'));
    }
  }
  audio(p,pcm) {
    const stream = randomUUID(); let seq=0;
    for (let i=0;i<pcm.length;i+=512) this.send(p,{type:'tts',stream,seq:seq++,end:i+512>=pcm.length,sampleRate:16000,pcm:pcm.subarray(i,i+512).toString('base64')});
  }
  async request(route,body,raw = false) {
    const response = await fetch(this.baseUrl+route,{method:'POST',headers:{authorization:`Bearer ${this.token}`,'content-type':raw?'application/octet-stream':'application/json'},body:raw?body:JSON.stringify(body),signal:AbortSignal.timeout(65000)});
    if (raw && response.ok) return Buffer.from(await response.arrayBuffer());
    const result = await response.json();
    if (!response.ok || result.ok === false || result.execution?.ok === false) throw new Error(result.error || result.execution?.error || `backend ${response.status}`);
    return result;
  }
  async receive(p,m) {
    if (!this.peers.has(p)) return;
    p.last = Date.now();
    if (m.type === 'hello') {
      if (typeof m.device !== 'string' || !/^[\w-]{1,64}$/.test(m.device) || m.fw !== '1.0.0') throw new Error('invalid pad hello');
      p.device = m.device;
      this.send(p,{type:'caps',heartbeatMs:5000,maxLine:4096,sampleRate:16000});
      this.send(p,{type:'keymap',...this.keymap}); this.send(p,this.getStatus(p));
      for (const e of this.signals?.list() || []) if (e.state === 'awaiting') this.signal(p,e);
      return;
    }
    if (m.type === 'ping') { this.send(p,this.getStatus(p)); return; }
    if (!p.device) throw new Error('hello required');
    if (m.type === 'keymap_state') { this.signals?.publish({type:'pad',device:p.device,message:m}); return; }
    if (!['key','knob','signal_state','voice'].includes(m.type)) throw new Error('unsupported pad message');
    if (typeof m.id !== 'string' || !/^[\w:-]{1,96}$/.test(m.id)) throw new Error('event id required');
    const identity = p.device+':'+m.id;
    if (this.seen.has(identity)) { this.send(p,{type:'result',id:m.id,ok:false,error:'duplicate event; refresh state'}); return; }
    this.seen.set(identity,true);
    if (this.seen.size>8192) this.seen.delete(this.seen.keys().next().value);
    this.signals?.publish({type:'pad',device:p.device,link:p.name,message:m.type === 'voice' ? {...m,pcm:undefined,bytes:Buffer.from(m.pcm || '','base64').length} : m});
    if (m.type === 'key') {
      if (m.edge !== 'down' || !/^[a-zA-Z0-9_.:-]{1,96}$/.test(m.action)) throw new Error('invalid key');
      if (['yes','no'].includes(m.action)) {
        if (!m.signalId) throw new Error('displayed signal id required');
        await this.request(`/signals/${encodeURIComponent(m.signalId)}/${m.action === 'yes'?'accept':'refuse'}`,{});
      } else {
        const outcome=m.action.match(/^pmamm:([1-9A-HJ-NP-Za-km-z]{32,44}):(yes|no)$/);
        if (outcome) await this.request('/signals',{kind:'predict',market:outcome[1],side:outcome[2],size:this.getStatus(p).sizeUsd});
        else await this.request('/key',{id:m.action});
      }
    } else if (m.type === 'signal_state') {
      if (!['accept','refuse'].includes(m.state) || !/^[\w-]{1,96}$/.test(m.signalId)) throw new Error('invalid signal answer');
      await this.request(`/signals/${m.signalId}/${m.state}`,{});
    } else if (m.type === 'knob') {
      if (!Number.isFinite(m.sizeUsd) || m.sizeUsd<=0) throw new Error('invalid knob size');
      await this.request('/size',{usd:m.sizeUsd});
    } else {
      if (m.sampleRate !== 16000 || !Number.isInteger(m.seq) || typeof m.stream !== 'string' || m.stream.length>96 || typeof m.end !== 'boolean' || typeof m.pcm !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(m.pcm)) throw new Error('invalid PCM chunk');
      const pcm = Buffer.from(m.pcm,'base64');
      if (pcm.length>512 || pcm.length%2) throw new Error('invalid PCM length');
      // One bounded utterance per connection. Idle streams expire even on a live link.
      for (const [id,s] of p.streams) if (Date.now()-s.at>15000) {s.live?.abort();p.streams.delete(id);}
      if (m.seq===0 && p.streams.size===0) p.streams.set(m.stream,{seq:0,chunks:[],bytes:0,live:await this.voiceInput?.(p.device)});
      const s = p.streams.get(m.stream);
      if (!s || s.seq!==m.seq || s.bytes+pcm.length>384000) {s?.live?.abort();p.streams.delete(m.stream);throw new Error('voice sequence/limit');}
      s.seq++; s.at=Date.now(); s.bytes+=pcm.length;
      if (s.live) {
        try {s.live.write(pcm);if(m.end)await s.live.finish();}
        catch(e){s.live.abort();p.streams.delete(m.stream);throw e;}
        finally {if(m.end)p.streams.delete(m.stream);}
      } else {
        s.chunks.push(pcm);
        if (m.end) {p.streams.delete(m.stream); this.audio(p,await this.request('/voice',Buffer.concat(s.chunks),true));}
      }
    }
    this.send(p,{type:'result',id:m.id,ok:true});
  }
  async http(req,res,device) {
    let p = [...this.peers].find(p => p.httpDevice === device);
    if (!/^[\w-]{1,64}$/.test(device || '')) {res.writeHead(400);res.end();return;}
    if (!p) {
      const out=[];
      p=this.peer('wifi',line => {if(out.length>=1024) throw new Error('pad stalled');out.push(line);});
      p.out=out; p.httpDevice=device;
    }
    try {
      let bytes=0;
      for await (const data of req) {bytes+=data.length;if(bytes>65536) throw new Error('pad request too large');p.lines.feed(data);}
      if (p.lines.pending.length) throw new Error('incomplete pad record');
      await p.tail;
      if (p.device && p.device!==device) throw new Error('device mismatch');
      res.writeHead(200,{'content-type':'application/x-ndjson'});res.end(p.out.splice(0).join(''));
    } catch {this.remove(p);res.writeHead(400);res.end();}
  }
  bind(server) {
    const wss = new WebSocketServer({noServer:true,maxPayload:65536,handleProtocols:ps => ps.has('xorrpad')?'xorrpad':false});
    server.on('upgrade',(req,socket,head) => {
      if (new URL(req.url,'http://localhost').pathname!=='/padlink') return;
      const protocols = String(req.headers['sec-websocket-protocol'] || '').split(',').map(s => s.trim());
      const given = req.headers.authorization?.replace(/^Bearer /,'') || req.headers['x-pad-token'] || protocols.find(s => s.startsWith('pad-token.'))?.slice(10);
      if (given!==this.token) {socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');return;}
      wss.handleUpgrade(req,socket,head,ws => {
        let p;
        try {p=this.peer('wifi',line => {if(ws.bufferedAmount>1024*1024) throw new Error('pad stalled');ws.send(line);},() => ws.terminate());}
        catch {ws.terminate();return;}
        ws.on('message',data => {try {p.lines.feed(data);} catch {this.remove(p);}});
        ws.on('error',() => this.remove(p));ws.on('close',() => this.remove(p));
      });
    });
    server.once('listening',() => {this.baseUrl ||= `http://127.0.0.1:${server.address().port}`;});
    server.once('close',() => {this.close();wss.close();});
  }
  async discover() {
    const {SerialPort} = await import('serialport');
    const scan = async () => {
      if (this.stopped) return;
      try {
        const ports = await SerialPort.list();
        const paths = process.env.XORR_PAD_SERIAL ? [process.env.XORR_PAD_SERIAL] : ports.filter(p => p.vendorId?.toLowerCase()==='303a').map(p => p.path);
        for (const path of paths) if (![...this.peers].some(p => p.path===path)) {
          const serial=new SerialPort({path,baudRate:115200});
          this.attach(serial,'usb').path=path;
        }
      } catch (e) {this.emit('diagnostic',`USB discovery: ${e.message}`);}
    };
    await scan();this.scanTimer=setInterval(scan,5000);this.scanTimer.unref();
    try {await this.discoverBle();} catch {this.emit('diagnostic','BLE adapter unavailable; phone relay or USB/Wi-Fi remains available');}
  }
  async discoverBle() {
    const noble = (await import('@abandonware/noble')).default;
    this.noble=noble;
    this.bleDiscover = async peripheral => {
      if (this.bleConnecting || this.stopped) return;
      this.bleConnecting=true;
      try {
        await noble.stopScanningAsync();await peripheral.connectAsync();
        const {characteristics} = await peripheral.discoverSomeServicesAndCharacteristicsAsync([UART],[]);
        const rx=characteristics.find(c => c.uuid.replace(/-/g,'')===UART.replace('0001','0002'));
        const tx=characteristics.find(c => c.uuid.replace(/-/g,'')===UART.replace('0001','0003'));
        if (!rx || !tx) throw new Error('UART characteristics unavailable');
        const mtu=Math.max(20,(peripheral.mtu || 23)-3);
        const stream=new Duplex({read(){},write(data,_enc,cb){(async () => {for(let i=0;i<data.length;i+=mtu) await rx.writeAsync(data.subarray(i,i+mtu),false);})().then(() => cb(),cb);},destroy(err,cb){peripheral.disconnectAsync().catch(() => {});cb(err);}});
        tx.on('data',data => stream.push(data)); await tx.subscribeAsync();
        peripheral.once('disconnect',() => {stream.destroy();this.bleConnecting=false;if(!this.stopped)noble.startScanningAsync([UART],false).catch(() => {});});
        this.attach(stream,'ble');
      } catch {this.bleConnecting=false;await peripheral.disconnectAsync().catch(() => {});if(!this.stopped)noble.startScanningAsync([UART],false).catch(() => {});}
    };
    this.bleState = state => {if(state==='poweredOn'&&!this.stopped)noble.startScanningAsync([UART],false).catch(() => {});};
    noble.on('discover',this.bleDiscover);noble.on('stateChange',this.bleState);this.bleState(noble.state);
  }
  close() {
    this.stopped=true;clearInterval(this.heartbeat);clearInterval(this.scanTimer);
    this.signals?.off('event',this.onEvent);
    this.noble?.off('discover',this.bleDiscover);this.noble?.off('stateChange',this.bleState);
    this.noble?.stopScanningAsync().catch(() => {});
    for (const p of this.peers) this.remove(p);
  }
}
