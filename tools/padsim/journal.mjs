// MIT · Copyright (c) 2026 Nivesh Gajengi
import {AmbientPadSimulator} from './ambient.mjs';
/** Public journal storage only. Signing keys remain in the existing native signer. */
export class JournalPadSimulator extends AmbientPadSimulator {
 constructor(options){super({...options,journalStateFile:options.sessionStateFile+'.journal.json'});this.journalWork=this.ambientWork;
  this.on('message',m=>{if(['signal','fund','portfolio','outcome_positions','flatten'].includes(m.type)){this.journalVisible=false;this.reportView();}
  if(['journal_decision','signal','signal_state','receipt'].includes(m.type)){
   this.journalWork=this.journalWork.then(async()=>{const r=await this.ambientDriver.call({command:'journal',message:m,epoch:Math.floor(Date.now()/1000)});this.journal=r.journal;this.journalHealthy=r.healthy;this.syncJournal();}).catch(e=>this.emit('protocol_error',e));
  }
  if(['ready','config'].includes(m.type))this.journalWork=this.journalWork.then(async()=>{const r=await this.ambientDriver.call({command:'snapshot'});this.journal=r.journal;this.journalHealthy=r.healthy;this.syncJournal();});
  });
 }
 syncJournal(){if(!this.verified || !this.journal)return;const j=this.journal;
  this.send({type:'journal_begin',revision:j.revision,count:j.entries.length,healthy:this.journalHealthy});
  j.entries.forEach((entry,index)=>this.send({type:'journal_entry',revision:j.revision,index,entry}));
  this.send({type:'journal_end',revision:j.revision});
 }
 reportView(){if(this.verified)this.send({type:'pad_view',screen:this.journalVisible?'journal':this.ambientVisible?'ambient':'home',selected:this.journalSelected || 0});}
 async pressKnob(options={}){const r=await this.knob({event:true,ended:true,...options});if(r.consumed)return r;
  const pending=this.signal?.state==='awaiting' && Date.now()<this.signal.expiresAt;
  if(!pending && !this.killed && !this.tilt?.blocked && !this.liqGuard?.active && !this.predict?.enabled){this.journalVisible=!this.journalVisible;this.journalSelected=0;this.reportView();}
  return r;
 }
 async scrollJournal(delta){if(!this.journalVisible)throw Error('Journal is closed');const r=await this.ambientDriver.call({command:'scroll',delta});this.journalSelected=r.selected;this.reportView();return r;}
 async key(action,options={}){await this.journalWork;
  if(this.journalVisible){this.journalVisible=false;this.reportView();if(action!=='kill')return {dismissed:true};}
  try{return await super.key(action,options);}catch(e){
   if(action==='yes' && /^Tilt guard:/.test(e.message) && this.signal?.signalId){const r=await this.ambientDriver.call({command:'result',id:this.signal.signalId,result:'blocked',reason:e.message});this.journal=r.journal;this.journalHealthy=r.healthy;this.syncJournal();}throw e;
  }
 }
 async close(){await this.journalWork;await super.close();}
}
