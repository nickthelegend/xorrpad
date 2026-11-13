// MIT · Copyright (c) 2026 Nivesh Gajengi
import {FlattenPadSimulator} from './flatten.mjs';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
export class AmbientDriver {
 constructor(){this.pending=[];this.child=spawn(fileURLToPath(new URL('../../firmware/build/ambient-driver',import.meta.url)));
  createInterface({input:this.child.stdout}).on('line',line=>this.pending.shift()?.resolve(JSON.parse(line)));
  for(const event of ['error','exit'])this.child.on(event,()=>{for(const p of this.pending.splice(0))p.reject(Error('ambient driver unavailable'));});
 }
 call(d){return new Promise((resolve,reject)=>{this.pending.push({resolve,reject});this.child.stdin.write(JSON.stringify(d)+'\n');});}
 close(){this.child.stdin.end();}
}
export class AmbientPadSimulator extends FlattenPadSimulator {
 constructor(options){super(options);this.ambientDriver=new AmbientDriver();this.ambientWork=this.ambientDriver.call({command:'wake',now:Date.now()>>>0});this.ambientEnabled=true;
  this.on('message',m=>{if(m.type==='ambient')this.ambient=m;if(['ready','config'].includes(m.type) && typeof m.ambient==='boolean')this.ambientEnabled=m.ambient;});
 }
 async idle(now=Date.now()>>>0){await this.ambientWork;
  const pending=this.signal?.state==='awaiting' && Date.now()<this.signal.expiresAt;
  const home=!pending && !this.killed && !this.tilt?.blocked && !this.liqGuard?.active && !this.predict?.enabled && !this.outcomePositions;
  const r=await this.ambientDriver.call({command:'tick',now,home,enabled:this.ambientEnabled});this.ambientVisible=r.visible;this.reportView();return r;
 }
 reportView(){if(this.verified)this.send({type:'pad_view',screen:this.ambientVisible?'ambient':'home',selected:0});}
 async key(action,options={}){await this.ambientWork;
  const now=options.now ?? (Date.now()>>>0),bit=1;
  const r=await this.ambientDriver.call({command:'key',now,bit,pressed:true});
  await this.ambientDriver.call({command:'key',now,bit,pressed:false});this.ambientVisible=false;this.reportView();
  if(r.consumed)return {woke:true};return super.key(action,options);
 }
 async knob({down=false,event=true,ended=false,now=Date.now()>>>0}={}){await this.ambientWork;const r=await this.ambientDriver.call({command:'knob',now,down,event,ended});this.ambientVisible=r.visible;this.reportView();return r;}
 async close(){await this.ambientWork;this.ambientDriver.close();await super.close();}
}
