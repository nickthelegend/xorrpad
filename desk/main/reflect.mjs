/**
 * reflect.mjs — turning what you did into what the pad knows.
 *
 * Sibyl ships its own self-learning, but it is gated to a paid tier
 * (TierGateError on free). The habit loop does not need it: the pad already
 * journals every proposal and every YES/NO, so the pattern is sitting in
 * memory. This reads that journal back and proposes rules you can accept on
 * the pad — after which decide() enforces them, and the pad stops asking.
 *
 * If the Pro tier is active, mem.learn() runs too and its report is included.
 */

const MIN_EVIDENCE = 3;   // how many times you must have said no

const val = (e, k) => {
  const v = e?.[k];
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return null; }
};

/** Mine the journal for habits worth turning into rules. */
export function proposeFromJournal(events = []) {
  const buckets = new Map();
  for (const e of events) {
    const ev = val(e, "evaluated"), ac = val(e, "acted");
    const sig = ev?.signal;
    if (!sig || !ac) continue;
    const rejected = ac.action === "REJECTED" || (ac.action === "REJECT" && !ac.executed);
    if (!rejected) continue;
    // A refusal an existing rule caused is not new evidence. Counting it would
    // let a rule cite its own vetoes as support and grow forever on nothing.
    if (ac.vetoedBy) continue;
    const key = `${sig.symbol}:${sig.side}`;
    const b = buckets.get(key) || { symbol: sig.symbol, side: sig.side, sizes: [], n: 0, from: [] };
    b.n++; if (Number.isFinite(sig.sizeUsd)) b.sizes.push(sig.sizeUsd);
    // Keep the events themselves, not just the count. A rule that vetoes a
    // trade should be able to show its working.
    if (e.ts) b.from.push({ ts: e.ts, usd: Number.isFinite(sig.sizeUsd) ? sig.sizeUsd : null });
    buckets.set(key, b);
  }

  const out = [];
  for (const [, b] of buckets) {
    if (b.n < MIN_EVIDENCE) continue;
    const smallest = b.sizes.length ? Math.min(...b.sizes) : null;
    // Propose the *narrowest* rule the evidence supports: only above the
    // smallest size you ever refused, so it never over-reaches.
    const above = smallest != null ? Math.max(0, Math.floor(smallest) - 1) : null;
    out.push({
      id: `no-${b.symbol.toLowerCase()}-${b.side.toLowerCase()}${above != null ? `-over-${above}` : ""}`,
      symbol: b.symbol, side: b.side, ...(above != null ? { above_usd: above } : {}),
      evidence: b.n,
      from: b.from.slice(-12),
      text: `you rejected ${b.n} ${b.symbol} ${b.side.toLowerCase()}s${above != null ? ` above $${above}` : ""}`,
    });
  }
  return out.sort((a, b) => b.evidence - a.evidence);
}

/** Proposals not already accepted, plus Sibyl's own learner when it is allowed. */
export async function reflect(mem) {
  const [events, brief, learned] = await Promise.all([
    mem.events(200), mem.recallBrief(), mem.learn().catch((e) => ({ ran: false, reason: String(e.message) })),
  ]);
  const known = new Set((brief.rules || []).map((r) => r.id));
  const proposals = proposeFromJournal(events).filter((p) => !known.has(p.id));
  return { proposals, sibylLearner: learned, journalDepth: events.length };
}

/**
 * Accept a proposal: it becomes a rule decide() enforces from now on.
 *
 * The lifecycle is written to Sibyl's own `status` column as well as to the
 * body. The body flag is what `recallBrief()` filters on and stays; the status
 * makes "active" vs "rejected" a first-class property of the entity rather
 * than a convention buried in its JSON, so the store can be asked for one
 * without reading every rule and interpreting it.
 */
export async function acceptRule(mem, proposal) {
  const body = { ...proposal, accepted: true, accepted_at: new Date().toISOString() };
  await mem.setEntityStatus("rule", proposal.id, body, "active");
  await mem.journal({ evaluated: { proposal }, acted: { action: "RULE_ACCEPTED", executed: false } });
  return proposal;
}

export async function rejectRule(mem, proposal) {
  const body = { ...proposal, accepted: false, rejected_at: new Date().toISOString() };
  await mem.setEntityStatus("rule", proposal.id, body, "rejected");
  return proposal;
}


/**
 * Rules that cannot do what they claim.
 *
 * An accepted rule reads like a guarantee, so a rule that can never fire is
 * worse than no rule: it tells the operator a risk is covered when nothing is
 * covering it. This reasons *about* what memory holds rather than just
 * reporting it, and every finding names the reason it is dead.
 */
export function findContradictions(rules = [], limits = null) {
  const out = [];
  const allow = limits?.allow || null;
  const cap = Number.isFinite(limits?.max_trade_usd) ? limits.max_trade_usd : null;

  for (const r of rules) {
    if (allow && r.symbol && !allow.includes(r.symbol))
      out.push({ id: r.id, kind: "dead",
        text: `'${r.id}' guards ${r.symbol}, which is not on the allowlist — the allowlist already refuses every ${r.symbol} trade` });
    if (cap != null && Number.isFinite(r.above_usd) && r.above_usd >= cap)
      out.push({ id: r.id, kind: "unreachable",
        text: `'${r.id}' only fires above $${r.above_usd}, but no trade may exceed $${cap} — it can never fire` });
  }

  // Two rules on the same symbol and side: the one that starts lower already
  // covers everything the higher one would have caught.
  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const a = rules[i], b = rules[j];
      if (a.symbol !== b.symbol || a.side !== b.side) continue;
      const av = Number.isFinite(a.above_usd) ? a.above_usd : 0;
      const bv = Number.isFinite(b.above_usd) ? b.above_usd : 0;
      if (av === bv) continue;
      const [lo, hi] = av <= bv ? [a, b] : [b, a];
      out.push({ id: hi.id, kind: "subsumed",
        text: `'${hi.id}' is already covered by '${lo.id}', which vetoes ${a.symbol} ${String(a.side).toLowerCase()}s from $${Math.min(av, bv)} up` });
    }
  }
  return out;
}

/**
 * Retire rules that have never actually stopped anything.
 *
 * A pad that only ever accumulates rules ends up governed by habits its
 * operator has forgotten agreeing to. This forgets *deliberately*: an unfired
 * rule is archived with the reason, so it can still be read back and restored,
 * which is the whole difference between archiving and deleting.
 */
export async function decayRules(mem, { days = 14, now = Date.now() } = {}) {
  const brief = await mem.recallBrief();
  const rules = brief.rules || [];
  if (!rules.length) return { checked: 0, archived: [], days };

  const window = days * 86400_000;
  const since = new Date(now - window).toISOString();
  const events = await mem.eventsBetween({ since, limit: 1000 }).catch(() => []);
  const fired = new Set();
  for (const e of events) {
    const ac = val(e, "acted");
    if (ac?.vetoedBy) fired.add(ac.vetoedBy);
  }

  const archived = [], kept = [];
  for (const r of rules) {
    if (fired.has(r.id)) { kept.push({ id: r.id, why: "fired inside the window" }); continue; }
    const at = r.accepted_at ? Date.parse(r.accepted_at) : NaN;
    if (!Number.isFinite(at) || now - at < window) {
      kept.push({ id: r.id, why: "younger than the window" });
      continue;
    }
    await mem.archiveEntity("rule", r.id,
      `retired after ${days} days: nothing it guards came up, so it never fired`);
    archived.push(r.id);
  }
  return { checked: rules.length, archived, kept, days };
}
