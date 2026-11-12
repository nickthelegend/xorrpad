import {$,esc,panel,heading,error,action} from './shared.mjs';
export async function mount({el,api,signal}) {
  el.innerHTML=heading('10','Abilities.','Add a widget, a focus timer or a local alert to your pad.')+`<div class="grid"><div class="stack">
    ${panel('Your pad',`<div class="panel-body"><label>Paired pad<select id="ability-device"><option value="">Connect a paired pad</option></select></label><button id="ability-refresh">Refresh abilities</button><div id="ability-status" role="status">Setup required: connect and pair a pad on the Link screen.</div></div>`)}
    ${panel('Trust a developer',`<form id="ability-developer" class="panel-body"><p>Compare the complete public key on the pad, then hold YES for 800 ms. Changing the developer removes both installed abilities.</p><label>Developer public key<input name="publicKey" pattern="[0-9a-f]{64}" maxlength="64" required autocomplete="off" spellcheck="false"></label><button>Review developer on pad</button></form>`)}
    </div><div class="stack">${panel('Install an ability',`<form id="ability-install" class="panel-body"><p>Choose a developer-signed ability bundle. Review its capabilities before installing.</p><label>Slot<select name="slot"><option value="0">Slot 1</option><option value="1">Slot 2</option></select></label><label>Signed bundle (.json)<input name="bundle" type="file" accept=".json,application/json" required></label><div id="ability-preview" role="status"></div><button class="primary" disabled>Verify & install ability</button><p class="hint">Abilities can display widgets, control their local view, read the current price and chime. They cannot sign or send trades.</p></form>`)}
    ${panel('Start building',`<div class="panel-body"><h3>Market Pulse</h3><p>A widget using the current market price from your desk. Missing or stale prices show as unavailable.</p><h3>Pomodoro discipline</h3><p>A 25-minute focus timer with a completion chime.</p><p>Build the C or AssemblyScript template in sdk/abilities, sign its manifest externally, then select the resulting bundle here.</p></div>`)}
    </div></div><p id="ability-feedback" role="status" aria-live="polite"></p>`;
  let bundle=null,fileRevision=0;
  const device=()=>$('#ability-device',el).value;
  const feedback=text=>{$('#ability-feedback',el).textContent=text;};
  async function refresh(){
    if(!device())throw Error('Setup required: connect and pair a pad on the Link screen');
    const d=await api('/pad/abilities?device='+encodeURIComponent(device()));
    if(signal.aborted)return;
    $('#ability-status',el).innerHTML=`<p class="hint">${d.reviewing?'Developer approval pending on pad.':d.developerPublicKey?'Developer trusted on pad.':'Setup required: trust your developer on the pad.'}</p>`+(d.slots||[]).map(s=>`<div class="row"><h3>Slot ${Number(s.slot)+1} · ${esc(s.name||'Empty')}</h3><p>${s.installed?s.running?'Running':'Stopped':'No ability installed'}${s.capabilities?' · '+esc(s.capabilities):''}</p>${s.error?`<p>${esc(s.error)}</p>`:''}${s.installed?`<button data-remove="${Number(s.slot)}">Remove ability</button>`:''}</div>`).join('');
    for(const button of el.querySelectorAll('[data-remove]'))button.onclick=()=>action(button,async()=>{await api('/pad/abilities',{device:device(),action:'remove',slot:Number(button.dataset.remove)});await refresh();});
  }
  try{
    const link=await api('/desk/link');if(signal.aborted)return;
    const pads=(link.devices||[]).filter(p=>p.secure&&!p.killed);
    $('#ability-device',el).innerHTML=pads.length?pads.map(p=>`<option value="${esc(p.device)}">${esc(p.device)}</option>`).join(''):'<option value="">No paired, rearmed pad connected</option>';
    if(pads.length)await refresh();
  }catch(e){if(!signal.aborted)$('#ability-status',el).innerHTML=error(e);}
  $('#ability-refresh',el).onclick=e=>action(e.currentTarget,refresh);
  $('#ability-device',el).onchange=()=>refresh().catch(e=>feedback(e.message));
  $('#ability-developer',el).onsubmit=e=>{e.preventDefault();action(e.submitter,async()=>{await api('/pad/abilities',{device:device(),action:'developer',developerPublicKey:e.target.elements.publicKey.value});feedback('Compare the complete key on the pad and hold YES for 800 ms, then refresh abilities.');});};
  $('#ability-install input[type=file]',el).onchange=async e=>{
    const revision=++fileRevision;
    bundle=null;$('#ability-preview',el).replaceChildren();$('#ability-install button',el).disabled=true;
    try{
      const file=e.target.files[0];if(!file)return;if(file.size>70000)throw Error('Choose a bundle smaller than 70 KB');
      const candidate=JSON.parse(await file.text()),m=candidate.manifest;
      if(revision!==fileRevision||signal.aborted)return;
      if(!m||!Array.isArray(m.capabilities)||typeof candidate.wasm!=='string')throw Error('Choose a signed ability bundle');
      bundle=candidate;
      $('#ability-preview',el).innerHTML=`<h3>${esc(m.name)} · ${esc(m.version)}</h3><p>Capabilities: ${esc(m.capabilities.join(', '))}</p><p>Memory: ${esc(m.memoryPages*64)} KiB · Fuel: ${esc(m.fuel)} per tick</p>`;
      $('#ability-install button',el).disabled=false;
    }catch(err){if(revision===fileRevision&&!signal.aborted)feedback(err.message);}
  };
  $('#ability-install',el).onsubmit=e=>{e.preventDefault();action(e.submitter,async()=>{
    if(!bundle)throw Error('Select a signed ability bundle');feedback('Verifying and installing. Keep the pad connected.');
    try{
      await api('/pad/abilities',{device:device(),action:'install',slot:Number(e.target.elements.slot.value),bundle});await refresh();feedback('Ability verified and installed.');
    }catch(error){feedback(error.message+' Check the paired pad and developer trust, then retry.');throw error;}
  });};
}
