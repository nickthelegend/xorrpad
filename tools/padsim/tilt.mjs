// MIT · Copyright (c) 2026 Nivesh Gajengi
import {PredictPadSimulator} from './predict.mjs';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
export class TiltDriver {
 constructor(stateFile){
  // Same NDJSON RPC protocol; this executable handles public discipline state only.
  this.pending=[];
  this.child=spawn(fileURLToPath(new URL('../../firmware/build/tilt-driver',import.meta.url)),[stateFile],{stdio:['pipe','pipe','inherit']});
  createInterface({input:this.child.stdout}).on('line',line=>this.pending.shift()?.resolve(JSON.parse(line)));
  this.child.on('error',e=>{for(const p of this.pending.splice(0))p.reject(e);});
  this.child.on('exit',()=>{for(const p of this.pending.splice(0))p.reject(Error('native tilt driver exited'));});
 }
 call(command){return new Promise((resolve,reject)=>{this.pending.push({resolve,reject});this.child.stdin.write(JSON.stringify(command)+"\n");});}
 close(){this.child.stdin.end();}
}
/** Encrypted simulator delegates every discipline counter/timer to production C++. */
export class TiltPadSimulator extends PredictPadSimulator {
 constructor(options){
  super(options);this.tiltDriver=new TiltDriver(options.sessionStateFile+'.tilt.json');this.tiltWork=Promise.resolve();
  this.on('message',m=>{this.tiltWork=this.tiltWork.then(async()=>{
   if(['config','ready'].includes(m.type) && m.tiltGuard)await this.tiltDriver.call({command:'settings',settings:m.tiltGuard});
   if(m.type==='receipt')await this.tiltDriver.call({command:'fill',id:m.signature,pnl:m.realizedPnlUsd,closed:m.closed===true});
   if(['config','ready','status','receipt'].includes(m.type))await this.reportTilt();
  }).catch(e=>this.emit('protocol_error',e));});
 }
 async reportTilt(){const s=await this.tiltDriver.call({command:'status'});this.tilt=s;if(this.verified)this.send({type:'tilt_state',...s});return s;}
 async reserve(id,reduceOnly=false){await this.tiltWork;const s=await this.tiltDriver.call({command:'accept',id,reduceOnly});await this.reportTilt();if(!s.ok)throw Error('Tilt guard: '+s.reason);}
 async key(action,options={}) {
  await this.tiltWork;
  const pending=this.signal?.state==='awaiting' && Date.now()<this.signal.expiresAt;
  if(action==='yes'){
   if(pending){
    if(Number(this.signal.trusted.size)>this.threshold && (options.heldMs || 0)<800)throw Error('hold-to-confirm requires 800ms');
    await this.reserve(this.signal.signalId,this.signal.reduceOnly===true);
   }
   else if(!this.liqGuard?.active){const s=await this.reportTilt();if(s.blocked)throw Error('Tilt guard: '+s.reason);}
  }
  return super.key(action,options);
 }
 async approveSign(options={}){if(options.reviewed===false || (options.heldMs ?? 800)<800)throw Error('native signing review required');await this.reserve(this.request.signalId,this.signal?.signalId===this.request.signalId && this.signal?.reduceOnly===true);return super.approveSign(options);}
 async approveReview(options={}){if(options.yes!==false && (options.reviewed===false || (options.heldMs ?? 800)<800))throw Error('native clear review required');if(options.yes!==false)await this.reserve(this.request.signalId,this.signal?.signalId===this.request.signalId && this.signal?.reduceOnly===true);return super.approveReview(options);}
 async close(){await this.tiltWork;this.tiltDriver.close();await super.close();}
}
