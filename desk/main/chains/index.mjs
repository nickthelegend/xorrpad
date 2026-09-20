/**
 * chains/index.mjs — which chain the pad is trading on right now.
 *
 * The pad is one device with one deck of keys, and it points at one chain at a
 * time. `CHAIN` selects it; the keys, the gate, the memory and the display do
 * not change, because none of them should have to care.
 *
 *   CHAIN=solana   tokenized US equities through Jupiter          (the default)
 *   CHAIN=xlayer   OKX's zkEVM through the OKX DEX aggregator
 *
 * A venue is an object with the same seven things on it — id, label, info,
 * balances, quote, price, markets — so everything above this file can be
 * written once. Neither venue signs; both hand an unsigned transaction back to
 * a human. That is a property of the product, not of a particular chain, and
 * `assertNeverSigns()` below exists so it stays true as venues are added.
 */
import * as solana from "./solana.mjs";
import * as xlayer from "./xlayer.mjs";

export const ALL = [solana, xlayer];

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
      return { id: c.id, label: c.label, ok: true, ...i, markets: c.markets() };
    } catch (e) {
      return { id: c.id, label: c.label, ok: false, error: String(e.message || e).slice(0, 140) };
    }
  }));
}
