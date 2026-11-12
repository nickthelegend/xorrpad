import {esc,panel,action} from './shared.mjs';
export function crewRounds(rounds=[]){
 return rounds.length?rounds.slice(-5).reverse().map(r=>`<div class="row"><strong>${esc(r.signalId)} · ${esc(r.state)}</strong><p>${r.approvals.length} of ${r.required} approvals · ${r.approvals.length?r.approvals.map(a=>esc(a.name)).join(', '):'Waiting for pads'}</p></div>`).join(''):'<p class="hint">No crew approvals requested in this desk session.</p>';
}
export async function mountCrew(el,api,signal){
 el.innerHTML=panel('Crew approvals',`<form id="crew-policy" class="panel-body"><p>Large trades wait for independent reviews on your crew’s pads.</p><label class="check"><input type="checkbox" name="enabled">Require crew approvals</label><label>For trades above USD<input name="aboveUsd" type="number" min="0" step="0.01" required></label><label>Approvals required<input name="required" type="number" min="2" max="8" step="1" required></label><fieldset><legend>Crew pads</legend><div id="crew-members"></div></fieldset><button>Save crew policy</button><p id="crew-feedback" class="hint" role="status"></p></form><div id="crew-rounds" class="panel-body" aria-live="polite"></div>`);
 const form=el.querySelector('form'),choices=el.querySelector('#crew-members'),feedback=el.querySelector('#crew-feedback');
 let policy,dirty=false,devices=[];
 form.addEventListener('input',()=>{dirty=true;});
 function options(){
  if(!policy||dirty||form.contains(document.activeElement))return;
  const members=new Map(policy.members.map(m=>[m.device,m]));
  for(const d of devices)if(d.secure&&d.devicePublicKey&&!members.has(d.device))members.set(d.device,{device:d.device,publicKey:d.devicePublicKey,name:d.device});
  choices.innerHTML=[...members.values()].map(m=>`<label class="check"><input type="checkbox" name="member" value="${esc(m.device)}" data-pk="${esc(m.publicKey)}" data-name="${esc(m.name)}" ${policy.members.some(p=>p.device===m.device)?'checked':''}>${esc(m.name)}${devices.some(d=>d.device===m.device&&d.secure)?'':' (offline)'}</label>`).join('')||'<p class="hint">Pair at least two pads to enable crew approval.</p>';
 }
 const load=async()=>{
  const state=await api('/pad/crew');if(signal.aborted)return;
  policy=state.policy;form.elements.enabled.checked=policy.enabled;form.elements.aboveUsd.value=policy.aboveUsd;form.elements.required.value=policy.required;
  dirty=false;options();el.querySelector('#crew-rounds').innerHTML=crewRounds(state.rounds);
 };
 form.onsubmit=e=>{e.preventDefault();action(e.submitter,async()=>{
  const selected=[...form.querySelectorAll('[name="member"]:checked')];
  await api('/pad/crew',{enabled:form.elements.enabled.checked,aboveUsd:Number(form.elements.aboveUsd.value),required:Number(form.elements.required.value),members:selected.map(c=>({device:c.value,publicKey:c.dataset.pk,name:c.dataset.name}))});
  await load();feedback.textContent='Crew policy saved. Each approval needs all review pages and an 800 ms hold.';
 });};
 try{await load();}catch(e){feedback.textContent=e.message;form.querySelector('button').disabled=true;}
 return {update(snapshot){devices=snapshot.devices||[];options();el.querySelector('#crew-rounds').innerHTML=crewRounds(snapshot.crew);}};
}
