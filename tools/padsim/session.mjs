/** Encrypted v2 simulator backed by the real native firmware signing logic. */
import {PadSimulatorV2} from './v2.mjs';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
export class SessionDriver {
  constructor(stateFile){
    this.pending=[];
    this.child=spawn(fileURLToPath(new URL('../../firmware/build/session-driver',import.meta.url)),[stateFile],{stdio:['pipe','pipe','inherit']});
    createInterface({input:this.child.stdout}).on('line',line=>this.pending.shift()?.resolve(JSON.parse(line)));
    this.child.on('error',error=>{for(const p of this.pending.splice(0))p.reject(error);});
    this.child.on('exit',()=>{for(const p of this.pending.splice(0))p.reject(Error('native firmware simulator exited'));});
  }
  call(command){return new Promise((resolve,reject)=>{this.pending.push({resolve,reject});this.child.stdin.write(JSON.stringify(command)+'\n');});}
  close(){this.child.stdin.end();}
}
export class SessionPadSimulator extends PadSimulatorV2 {
  constructor({sessionStateFile,...options}){
    super(options);this.driver=new SessionDriver(sessionStateFile);this.work=Promise.resolve();
    this.on('message',message=>{this.work=this.work.then(()=>this.sessionMessage(message)).catch(error=>this.emit('protocol_error',error));});
  }
  async sessionMessage(m){
    if(m.type==='session_status'){
      const state=await this.driver.call({command:'status'});
      this.send({type:'session_state',requestId:m.requestId,...state,configured:!!this.policy});
    }else if(m.type==='session_policy'){this.policyRequest=m;}
    else if(m.type==='clear_begin'){this.upload={size:m.size,hash:m.sha256,chunks:[],offset:0};}
    else if(m.type==='clear_chunk'){
      const u=this.upload;if(!u || m.offset!==u.offset)throw Error('unordered clear upload');
      const bytes=Buffer.from(m.data,'hex');u.chunks.push(bytes);u.offset+=bytes.length;
    }else if(m.type==='clear_end'){
      const u=this.upload;this.upload=null;if(!u)throw Error('missing clear upload');
      const bytes=Buffer.concat(u.chunks);
      if(bytes.length!==u.size || createHash('sha256').update(bytes).digest('hex')!==u.hash)throw Error('corrupt clear upload');
      this.request=JSON.parse(bytes);this.review=await this.driver.call({command:'prepare',request:this.request});
      this.emit('session_review',this.review);
    }
  }
  async approvePolicy(heldMs=3800){
    const m=this.policyRequest;if(!m)throw Error('no pending policy');this.policyRequest=null;
    const result=await this.driver.call({command:'policy',heldMs,policy:m.policy});if(result.ok)this.policy=m.policy;
    const state=await this.driver.call({command:'status'});
    this.send({type:'session_state',requestId:m.requestId,...state,ok:result.ok,configured:result.ok,error:result.ok?undefined:'policy refused'});
  }
  async approveSign({reviewed=true,heldMs=800}={}){
    const result=await this.driver.call({command:'sign',reviewed,heldMs});
    this.send({type:'session_signature',signalId:this.request.signalId,
      messageHash:createHash('sha256').update(Buffer.from(this.request.message,'hex')).digest('hex'),...result});
    return result;
  }
  async close(){this.driver.close();await super.close();}
}
