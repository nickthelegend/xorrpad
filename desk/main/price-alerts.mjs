/** Public alert rules; no endpoints, credentials or trading actions are accepted. */
export function validatePriceAlerts(alerts) {
  if(!Array.isArray(alerts)||alerts.length>8)throw Error('at most eight price alerts');
  const ids=new Set();
  for(const a of alerts){
    if(!a || Object.keys(a).some(k=>!['id','mint','usd','above'].includes(k)) ||
      typeof a.id!=='string'|| !/^[\w-]{1,32}$/.test(a.id)||ids.has(a.id)||
      typeof a.mint!=='string'|| !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a.mint)||
      !Number.isFinite(a.usd)||a.usd<=0||a.usd>1e12||typeof a.above!=='boolean')throw Error('invalid price alert');
    ids.add(a.id);
  }
  return structuredClone(alerts);
}
