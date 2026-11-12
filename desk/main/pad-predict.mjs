// MIT · Copyright (c) 2026 Nivesh Gajengi
// Bounded public records only. No provider substitution or signing in this bridge.
const address = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export function predictRecord(data, { enabled = true, now = Date.now(), selected = 0 } = {}) {
  if (data.cluster !== 'devnet' || !Array.isArray(data.markets)) throw Error('Setup required: pm-AMM devnet feed');
  const all = data.markets.filter(m => address.test(m.market) && typeof m.name === 'string' && m.name.trim() &&
    Number.isFinite(m.yesPrice) && m.yesPrice >= 0 && m.yesPrice <= 1 && Number.isFinite(m.endTs) && m.endTs * 1000 > now)
    .map(m => ({ market: m.market, question: m.name.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").slice(0, 180), probability: m.yesPrice,
      change24h: Number.isFinite(m.change24h) ? m.change24h : null, closesIn: Math.min(0xffffffff, Math.ceil(m.endTs - now / 1000)) }));
  selected = all.length ? ((selected % all.length) + all.length) % all.length : 0;
  const start = Math.floor(selected / 6) * 6, markets = all.slice(start, start + 6);
  return { type: 'predict', selected: selected - start, total: all.length, offset: start, enabled, cluster: 'devnet', venue: 'pmamm', markets,
    message: markets.length ? '' : 'Setup required: open, funded devnet pm-AMM markets', observedAt: new Date(now).toISOString() };
}
export function outcomePositionsRecord(data) {
  if (data.cluster !== 'devnet' || !Array.isArray(data.positions)) throw Error('Setup required: pm-AMM devnet positions');
  const positions = data.positions.filter(p => typeof p.name === 'string' && Number.isFinite(p.yes) && p.yes >= 0 &&
    Number.isFinite(p.no) && p.no >= 0).slice(0, 8).map(({ name, yes, no }) => ({ name: name.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").slice(0, 180), yes, no }));
  return { type: 'outcome_positions', cluster: 'devnet', positions };
}
export function predictProposal({ peer, message, enabled, killed, pending, now = Date.now(), size }) {
  if (!peer.secure || !peer.verified || !enabled || killed || pending) throw Error('Predict proposal unavailable: finish the pending decision or re-arm');
  const feed = peer.predict;
  if (!feed || now - peer.predictAt >= 30000 || !feed.markets.some(m => m.market === message.market && m.closesIn * 1000 > now - peer.predictAt))
    throw Error('Setup required: refresh the live prediction market');
  if (!['predict:yes', 'predict:no'].includes(message.action) || !Number.isFinite(size) || size <= 0) throw Error('invalid prediction proposal');
  return { kind: 'predict', market: message.market, side: message.action.slice(8), size, source: 'pad-predict' };
}
