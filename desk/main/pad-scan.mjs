// MIT · Copyright (c) 2026 Nivesh Gajengi
// Bounded public presentation fields only; no proposal can be accepted by this record.
export function scanRecord(result) {
  const text = (v, n) => typeof v === 'string' ? Buffer.from(v).subarray(0,n).toString('utf8').replace(/\uFFFD$/, '') : '';
  const top = result.signals?.[0];
  return {type:'scan', summary:text(result.summary, 512) || 'Setup required: run a live scan',
    checkedCount:(result.markets || []).filter(m=>!m.error).length,
    unavailableCount:(result.markets || []).filter(m=>m.error).length,
    markets:[...(result.markets || []).filter(m=>!m.error),...(result.markets || []).filter(m=>m.error)].slice(0, 6).map(m=>({symbol:text(m.symbol,24), error:text(m.error,96)})),
    top:top ? {symbol:text(top.symbol,24),side:text(top.side,16),strategy:text(top.strategy,64),rationale:text(top.rationale,256)} : null};
}
export async function readScan(scan) {
  try { return await scan(); }
  catch (error) { return {at:new Date().toISOString(),markets:[],signals:[],summary:`Setup required: ${String(error.message || error).slice(0,400)}`}; }
}
