import {PadSimulatorV2} from './v2.mjs';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
// This driver accepts only public manifests/modules/signatures. No signer exists.
export class AbilityDriver {
  constructor(){
    this.pending=[];
    this.child=spawn(process.env.XORR_ABILITY_DRIVER||fileURLToPath(new URL('../../firmware/build/abilities-driver',import.meta.url)),[],{stdio:['pipe','pipe','inherit']});
    createInterface({input:this.child.stdout}).on('line',line=>{const p=this.pending.shift();try{p?.resolve(JSON.parse(line));}catch(error){p?.reject(error);}});
    const fail=error=>{for(const p of this.pending.splice(0))p.reject(error);};
    this.child.on('error',fail);this.child.on('exit',()=>fail(Error('native ability driver exited')));
  }
  call(command){return new Promise((resolve,reject)=>{this.pending.push({resolve,reject});this.child.stdin.write(JSON.stringify(command)+'\n');});}
  close(){this.child.stdin.end();}
}
export class AbilityPadSimulator extends PadSimulatorV2 {
  constructor(options){
    super(options);this.driver=new AbilityDriver();this.work=Promise.resolve();
    this.on('message',m=>{this.work=this.work.then(()=>this.abilityMessage(m)).catch(error=>this.emit('protocol_error',error));});
  }
  async abilityMessage(m){
    if(!m.type.startsWith('ability_'))return;
    if(m.type==='ability_developer'){
      if(this.killed||this.signal?.state==='awaiting')return this.send({type:'ability_result',id:m.id,ok:false,error:'pad busy'});
      this.developerRequest=m;return this.send({type:'ability_result',id:m.id,ok:true});
    }
    const command={ability_status:'status',ability_begin:'begin',ability_chunk:'chunk',ability_end:'end',ability_remove:'remove'}[m.type];
    const result=await this.driver.call({...m,command,epoch:1});this.send({...result,type:'ability_result',id:m.id});
  }
  async approveDeveloper(heldMs=800){
    if(!this.developerRequest||heldMs<800||!this.verified||this.killed)throw Error('physical developer hold required');
    const result=await this.driver.call({command:'trust',developerPublicKey:this.developerRequest.developerPublicKey});this.developerRequest=null;return result;
  }
  async close(){this.driver.close();await super.close();}
}
