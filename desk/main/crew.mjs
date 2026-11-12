/** Crew policy and short-lived, exact-message device approvals. Public data only. */
import {createHash,createPublicKey,verify,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import path from 'node:path';
import {prepareClearSign} from './clear-sign.mjs';
export const DEFAULT_CREW=Object.freeze({enabled:false,aboveUsd:100,required:2,members:[]});
export function validateCrew(input){
 if(!input || typeof input!=='object'||Array.isArray(input) || Object.keys(input).some(k=>!Object.hasOwn(DEFAULT_CREW,k)))throw Error('invalid crew policy');
 const p=structuredClone({...DEFAULT_CREW,...input});
 if(typeof p.enabled!=='boolean'||!Number.isFinite(p.aboveUsd)||p.aboveUsd<0||!Number.isInteger(p.required)||p.required<2||p.required>8||!Array.isArray(p.members)||p.members.length>8)throw Error('invalid crew threshold or quorum');
 const devices=new Set(),keys=new Set();
 for(const m of p.members){
  if(!m || Object.keys(m).some(k=>!['device','publicKey','name'].includes(k)) || typeof m.device!=='string'|| !/^[\w-]{1,96}$/.test(m.device)||
    typeof m.publicKey!=='string'|| !/^[0-9a-f]{64}$/.test(m.publicKey)||typeof m.name!=='string'||m.name.length<1||m.name.length>40||/[\x00-\x1f]/.test(m.name)||devices.has(m.device)||keys.has(m.publicKey))throw Error('invalid or duplicate crew member');
  devices.add(m.device);keys.add(m.publicKey);
 }
 if(p.enabled && p.members.length<p.required)throw Error('crew needs enough distinct pads');
 return p;
}
export function verifyCrewApproval(member,result,hash){
 if(!result?.ok || result.device!==member.device || result.messageHash!==hash || result.blind!==false ||
   !Number.isInteger(result.heldMs)||result.heldMs<800||typeof result.signature!=='string'|| !/^[0-9a-f]{128}$/.test(result.signature))throw Error('invalid crew approval');
 const key=createPublicKey({format:'der',type:'spki',key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(member.publicKey,'hex')])});
 if(!verify(null,Buffer.from(hash,'hex'),key,Buffer.from(result.signature,'hex')))throw Error('invalid crew device signature');
 return {device:member.device,name:member.name,messageHash:hash,signature:result.signature};
}
export class CrewGate {
 constructor({dir,link,publish=()=>{}}){this.file=path.join(dir,'crew-policy.json');this.link=link;this.publish=publish;this.rounds=new Map();}
 read(){try{return validateCrew(JSON.parse(readFileSync(this.file,'utf8')));}catch(e){if(e.code!=='ENOENT')throw e;return structuredClone(DEFAULT_CREW);}}
 write(input){
  const p=validateCrew(input);
  for(const m of p.members)if(p.enabled && this.link?.pairings.get(m.device)?.pk!==m.publicKey)throw Error('Setup required: pair each crew device and verify its identity');
  mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});const tmp=`${this.file}.${process.pid}.tmp`;
  writeFileSync(tmp,JSON.stringify(p)+'\n',{mode:0o600});renameSync(tmp,this.file);return p;
 }
 status(){return [...this.rounds.values()].map(r=>({...r,approvals:r.approvals.map(a=>({device:a.device,name:a.name}))}));}
 assert(tx,usd,receipt){
  const p=this.read();if(!p.enabled||usd<=p.aboveUsd)return;
  const hash=createHash('sha256').update(tx.message.serialize()).digest('hex');
  if(!receipt || receipt.expiresAt<=Date.now()||receipt.policy!==JSON.stringify(p)||receipt.hash!==hash||receipt.approvals.length<p.required)throw Error('crew approval required or expired');
  const unique=new Set();
  for(const a of receipt.approvals){const m=p.members.find(m=>m.device===a.device);if(!m||unique.has(a.device))throw Error('crew identity changed');unique.add(a.device);verifyCrewApproval(m,{...a,ok:true,heldMs:800,blind:false},hash);}
 }
 async collect(tx,{usd,signalId,expiresAt,cluster,inputMint,recheck,prepared}){
  const p=this.read();if(!Number.isFinite(usd)||usd<=0)throw Error('invalid crew trade size');
  if(!p.enabled||usd<=p.aboveUsd)return null;
  if(expiresAt<=Date.now())throw Error('crew trade expired');
  const hash=createHash('sha256').update(tx.message.serialize()).digest('hex');
  const online=p.members.filter(m=>{try{const peer=this.link.sessionPeer(m.device);return peer.candidate?.pk===m.publicKey&&!peer.sessionRequest&&!peer.clearReview&&!peer.updating;}catch{return false;}});
  if(online.length<p.required)throw Error('Setup required: enough paired, online, rearmed crew pads');
  const roundId=randomUUID();
  prepared??=await prepareClearSign({unsignedTx:Buffer.from(tx.serialize()).toString('base64'),cluster,inputMint,signalId:roundId,remainingMs:Math.min(120000,expiresAt-Date.now()),cosign:true});
  if(prepared.messageHash!==hash || prepared.request?.cosign!==true || prepared.request?.sign===true)throw Error('crew prepared a different message');
  const end=Math.min(expiresAt,Date.now()+prepared.request.remainingMs),approvals=[];
  const round={signalId,roundId,messageHash:hash,required:p.required,approvals,state:'awaiting',expiresAt:end};
  this.rounds.set(signalId,round);if(this.rounds.size>50)this.rounds.delete(this.rounds.keys().next().value);
  const announce=()=>this.publish({type:'crew_approval',...round,approvals:approvals.map(a=>({device:a.device,name:a.name}))});announce();
  try{
   await new Promise((resolve,reject)=>{
    let remaining=online.length,done=false;
    for(const member of online)Promise.resolve().then(()=>this.link.approveCrew(member.device,prepared,end)).then(result=>{
     if(done)return;if(Date.now()>=end)throw Error('crew approval expired');
     approvals.push(verifyCrewApproval(member,result,hash));announce();
     if(approvals.length>=p.required){done=true;resolve();}
    }).catch(()=>{}).finally(()=>{if(--remaining===0&&!done){done=true;reject(Error('crew quorum refused or expired'));}});
   });
   await recheck();
   const receipt={hash,policy:JSON.stringify(p),expiresAt:end,approvals:[...approvals]};
   this.assert(tx,usd,receipt);round.state='approved';announce();return receipt;
  }catch(error){round.state='refused';announce();throw error;}
  finally{for(const m of online)this.link.cancelCrew(m.device,prepared.request.signalId);}
 }
}
