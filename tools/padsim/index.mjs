#!/usr/bin/env node
/** Byte-accurate pad endpoint. No invented quotes, fills or provider replies. */
import net from 'node:net';
import {EventEmitter} from 'node:events';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {Lines,validateKeymap} from '../../desk/main/padlink.mjs';

export class PadSimulator extends EventEmitter {
  history=[]; keymap=null; signal=null; seq=0;
  constructor({device='padsim-'+randomUUID(),fragmentBytes=4096}={}) {super();Object.assign(this,{device,fragmentBytes});}
  attach(stream) {
    this.stream=stream;
    const lines=new Lines(m => {
      this.history.push(m);this.emit('message',m);
      if (m.type==='ping') this.hello();
      if (m.type==='keymap') {this.keymap=validateKeymap(m);this.send({type:'keymap_state',revision:m.revision,ok:true});}
      if (m.type==='signal') this.signal=m;
      if (m.type==='signal_state' && m.signalId===this.signal?.signalId) this.signal={...this.signal,state:m.state};
    });
    stream.on('data',data => {try {lines.feed(data);} catch(e) {this.emit('protocol_error',e);stream.destroy();}});
    stream.on('error',e => this.emit('protocol_error',e));
    this.hello();return this;
  }
  hello() {this.send({type:'hello',device:this.device,fw:'1.0.0',caps:['keys','voice','tts','signals','keymap']});}
  send(message) {
    const line=Buffer.from(JSON.stringify({v:1,...message})+'\n');
    if (line.length>4096) throw new Error('record too large');
    for(let i=0;i<line.length;i+=this.fragmentBytes)this.stream.write(line.subarray(i,i+this.fragmentBytes));
  }
  key(action,{signalId=this.signal?.signalId,id=this.device+':'+(++this.seq)}={}) {this.send({type:'key',id,action,edge:'down',...(['yes','no'].includes(action)?{signalId}:{})});return id;}
  voice(pcm,{stream=randomUUID()}={}) {
    let seq=0,id;
    for(let i=0;i<pcm.length;i+=512){id=this.device+':'+(++this.seq);this.send({type:'voice',id,stream,seq:seq++,end:i+512>=pcm.length,sampleRate:16000,pcm:pcm.subarray(i,i+512).toString('base64')});}
    return id;
  }
  waitFor(predicate,{after=0,timeout=30000}={}) {
    const found=this.history.slice(after).find(predicate);if(found)return Promise.resolve(found);
    return new Promise((resolve,reject) => {
      const timer=setTimeout(() => {this.off('message',handler);reject(new Error('pad message timeout'));},timeout);
      const handler=m => {if(predicate(m)){clearTimeout(timer);this.off('message',handler);resolve(m);}};
      this.on('message',handler);
    });
  }
  async listen(port=8711) {
    if (!Number.isInteger(port) || port<8710 || port>8729) throw new Error('use ports 8710–8729');
    this.server=net.createServer(stream => {if(this.stream&&!this.stream.destroyed){stream.destroy();return;}this.attach(stream);});
    await new Promise((resolve,reject) => {this.server.once('error',reject);this.server.listen(port,'127.0.0.1',resolve);});return this.server.address();
  }
  async close() {if(this.stream?.isOpen && !this.stream.closing)await new Promise(r=>this.stream.close(r));this.stream?.destroy();if(this.server)await new Promise(resolve => this.server.close(resolve));}
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const {PadSimulatorV2}=await import('./v2.mjs');
  const pad=new PadSimulatorV2({fragmentBytes:20,serial:process.argv[2]==='--pty'});
  process.stderr.write(`Pairing URL: ${pad.qr}\nSimulator code: ${pad.code}\n`);
  pad.on('message',m => process.stdout.write(JSON.stringify(m)+'\n'));
  pad.on('protocol_error',e => process.stderr.write(e.message+'\n'));
  if(process.argv[2]==='--pty') {
    const {SerialPort}=await import('../../desk/node_modules/serialport/dist/index.js');
    pad.attach(new SerialPort({path:process.argv[3],baudRate:115200}));
  } else {
    const addr=await pad.listen(Number(process.argv[3] || 8711));
    process.stderr.write(`Pad simulator listening on ${addr.address}:${addr.port}\n`);
  }
  const stdinLines=new Lines(m => pad.send(m));
  process.stdin.on('data',data => {try {stdinLines.feed(data);} catch(e) {process.stderr.write(e.message+'\n');}});
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async () => {await pad.close();process.exit(0);});
}
