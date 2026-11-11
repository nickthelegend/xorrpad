/** Live Nova-3 input and raw Aura PCM output. Keys never leave this process except to Deepgram. */
import { WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
const missing = () => new Error('Setup required: Deepgram API key');
async function socket(endpoint,key) {
  if (!key) throw missing();
  const ws=new WebSocket('wss://api.deepgram.com/v1/'+endpoint,{headers:{Authorization:`Token ${key}`},handshakeTimeout:10000,maxPayload:2*1024*1024});
  // Keep a handler installed throughout shutdown, including handshake failures.
  ws.on('error',()=>{});
  await new Promise((resolve,reject)=>{
    ws.once('open',resolve);ws.once('error',()=>reject(new Error('Deepgram connection failed')));
    ws.once('unexpected-response',(_req,res)=>{res.resume();ws.terminate();reject(new Error(`Deepgram HTTP ${res.statusCode}`));});
  });
  return ws;
}
export class DeepgramVoice {
  constructor({getKey=async()=>''}={}) {this.getKey=getKey;}
  async transcribeLive({onTranscript=()=>{}}={}) {
    const ws=await socket('listen?model=nova-3&encoding=linear16&sample_rate=16000&channels=1&interim_results=true&punctuate=true',await this.getKey());
    let ended=false,settled=false,bytes=0,resolve,reject;const finals=[];
    const done=new Promise((a,b)=>{resolve=a;reject=b;});done.catch(()=>{});
    const cleanup=()=>{clearTimeout(timeout);clearInterval(keepalive);};
    const fail=error=>{if(settled)return;settled=true;cleanup();ws.terminate();reject(error);};
    const timeout=setTimeout(()=>fail(new Error('Deepgram transcription timed out')),45000);
    const keepalive=setInterval(()=>{if(ws.readyState===WebSocket.OPEN)ws.send('{"type":"KeepAlive"}');},5000);keepalive.unref();
    ws.on('error',()=>fail(new Error('Deepgram transcription connection failed')));
    ws.on('message',(data,binary)=>{
      if(binary)return;
      try {
        const m=JSON.parse(data.toString());
        if(m.type==='Error')return fail(new Error('Deepgram transcription failed'));
        if(m.type==='Results') {
          const text=m.channel?.alternatives?.[0]?.transcript || '';
          if(m.is_final && text)finals.push(text);
          if(text)onTranscript({text,final:!!m.is_final});
        }
      }catch {fail(new Error('Deepgram returned invalid transcription data'));}
    });
    ws.on('close',()=>{
      if(settled)return;
      if(!ended)return fail(new Error('Deepgram transcription closed before finalization'));
      settled=true;cleanup();resolve(finals.join(' ').trim());
    });
    return {
      write(pcm) {
        if(settled || ended || ws.readyState!==WebSocket.OPEN)throw new Error('Deepgram transcription stream closed');
        if(!Buffer.isBuffer(pcm) || pcm.length%2 || (bytes+=pcm.length)>384000)throw new Error('invalid PCM input or utterance limit');
        if(ws.bufferedAmount>1024*1024)throw new Error('Deepgram transcription backpressure');
        if(pcm.length)ws.send(pcm);
      },
      finish() {if(!ended && !settled){ended=true;ws.send('{"type":"CloseStream"}');}return done;},
      abort() {fail(new Error('Deepgram transcription aborted'));},
    };
  }
  async transcribe(pcm,options) {
    const input=await this.transcribeLive(options);
    try {input.write(pcm);return await input.finish();}catch(e){input.abort();throw e;}
  }
  async speak(text,{onAudio=()=>{}}={}) {
    if(typeof text!=='string' || !text.trim() || text.length>10000)throw new Error('invalid speech text');
    const ws=await socket('speak?model=aura-2-thalia-en&encoding=linear16&sample_rate=16000&container=none',await this.getKey());
    const stream=randomUUID(),chunks=[];let seq=0,bytes=0,pending=Buffer.alloc(0);
    return new Promise((resolve,reject)=>{
      let settled=false;
      const cleanup=()=>clearTimeout(timeout);
      const fail=e=>{if(settled)return;settled=true;cleanup();ws.terminate();reject(e);};
      const timeout=setTimeout(()=>fail(new Error('Deepgram speech timed out')),45000);
      ws.on('error',()=>fail(new Error('Deepgram speech connection failed')));
      ws.on('close',()=>{if(!settled)fail(new Error('Deepgram speech closed before flush'));});
      ws.on('message',(data,binary)=>{
        try {
          if(binary) {
            bytes+=data.length;if(bytes>4*1024*1024)throw new Error('Deepgram speech output limit');
            pending=Buffer.concat([pending,data]);
            while(pending.length>=512){const pcm=Buffer.from(pending.subarray(0,512));pending=pending.subarray(512);chunks.push(pcm);onAudio({stream,seq:seq++,end:false,pcm,sampleRate:16000});}
          } else {
            const m=JSON.parse(data.toString());
            if(m.type==='Error')throw new Error('Deepgram speech failed');
            if(m.type==='Flushed') {
              if(pending.length%2)throw new Error('Deepgram returned partial PCM sample');
              if(pending.length)chunks.push(pending);
              onAudio({stream,seq:seq++,end:true,pcm:pending,sampleRate:16000});
              if(!bytes)throw new Error('Deepgram returned no speech');
              settled=true;cleanup();ws.send('{"type":"Close"}');ws.close();resolve(Buffer.concat(chunks));
            }
          }
        }catch(e){fail(e);}
      });
      // Speak messages stay below the provider's per-message text limit.
      for(let offset=0;offset<text.length;offset+=1800)ws.send(JSON.stringify({type:'Speak',text:text.slice(offset,offset+1800)}));
      ws.send('{"type":"Flush"}');
    });
  }
}
