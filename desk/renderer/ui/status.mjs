import {$,esc,fmt} from './shared.mjs';
export function mountStatus({api,subscribe}){
  const bar=document.createElement('div');bar.id='desk-status';bar.setAttribute('aria-label','Desk status');bar.textContent='Setup required: connect desk for live status';document.body.append(bar);
  let busy=false,data;
  function render(){
    if(!data)return;
    const links=['usb','ble','wifi'].map(t=>`${t==='wifi'?'Wi-Fi':t.toUpperCase()} ${(data.devices||[]).some(d=>d.link===t)?'linked':'—'}`).join(' · ');
    const rpc=data.rpc.map(r=>`<span class="rpc-badge ${r.cluster==='devnet'?'devnet':''}" title="${esc(r.error || 'Verified by RPC genesis hash')}">${esc(r.name)} ${esc(r.cluster || 'unavailable')}</span>`).join(' ');
    const balances=data.wallet.publicKey?data.rpc.map(r=>`${r.cluster||r.name}: ${r.balanceError?'unavailable':fmt(r.balanceSol,'SOL',5)}`).join(' / '):data.wallet.setupRequired;
    bar.innerHTML=`<a href="#link" title="Verified pad links">${esc(links)}</a><span>${rpc}</span><a href="#agent" title="${esc(data.wallet.publicKey || '')}">Session · ${esc(balances)}</a><a href="#permissions">Today ${fmt(data.spentTodayUsd,'USD')} / ${fmt(data.dayCapUsd,'USD')}${data.reservedUsd?' · '+fmt(data.reservedUsd,'USD')+' reserved':''}</a><a href="#permissions" class="auto-state">Auto-accept ${data.autoAccept.enabled?'ON · scoped':'OFF'}</a>`;
    bar.title='Observed '+data.observedAt;
  }
  async function refresh(){if(busy)return;busy=true;try{data=await api('/desk/status');render();}catch(e){bar.textContent=e.message;}finally{busy=false;}}
  const off=subscribe(e=>{if(e.type==='pad_link'&&data){data.devices=e.devices;render();}if(['receipt','signal'].includes(e.type))refresh();});
  const timer=setInterval(refresh,15000);refresh();return()=>{off();clearInterval(timer);bar.remove();};
}
