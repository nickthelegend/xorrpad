/** Public permission policy. Unknown fields (including credentials) are refused. */
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export function appDataDir() {
  return process.env.XORR_USER_DATA || path.join(homedir(), process.platform === 'darwin'
    ? 'Library/Application Support/xorr-pad' : '.local/share/xorrpad');
}
export const DEFAULT_POLICY = Object.freeze({
  autoAccept: { venues: {}, kinds: {} }, maxTradeUsd: 100, maxDayUsd: 300,
  maxLeverage: 10, maxOpenPositions: 10, marketAllowlist: null, marketDenylist: [],
  venueAllowlist: null, cooldownSeconds: 0, quietHours: null, alwaysAskAboveUsd: 100,
});
export function validatePolicy(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('policy must be an object');
  for (const k of Object.keys(input)) if (!(k in DEFAULT_POLICY)) throw new Error(`unknown policy field: ${k}`);
  const p = structuredClone({ ...DEFAULT_POLICY, ...input });
  for (const k of ['maxTradeUsd','maxDayUsd','maxLeverage','maxOpenPositions','cooldownSeconds','alwaysAskAboveUsd'])
    if (!Number.isFinite(p[k]) || p[k] < 0) throw new Error(`${k} must be finite and nonnegative`);
  if (p.maxLeverage < 1 || !Number.isInteger(p.maxOpenPositions)) throw new Error('invalid leverage or open position cap');
  for (const k of ['marketAllowlist','marketDenylist','venueAllowlist'])
    if (!(p[k] === null && k !== 'marketDenylist') && (!Array.isArray(p[k]) || p[k].some(s => typeof s !== 'string' || !s)))
      throw new Error(`${k} must be a list of names`);
  const a = p.autoAccept;
  if (!a || Object.keys(a).some(k => !['venues','kinds'].includes(k))) throw new Error('invalid autoAccept');
  for (const k of ['venues','kinds']) {
    a[k] ??= {};
    if (typeof a[k] !== 'object' || a[k] === null || Array.isArray(a[k]) || Object.values(a[k]).some(v => typeof v !== 'boolean'))
      throw new Error(`autoAccept.${k} must map names to booleans`);
  }
  if (p.quietHours !== null) {
    const q = p.quietHours;
    if (!q || Object.keys(q).some(k => !['start','end','timeZone'].includes(k)) ||
      ![q.start,q.end].every(s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s)))
      throw new Error('quietHours requires start/end HH:MM and an IANA timeZone');
    new Intl.DateTimeFormat('en', { timeZone: q.timeZone || 'UTC' });
  }
  return p;
}
export class Permissions {
  constructor({ dir = appDataDir() } = {}) { this.file = path.join(dir, 'permissions.json'); }
  read() {
    try { return validatePolicy(JSON.parse(readFileSync(this.file, 'utf8'))); }
    catch (e) { if (e.code !== 'ENOENT') throw e; return this.write(DEFAULT_POLICY); }
  }
  write(input) {
    const p = validatePolicy(input);
    mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(p, null, 2) + '\n', { mode: 0o600 });
    renameSync(tmp, this.file);
    return p;
  }
}
const minutes = s => Number(s.slice(0,2)) * 60 + Number(s.slice(3));
export function checkPolicy(signal, brief, policy, { now = Date.now(), reservedUsd = 0, reservedPositions = 0, lastTradeAt = 0 } = {}) {
  const p = validatePolicy(policy), size = signal.sizeUsd;
  const result = (action, ruleId, why, autoAccept = false) => ({ action, ruleId, why, autoAccept });
  const refuse = (rule, why) => result('REJECT', `permissions.${rule}`, why);
  if (!Number.isFinite(size) || size <= 0) return refuse('size', 'size must be positive and finite');
  if (size > p.maxTradeUsd) return refuse('per_trade', `per-trade cap is $${p.maxTradeUsd}`);
  if (size + (brief?.spent_today || 0) + reservedUsd > p.maxDayUsd) return refuse('per_day', `daily cap is $${p.maxDayUsd}`);
  if (signal.kind === 'perp' && (!Number.isFinite(signal.leverage) || signal.leverage < 1 || signal.leverage > p.maxLeverage)) return refuse('leverage', `leverage cap is ${p.maxLeverage}`);
  if (p.venueAllowlist && signal.venue && !p.venueAllowlist.includes(signal.venue)) return refuse('venue', 'venue is not allowed');
  const market = signal.symbol || signal.market;
  if (p.marketDenylist.includes(market)) return refuse('denylist', `${market} is denied`);
  if (p.marketAllowlist && !p.marketAllowlist.includes(market)) return refuse('allowlist', `${market} is not allowed`);
  const positions = Object.entries(brief?.positions || {}).filter(([,v]) => v.qty > 0);
  if (signal.side !== 'SELL' && !positions.some(([k]) => k === market) && positions.length + reservedPositions >= p.maxOpenPositions)
    return refuse('positions', `open position cap is ${p.maxOpenPositions}`);
  let last = lastTradeAt;
  for (const e of brief?.journal_recent || []) {
    let a = e.acted; try { if (typeof a === 'string') a = JSON.parse(a); } catch { continue; }
    if (a?.executed) last = Math.max(last, Date.parse(e.ts) || 0);
  }
  if (last && now - last < p.cooldownSeconds * 1000) return refuse('cooldown', 'trade cooldown is active');
  if (p.quietHours) {
    const q = p.quietHours;
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: q.timeZone || 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(now));
    const m = minutes(parts), start = minutes(q.start), end = minutes(q.end);
    if (start === end || (start < end ? m >= start && m < end : m >= start || m < end)) return refuse('quiet_hours', 'quiet hours are active');
  }
  if (size > p.alwaysAskAboveUsd) return result('EXECUTE', 'permissions.always_ask', `always ask above $${p.alwaysAskAboveUsd}`);
  if (p.autoAccept.venues[signal.venue] === true && p.autoAccept.kinds[signal.kind || 'spot'] === true)
    return result('EXECUTE', 'permissions.auto_accept', 'auto-accept allowed for venue and kind', true);
  return result('EXECUTE', 'permissions.manual', 'manual acceptance required');
}
