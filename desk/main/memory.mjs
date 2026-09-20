/**
 * memory.mjs — the Node side of Sibyl.
 *
 * Spawns desktop/memory/sibyl_bridge.py and speaks newline-delimited JSON to
 * it. Every call here hits the real SQLite store; there is no in-memory
 * fallback on purpose — if memory is gone, the agent must visibly degrade,
 * because that is the product claim.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

/**
 * Where the bridge and its Python live, running from source OR from a packaged
 * .app. Neither can come out of app.asar: bash cannot read a script from inside
 * an archive and neither can the Python interpreter, so electron-builder ships
 * both as extraResources and they are found here.
 */
const pick = (...c) => c.find((f) => f && existsSync(f)) || null;

const BRIDGE = pick(
  process.env.SIBYL_BRIDGE,
  process.resourcesPath && path.join(process.resourcesPath, "memory", "sibyl_bridge.py"),
  path.join(ROOT, "desktop", "memory", "sibyl_bridge.py"),
);

const PY = pick(
  process.env.SIBYL_PY,
  process.resourcesPath && path.join(process.resourcesPath, ".venv", "bin", "python"),
  path.join(ROOT, ".venv", "bin", "python"),
) || "python3";   // last resort: a system python that may lack the SDK, and will say so

export class Memory {
  constructor({ db = process.env.SIBYL_DB } = {}) {
    this.db = db;
    this.seq = 0;
    this.pending = new Map();
    this.proc = null;
  }

  start() {
    if (this.proc) return;
    this.proc = spawn(PY, [BRIDGE], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...(this.db ? { SIBYL_DB: this.db } : {}) },
    });
    createInterface({ input: this.proc.stdout }).on("line", (line) => {
      let msg;
      try { msg = JSON.parse(line); } catch { return; }
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      msg.ok ? p.resolve(msg.result) : p.reject(new Error(msg.error));
    });
    this.proc.stderr.on("data", (d) => {
      const s = String(d).trim();
      if (s) console.error("[sibyl]", s);
    });
    this.proc.on("exit", (code) => {
      this.proc = null;
      for (const { reject } of this.pending.values())
        reject(new Error(`sibyl bridge exited (${code})`));
      this.pending.clear();
    });
  }

  /** The store this bridge actually opened — resolved, never guessed. */
  where() { return this.call("where"); }

  call(op, args = {}) {
    this.start();
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(JSON.stringify({ id, op, args }) + "\n");
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`sibyl op '${op}' timed out`));
        }
      }, 15000);
    });
  }

  stop() { if (this.proc) { this.proc.stdin.end(); this.proc.kill(); this.proc = null; } }

  // --- the vocabulary the agent loop uses -------------------------------
  ping()                     { return this.call("ping"); }
  stats()                    { return this.call("stats"); }
  wipe()                     { return this.call("wipe"); }
  recallBrief()              { return this.call("recall_brief"); }
  fullStore(limit = 60)      { return this.call("full_store", { limit }); }
  archiveEntity(category, name, reason) { return this.call("archive_entity", { category, name, reason }); }
  /**
   * Everything retired rather than destroyed, newest first.
   *
   * Takes an options object like every other search on this client. It used to
   * take a bare positional number, so calling it the way its siblings are
   * called — `listArchived({ limit: 10 })` — passed a dict where the bridge
   * wanted an int and threw a TypeError. A number still works.
   */
  listArchived(opts = {}) {
    const limit = typeof opts === "number" ? opts : (opts.limit ?? 50);
    return this.call("list_archived", { limit });
  }
  /** FTS5 with Sibyl's verdict attached: NO_MATCH and EMPTY_STORE are not the same answer. */
  searchTiers(query, { tiers = null, limit = 20 } = {}) { return this.call("search_tiers", { query, tiers, limit }); }
  /** The journal over a real time range, rather than "the last N and hope". */
  eventsBetween({ since = null, until = null, limit = 500 } = {}) { return this.call("events_between", { since, until, limit }); }
  /** Sibyl's own lifecycle column: a rule is `active` or `rejected`, not a flag in its JSON. */
  setEntityStatus(category, name, body, status) { return this.call("set_entity_status", { category, name, body, status }); }
  setState(key, body)        { return this.call("set_state", { key, body }); }
  setEntity(category, name, body) { return this.call("set_entity", { category, name, body }); }
  getEntity(category, name)  { return this.call("get_entity", { category, name }); }
  setReference(key, body)    { return this.call("set_reference", { key, body }); }

  // Deliberately NOT wrapped: get_state, get_reference, list_entities,
  // delete_entity and search_entities. The bridge still exposes all five, but
  // this client had wrappers for them with zero call sites, and on a project
  // judged for depth of integration an unused wrapper reads as integration
  // that is not there. Each is redundant against something real:
  // recallBrief() already returns the baton and the limits, fullStore() already
  // lists every entity, searchTiers() already searches entities AND carries the
  // verdict, and nothing deletes an entity any more — closing a position
  // archives it so the history survives.
  journal(e)                 { return this.call("write_event", e); }
  events(limit = 50)         { return this.call("read_events", { limit }); }
  search(query, limit = 20)  { return this.call("search", { query, limit }); }
  learn(kwargs = {})         { return this.call("learn", { kwargs }); }

  /** Limits with safe defaults, so a wiped memory is *restrictive*, not wide open. */
  async limits() {
    const b = await this.recallBrief();
    return b.limits || null;
  }
}

/** What a fresh pad is seeded with — its normal operating envelope.
 *
 *  The allowlist is exactly the set in markets.mjs that passed a real depth
 *  check on Base, plus the quote asset. DEGEN used to be here; a $500 order
 *  moves its pool 240%, so it was delisted rather than traded through.
 */
export const DEFAULT_LIMITS = {
  max_trade_usd: 100,
  max_day_usd: 300,
  allow: ["ETH", "WETH", "USDC", "cbBTC", "EURC", "AERO", "MORPHO", "VIRTUAL"],
};

/**
 * What decide() falls back to when it remembers NOTHING.
 *
 * These are deliberately not DEFAULT_LIMITS. An agent that has lost its memory
 * does not know what you told it, what it already spent today, or what it is
 * holding — so the safe move is to shrink, not to carry on at full size. This
 * is also the honest answer to "what breaks when memory is deleted?": the pad
 * still works, but it degrades to a timid version of itself.
 */
export const NO_MEMORY_LIMITS = {
  max_trade_usd: 10,
  max_day_usd: 25,
  allow: ["ETH", "USDC"],
};
