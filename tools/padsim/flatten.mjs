// MIT · Copyright (c) 2026 Nivesh Gajengi
import {TiltPadSimulator} from './tilt.mjs';
import {SessionPadSimulator} from './session.mjs';
/** F4 uses the same authenticated transport and native signing/tilt drivers. */
export class FlattenPadSimulator extends TiltPadSimulator {
 constructor(options){super(options);this.on('message',m=>{
  if(m.type==='flatten'){
   this.flatten=m;this.flattenAt=Date.now();
   if(m.state==='executing' && m.reduceOnly===true && m.legReduceOnly===true && typeof m.legId==='string' && m.legId)
    this.flattenWork=(this.flattenWork || Promise.resolve()).then(()=>this.reserve(m.legId,true)).catch(e=>this.emit('protocol_error',e));
  }
  if(m.type==='rearm_complete')this.flatten=null;
 });}
 async key(action,options={}) {
  if(this.killed && ['yes','no'].includes(action)) {
   const p=this.flatten;
   if(!this.verified || !p || p.reduceOnly!==true || !['awaiting','setup','empty'].includes(p.state))throw Error('No live displayed flatten plan');
   if(action==='yes' && (p.state!=='awaiting' || Date.now()-this.flattenAt>=p.remainingMs || (options.heldMs || 0)<800))throw Error('Setup required: live reduce-only plan and fresh YES hold (800ms)');
   const id=options.id || this.device+':'+(++this.seq);
   this.send({type:'key',id,edge:'down',action:'flatten:'+action,planId:p.id,fingerprint:p.fingerprint,heldMs:options.heldMs || 0});return id;
  }
  return super.key(action,options);
 }
 async approveSign(options={}) {
  if(this.killed){
   if(this.flatten?.state!=='executing' || !this.flatten.legReduceOnly || this.flatten.legId!==this.request?.signalId)throw Error('Killed: unapproved signing request');
   if(options.reviewed===false || (options.heldMs ?? 800)<800)throw Error('native signing review required');
   await this.reserve(this.request.signalId,true);return SessionPadSimulator.prototype.approveSign.call(this,options);
  }
  return super.approveSign(options);
 }
 async close(){await this.flattenWork;await super.close();}
}
