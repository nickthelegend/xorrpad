// MIT · Copyright (c) 2026 Nivesh Gajengi
import {JournalPadSimulator} from './journal.mjs';
/** SCAN presentation and dismissal use the production C++ parser/timer. */
export class ScanPadSimulator extends JournalPadSimulator {
 constructor(options){super(options);this.scanWork=Promise.resolve();
  this.on('message',m=>{if(m.type==='scan')this.scanWork=this.scanWork.then(async()=>{
    const r=await this.ambientDriver.call({command:'scan',record:m,now:Date.now()>>>0});
    if(r.valid){this.scan=m;this.scanVisible=true;this.reportView();}
  }).catch(e=>this.emit('protocol_error',e));});
 }
 reportView(){if(this.verified)this.send({type:'pad_view',screen:this.scanVisible?'scan':this.journalVisible?'journal':this.ambientVisible?'ambient':'home',selected:this.journalSelected || 0});}
 async scanTick(now=Date.now()>>>0){await this.scanWork;const r=await this.ambientDriver.call({command:'snapshot',now});this.scanVisible=r.scanVisible;this.reportView();return r;}
 async key(action,options={}){await this.scanWork;
  const r=await this.ambientDriver.call({command:'scan_key',now:options.now ?? (Date.now()>>>0)});this.scanVisible=false;this.reportView();
  if(r.dismissed && action!=='kill')return {dismissed:true};
  return super.key(action,options);
 }
 async idle(now=Date.now()>>>0){await this.scanTick(now);if(this.scanVisible)return {visible:false};return super.idle(now);}
 async close(){await this.scanWork;await super.close();}
}
