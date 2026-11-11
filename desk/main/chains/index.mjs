/** Solana venue registry. Every venue reads and builds; none signs. */
import * as solana from "./solana.mjs";

export const ALL = [solana];

/** Every venue, by id. */
export const BY_ID = Object.fromEntries(ALL.map((c) => [c.id, c]));

/** The chain in hand. Naming one that does not exist is an error, not a fallback. */
export function pick(preferred = process.env.CHAIN) {
  if (!preferred) return solana;
  const c = BY_ID[preferred];
  if (!c) throw new Error(`unknown chain "${preferred}" — built: ${ALL.map((x) => x.id).join(", ")}`);
  return c;
}

export const active = () => pick();

/**
 * Every venue must refuse to sign. This is asserted rather than assumed: the
 * read-only posture is the whole safety argument for a device anyone walking
 * past the desk can press, and a venue that quietly gained an execute path
 * would invalidate it without changing a single line of the code above.
 */
export async function assertNeverSigns() {
  for (const c of ALL) {
    let refused = false;
    try { await c.swap(); } catch { refused = true; }
    if (!refused) throw new Error(`${c.id}: swap() did not refuse — a venue must never sign`);
  }
  return true;
}

/** A one-line description of each venue's readiness, for /pad and the UI. */
export async function survey() {
  return Promise.all(ALL.map(async (c) => {
    try {
      const i = await c.info();
      return { id: c.id, label: c.label, ok: true, ...i, markets: await c.markets() };
    } catch (e) {
      return { id: c.id, label: c.label, ok: false, error: String(e.message || e).slice(0, 140) };
    }
  }));
}
