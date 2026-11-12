/** Two-pad crew support: real encrypted pairing, native clear/hold gate, real
 * device Ed25519 signatures. Device signing material exists only in memory. */
import {PadSimulatorV2} from './v2.mjs';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {sign} from 'node:crypto';
export class CrewDriver {
 constructor(){
  this.pending=[];
  this.child=spawn(process.env.XORR_CREW_DRIVER||fileURLToPath(new URL('../../firmware/build/crew-driver',import.meta.url)),[],{stdio:['pipe','pipe','inherit']});
  createInterface({input:this.child.stdout}).on('line',line=>{const p=this.pending.shift();try{p?.resolve(JSON.parse(line));}catch(e){p?.reject(e);}});
  const fail=e=>{for(const p of this.pending.splice(0))p.reject(e);};this.child.on('error',fail);this.child.on('exit',()=>fail(Error('native crew driver exited')));
 }
 call(input){return new Promise((resolve,reject)=>{this.pending.push({resolve,reject});this.child.stdin.write(JSON.stringify(input)+'\n');});}
 close(){this.child.stdin.end();}
}
export class CrewPadSimulator extends PadSimulatorV2 {
 constructor(options){
  super(options);this.driver=new CrewDriver();this.work=Promise.resolve();
  this.on('message',m=>{this.work=this.work.then(()=>this.crewMessage(m)).catch(e=>this.emit('protocol_error',e));});
 }
 attach(stream){if(this.driver)this.driver.call({command:'disconnect'}).catch(e=>this.emit('protocol_error',e));super.attach(stream);}
 async crewMessage(m){
  const command={clear_begin:'begin',clear_chunk:'chunk',clear_end:'end',clear_cancel:'cancel'}[m.type];
  if(!command)return;
  if(this.killed||!this.verified){await this.driver.call({command:'cancel'});return;}
  if(command==='begin'){this.crewSignal=m.signalId;this.deadline=Date.now()+m.remainingMs;this.review=null;}
  const result=await this.driver.call({...m,command});
  if(command==='end'){this.review=result;this.emit('crew_review',result);}
  if(command==='cancel')this.review=null;
 }
 async approveCrew({reviewed=true,heldMs=800,yes=true}={}){
  if(!this.review||!this.verified||this.killed||Date.now()>=this.deadline)throw Error('no live crew trade');
  let result=yes?await this.driver.call({command:'approve',reviewed,heldMs}):{ok:false,messageHash:this.review.messageHash};
  const response={type:'crew_approval',signalId:this.crewSignal,ok:result.ok,heldMs,blind:false,messageHash:result.messageHash};
  if(result.ok)response.signature=sign(null,Buffer.from(result.messageHash,'hex'),this.identity.privateKey).toString('hex');
  else response.error='refused on pad';
  this.send(response);this.review=null;return response;
 }
 async close(){this.driver.close();await super.close();}
}
