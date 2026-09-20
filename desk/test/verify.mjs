/**
 * verify.mjs — the whole product, checked end to end against a running backend.
 *
 * Not a unit test. It drives the real HTTP API, the real Base fork, the real
 * Sibyl store and the real Deepgram/Claude calls, and asserts the behaviour
 * written down in TESTPLAN.md. Everything it touches is real: the swaps mine,
 * the store is on disk, the speech is synthesised and transcribed.
 *
 *   ./run-dev.sh &                 # backend on :8080, CHAIN_MODE=fork
 *   node test/verify.mjs
 *
 * Exits non-zero on the first section that fails.
 */
import "./env.mjs";           // must precede every other import — see env.mjs
import { chainInfo, balances, pub, erc20Abi, fundOnFork } from "../main/chain.mjs";
import { quote, swap, spendable, routeOf } from "../main/dex.mjs";
import { bySpender } from "../main/routers/index.mjs";
import { TOKENS, UNISWAP_V3 } from "../main/tokens.mjs";
import { Memory, DEFAULT_LIMITS, NO_MEMORY_LIMITS } from "../main/memory.mjs";
import { tts, stt, pcmToWav, think, parseIntent, parseAmount } from "../main/voice.mjs";
import { MARKETS, DELISTED, SYMBOLS } from "../main/markets.mjs";
import { klines, marketUptrend, regimeOf, closedBars } from "../main/candles.mjs";
import { BOOK, runBook, ema, rsi, relativeVolume, atrPct, P } from "../main/strategies.mjs";
import { priceImpact, MAX_IMPACT } from "../main/dex.mjs";
import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// "Extreme SSD" has a space in it — URL.pathname would percent-encode it and
// every spawned child would fail with ENOENT on its own cwd.
const ROOT = fileURLToPath(new URL("..", import.meta.url));


const B = process.env.PAD_URL || "http://localhost:8080";
const TOKEN = process.env.PAD_TOKEN || "xorrpad-dev";
const H = { "content-type": "application/json", authorization: "Bearer " + TOKEN };

let pass = 0, fail = 0, skipped = 0;
// NOTE on the message argument: it is a template literal, so it is evaluated
// BEFORE chk() runs. A momentarily-bad response therefore used to throw inside
// the message and abort the whole section — one flaky read took nine unrelated
// checks with it and reported "R crashed" instead of naming what failed. Every
// message below reaches into the response optionally for that reason; the
// assertions themselves stay strict.
/** A check that could not run, with the reason. Counted, never assumed. */
function skip(name, why) {
  skipped++;
  console.log(`  \x1b[33mSKIP\x1b[0m  ${name.padEnd(32)} ${why}`);
}
const chk = (id, ok, detail) => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m"}  ${id.padEnd(34)} ${detail}`);
};
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);
/**
 * Every request this suite makes, with a deadline.
 *
 * `fetch` has no default timeout, so a single stuck socket hangs the whole run
 * with no output and no exit — which is exactly what happened on the fifth run:
 * the suite sat on one `/speak` call for a quarter of an hour while the same
 * endpoint answered every direct request in a second. A suite that can hang
 * forever cannot be trusted to report, and "no result" is the one outcome that
 * looks like neither a pass nor a fail.
 *
 * A timeout turns that into a loud, attributable failure on the check that
 * caused it. 90s is far above anything here — the slowest real call is a voice
 * round trip at ~14s — so this can only fire on a genuine stall.
 */
const FETCH_TIMEOUT_MS = Number(process.env.VERIFY_TIMEOUT_MS || 90_000);
const withDeadline = async (url, opts = {}) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try { return await fetch(url, { ...opts, signal: ctl.signal }); }
  catch (e) {
    if (e.name === "AbortError")
      throw new Error(`no answer from ${url} within ${FETCH_TIMEOUT_MS / 1000}s — the request stalled, it did not fail`);
    throw e;
  } finally { clearTimeout(t); }
};

const j = async (p, o = {}) => {
  const r = await withDeadline(B + p, { ...o, headers: o.noauth ? {} : H });
  let b = null; try { b = await r.json(); } catch {}
  return { s: r.status, b };
};
const amt = (b, s) => b[s].amount;

/**
 * Wait for the fork to answer before a chain-heavy section.
 *
 * The upstream this fork reads from is a free, rate-limited public RPC. A burst
 * — G6 fires two confirms at once, so two swaps race — tips it over, and anvil
 * then stalls for a few seconds fetching uncached slots. Every check after that
 * failed for the same reason and reported it as a product fault: "nothing
 * archived", "0 positions", "lost []". None of those were true.
 *
 * So gate on the node. A transient stall costs a pause; a node that never comes
 * back still fails the checks, loudly and for the right reason.
 */
async function waitForNode(seconds = 45) {
  const deadline = Date.now() + seconds * 1000;
  let last = "";
  while (Date.now() < deadline) {
    const r = await j("/portfolio");
    if (r.s === 200 && r.b?.chain?.chainId) return { ok: true };
    last = r.b?.error || `HTTP ${r.s}`;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return { ok: false, why: last };
}

// ── A/B. the HTTP surface ───────────────────────────────────────────────────
section("B. HTTP API");
try {
  const h = await j("/health", { noauth: true });
  chk("B1 GET /health open", h.s === 200 && h.b.ok === true && h.b.mode === "fork" &&
      typeof h.b.agent === "string" && typeof h.b.armed === "boolean", JSON.stringify(h.b));

  const noTok = await j("/memory", { noauth: true });
  chk("B2 auth is enforced", noTok.s === 401 && noTok.b?.error === "bad pad token", `${noTok.s}`);

  const mem = await j("/memory");
  const need = ["limits", "positions", "rules", "watchlist", "baton", "journal_recent"];
  chk("B3 GET /memory shape", mem.s === 200 && need.every((k) => k in mem.b), `keys=${Object.keys(mem.b)}`);

  const pf = await j("/portfolio");
  chk("B4 GET /portfolio", pf.s === 200 && pf.b.chain.chainId === 8453 && pf.b.chain.mode === "fork" &&
      typeof pf.b.balances.ETH.amount === "number", `chainId=${pf.b.chain?.chainId} (no bigint crash)`);

  let agentsOk = true;
  for (const a of ["dca", "grid", "momentum", "rebalance", "yield", "risk"]) {
    const k = await j("/key", { method: "POST", body: JSON.stringify({ id: a }) });
    const hh = await j("/health", { noauth: true });
    if (!(k.b?.agent === a && hh.b.agent === a)) agentsOk = false;
  }
  const baton = (await j("/memory")).b.baton;
  chk("B5 all six agents take the baton", agentsOk && baton?.agent === "risk", `baton persisted as '${baton?.agent}'`);

  const unknown = await j("/key", { method: "POST", body: JSON.stringify({ id: "nonsense" }) });
  chk("B10 unknown key is handled", unknown.s === 200 && unknown.b.ok === false &&
      /unknown key/.test(unknown.b.error), `"${unknown.b.error}"`);

  // Make sure nothing IS pending before asserting on the orphan case. The
  // pending decision survives restarts by design, so leaving this implicit made
  // the check depend on whether the previous run happened to end mid-decision —
  // and a stray ✓ here would confirm a real trade, not just fail a test.
  await j("/key", { method: "POST", body: JSON.stringify({ id: "no" }) });
  const orphanYes = await j("/key", { method: "POST", body: JSON.stringify({ id: "yes" }) });
  chk("B9 YES with nothing pending", orphanYes.b?.ok === false && /nothing pending/.test(orphanYes.b.error), "no 500");

  const four04 = await j("/nope");
  chk("B17 unknown route", four04.s === 404 && /no such route/.test(four04.b?.error || ""), "404");

  const badBody = await j("/reflect/accept", { method: "POST", body: JSON.stringify({ id: "oops" }) });
  chk("B15a malformed accept is 400", badBody.s === 400 && /proposal/.test(badBody.b?.error || ""), `${badBody.s}`);
} catch (e) { chk("B crashed", false, String(e.message || e).slice(0, 92)); }

// ── the gate: propose → confirm → real fill ─────────────────────────────────
section("B6–B8 · F2–F4. propose, confirm, fill");
try {
  // Name the market this section asserts on. The baton is remembered across
  // restarts, so leaving it implicit made these checks depend on whichever
  // market the PREVIOUS run happened to finish on — they passed on a fresh
  // store and failed on the second run against the same one.
  await j("/key", { method: "POST", body: JSON.stringify({ id: "ETH" }) });
  const buy = await j("/key", { method: "POST", body: JSON.stringify({ id: "buy" }) });
  const v = buy.b.verdict;
  const cites = v.why.some((w) => /memory|journal|holding|allowlist|rule|limits/i.test(w));
  chk("B6 BUY cites remembered facts", buy.s === 200 && !!buy.b.signal && cites,
      `${v.action} $${v.sizeUsd} — "${v.why[0]}"`);

  const before = await j("/memory");
  const yes = await j("/key", { method: "POST", body: JSON.stringify({ id: "yes" }) });
  const after = await j("/memory");
  const q0 = before.b.positions?.ETH?.qty ?? 0, q1 = after.b.positions?.ETH?.qty ?? 0;
  chk("B7 YES mines a real swap", /^0x[0-9a-f]{64}$/.test(yes.b?.fill?.hash || "") &&
      yes.b.fill.status === "success" && yes.b.fill.received > 0 && q1 > q0,
      `${yes.b?.fill?.hash?.slice(0, 12)}… position ${q0.toFixed(5)} → ${q1.toFixed(5)}`);

  const dupe = await j("/key", { method: "POST", body: JSON.stringify({ id: "yes" }) });
  chk("G5 a second YES cannot double-fill", dupe.b?.ok === false && /nothing pending/.test(dupe.b.error), "refused");

  await j("/key", { method: "POST", body: JSON.stringify({ id: "buy" }) });
  const no = await j("/key", { method: "POST", body: JSON.stringify({ id: "no" }) });
  chk("B8 NO rejects and journals", no.b?.rejected === true, "rejected, nothing traded");
} catch (e) { chk("B6–B8 · F2–F4 crashed", false, String(e.message || e).slice(0, 92)); }

// ── the kill switch ─────────────────────────────────────────────────────────
section("B11–B12 · F7. the kill switch");
try {
  await j("/key", { method: "POST", body: JSON.stringify({ id: "kill" }) });
  const h = await j("/health", { noauth: true });
  chk("B11 KILL disarms", h.b.armed === false, "armed=false");

  await j("/key", { method: "POST", body: JSON.stringify({ id: "buy" }) });
  const usd0 = (await j("/portfolio")).b.balances.USDC.amount;
  const yes = await j("/key", { method: "POST", body: JSON.stringify({ id: "yes" }) });
  const usd1 = (await j("/portfolio")).b.balances.USDC.amount;
  chk("G19 KILL stops the HUMAN path too", yes.b?.ok === false && /disarmed/.test(yes.b.error) &&
      Math.abs(usd1 - usd0) < 1e-9, `balance unmoved at $${usd1.toFixed(2)}`);

  const arm = await j("/arm", { method: "POST" });
  const h2 = await j("/health", { noauth: true });
  chk("G20 /arm re-arms, pending survives", arm.b.armed === true && h2.b.armed === true && h2.b.pending === true,
      "the same ✓ still stands");

  const yes2 = await j("/key", { method: "POST", body: JSON.stringify({ id: "yes" }) });
  chk("G20b the held ✓ then executes", /^0x[0-9a-f]{64}$/.test(yes2.b?.fill?.hash || ""),
      `${yes2.b?.fill?.hash?.slice(0, 12)}…`);

  const panic = await j("/panic", { method: "POST" });
  chk("B12 /panic disarms", panic.b.armed === false, "armed=false");
  await j("/arm", { method: "POST" });
} catch (e) { chk("B11–B12 · F7 crashed", false, String(e.message || e).slice(0, 92)); }

// ── reflection: journal → proposal → accepted rule → veto ───────────────────
section("B14–B15 · D5 · F8. the habit loop");
try {
  // Establish the precondition rather than inheriting it. Reflection mines
  // refusals of the SAME SHAPE, and a sell is only refused BY THE OPERATOR if
  // it got past the gate first — with no remembered position the gate rejects
  // it, nothing minable is journalled, and this section failed with "nothing
  // mined from the journal" for a reason that had nothing to do with
  // reflection. Depending on whatever ran before is how a suite acquires
  // intermittent failures.
  await j("/memory/seed", { method: "POST", body: "{}" });
  await j("/arm", { method: "POST" });
  // /memory/seed re-teaches the LIMITS only — it does not clear learned rules.
  // A rule left behind by an earlier section vetoes these sells at the gate, so
  // they journal as "vetoed by rule" rather than as operator refusals, and
  // reflection has nothing of the right shape to mine. Retire them first.
  {
    const mem3 = new Memory({ db: (await j("/health")).b?.memoryDb || process.env.SIBYL_DB });
    for (const r of (await mem3.recallBrief().catch(() => ({}))).rules || [])
      await mem3.archiveEntity("rule", r.id, "cleared for the habit-loop check").catch(() => {});
    mem3.stop();
  }
  await j("/key", { method: "POST", body: JSON.stringify({ id: "ETH" }) });
  await j("/size", { method: "POST", body: JSON.stringify({ usd: 25 }) });
  if (!(await j("/memory")).b?.positions?.ETH) {
    await j("/key", { method: "POST", body: JSON.stringify({ id: "buy" }) });
    await j("/key", { method: "POST", body: JSON.stringify({ id: "yes" }) });
  }
  for (let i = 0; i < 3; i++) {
    await j("/key", { method: "POST", body: JSON.stringify({ id: "sell" }) });
    await j("/key", { method: "POST", body: JSON.stringify({ id: "no" }) });
  }
  const rf = await j("/reflect");
  chk("B14 GET /reflect", rf.s === 200 && Array.isArray(rf.b.proposals) && typeof rf.b.journalDepth === "number",
      `${rf.b?.proposals?.length} proposal(s) from ${rf.b?.journalDepth} journalled events`);

  // Take the proposal mined from the refusals THIS section just journalled —
  // ETH sells — not whichever happens to rank first. The journal is shared, so
  // another section (or a stress run) can leave a higher-ranked proposal about
  // a different side entirely; accepting that one and then pressing sell tests
  // nothing, because a buy rule cannot veto a sell. That is not a hypothetical:
  // it accepted 'no-eth-buy-over-24' and then failed D5 for the right reason.
  const prop = rf.b.proposals.find(
    (p) => p.symbol === "ETH" && String(p.side).toUpperCase() === "SELL");
  if (!prop) {
    chk("D5 a rule is proposed", false,
        `no ETH SELL proposal among ${rf.b.proposals.length}: ` +
        rf.b.proposals.map((p) => `${p.symbol}/${p.side}`).join(", "));
  }
  else {
    await j("/reflect/accept", { method: "POST", body: JSON.stringify({ proposal: prop }) });
    const rules = (await j("/memory")).b.rules;
    const saved = rules.find((r) => r.id === prop.id);
    chk("B15 accepted rule persists", saved?.accepted === true, `entity:rule/${prop.id}`);

    const sell = await j("/key", { method: "POST", body: JSON.stringify({ id: "sell" }) });
    const vetoed = sell.b.verdict.action === "REJECT" &&
                   sell.b.verdict.why.some((w) => /vetoed by remembered rule/.test(w));
    chk("D5 the learned rule vetoes", vetoed, `"${sell.b?.verdict?.why?.slice(-1)[0]}"`);
  }
} catch (e) { chk("B14–B15 · D5 · F8 crashed", false, String(e.message || e).slice(0, 92)); }

// ── C. the chain ────────────────────────────────────────────────────────────
section("C. Base fork — real contracts, real fills");
try {
  {
    // Stop the section rather than running checks that cannot measure anything.
    // Letting them run turned one infrastructure stall into nine "failures"
    // that each named a product fault which was not there.
    const up = await waitForNode();
    if (!up.ok) throw new Error(`the Base node never came back (${up.why}) — this section measures nothing without it`);
  }
  // The fork's wallet is whatever previous runs left in --state. Top it up
  // first, or the suite's pass/fail depends on residue from the last session.
  const fund = await fundOnFork();
  chk("C0 the fork wallet is funded to trade", fund.funded && fund.usdc >= 100,
      `${fund.usdc?.toFixed(2)} USDC${fund.swapped ? " (topped up on-chain)" : ""}${fund.quoteAsset ? " — " + fund.quoteAsset : ""}`);

  const info = await chainInfo();
  const supply = await pub.readContract({ address: TOKENS.USDC.address, abi: erc20Abi, functionName: "totalSupply" });
  chk("C1 fork is Base mainnet state", info.chainId === 8453 && Number(info.block) > 0 && supply > 0n,
      `chain 8453 @ block ${info.block}, USDC supply $${(Number(supply) / 1e6).toFixed(0)}`);

  const q = await quote("ETH", "USDC", 0.05);
  chk("C2 live Uniswap V3 quote", UNISWAP_V3.fees.includes(q.fee) && q.price > 500 && q.price < 20000,
      `fee tier ${q.fee / 10000}% → $${q.price.toFixed(2)}/ETH`);

  const b0 = await balances(); const f = await swap("USDC", "ETH", 5); const b1 = await balances();
  chk("C3 a swap actually moves tokens", f.status === "success" && amt(b1, "WETH") > amt(b0, "WETH") &&
      amt(b1, "USDC") < amt(b0, "USDC"),
      `USDC ${amt(b0, "USDC").toFixed(2)}→${amt(b1, "USDC").toFixed(2)}, WETH +${(amt(b1, "WETH") - amt(b0, "WETH")).toFixed(5)}`);

  const s = await swap("ETH", "USDC", 0.001); const b2 = await balances();
  chk("C3b and round-trips back", s.status === "success" && amt(b2, "USDC") > amt(b1, "USDC"),
      `USDC ${amt(b1, "USDC").toFixed(2)}→${amt(b2, "USDC").toFixed(2)}`);

  let msg = "(no throw)";
  try { await swap("USDC", "ETH", 1e9); } catch (e) { msg = e.message; }
  chk("C4 over-spend fails readably", /insufficient/i.test(msg) && !/STF/.test(msg), `"${msg.slice(0, 60)}…"`);

  const sp = await spendable("ETH"), bb = await balances();
  chk("C4b spendable ETH counts WETH", Math.abs(sp - ((amt(bb, "ETH") - 0.01) + amt(bb, "WETH"))) < 1e-6,
      "a bought position is sellable");

  const guard = (env) => {
    try {
      execFileSync(process.execPath, ["-e", 'import("./main/chain.mjs").then(()=>process.exit(9))'],
        { env: { ...process.env, ...env }, cwd: ROOT, stdio: "pipe" });
      return "loaded";
    } catch (e) { return String(e.stderr || "").includes("Error") ? "refused" : "refused"; }
  };
  const noKey = guard({ CHAIN_MODE: "mainnet", AGENT_PRIVATE_KEY: "" });
  const anvilKey = guard({ CHAIN_MODE: "mainnet", AGENT_PRIVATE_KEY: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" });
  chk("C5 mainnet guards hold", noKey === "refused" && anvilKey === "refused",
      "no key → refused; anvil key on mainnet → refused");
} catch (e) { chk("C crashed", false, String(e.message || e).slice(0, 92)); }

// ── D. memory ───────────────────────────────────────────────────────────────
section("D. Sibyl memory");
try {
  const DB = "/tmp/xorrpad-verify.db";
  for (const p of [DB, DB + "-wal", DB + "-shm"]) if (fs.existsSync(p)) fs.unlinkSync(p);
  const m = new Memory({ db: DB }); await m.ping();
  await m.setReference("risk/limits", DEFAULT_LIMITS);
  await m.setEntity("position", "ETH", { qty: 0.5, avg_entry_usd: 2400 });
  const n0 = (await m.events(500)).length;
  await m.journal({ evaluated: { signal: { symbol: "ETH", side: "BUY", sizeUsd: 25 } },
                    acted: { action: "APPROVED", executed: false } });
  const n1 = (await m.events(500)).length;
  chk("D2 the journal grows", n1 === n0 + 1, `${n0} → ${n1} events`);
  chk("D1a it is a real file", fs.existsSync(DB) && fs.statSync(DB).size > 0, DB);

  const out = execFileSync(process.execPath, ["-e", `
    import("./main/memory.mjs").then(async ({Memory})=>{ const m=new Memory({db:"${DB}"}); await m.ping();
      const b=await m.recallBrief();
      console.log(JSON.stringify({l:b.limits?.max_trade_usd,e:b.positions?.ETH?.qty,n:(await m.events(500)).length}));
      process.exit(0); });`],
    { env: process.env, encoding: "utf8", cwd: ROOT });
  const seen = JSON.parse(out.trim().split("\n").pop());
  chk("D1 survives a separate process", seen.l === 100 && seen.e === 0.5 && seen.n === n1,
      "real SQLite on disk, not an in-memory shim");

  const w = await m.wipe();
  const gone = execFileSync(process.execPath, ["-e", `
    import("./main/memory.mjs").then(async ({Memory})=>{ const m=new Memory({db:"${DB}"}); await m.ping();
      const b=await m.recallBrief();
      console.log(JSON.stringify({l:b.limits,p:Object.keys(b.positions||{}).length,n:(await m.events(500)).length}));
      process.exit(0); });`],
    { env: process.env, encoding: "utf8", cwd: ROOT });
  const g = JSON.parse(gone.trim().split("\n").pop());
  chk("D3 wipe really destroys it", w.removed.length === 3 && g.l === null && g.p === 0 && g.n === 0,
      "db + wal + shm removed; a fresh process finds nothing");

  await m.setReference("risk/limits", { max_trade_usd: 7, max_day_usd: 9, allow: ["ETH"] });
  chk("D3b the store still works after a wipe", (await m.recallBrief()).limits?.max_trade_usd === 7, "re-seeded fine");
  m.stop?.();

  chk("D6 no-memory fallback is stricter", NO_MEMORY_LIMITS.max_trade_usd < DEFAULT_LIMITS.max_trade_usd &&
      NO_MEMORY_LIMITS.max_day_usd < DEFAULT_LIMITS.max_day_usd,
      `$${NO_MEMORY_LIMITS.max_trade_usd}/trade vs the remembered $${DEFAULT_LIMITS.max_trade_usd}`);
} catch (e) { chk("D crashed", false, String(e.message || e).slice(0, 92)); }

// ── G3. a wipe must void an outstanding ✓ ───────────────────────────────────
section("G3. wiping memory mid-flow");
try {
  const buy = await j("/key", { method: "POST", body: JSON.stringify({ id: "buy" }) });
  const usd0 = (await j("/portfolio")).b.balances.USDC.amount;
  const w = await j("/memory/wipe", { method: "POST" });
  const yes = await j("/key", { method: "POST", body: JSON.stringify({ id: "yes" }) });
  const usd1 = (await j("/portfolio")).b.balances.USDC.amount;
  chk("G3 the forgotten ✓ is voided", w.b.pendingVoided === true && yes.b?.ok === false && usd0 === usd1,
      `proposed $${buy.b?.verdict?.sizeUsd} before the wipe, then refused — balance unmoved`);

  const m = await j("/memory");
  chk("B16 post-wipe recall is empty", m.b.limits === null && Object.keys(m.b.positions).length === 0,
      "limits null, positions {}");

  // and the wipe has to be reversible, or the demo can only be run once
  const seed = await j("/memory/seed", { method: "POST", body: "{}" });
  const back = await j("/memory");
  chk("G32 the pad can be re-taught", seed.s === 200 && back.b.limits?.max_trade_usd === 100,
      `limits restored to $${back.b.limits?.max_trade_usd}/trade without a restart`);
  await j("/memory/wipe", { method: "POST" });

  const post = await j("/key", { method: "POST", body: JSON.stringify({ id: "buy" }) });
  chk("F6 the same press now decides differently", post.b.verdict.sizeUsd <= NO_MEMORY_LIMITS.max_trade_usd &&
      post.b.verdict.why.some((w) => /NO remembered limits/.test(w)),
      `$${buy.b?.verdict?.sizeUsd} with memory → $${post.b?.verdict?.sizeUsd} without it`);
  await j("/key", { method: "POST", body: JSON.stringify({ id: "no" }) });
} catch (e) { chk("G3 crashed", false, String(e.message || e).slice(0, 92)); }

// ── M. markets, strategies, liquidity ───────────────────────────────────────
section("M. markets — every asset class, on Base");
try {
  const classes = new Set(Object.values(MARKETS).map((m) => m.class));
  chk("M1 four asset classes are live", classes.size >= 4,
      [...classes].join(", ") + ` across ${SYMBOLS.length} markets`);

  const mk = await j("/markets");
  chk("M2 GET /markets", mk.s === 200 && Object.keys(mk.b.markets).length === SYMBOLS.length,
      `${Object.keys(mk.b.markets).length} listed, ${Object.keys(mk.b.delisted).length} delisted with reasons`);

  // Every listed market must actually price within the impact limit.
  let worst = { sym: null, impact: -1 };
  for (const sym of SYMBOLS) {
    const i = await priceImpact("USDC", sym, 200);
    if (i.impact > worst.impact) worst = { sym, impact: i.impact };
  }
  chk("M3 every listed market is deep enough", worst.impact <= MAX_IMPACT,
      `worst is ${worst.sym} at ${(worst.impact * 100).toFixed(2)}% (limit ${(MAX_IMPACT * 100).toFixed(0)}%)`);

  const deg = await j("/key", { method: "POST", body: JSON.stringify({ id: "DEGEN" }) });
  chk("M4 a delisted market is refused with its reason",
      deg.b?.ok === false && /delisted/.test(deg.b.error), `"${deg.b?.error}"`);

  // The wipe in the previous section left the pad on its timid fallback, which
  // allows only ETH and USDC — that is correct, so re-teach before trading a
  // non-crypto market, and prove the refusal first.
  const beforeTeach = await j("/key", { method: "POST", body: JSON.stringify({ id: "EURC" }) });
  await j("/key", { method: "POST", body: JSON.stringify({ id: "buy" }) });
  const refused = await j("/key", { method: "POST", body: JSON.stringify({ id: "buy" }) });
  chk("M4b a memoryless pad refuses an unremembered market",
      refused.b?.verdict?.action === "REJECT" && refused.b.verdict.why.some((w) => /allowlist/.test(w)),
      `"${refused.b?.verdict?.why?.slice(-1)[0]}"`);
  await j("/memory/seed", { method: "POST", body: "{}" });

  await j("/key", { method: "POST", body: JSON.stringify({ id: "EURC" }) });
  const h = await j("/health", { noauth: true });
  const buy = await j("/key", { method: "POST", body: JSON.stringify({ id: "buy" }) });
  const yes = await j("/key", { method: "POST", body: JSON.stringify({ id: "yes" }) });
  chk("M5 a non-crypto market fills for real", /^0x[0-9a-f]{64}$/.test(yes.b?.fill?.hash || "") &&
      yes.b.fill.receivedSymbol === "EURC",
      `forex: ${(+yes.b?.fill?.received || 0).toFixed(2)} EURC at fee tier ${yes.b?.fill?.fee}`);
  await j("/key", { method: "POST", body: JSON.stringify({ id: "ETH" }) });
} catch (e) { chk("M crashed", false, String(e.message || e).slice(0, 92)); }

section("S. the strategy book");
try {
  const gate = await marketUptrend();
  chk("S1 the market trend gate reads real BTC history", typeof gate.uptrend === "boolean" && gate.sma200 > 0,
      gate.reason);

  const c = await klines("ETHUSDT", { limit: 300 });
  chk("S2 real hourly candles with volume", c.length >= 200 && c.every((k) => k.volume > 0 && k.high >= k.low),
      `${c.length} bars, OHLCV complete`);

  // Each strategy must FIRE on a construction that meets it and stay silent
  // one step below — a book that cannot fire is not a book.
  const flat = (n, px) => Array.from({ length: n }, () => ({ t: 0, open: px, high: px * 1.001, low: px * 0.999, close: px, volume: 1000 }));
  const deep = flat(120, 100); deep[119] = { t: 0, open: 92.8, high: 93.2, low: 92.9, close: 93, volume: 1000 };
  chk("S3 deep_stretch_reversion fires at -7%", !!BOOK.deep_stretch_reversion(deep, { uptrend: true, regime: "CHOP", symbol: "ETH" }),
      "the strongest measured condition");
  const shallow = flat(120, 100); shallow[119] = { t: 0, open: 95.8, high: 96.2, low: 95.9, close: 96, volume: 1000 };
  chk("S4 …and stays silent at -4%", !BOOK.deep_stretch_reversion(shallow, { uptrend: true, regime: "CHOP", symbol: "ETH" }),
      "threshold respected");
  chk("S5 …and the market gate switches it off", !BOOK.deep_stretch_reversion(deep, { uptrend: false, regime: "CHOP", symbol: "ETH" }),
      "no dip buying while BTC is below its 200-day mean");

  const sc = await j("/scan");
  chk("S6 GET /scan runs the book on every market",
      sc.s === 200 && sc.b.markets.length === SYMBOLS.length && Array.isArray(sc.b.signals) && !!sc.b.summary,
      `${sc.b.summary}`);
  chk("S7 the scan explains every market it looked at",
      sc.b.markets.every((m) => m.error || (typeof m.rsi === "number" && typeof m.regime === "string")),
      sc.b.markets.map((m) => `${m.symbol} RSI ${m.rsi}`).join(", "));
} catch (e) { chk("S crashed", false, String(e.message || e).slice(0, 92)); }

// ── routes and chain behaviour the earlier sections do not reach ────────────
section("R. remaining routes");
try {
  await j("/memory/seed", { method: "POST", body: "{}" });
  await j("/arm", { method: "POST" });
  await j("/key", { method: "POST", body: JSON.stringify({ id: "ETH" }) });

  const lg = await j("/log");
  chk("B6 GET /log", lg.s === 200 && Array.isArray(lg.b?.log) && lg.b.log.every((e) => e.t && e.m),
      `${lg.b?.log?.length} server-side entries, so pad presses are visible`);

  await j("/key", { method: "POST", body: JSON.stringify({ id: "buy" }) });
  const live = await j("/pending");
  await j("/key", { method: "POST", body: JSON.stringify({ id: "no" }) });
  const gone = await j("/pending");
  chk("B7 GET /pending both states", live.b.pending === true && !!live.b.signal && !!live.b.verdict && gone.b.pending === false,
      `${live.b?.signal?.side} ${live.b?.signal?.symbol} $${live.b?.signal?.sizeUsd} -> none`);

  const sw = await j("/key", { method: "POST", body: JSON.stringify({ id: "eurc" }) });
  const baton = (await j("/memory")).b.baton?.market;
  chk("B9 market switch is case-insensitive", sw.b?.ok === true && sw.b.market === "EURC" && sw.b.class === "forex" && baton === "EURC",
      `"eurc" -> ${sw.b?.market} (${sw.b?.class}), baton follows`);
  await j("/key", { method: "POST", body: JSON.stringify({ id: "ETH" }) });

  const tick = await j("/tick", { method: "POST" });
  chk("B20 POST /tick", tick.s === 200 && Array.isArray(tick.b?.signals),
      `${tick.b?.signals?.length} signal(s), verdict ${tick.b?.verdict?.action ?? "none"}`);

  const noId = await j("/key", { method: "POST", body: "{}" });
  const junk = await j("/reflect/reject", { method: "POST", body: '{"x":1}' });
  chk("G9 malformed bodies never 500", noId.s === 200 && noId.b?.ok === false && junk.s === 400,
      `/key {} -> "${noId.b?.error}"; junk reject -> ${junk.s}`);

  const fonts = await withDeadline(B + "/fonts/inter-600.woff2");
  const trav = await withDeadline(B + "/fonts/..%2f..%2fpackage.json");
  chk("A3/A4 fonts serve, traversal does not",
      fonts.status === 200 && fonts.headers.get("content-type") === "font/woff2" && trav.status !== 200,
      `woff2 200, traversal ${trav.status}`);
} catch (e) { chk("R crashed", false, String(e.message || e).slice(0, 92)); }

section("C. chain behaviour on every asset class");
try {
  const q = await quote("ETH", "USDC", 0.1);
  chk("C3 quote uses the measured fee tier", q.fee === MARKETS.ETH.fee,
      `${q.fee / 10000}% matches markets.mjs`);

  for (const [cls, syms] of Object.entries({ crypto: ["ETH", "cbBTC"], forex: ["EURC"], defi: ["AERO", "MORPHO"], ai: ["VIRTUAL"] })) {
    for (const sym of syms) {
      const key = sym === "ETH" ? "WETH" : sym;
      const before = (await balances())[key].amount;
      const f = await swap("USDC", sym, 6);
      const after = (await balances())[key].amount;
      chk(`C4 ${cls}/${sym} mined fill`, f.status === "success" && after > before && f.received > 0,
          `${f.hash.slice(0, 12)}… +${(after - before).toFixed(6)} at tier ${f.fee}`);
    }
  }

  TOKENS.DEGEN = { symbol: "DEGEN", address: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed", decimals: 18 };
  // Size it to what the wallet holds, or the balance check fires first and we
  // end up testing the wallet instead of the gate.
  const affordable = Math.max(5, Math.min(100, Math.floor((await spendable("USDC")) * 0.5)));
  let msg = "(no throw)";
  try { await swap("USDC", "DEGEN", affordable); } catch (e) { msg = e.message; }
  // Refused either because it measured the pool as too thin, or because it
  // could not measure it at all. Both are the gate holding; a submitted
  // transaction is the gate failing.
  chk("C6 the liquidity gate refuses before signing",
      (/too thin/.test(msg) || /could not be measured/.test(msg)) && !/submitted/.test(msg),
      `$${affordable} attempt: "${msg.slice(0, 64)}"`);
  delete TOKENS.DEGEN;
} catch (e) { chk("C crashed", false, String(e.message || e).slice(0, 92)); }

section("G. concurrency");
try {
  {
    // Stop the section rather than running checks that cannot measure anything.
    // Letting them run turned one infrastructure stall into nine "failures"
    // that each named a product fault which was not there.
    const up = await waitForNode();
    if (!up.ok) throw new Error(`the Base node never came back (${up.why}) — this section measures nothing without it`);
  }
  await j("/key", { method: "POST", body: JSON.stringify({ id: "ETH" }) });
  await j("/key", { method: "POST", body: JSON.stringify({ id: "buy" }) });
  // A stalled node must fail this check with a message, not crash the run.
  const usdc = async () => {
    const r = await j("/portfolio");
    return r.b?.balances?.USDC?.amount ?? null;
  };
  const u0 = await usdc();
  const [a, b2] = await Promise.all([
    j("/key", { method: "POST", body: JSON.stringify({ id: "yes" }) }),
    j("/key", { method: "POST", body: JSON.stringify({ id: "yes" }) }),
  ]);
  // The two concurrent swaps are the heaviest burst in the run, and the node
  // routinely needs a moment afterwards. Measuring straight away read a 503 and
  // reported it as "fills exactly once" failing — when the fill was correct and
  // only the measurement was unavailable. Wait for the node, then measure.
  await waitForNode(60);
  const u1 = await usdc();
  const fills = [a, b2].filter((r) => r.b?.fill).length;
  // Compare the movement against the trade that actually ran, not a constant.
  // The old guard hard-coded "< 60" and failed a correct single $100 fill the
  // moment the size had been left at $100 — it was measuring the fixture, not
  // the behaviour. What matters is that ONE trade moved, never two.
  const one = Number(a.b?.fill ? a.b.verdict?.sizeUsd : b2.b?.verdict?.sizeUsd) || 50;
  chk("G6 concurrent confirm fills exactly once",
      fills === 1 && u0 != null && u1 != null && (u0 - u1) <= one * 1.1,
      u0 == null || u1 == null
        ? "the Base node stalled and /portfolio returned 503 — cannot measure the balance"
        : `${fills} fill, $${(u0 - u1).toFixed(2)} moved on a $${one} trade`);

  await Promise.all(["cbBTC", "EURC", "AERO"].map((m) =>
    j("/key", { method: "POST", body: JSON.stringify({ id: m }) })));
  const bat = (await j("/memory")).b.baton?.market;
  const nxt = await j("/key", { method: "POST", body: JSON.stringify({ id: "buy" }) });
  chk("G7 rapid switching stays consistent", nxt.b?.signal?.symbol === bat,
      `baton ${bat}, next proposal ${nxt.b?.signal?.symbol}`);
  await j("/key", { method: "POST", body: JSON.stringify({ id: "no" }) });
  await j("/key", { method: "POST", body: JSON.stringify({ id: "ETH" }) });
} catch (e) { chk("G crashed", false, String(e.message || e).slice(0, 92)); }

// ── E. voice + brain ────────────────────────────────────────────────────────
section("E. Deepgram + the Claude Code brain");
try {
  const audio = await tts("buy fifty dollars of E T H");
  chk("E1 Deepgram TTS", Buffer.isBuffer(audio) && audio.length > 10000, `${audio.length} bytes of linear16`);

  const text = await stt(pcmToWav(audio));
  const t = text.toLowerCase();
  // Deepgram returns "By" for "Buy", and spells ETH as "e t eight" — H heard as
  // "aitch" — often enough that pinning the assertion to any spelling tests the
  // transcriber's mood, not the product. It failed on exactly that while the
  // pad parsed the same sentence into the right order. So assert what actually
  // matters: something was heard, and it becomes the order it should.
  const parsed = parseIntent(text, "momentum", "ETH");
  chk("E2 Deepgram STT", text.length > 0 && parsed?.side === "BUY" &&
      parsed.symbol === "ETH" && parsed.sizeUsd === 50,
      `heard "${text}" -> ${parsed ? `${parsed.side} ${parsed.symbol} $${parsed.sizeUsd}` : "not an order"}`);

  const sig = parseIntent(text, "momentum");
  chk("E2b speech becomes an order", sig?.side === "BUY" && sig?.sizeUsd === 50, JSON.stringify(sig));
  chk("E2c spoken amounts parse", parseAmount("$50") === 50 && parseAmount("fifty bucks") === 50 &&
      parseAmount("two hundred") === 200, "'$50' · 'fifty bucks' · 'two hundred'");

  // Deepgram returns "By" AND "My" for "Buy" — both have killed a real spoken
  // order. The impostors count as the verb only immediately before an amount,
  // so a question that merely contains "my" is still a question.
  {
    const sideOf = (t) => parseIntent(t, "momentum", "ETH")?.side ?? null;
    const cases = [
      ["Buy $50 of ETH.", "BUY"], ["By $50 of ETH.", "BUY"], ["My $50 of ETH.", "BUY"],
      ["by fifty dollars of eth", "BUY"], ["my fifty dollars of eth", "BUY"],
      ["What is my per trade limit?", null], ["what is my balance", null],
      ["by the way what do you think", null], ["my portfolio please", null],
    ];
    const bad = cases.filter(([t, want]) => sideOf(t) !== want);
    chk("E2d buy/by/my homophones, without false orders", bad.length === 0,
        bad.length ? `${bad.length} wrong: ${bad.map(([t]) => `"${t}"`).join(", ")}`
                   : `${cases.length}/${cases.length} — orders parse, questions do not`);
  }

  const mk = (lim) => ({ limits: { max_trade_usd: lim, max_day_usd: 300, allow: ["ETH", "USDC"] },
                         positions: { ETH: { qty: 0.03, avg_entry_usd: 2479 } }, rules: [], watchlist: [] });
  const a1 = (await think("what is my per-trade limit?", mk(100), { prices: { ETH: 2479 } })).text;
  const a2 = (await think("what is my per-trade limit?", mk(250), { prices: { ETH: 2479 } })).text;
  // The reply is spoken, so numbers come back as words and the phrasing varies
  // run to run ("two hundred fifty" / "two hundred and fifty"). Normalise to
  // digits and test the CLAIM — that the answer tracks memory — not the wording.
  const toDigits = (t) => {
    const W = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10,
                twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90 };
    let out = t.toLowerCase().replace(/\band\b/g, " ");
    // "two hundred fifty" -> 250, "one hundred" -> 100
    out = out.replace(/\b(one|two|three|four|five|six|seven|eight|nine)\s+hundred(?:\s+(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety))?(?:\s+(one|two|three|four|five|six|seven|eight|nine))?/g,
      (_m, h, t2, u) => String(W[h] * 100 + (t2 ? W[t2] : 0) + (u ? W[u] : 0)));
    return out;
  };
  const n1 = toDigits(a1), n2 = toDigits(a2);
  const has = (t, n) => new RegExp(`\\b${n}\\b`).test(t);
  chk("E3 the brain is grounded in memory",
      has(n1, 100) && !has(n1, 250) && has(n2, 250) && !has(n2, 100),
      `remembered 100 → "${a1.slice(0, 42)}…" · remembered 250 → "${a2.slice(0, 42)}…"`);

  const r = await withDeadline(B + "/voice", { method: "POST",
    headers: { authorization: "Bearer " + TOKEN, "content-type": "application/octet-stream" },
    body: await tts("Buy forty dollars of E T H") });
  const spoken = Buffer.from(await r.arrayBuffer());
  const act = r.headers.get("x-action");
  // A spoken ORDER must reach the decide() gate. Accepting ANSWER here would
  // hide exactly the bug this caught: a mis-heard ticker turning a trade into
  // small talk.
  const tr = decodeURIComponent(r.headers.get("x-transcript") || "");
  // Assert the OUTCOME, not the transcriber's spelling. Deepgram returns "By"
  // and "My" for "Buy"; the parser handles all three, and pinning this to the
  // letters b-u-y failed a round trip the product got exactly right.
  chk("B18 POST /voice round trip", r.status === 200 && spoken.length > 10000 &&
      tr.length > 0 && ["EXECUTE", "REJECT"].includes(act),
      `speech → "${tr}" → ${act} → ${spoken.length} bytes spoken back`);

  const ask = await withDeadline(B + "/voice", { method: "POST",
    headers: { authorization: "Bearer " + TOKEN, "content-type": "application/octet-stream" },
    body: await tts("What is my per trade limit?") });
  await ask.arrayBuffer();
  chk("B18b a question is answered, not traded", ask.headers.get("x-action") === "ANSWER",
      `"${decodeURIComponent(ask.headers.get("x-reply") || "").slice(0, 70)}"`);
  await j("/panic", { method: "POST" }); await j("/arm", { method: "POST" });

  // These were two hardcoded SKIP lines that printed whatever the truth was —
  // one of them still claimed "route falls back to Uniswap V3", written before
  // an aggregator existed. A line in a test report that measures nothing is the
  // same defect as a route label that cannot disagree with the receipt.
  {
    const key = process.env.GROQ_API_KEY;
    if (!key) skip("E4 Groq", "no GROQ_API_KEY set");
    else {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ model: "openai/gpt-oss-20b", max_tokens: 5,
                               messages: [{ role: "user", content: "Say OK" }] }),
        signal: AbortSignal.timeout(15_000),
      }).catch(() => null);
      const jr = r ? await r.json().catch(() => ({})) : {};
      if (r?.ok) chk("E4 Groq answers", Boolean(jr.choices?.[0]?.message?.content), "a Groq model replied");
      else skip("E4 Groq", `${jr?.error?.code || "unreachable"} — account-level, not a code fault`);
    }
  }
  {
    // The honest question is not "is 1inch configured" but "does an aggregator
    // actually route", and one does — without any key.
    const { byName } = await import("../main/routers/index.mjs");
    const agg = byName("kyberswap");
    if (!agg?.available()) skip("E5 aggregator", "KYBERSWAP=off");
    else {
      const q = await agg.quote("USDC", "AERO", 25).catch((e) => ({ err: String(e.message) }));
      chk("E5 an aggregator routes with no API key",
          !q.err && q.amountOut > 0 && (q.venues || []).length > 0,
          q.err ? q.err.slice(0, 70) : `${q.amountOut.toFixed(4)} AERO via ${q.venues.join(" + ")}`);
    }
  }
} catch (e) { chk("E crashed", false, String(e.message || e).slice(0, 92)); }

// ── N. the bugs found by running it, locked shut ────────────────────────────
section("N. regressions");
try {
  {
    // Stop the section rather than running checks that cannot measure anything.
    // Letting them run turned one infrastructure stall into nine "failures"
    // that each named a product fault which was not there.
    const up = await waitForNode();
    if (!up.ok) throw new Error(`the Base node never came back (${up.why}) — this section measures nothing without it`);
  }
  // recall_brief computed spent_today and then dropped it from the returned
  // dict, so decide() silently fell back to "the last 10 events" — correct
  // today, wrong the moment a day has more than ten.
  const m = await j("/memory");
  chk("N1 the brief carries spent_today", Number.isFinite(m.b.spent_today),
      `spent_today=${JSON.stringify(m.b.spent_today)}`);

  // A USD-denominated round trip never lands on exactly zero, so a fully closed
  // position left sub-cent dust and the 1e-12 close test never fired: nothing
  // was ever archived and the pad kept claiming to hold 0.0000007 ETH.
  await j("/memory/seed", { method: "POST", body: "{}" });
  await j("/arm", { method: "POST" });
  const k = (id) => j("/key", { method: "POST", body: JSON.stringify({ id }) });
  await k("AERO");
  // Start from a known size and a flat book. A round trip that only partly
  // closes a position left open by something earlier archives nothing — which
  // is correct behaviour and a meaningless assertion. Sell down first.
  await j("/size", { method: "POST", body: JSON.stringify({ usd: 50 }) });
  for (let i = 0; i < 8; i++) {
    if (!(await j("/memory")).b?.positions?.AERO) break;
    const s = await k("sell");
    if (s.b?.verdict?.action !== "EXECUTE") break;
    await k("yes");
  }
  await k("buy"); await k("yes");
  const sv = await k("sell");
  if (sv.b?.verdict?.action === "EXECUTE") await k("yes");
  const store = (await j("/memory/full")).b;
  const arch = store.archived || [];
  const live = (store.entities?.position || []).map((r) => r.name);
  chk("N2 a closed position is archived, not deleted",
      arch.some((a) => a.name === "AERO") && !live.includes("AERO"),
      arch.length ? `archived: ${arch[0].category}/${arch[0].name} — "${arch[0].reason}"` : "nothing archived");

  // spendable() rounds an 18-decimal balance through a JS double, which can
  // round UP: selling "everything" asked the router for 8398 wei more than the
  // wallet held and Uniswap reverted with the opaque string STF.
  await swap("USDC", "AERO", 25);
  const all = await spendable("AERO");
  const f = await swap("AERO", "USDC", all);
  chk("N3 selling the entire balance does not revert", f.status === "success",
      `sold ${f.sold} -> ${f.received.toFixed(4)} USDC`);

  // viem sends exactly the estimate, and the swap executes a block later
  // against state that can cost more. One reverted at 98.8% of its limit —
  // out of gas, no fill, gas burned. Every swap now carries a margin.
  const rc = await pub.getTransactionReceipt({ hash: f.hash });
  const tx = await pub.getTransaction({ hash: f.hash });
  const used = Number(rc.gasUsed) / Number(tx.gas);
  chk("N5 a swap has gas headroom", used < 0.9,
      `used ${(used * 100).toFixed(1)}% of the limit (${rc.gasUsed} of ${tx.gas})`);

  // The store's headings and rows were separate children of a two-column
  // layout, so "archived — 1" could sit at the foot of one column with its row
  // at the head of the next, under a different heading.
  const html = fs.readFileSync(new URL("../renderer/index.html", import.meta.url), "utf8");
  const body = html.slice(html.indexOf("function drawStore"), html.indexOf("// --- first paint"));
  chk("N4 no store tier pushes a bare heading", !/parts\.push\(\s*`<h2/.test(body),
      /parts\.push\(\s*`<h2/.test(body) ? "a heading is pushed outside group()" : "every tier goes through group()");

  // Leave the baton where the suite found it, so the next run starts clean.
  await j("/key", { method: "POST", body: JSON.stringify({ id: "ETH" }) });
} catch (e) { chk("N crashed", false, String(e.message || e).slice(0, 92)); }

// ── O. the store, reasoned about rather than reported ───────────────────────
section("O. memory that derives, forgets and remembers when");
try {
  {
    // Stop the section rather than running checks that cannot measure anything.
    // Letting them run turned one infrastructure stall into nine "failures"
    // that each named a product fault which was not there.
    const up = await waitForNode();
    if (!up.ok) throw new Error(`the Base node never came back (${up.why}) — this section measures nothing without it`);
  }
  const k = (id) => j("/key", { method: "POST", body: JSON.stringify({ id }) });
  // Ask the server which store it opened rather than assuming one. This guessed
  // "/tmp/xorrpad-server.db" while the server had fallen back to
  // ~/.sibyl-memory/memory.db, so every direct-Memory write in this section
  // landed in a different database than the one under test — O7 then reported a
  // working product as broken.
  const DB = (await j("/health")).b?.memoryDb || process.env.SIBYL_DB || "/tmp/xorrpad-server.db";
  await j("/memory/wipe", { method: "POST" });
  await j("/memory/seed", { method: "POST", body: "{}" });
  await j("/arm", { method: "POST" });
  await k("ETH");

  // #9 — recall as the first thing that happens, and honest when it is empty.
  const t0 = new Date().toISOString();
  await k("buy"); await k("yes");
  const b1 = await j("/briefing");
  chk("O1 the briefing states what it remembers", /limits/i.test(b1.b.text) && /holding/i.test(b1.b.text),
      `"${b1.b.text.slice(0, 76)}…"`);

  // #3 — a rule that can show its working.
  for (let i = 0; i < 3; i++) { await k("sell"); await k("no"); }
  const rf = await j("/reflect");
  const live = rf.b.proposals[0];
  chk("O2 a proposal carries the events it was mined from",
      Array.isArray(live?.from) && live.from.length >= 3, `from ${live?.from?.length} journal events`);
  await j("/reflect/accept", { method: "POST", body: JSON.stringify({ proposal: live }) });
  const veto = await k("sell");
  chk("O3 the veto cites its provenance",
      veto.b.verdict?.vetoedBy === live.id && veto.b.verdict.why.some((w) => /mined from/.test(w)),
      `"${veto.b?.verdict?.why?.find((w) => /mined from/.test(w)) || veto.b?.verdict?.why?.[0]}"`);
  const jr = (await j("/memory/full")).b.journal || [];
  const vetoed = jr.some((e) => {
    const a = typeof e.acted === "string" ? JSON.parse(e.acted) : e.acted;
    return a?.vetoedBy === live.id;
  });
  chk("O4 the gate's own refusal is journalled", vetoed,
      vetoed ? `acted.vetoedBy=${live.id}` : "the pad's refusals leave no trace");

  // #8 — a rule that cannot fire is worse than no rule.
  await j("/reflect/accept", { method: "POST", body: JSON.stringify({ proposal: { ...live, id: "dead-doge-rule", symbol: "DOGE" } }) });
  const cx = await j("/memory/contradictions");
  chk("O5 a rule that can never fire is surfaced", cx.b.findings?.some((f) => f.kind === "dead"),
      `"${cx.b.findings?.[0]?.text?.slice(0, 74)}"`);

  // #12 — forgetting deliberately. Backdate both rules so age cannot be the
  // reason either survives, which is how this passed for the wrong reason once.
  {
    const mem2 = new Memory({ db: DB });
    const br = await mem2.recallBrief();
    const old = new Date(Date.now() - 30 * 86400_000).toISOString();
    for (const r of br.rules || []) await mem2.setEntity("rule", r.id, { ...r, accepted_at: old });
    mem2.stop();
  }
  await k("sell");                                  // make the live rule fire again
  const dec = await j("/memory/decay", { method: "POST", body: JSON.stringify({ days: 1 }) });
  const firedKept = (dec.b.kept || []).filter((x) => x.why === "fired inside the window").map((x) => x.id);
  chk("O6 a rule that is doing work survives the sweep",
      firedKept.includes(live.id) && !dec.b.archived.includes(live.id),
      `kept as fired: [${firedKept.join(", ")}]`);
  chk("O7 a rule nothing needs is archived, not deleted",
      dec.b.archived.includes("dead-doge-rule") &&
      ((await j("/memory/full")).b.archived || []).some((a) => a.name === "dead-doge-rule"),
      `archived: [${(dec.b?.archived || []).join(", ")}]`);
  const dz = await j("/memory/decay", { method: "POST", body: JSON.stringify({ days: 0 }) });
  chk("O8 days:0 is honoured, not silently 14", dz.b.days === 0, `days=${dz.b.days}`);

  // #5 — the temporal tier as a time machine.
  const past = await j(`/memory/at?ts=${encodeURIComponent(t0)}`);
  const now = await j(`/memory/at?ts=${encodeURIComponent(new Date(Date.now() + 1000).toISOString())}`);
  const store = await j("/memory");
  chk("O9 replay shows a past that differs from now",
      Object.keys(past.b.positions).length === 0 && Object.keys(now.b.positions).length > 0,
      `${Object.keys(past.b.positions).length} positions then, ${Object.keys(now.b.positions).length} now`);
  chk("O10 and the replayed present matches the live store",
      Object.keys(now.b.positions).sort().join(",") === Object.keys(store.b.positions || {}).sort().join(","),
      `replay [${Object.keys(now.b.positions).sort().join(", ")}] vs store [${Object.keys(store.b.positions || {}).sort().join(", ")}]`);
  chk("O11 a junk timestamp is refused", (await j("/memory/at?ts=banana")).s === 400, "400 on ?ts=banana");

  // #10 — the sponsor's own MCP server, on the store the pad writes.
  {
    const frame = (o) => JSON.stringify(o) + "\n";
    const rpcInit = frame({ jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "verify", version: "1" } } })
      + frame({ jsonrpc: "2.0", method: "notifications/initialized" });
    const rpcList = frame({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const rpcPos = frame({ jsonrpc: "2.0", id: 3, method: "tools/call",
      params: { name: "memory_list", arguments: { category: "position" } } });
    const bin = path.join(ROOT, "..", ".venv", "bin", "sibyl-memory-mcp");
    // An MCP server is long-lived by design. Piping the requests in and closing
    // stdin makes the later ones race the EOF — tools/list answered and the
    // tools/call that followed it was simply dropped, which looked exactly like
    // a broken integration. Hold the pipe open and wait for the answers.
    const rpcCall = () => new Promise((resolve) => {
      const proc = spawn(bin, [], { env: { ...process.env, SIBYL_MEMORY_DB: DB, SIBYL_DB: DB },
                                    stdio: ["pipe", "pipe", "ignore"] });
      const seen = new Map();
      let buf = "";
      const done = (r) => { try { proc.kill(); } catch {} resolve(r); };
      const timer = setTimeout(() => done(seen), 25000);
      proc.stdout.on("data", (d) => {
        buf += d;
        const lines = buf.split("\n"); buf = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          let m; try { m = JSON.parse(line); } catch { continue; }
          if (m.id != null) seen.set(m.id, m);
          if (m.id === 1) proc.stdin.write(rpcList);
          if (m.id === 2) proc.stdin.write(rpcPos);
          if (m.id === 3) { clearTimeout(timer); done(seen); }
        }
      });
      proc.on("error", () => { clearTimeout(timer); done(seen); });
      proc.stdin.write(rpcInit);
    });
    const seen = await rpcCall();
    const tools = seen.get(2)?.result?.tools?.length || 0;
    let positions = -1;
    try { positions = JSON.parse(seen.get(3).result.content[0].text).count; } catch {}

    chk("O12 the sponsor's MCP server exposes its tools", tools === 8, `${tools} tools over stdio`);
    chk("O13 MCP reads what the pad wrote", positions > 0,
        positions < 0 ? "the MCP server did not answer" : `memory_list(position) -> ${positions}`);
  }

  // #7 — what a wipe actually cost, measured rather than asserted.
  await j("/memory/wipe", { method: "POST" });
  const d = await j("/memory/diff");
  chk("O14 the wipe diff names what was lost",
      (d.b.lost?.entities?.position || []).length > 0 && d.b.lost.references.includes("risk/limits"),
      `lost [${(d.b.lost?.entities?.position || []).join(", ")}] + ${d.b.lost?.references?.length} reference(s) + ${d.b.lost?.journal} events`);
  // The cost is settled at the wipe. Recomputing it later compared the old
  // snapshot against a store that had regrown, and reported a NEGATIVE loss.
  await j("/key", { method: "POST", body: JSON.stringify({ id: "ETH" }) });
  await j("/key", { method: "POST", body: JSON.stringify({ id: "buy" }) });
  const d2 = await j("/memory/diff");
  await j("/key", { method: "POST", body: JSON.stringify({ id: "no" }) });   // leave nothing pending
  chk("O16 the cost stays what it was, and is never negative",
      d2.b.lost.journal === d.b.lost.journal && d2.b.lost.journal >= 0 && !!d2.b.at,
      `${d2.b.lost.journal} events, stamped ${String(d2.b.at).slice(11, 19)}`);
  const b2 = await j("/briefing");
  chk("O15 the briefing after a wipe is honest", /remember nothing/i.test(b2.b.text), `"${b2.b.text.slice(0, 60)}…"`);

  await j("/memory/seed", { method: "POST", body: "{}" });
  await j("/key", { method: "POST", body: JSON.stringify({ id: "ETH" }) });
} catch (e) { chk("O crashed", false, String(e.message || e).slice(0, 92)); }

// ── P. the physical pad's contract ──────────────────────────────────────────
section("P. the pad on the desk");
try {
  // One cheap poll carries everything the pad's LED and keycaps need.
  const t0 = Date.now();
  const pad = await j("/pad");
  const ms = Date.now() - t0;
  const need = ["armed","agent","market","sizeUsd","pending","mode","chainOk",
                "remembers","spentToday","dayLimit","unrealised","price"];
  chk("P1 GET /pad carries the whole pad state", pad.s === 200 && need.every((k) => k in pad.b),
      `${Object.keys(pad.b || {}).length} fields in ${ms}ms`);
  chk("P2 /pad is cheap enough to poll", ms < 150, `${ms}ms (budget 150)`);

  // Speech for the amp: raw PCM at the rate the mic records at.
  const sp = await withDeadline(B + "/speak?text=" + encodeURIComponent("xorr pad connected"), { headers: H });
  const spb = Buffer.from(await sp.arrayBuffer());
  let peak = 0;
  for (let i = 0; i + 1 < spb.length; i += 2) peak = Math.max(peak, Math.abs(spb.readInt16LE(i)));
  chk("P3 GET /speak returns playable PCM",
      sp.status === 200 && sp.headers.get("content-type") === "application/octet-stream" &&
      sp.headers.get("x-sample-rate") === "16000" && spb.length > 8000 && peak > 2000,
      `${(spb.length / 2 / 16000).toFixed(2)}s at 16kHz, peak ${peak}`);
  const spEmpty = await j("/speak");
  chk("P4 /speak refuses an empty line", spEmpty.s === 400 && /nothing to say/.test(spEmpty.b.error || ""),
      `${spEmpty.s} "${spEmpty.b?.error}"`);
  chk("P5 the pad's routes are auth-gated",
      (await j("/pad", { noauth: true })).s === 401 && (await j("/speak?text=hi", { noauth: true })).s === 401,
      "both 401 without the pad token");

  // A spoken ticker that resolves to nothing must NEVER become the market in
  // hand. "Buy $50 of ETH" came back from Deepgram as "ETA" and bought VIRTUAL.
  {
    const sym = (t) => { const g = parseIntent(t, "momentum", "VIRTUAL");
                         return g?.needsMarket ? "REFUSE" : (g?.symbol ?? null); };
    const cases = [
      ["Buy $50 of ETA.", "ETH"], ["Buy $50 of E T A", "ETH"], ["buy fifty dollars of eath", "ETH"],
      // Deepgram really returned this one, spelling E-T-H and hearing "eight".
      ["Buy $50 of e t eight.", "ETH"], ["buy 50 of e t ate", "ETH"],
      // And this one: "Buy fifty dollars of Zorblax" came back as "Buy $50
      // Absorb Locks." — no preposition and no alias, so the old guard (which
      // needed an "of") let it through and the pad proposed the market in hand.
      ["Buy $50 Absorb Locks.", "REFUSE"], ["buy fifty dollars absorb locks", "REFUSE"],
      ["buy fifty bucks please", "VIRTUAL"], ["sell twenty dollars", "VIRTUAL"],
      ["buy $25 more", "VIRTUAL"],
      ["buy 40 dollars", "VIRTUAL"], ["buy 30 of it.", "VIRTUAL"],
      ["Buy $40 of Zorblax.", "REFUSE"], ["Sell $25 of Doge!", "REFUSE"],
    ];
    const bad = cases.filter(([t, want]) => sym(t) !== want);
    chk("P6 a mis-heard ticker never becomes the market in hand", bad.length === 0,
        bad.length ? bad.map(([t]) => `"${t}"->${sym(t)}`).join(", ")
                   : `${cases.length}/${cases.length} — ETA resolves to ETH, unknown names are refused`);
  }
} catch (e) { chk("P crashed", false, String(e.message || e).slice(0, 92)); }

// ── W. the archive is reachable, not just written ───────────────────────────
section("W. what it used to hold");
try {
  const DB = (await j("/health")).b?.memoryDb || process.env.SIBYL_DB;
  const mem2 = new Memory({ db: DB });

  // listArchived takes an options object like every other search on the client.
  // It used to take a bare positional number, so calling it the way its
  // siblings are called threw a TypeError from the bridge — dead code hiding a
  // real defect.
  const forms = await Promise.all([mem2.listArchived(), mem2.listArchived(5), mem2.listArchived({ limit: 5 })]
    .map((p) => p.then((r) => Array.isArray(r)).catch(() => false)));
  chk("W1 listArchived accepts an options object, a number, or nothing",
      forms.every(Boolean), `three call forms -> ${forms.join(", ")}`);

  // Close a position, then ask about it. Archived entities live in their own
  // table and are NOT in Sibyl's FTS index, so searching the tiers finds the
  // journal and the baton and misses the one row that says what was held.
  await mem2.setEntity("position", "ZZTEST", { qty: 1.5, avg_entry_usd: 4.25, updated: new Date().toISOString() });
  await mem2.archiveEntity("position", "ZZTEST", "closed at $4.30 (was 1.500000 @ $4.2500)");
  const rows = await mem2.listArchived({ limit: 50 });
  const found = (rows || []).some((r) => r.category === "position" && r.name === "ZZTEST");
  chk("W2 a closed position is archived, not destroyed", found,
      found ? `${rows.length} archived row(s), ZZTEST among them` : "ZZTEST not in the archive");

  // And the FTS index genuinely does NOT cover it — which is why W4 matters.
  const st = await mem2.searchTiers("ZZTEST", { limit: 10 });
  chk("W3 the archive is outside the search index, as assumed",
      !(st?.hits || []).some((h) => JSON.stringify(h).includes("ZZTEST")),
      `searchTiers found ${(st?.hits || []).length} hit(s), none archived`);

  const { think } = await import("../main/voice.mjs");
  const brief = await mem2.recallBrief();
  const ans = await think("have I ever held ZZTEST?", brief, { prices: {} }, mem2);
  chk("W4 the brain can answer about a position it no longer holds",
      /1\.5|4\.2|4\.3|held|closed/i.test(ans.text) && !/never|no record/i.test(ans.text),
      `[${ans.brain}] "${ans.text.slice(0, 84)}"`);

  await mem2.archiveEntity("position", "ZZTEST", "test cleanup").catch(() => {});
  mem2.stop();
} catch (e) { chk("W crashed", false, String(e.message || e).slice(0, 92)); }

// ── V. numbers the operator can check against the screen ────────────────────
section("V. displayed prices");
try {
  const { decide } = await import("../main/decide.mjs");
  const cite = (sym, avg) => {
    const v = decide({ agent: "momentum", side: "BUY", symbol: sym, sizeUsd: 25, reason: "t", confidence: 1 },
      { limits: { max_trade_usd: 100, max_day_usd: 300, allow: [sym] },
        positions: { [sym]: { qty: 10, avg_entry_usd: avg } }, rules: [], spent_today: 0 });
    return (v.why.find((w) => w.includes("holding")) || "").replace(/.*@ /, "");
  };
  // The entry price was Math.round()ed, so AERO at $0.6154 was cited as "@ $1"
  // and anything under fifty cents as "@ $0" — in the sentence the verdict
  // rests on. Three of the six markets trade under a dollar.
  const cases = [["AERO", 0.6154, "$0.6154"], ["VIRTUAL", 0.0421, "$0.0421"],
                 ["EURC", 1.163, "$1.16"], ["cbBTC", 78723.4, "$78,723"]];
  const wrong = cases.filter(([s, a, want]) => cite(s, a) !== want);
  // A known path reached with the wrong verb must say so. Answering 404 claims
  // the route does not exist, which sends the caller hunting for a missing
  // endpoint — it misled me while testing this server.
  {
    const wrong = await withDeadline(B + "/pad", { method: "POST", headers: H, body: "{}" });
    const wj = await wrong.json().catch(() => ({}));
    chk("V0 a wrong method on a real route is 405 with an Allow header, not 404",
        wrong.status === 405 && (wrong.headers.get("allow") || "").includes("GET"),
        `${wrong.status} allow=${wrong.headers.get("allow")} "${String(wj.error).slice(0, 50)}"`);
    const gone = await withDeadline(B + "/definitely-not-a-route", { headers: H });
    chk("V0b a path that really does not exist is still 404",
        gone.status === 404, `${gone.status}`);
  }

  chk("V1 a sub-dollar entry price is cited at the precision it was paid at",
      wrong.length === 0,
      wrong.length ? wrong.map(([s, a, w]) => `${s}: got ${cite(s, a)}, want ${w}`).join("; ")
                   : cases.map(([s, a]) => `${s} ${cite(s, a)}`).join("  "));
} catch (e) { chk("V crashed", false, String(e.message || e).slice(0, 92)); }

// ── A. the aggregator, and best execution ───────────────────────────────────
section("A. the aggregator");
try {
  {
    const up = await waitForNode();
    if (!up.ok) throw new Error(`the Base node never came back (${up.why}) — a fill cannot be measured`);
  }
  const { quoteAll, margin, byName } = await import("../main/routers/index.mjs");
  const { swap } = await import("../main/dex.mjs");
  const { fundOnFork } = await import("../main/chain.mjs");

  // The plan had this blocked on a credential, because 0x wants a key and
  // 1inch wants KYC. Neither implies that every aggregator does.
  const kyber = byName("kyberswap");
  chk("A1 an aggregator is available with no API key at all",
      Boolean(kyber?.available()) && !process.env.ZEROX_API_KEY && !process.env.ONEINCH_API_KEY,
      `kyberswap usable; ZEROX_API_KEY and ONEINCH_API_KEY both unset`);

  const kq = await kyber.quote("USDC", "AERO", 25);
  chk("A2 it returns a real route across named venues",
      kq.amountOut > 0 && (kq.venues || []).length > 0,
      `${kq.amountOut.toFixed(4)} AERO via ${kq.venues.join(" + ")}`);

  // Both routers quote the same trade, and the loser is kept.
  const ranked = await quoteAll("USDC", "AERO", 25);
  chk("A3 every router quotes the same trade and they are ranked",
      ranked.all.length >= 2 && ranked.best,
      ranked.all.map((x) => `${x.name} ${x.quote ? x.out.toFixed(4) : "failed"}`).join("  vs  "));

  const m = margin(ranked);
  chk("A4 the margin between them is real and small enough to be credible",
      m != null && Math.abs(m) < 0.05,
      m == null ? "only one quote" : `${(m * 100).toFixed(3)}% — ${ranked.best.name} ahead`);

  // The claim that matters: a fill actually routed through the aggregator, and
  // the receipt agrees.
  await fundOnFork();
  const f = await swap("USDC", "AERO", 20);
  // The winner fills unless it failed, in which case the direct pool does and
  // the fill says so. Both are correct; a fill that quietly reports the winner
  // while the pool did the work is not.
  const agreed = f.fellBack
    ? f.route === "uniswap" && f.fellBack.from === f.comparison?.chose
    : f.comparison?.chose === f.route;
  chk("A5 a fill routes through the winner, or says what it fell back from",
      Boolean(f.hash) && f.received > 0 && agreed,
      `${f.received.toFixed(4)} AERO via ${f.route}` +
      (f.fellBack ? ` — fell back from ${f.fellBack.from}: ${f.fellBack.why.slice(0, 60)}` : `, chose ${f.comparison?.chose}`));

  chk("A6 the losing quotes are journalled, so the choice is auditable",
      (f.comparison?.quotes || []).length >= 2 &&
      f.comparison.quotes.every((q) => "out" in q && "router" in q),
      `won by ${f.comparison?.wonBy}% over ${f.comparison.quotes.filter((q) => q.router !== f.route).map((q) => q.router).join(", ")}`);

  // And the equities: quotable through the aggregator, still unfillable here.
  const eq = await kyber.quote("USDC", "NVDAc", 25).catch((e) => ({ err: String(e.message) }));
  chk("A7 the aggregator can price a tokenized equity a direct pool cannot",
      !eq.err && eq.amountOut > 0,
      eq.err ? eq.err.slice(0, 70) : `$25 -> ${eq.amountOut} NVDAc via ${eq.venues.join(" + ")}`);
} catch (e) { chk("A crashed", false, String(e.message || e).slice(0, 92)); }

// ── J. the setup code the pad is provisioned with ───────────────────────────
section("J. the QR the pad is set up from");
try {
  const { encode } = await import("../main/qr.mjs");

  // The invariant that matters, and the one that caught the real bug: a QR is
  // a Reed-Solomon codeword, so its syndromes must all be zero. A stream with
  // non-zero syndromes still looks like a QR, still places correctly, and still
  // reads its own payload back — and every real scanner rejects it.
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  { let x = 1;
    for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; }
  const gmul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

  const MASKS = [(r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0, (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0];

  /** Read a matrix back the way a scanner does: format, then unmasked data. */
  const readBack = (g) => {
    const size = g.length;
    let fmt = 0;
    for (let i = 0; i < 15; i++) {
      let v; if (i < 6) v = g[8][i]; else if (i < 8) v = g[8][i + 1];
      else if (i === 8) v = g[7][8]; else v = g[14 - i][8];
      fmt |= (v ? 1 : 0) << (14 - i);
    }
    const raw = fmt ^ 0x5412, mask = (raw >>> 10) & 7, ecLevel = (raw >>> 13) & 3;
    const res = Array.from({ length: size }, () => new Array(size).fill(false));
    const mark = (r, c) => { if (r >= 0 && r < size && c >= 0 && c < size) res[r][c] = true; };
    for (const [fr, fc] of [[0, 0], [0, size - 7], [size - 7, 0]])
      for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) mark(fr + dr, fc + dc);
    for (let i = 0; i < size; i++) { mark(6, i); mark(i, 6); }
    for (let i = 0; i < 9; i++) { mark(8, i); mark(i, 8); }
    for (let i = 0; i < 8; i++) { mark(8, size - 1 - i); mark(size - 1 - i, 8); }
    // The alignment patterns are data-region holes too. Leaving them out of the
    // reader shifts every codeword after the first one and reads back garbage —
    // which is a bug in the reader, not in the encoder.
    const version = (size - 17) / 4;
    const CENTRES = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30] }[version] || [];
    for (const ar of CENTRES) for (const ac of CENTRES) {
      const overlapsFinder = (ar <= 8 && ac <= 8) || (ar <= 8 && ac >= size - 9) || (ar >= size - 9 && ac <= 8);
      if (overlapsFinder) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) mark(ar + dr, ac + dc);
    }
    const bits = []; let up = true;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let st = 0; st < size; st++) { const y = up ? size - 1 - st : st;
        for (const x of [right, right - 1]) if (!res[y][x]) bits.push((g[y][x] !== MASKS[mask](y, x)) ? 1 : 0); }
      up = !up;
    }
    const words = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) words.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
    const len = bits.slice(4, 12).reduce((a, b) => (a << 1) | b, 0);
    let text = "";
    for (let i = 0; i < len; i++) text += String.fromCharCode(bits.slice(12 + i * 8, 20 + i * 8).reduce((a, b) => (a << 1) | b, 0));
    return { mask, ecLevel, words, mode: bits.slice(0, 4).join(""), text };
  };

  const syndromesZero = (cw, nsym) => {
    for (let j = 0; j < nsym; j++) {
      let acc = 0;
      for (let i = 0; i < cw.length; i++) acc ^= gmul(cw[i], EXP[(j * (cw.length - 1 - i)) % 255]);
      if (acc !== 0) return false;
    }
    return true;
  };

  // version -> [total codewords, ec per block, blocks] for the sizes used here
  const SPEC = { 1: [26, 10, 1], 2: [44, 16, 1], 3: [70, 26, 1], 4: [100, 18, 2] };
  // Single-block versions only (1-3). This reader walks codewords in placement
  // order and does not de-interleave the multiple blocks that version 4 and up
  // use, so a longer payload would fail here for the reader's reasons rather
  // than the encoder's. Version 3 holds 42 bytes — comfortably more than a LAN
  // URL and a token, which is all this code ever carries.
  const cases = ["http://192.168.1.19:8080",
                 "http://192.168.1.19:8080|xorrpad-dev",
                 "http://192.168.1.19:8080|a-token-1234567"];

  const bad = [];
  for (const text of cases) {
    const g = encode(text);
    const r = readBack(g);
    const version = (g.length - 17) / 4;
    const spec = SPEC[version];
    if (r.text !== text) { bad.push(`${text}: read back "${r.text}"`); continue; }
    if (r.mode !== "0100") { bad.push(`${text}: mode ${r.mode}`); continue; }
    if (spec && spec[2] === 1 && !syndromesZero(r.words.slice(0, spec[0]), spec[1]))
      bad.push(`${text}: non-zero Reed-Solomon syndromes — no scanner will read this`);
  }
  chk("J1 the codes read back as themselves and are valid codewords", bad.length === 0,
      bad.length ? bad[0] : `${cases.length}/${cases.length}: payload, byte mode, zero syndromes`);

  const g = encode("http://192.168.1.19:8080");
  chk("J2 the finder patterns are where a scanner looks",
      g[0][0] && g[0][6] && g[6][0] && g[6][6] && !g[7][7] &&
      g[0][g.length - 1] && g[g.length - 1][0],
      `${g.length}x${g.length}, three finders and their separators`);

  // The real payload, at the real length, must stay inside what this reader —
  // and therefore this check — can actually verify.
  const real = `http://192.168.1.19:8080|${TOKEN}`;
  chk("J2b the code the desk actually shows is a single-block version",
      (encode(real).length - 17) / 4 <= 3,
      `${real.length} bytes -> version ${(encode(real).length - 17) / 4}`);

  chk("J3 an oversized payload is refused rather than silently truncated",
      (() => { try { encode("x".repeat(5000)); return false; } catch { return true; } })(),
      "throws instead of encoding a code that decodes to the wrong thing");
} catch (e) { chk("J crashed", false, String(e.message || e).slice(0, 92)); }

// ── K. the tokenized equities ───────────────────────────────────────────────
section("K. equities, priced and refused");
try {
  const mk = (await j("/markets")).b;
  const eq = mk?.equities || {}, px = mk?.equityPrices || {}, blocked = mk?.equitiesBlocked || {};
  const syms = Object.keys(eq);

  chk("K1 every listed equity carries a pool discovered on-chain",
      syms.length === 10 && syms.every((s) => /^0x[0-9a-fA-F]{40}$/.test(eq[s].pool || "")),
      `${syms.length} listed, ${syms.filter((s) => eq[s].pool).length} with pools`);

  // The B20 token reverts on a fork; the pool behind it is ordinary bytecode.
  // Pricing the pool and never touching the token is what makes this work here.
  const priced = syms.filter((s) => Number.isFinite(px[s]) && px[s] > 0);
  chk("K2 they are priced from those pools, even on a fork",
      priced.length === syms.length, `${priced.length}/${syms.length} priced`);

  // A price that is real but absurd would pass the check above. These are
  // large-cap US shares: single digits or six figures means the maths is wrong.
  const sane = priced.filter((s) => px[s] > 10 && px[s] < 10_000);
  chk("K3 and the prices are in the range a share can actually be",
      sane.length === priced.length,
      `${sane.length}/${priced.length} within $10–$10,000 — NVDAc $${(px.NVDAc || 0).toFixed(2)}`);

  chk("K4 every one is still refused, with a reason",
      syms.every((s) => typeof blocked[s] === "string" && blocked[s].length > 20),
      `"${String(blocked[syms[0]]).slice(0, 68)}…"`);

  // The two refusals are different and must never be conflated.
  chk("K5 the fork refusal names the B20 cause, not a liquidity one",
      /B20|OpcodeNotFound/.test(blocked[syms[0]] || ""),
      /B20/.test(blocked[syms[0]] || "") ? "names B20 and the node" : `"${blocked[syms[0]]}"`);
} catch (e) { chk("K crashed", false, String(e.message || e).slice(0, 92)); }

// ── M. the guards standing between this app and real money ──────────────────
section("M. mainnet guards");
try {
  // These are the only things preventing a mistake here from spending the
  // owner's money. They cost nothing to check, so they are checked every run.
  const boots = (env) => {
    try {
      execFileSync(process.execPath, ["-e", 'await import("./main/chain.mjs"); console.log("BOOTED")'],
        { env: { ...process.env, ...env }, cwd: ROOT, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
      return null;                                  // it booted — no guard fired
    } catch (e) { return String(e.stderr || e.message); }
  };

  // Mainnet with no key is read-only rather than fatal: reads should not require
  // putting a funded key on the machine first. What must hold is that it cannot
  // sign — booting is fine, signing is not.
  const ro = execFileSync(process.execPath, ["-e", `
      const c = await import("./main/chain.mjs");
      const { swap } = await import("./main/dex.mjs");
      let refused = "";
      try { await swap("USDC", "ETH", 1); } catch (e) { refused = e.message; }
      console.log(JSON.stringify({ readOnly: c.READ_ONLY, wallet: c.wallet, refused }));`],
    { env: { ...process.env, CHAIN_MODE: "mainnet", AGENT_PRIVATE_KEY: "" },
      cwd: ROOT, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  const roj = JSON.parse(ro.trim().split("\n").pop());
  chk("M1 mainnet without a key is read-only, and cannot sign",
      roj.readOnly === true && roj.wallet === null && /needs a signing key/.test(roj.refused),
      `READ_ONLY=${roj.readOnly}, wallet=${roj.wallet}, swap refused`);

  // A slippage tolerance is not a safety margin on mainnet — it is the width of
  // the window someone else is allowed to take from the fill. Measured impact
  // at the sizes this pad trades is 0.000-0.002% (test/mainnet-conditions.mjs),
  // so carrying the fork's forgiving 1% onto mainnet would be handing away
  // three orders of magnitude more than the pool actually needs.
  const slip = execFileSync(process.execPath,
    ["--input-type=module", "-e",
     `const d = await import("${path.join(ROOT, "main", "dex.mjs")}");
      console.log(d.DEFAULT_SLIPPAGE_PCT);`],
    { env: { ...process.env, CHAIN_MODE: "mainnet", AGENT_PRIVATE_KEY: "" },
      cwd: ROOT, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  const slipMainnet = Number(slip.trim().split("\n").pop());
  chk("M7 mainnet does not inherit the fork's loose slippage tolerance",
      slipMainnet > 0 && slipMainnet <= 0.5,
      `mainnet default ${slipMainnet}% (fork uses 1%; measured pool impact is under 0.01%)`);

  // anvil's account #0 key is published in its own README. Signing a real
  // transaction with it hands the funds to anyone watching the chain.
  const anvilKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const wellKnown = boots({ CHAIN_MODE: "mainnet", AGENT_PRIVATE_KEY: anvilKey });
  chk("M2 mainnet refuses the publicly-known anvil key",
      /refusing to use the anvil key/.test(wellKnown || ""),
      wellKnown ? `"${(wellKnown.match(/Error: (.*)/) || [, wellKnown])[1].slice(0, 62)}"` : "IT BOOTED");

  // The book may propose all it likes on mainnet; only a human ✓ can execute.
  const src = fs.readFileSync(path.join(ROOT, "main", "server.mjs"), "utf8");
  chk("M3 automation cannot execute on mainnet, only a human confirm can",
      /execute:\s*state\.armed\s*&&\s*IS_FORK/.test(src),
      "runOnce is gated on state.armed && IS_FORK");

  // Verified live against real Base mainnet on 2026-09-09: the backend boots
  // read-only, /pad reports mode "mainnet" with a real ETH price, and a ✓ is
  // refused with "there is no signing key" rather than "no USDC to spend" —
  // which is true of the zero address but names the wrong problem, and would
  // let a funded WATCH_ADDRESS get further than it should.
  chk("M6 a confirm on a read-only chain is refused before the balance check",
      (() => {
        const i = src.indexOf("if (READ_ONLY)");
        const j = src.indexOf("to spend`");
        return i > 0 && j > 0 && i < j;
      })(),
      "the READ_ONLY guard precedes the balance guard in the confirm path");

  chk("M4 the fork is the default, so a mistyped mode cannot mean mainnet",
      (await j("/health")).b?.mode === "fork" && !process.env.CHAIN_MODE,
      `mode=${(await j("/health")).b?.mode}, CHAIN_MODE unset`);
} catch (e) { chk("M crashed", false, String(e.message || e).slice(0, 92)); }

// ── T. first run, with no credentials anywhere ──────────────────────────────
section("T. the packaged app's first run");
try {
  // A packaged .app has no .env and no shell environment. Without a way to
  // supply one, the window opens onto a desk whose mic fails silently.
  const g = await withDeadline(B + "/setup");
  chk("T1 /setup is reachable before any token exists",
      g.status === 200 && /text\/html/.test(g.headers.get("content-type") || ""),
      `${g.status} ${g.headers.get("content-type")}`);

  const dir = "/tmp/xorr-setup-verify-" + Date.now();
  const post = (b) => fetch(B + "/setup", { method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

  // Writing needs a config directory, which only the desk app supplies.
  const saved = await post({ token: "xorrpad-dev", chainMode: "fork" });
  const sj = await saved.json().catch(() => ({}));
  if (process.env.XORR_USER_DATA) {
    chk("T2 it writes what it was given", saved.status === 200 && (sj.saved || []).includes("PAD_TOKEN"),
        `${saved.status} saved=${JSON.stringify(sj.saved)}`);
    const mode = fs.statSync(sj.file).mode & 0o777;
    chk("T3 the file holding a key is not world-readable", mode === 0o600, `mode ${mode.toString(8)}`);
  } else {
    chk("T2 it refuses to write with nowhere to write", saved.status === 500,
        `${saved.status} "${sj.error}"`);
    chk("T3 …and says which side is missing", /config directory/.test(sj.error || ""), `"${sj.error}"`);
  }

  const empty = await post({});
  chk("T4 an empty submission is refused rather than written",
      empty.status === 400, `${empty.status} "${(await empty.json().catch(() => ({}))).error}"`);

  // Re-opening setup to change one field must not delete the others. Writing
  // the whole file did exactly that: a token-only save wiped the Deepgram key
  // and the mic went dead with nothing on screen to explain it.
  if (process.env.XORR_USER_DATA) {
    const file = path.join(process.env.XORR_USER_DATA, ".env");
    const keys = () => new Set(fs.readFileSync(file, "utf8").split("\n")
      .map((l) => l.split("=")[0]).filter(Boolean));
    const before = keys();
    await post({ token: "xorrpad-dev" });
    const after = keys();
    const lost = [...before].filter((k) => !after.has(k));
    chk("T5 saving one field keeps the others", lost.length === 0,
        lost.length ? `lost ${lost.join(", ")}` : `kept ${[...after].join(", ")}`);
  }
  void dir;
} catch (e) { chk("T crashed", false, String(e.message || e).slice(0, 92)); }

// ── B. the brain, when there is no brain ────────────────────────────────────
section("S. the answer when no model is reachable");
try {
  // A spoken question must not die because a binary moved. The pad is holding
  // the answer; it should say it, and say that it is saying it without a model.
  const brief = { limits: { max_trade_usd: 100, max_day_usd: 300, allow: ["ETH"] },
                  positions: { ETH: { qty: 0.0202, avg_entry_usd: 2479 } },
                  rules: [{ id: "r1" }, { id: "r2" }], spent_today: 75 };
  const noBrain = (q) => {
    const out = execFileSync(process.execPath, ["-e", `
      process.env.PATH = "/usr/bin:/bin";
      const { think } = await import("./main/voice.mjs");
      const a = await think(process.argv[1], JSON.parse(process.argv[2]), { prices: { ETH: 2479 } });
      console.log(JSON.stringify(a));`, q, JSON.stringify(brief)],
      { cwd: ROOT, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    return JSON.parse(out.trim().split("\n").pop());
  };

  const lim = noBrain("what is my per trade limit");
  chk("S1 with no model reachable, the answer still comes — from memory",
      lim.brain === "memory" && /100/.test(lim.text), `[${lim.brain}] ${lim.text.slice(0, 72)}`);
  chk("S2 and it says it has no model, rather than passing memory off as one",
      /unreachable/i.test(lim.text), `"${lim.text.slice(0, 52)}…"`);

  const cases = [["what am I holding", /0\.0202 ETH/], ["how much have I spent today", /75/],
                 ["what rules have you learned", /2 rules/], ["what is ETH price", /2479/]];
  const missed = cases.filter(([q, re]) => !re.test(noBrain(q).text));
  chk("S3 it answers the questions memory can actually answer", missed.length === 0,
      missed.length ? `no answer for: ${missed.map(([q]) => q).join("; ")}`
                    : `${cases.length}/${cases.length} — positions, spend, rules and price`);

  // And the live brain must still be named, so a degraded answer is visible.
  const sp = await withDeadline(B + "/speak?text=" + encodeURIComponent("what is my per trade limit"), { headers: H });
  const pcm = Buffer.from(await sp.arrayBuffer());
  const vr = await withDeadline(B + "/voice", { method: "POST",
    headers: { ...H, "content-type": "application/octet-stream" }, body: pcm });
  chk("S4 /voice names the brain that answered",
      vr.headers.get("x-brain") === "claude",
      `x-brain: ${vr.headers.get("x-brain")} — "${decodeURIComponent(vr.headers.get("x-reply") || "").slice(0, 46)}…"`);
} catch (e) { chk("S crashed", false, String(e.message || e).slice(0, 92)); }

// ── Q. the route a fill claims is the route it took ─────────────────────────
section("Q. the route is what the chain says");
try {
  {
    const up = await waitForNode();
    if (!up.ok) throw new Error(`the Base node never came back (${up.why}) — a fill cannot be measured`);
  }
  // `ROUTE` used to be `ONEINCH_API_KEY ? "1inch" : "uniswap"` while swap() only
  // ever called Uniswap V3, so a key that was never read made every fill claim a
  // route it had not taken. The label is now read back off the mined receipt.
  await j("/memory/seed", { method: "POST", body: "{}" });
  await j("/arm", { method: "POST" });
  const k = (id) => j("/key", { method: "POST", body: JSON.stringify({ id }) });
  await k("AERO");
  await j("/size", { method: "POST", body: JSON.stringify({ usd: 25 }) });
  await k("buy");
  const done = await k("yes");
  const fill = done.b?.fill;

  chk("Q1 a real fill came back with a route and a hash",
      Boolean(fill?.hash && fill?.route), fill ? `${fill.route} ${String(fill.hash).slice(0, 12)}…` : "no fill");

  if (fill?.hash) {
    // The receipt is the only source of truth about who executed this.
    const rc = await pub.getTransactionReceipt({ hash: fill.hash });
    chk("Q2 the claimed route is the contract the chain actually called",
        routeOf(rc.to) === fill.route,
        `receipt.to=${rc.to} -> ${routeOf(rc.to)}, fill said ${fill.route}`);
    // There is more than one router now, so pinning this to Uniswap's address
    // would assert the old world. What must hold is that the contract the chain
    // called is one this build actually ships — an unknown `to` means a fill
    // went somewhere nobody here can account for.
    const known = bySpender();
    chk("Q3 the contract the chain called is a router this build ships",
        known.has(String(rc.to).toLowerCase()),
        `${rc.to} -> ${known.get(String(rc.to).toLowerCase()) || "UNKNOWN"} (built: ${[...known.values()].join(", ")})`);
  }

  // The specific regression: a key nothing reads must not change what is claimed.
  const withKey = execFileSync(process.execPath,
    ["-e", 'import("./main/dex.mjs").then(m => console.log(m.ROUTE))'],
    { env: { ...process.env, ONEINCH_API_KEY: "set-but-unimplemented" },
      cwd: ROOT, encoding: "utf8" }).trim();
  chk("Q4 setting ONEINCH_API_KEY does not make the app claim 1inch",
      withKey === "uniswap", `ROUTE with the key set = "${withKey}"`);
} catch (e) { chk("Q crashed", false, String(e.message || e).slice(0, 92)); }

// The tally is counted, not asserted. It used to end "(2 skipped: credentials
// unavailable)" as a fixed string, which stayed true only by coincidence.
// ── X. the automation path ──────────────────────────────────────────────────
// The tick is the only route that can trade without a human ✓, and for three
// full QA runs nothing here exercised it. It was answering 500 on every armed
// call: the rebalance agent emitted BUY USDC — the quote asset — which becomes
// swap("USDC","USDC"), a self-swap with no pool, and runOnce takes signals[0]
// blindly so it was always the first thing tried.
section("X. the automation path");
{
  const { runOnce } = await import("../main/trader.mjs");
  const { evaluateAll } = await import("../main/agents.mjs");
  const mem = new Memory();
  await mem.ping();

  // Every signal any agent emits must be something the pad can ACTUALLY trade.
  //
  // The first version of this check ran one agent sweep against whatever the
  // live store happened to hold, and passed while the yield agent was emitting
  // `SELL USDC` — the same self-swap the rebalance agent had — because the book
  // it tested held no cash, so yield never fired. A property is only tested by
  // states that reach it, so this drives all six across states chosen to fire
  // each one, including a book that holds cash.
  const { evaluate, AGENT_KINDS } = await import("../main/agents.mjs");
  const { SYMBOLS } = await import("../main/markets.mjs");
  const prices = { ETH: 2500, cbBTC: 79000, EURC: 1.16, AERO: 0.61, MORPHO: 2.35, VIRTUAL: 0.7, USDC: 1 };
  const agentMkt = { prices, change24hPct: { ETH: 5.2, AERO: -9.4 } };
  const states = {
    "flat":              {},
    "cash only":         { USDC: { qty: 500, avg_entry_usd: 1 } },
    "cash and a winner": { USDC: { qty: 500, avg_entry_usd: 1 }, ETH: { qty: 1, avg_entry_usd: 2000 } },
    "past the stop":     { AERO: { qty: 100, avg_entry_usd: 1.0 } },
    "one asset":         { ETH: { qty: 1, avg_entry_usd: 2400 } },
  };
  const malformed = [];
  let emitted = 0;
  for (const [label, positions] of Object.entries(states)) {
    const b = { positions, baton: {}, limits: { max_trade_usd: 100, max_day_usd: 300, allow: SYMBOLS } };
    for (const kind of AGENT_KINDS) {
      const sig = evaluate(kind, agentMkt, b);
      if (!sig) continue;
      emitted++;
      const why = [];
      if (sig.symbol === "USDC") why.push("names the quote asset — a self-swap");
      if (!SYMBOLS.includes(sig.symbol)) why.push(`'${sig.symbol}' is not a tradeable market`);
      if (!["BUY", "SELL"].includes(sig.side)) why.push(`side '${sig.side}'`);
      if (!(Number.isFinite(sig.sizeUsd) && sig.sizeUsd > 0)) why.push(`sizeUsd ${sig.sizeUsd}`);
      if (!(sig.confidence >= 0 && sig.confidence <= 1)) why.push(`confidence ${sig.confidence}`);
      if (!sig.reason?.trim()) why.push("no reason given");
      if (sig.side === "SELL" && !positions[sig.symbol]) why.push(`SELL ${sig.symbol} with no remembered position`);
      if (why.length) malformed.push(`${label}/${kind}: ${why.join("; ")}`);
    }
  }
  chk("X1 every signal any of the six agents emits is actually tradeable",
      malformed.length === 0,
      malformed.length ? malformed.join(" · ").slice(0, 150)
                       : `${emitted} signal(s) across ${Object.keys(states).length} book states x ${AGENT_KINDS.length} agents`);

  // A tick that is allowed to trade must not throw. Whether it finds anything
  // is the book's business; answering 500 is not.
  let tickErr = null, tick = null;
  try { tick = await runOnce(mem, { execute: false }); }
  catch (e) { tickErr = e.message; }
  chk("X2 a tick completes rather than throwing", tickErr === null,
      tickErr ? `threw: ${String(tickErr).slice(0, 80)}` : `${(tick?.signals || []).length} signal(s), verdict ${tick?.verdict?.action ?? "none"}`);

  // Nothing to do must look like nothing to do, even when execution is allowed.
  const quiet = await runOnce(mem, { execute: true, cfgs: {
    dca: { everyMs: 1e15 }, rebalance: { bandPct: 1e9 }, grid: { stepPct: 1e9 },
    momentum: { thresholdPct: 1e9 }, yield: { bufferUsd: 1e12 }, risk: { drawdownPct: 1e9 } } });
  // The time-machine panel is hidden by the refresh whenever the last wipe is
  // newer than `ttDrawnAt`. Anything written into it without stamping that
  // clock is erased a few seconds later — which is what happened to "Pick a
  // time first.": the operator is told what to do and the instruction deletes
  // itself while they read it. Every write to that panel must stamp.
  const rendererSrc = fs.readFileSync(new URL("../renderer/index.html", import.meta.url), "utf8");
  const writesToPanel = [...rendererSrc.matchAll(/el\("ttout"\)\.innerHTML\s*=|box\.innerHTML\s*=\s*ttHead/g)].length;
  const stamps = [...rendererSrc.matchAll(/ttDrawnAt\s*=\s*Date\.now\(\)/g)].length;
  const unstampedWrite = /el\("ttout"\)\.hidden\s*=\s*false;\s*el\("ttout"\)\.innerHTML/.test(rendererSrc);
  chk("X4 nothing writes to the time-machine panel without stamping the refresh clock",
      !unstampedWrite && stamps >= 3,
      unstampedWrite ? "a write sets hidden=false then innerHTML without ttDrawnAt — the refresh will erase it"
                     : `${writesToPanel} panel write(s), ${stamps} stamp(s)`);

  // An interval that nothing stamps is not an interval. `dca_last_ms` was read
  // by the agent and written by nobody, so "recurring buy every 24h" proposed a
  // buy on every single evaluation — every tick when armed, not once a day.
  // Two halves: the gate must actually gate, and a real fill must stamp it.
  const justBought = { positions: {}, baton: { dca_last_ms: Date.now() - 60_000 },
                       limits: { max_trade_usd: 100, max_day_usd: 300, allow: SYMBOLS } };
  const longAgo = { positions: {}, baton: { dca_last_ms: Date.now() - 25 * 3600e3 },
                    limits: { max_trade_usd: 100, max_day_usd: 300, allow: SYMBOLS } };
  const gated = evaluate("dca", agentMkt, justBought);
  const due = evaluate("dca", agentMkt, longAgo);
  chk("X5 the dca interval actually gates",
      gated === null && due !== null,
      `a minute after buying: ${gated ? "FIRES ANYWAY" : "silent"} · 25h after: ${due ? "proposes" : "STAYS SILENT"}`);

  const traderSrc = fs.readFileSync(new URL("../main/trader.mjs", import.meta.url), "utf8");
  chk("X6 a dca fill records when it bought",
      /agent === "dca"[\s\S]{0,200}dca_last_ms:\s*Date\.now\(\)/.test(traderSrc)
        && /\.\.\.\(b\.baton \|\| \{\}\)/.test(traderSrc),
      /agent === "dca"/.test(traderSrc)
        ? "applyFill stamps the baton, merging rather than replacing it"
        : "nothing writes dca_last_ms — the interval is decorative");

  chk("X3 a quiet book invents nothing, even when allowed to trade",
      (quiet.signals || []).length === 0 && quiet.verdict === null && quiet.fill === null,
      `signals ${(quiet.signals || []).length}, verdict ${quiet.verdict}, fill ${quiet.fill}`);
}

section("U. the data the book stands on");
try {
  const HOUR = 3.6e6, DAY = 86400e3, now = Date.now();

  const h = await klines("ETHUSDT", { limit: 300 });
  let mono = true; const gaps = new Set();
  for (let i = 1; i < h.length; i++) { if (h[i].t <= h[i - 1].t) mono = false; gaps.add(h[i].t - h[i - 1].t); }
  chk("U1 hourly candles are real, ordered and evenly spaced",
      h.length >= 200 && mono && [...gaps].every((g) => g === HOUR) && h.every((k) => k.high >= k.low && k.volume > 0),
      `${h.length} bars, newest last, ${[...gaps].length} distinct gap(s)`);

  const t0 = Date.now(); await klines("ETHUSDT", { limit: 300 }); const warm = Date.now() - t0;
  const t1 = Date.now(); await klines("ETHUSDT", { limit: 298 }); const cold = Date.now() - t1;
  chk("U2 the feed cache is keyed by its arguments", warm < 5 && cold > warm,
      `same args ${warm}ms (cached), different limit ${cold}ms (fetched)`);

  const newest = h[h.length - 1];
  chk("U3 a candle knows when its period ends",
      h.every((k) => Number.isFinite(k.tClose)) && newest.tClose === newest.t + HOUR - 1,
      `newest bar closes ${new Date(newest.tClose).toISOString().slice(11, 19)}, ` +
      `${((now - newest.t) / 60e3).toFixed(0)}min into it`);

  // The whole section in one assertion: the forming bar is dropped by anything
  // measuring a completed period, and kept by anything measuring now.
  const daily = await klines("BTCUSDT", { interval: "1d", limit: 220 });
  const printed = closedBars(daily);
  const forming = daily[daily.length - 1].tClose > now;
  chk("U4 the 200-day mean is 200 printed days",
      printed.length === daily.length - (forming ? 1 : 0) &&
      printed.every((c) => c.tClose <= now),
      forming ? `today's bar dropped — ${printed.length} printed of ${daily.length} fetched`
              : `no bar in progress — all ${printed.length} printed`);

  const gate = await marketUptrend();
  const handSma = printed.map((c) => c.close).slice(-200).reduce((a, b) => a + b, 0) / 200;
  chk("U5 …and the live price is still the live price",
      Math.abs(gate.sma200 - handSma) < 1e-6 && gate.px === daily[daily.length - 1].close,
      `px $${Math.round(gate.px).toLocaleString()} (live) vs mean $${Math.round(gate.sma200).toLocaleString()} (printed)`);

  // A completed hour over completed hours -- never a part-hour over whole ones.
  const shipped = relativeVolume(h);
  const naive = h[h.length - 1].volume / (h.slice(-21, -1).reduce((a, c) => a + c.volume, 0) / 20);
  chk("U6 relative volume compares like with like",
      Math.abs(shipped - relativeVolume(closedBars(h))) < 1e-9 && (!forming || Math.abs(shipped - naive) > 1e-9),
      `${shipped.toFixed(2)} on the last completed hour · the part-hour reading would be ${naive.toFixed(2)}`);

  const again = relativeVolume(await klines("ETHUSDT", { limit: 300 }));
  chk("U7 …so the answer does not depend on the wall clock", shipped === again,
      `two reads inside one hour agree at ${shipped.toFixed(4)}`);

  // Blow up the range of the bar that is still being written. Its close is left
  // alone, because that IS the normaliser -- the stop is a share of what we
  // would pay now -- so any movement here would be the forming bar's range
  // leaking into a measurement defined over completed ones.
  const tampered = h.map((k, i) => (i === h.length - 1 ? { ...k, high: k.high * 3, low: k.low / 3 } : k));
  chk("U8 ATR measures completed ranges",
      atrPct(h) > 0 && (!forming || atrPct(tampered) === atrPct(h)),
      forming
        ? `${(atrPct(h) * 100).toFixed(3)}% of price — tripling the forming bar's range moves it by ` +
          `${Math.abs(atrPct(tampered) - atrPct(h)).toExponential(1)}`
        : `${(atrPct(h) * 100).toFixed(3)}% of price — no bar in progress to exclude`);

  // A threshold no live input can reach is not a threshold.
  const reach = [];
  for (const sym of SYMBOLS) {
    const m = MARKETS[sym]; if (!m?.binance) continue;
    reach.push({ sym, rv: relativeVolume(await klines(m.binance)) });
  }
  const top = reach.reduce((a, b) => (b.rv > a.rv ? b : a));

  // The property is that the threshold is REACHABLE -- which is about the
  // measurement, not about whether the market happens to be busy while the
  // suite runs. Asserting a live level here failed on a quiet morning with
  // every market under 1.0x and nothing wrong with the code: measuring the
  // fixture again. So the reachability is proved on a series built to meet
  // every one of volume_thrust's conditions, and the live feed is only
  // required to produce sane numbers.
  const vbar = (px, vol) => ({ t: 0, open: px, high: px * 1.001, low: px * 0.999, close: px, volume: vol });
  const built = [];
  for (let i = 0; i < 120; i++) built.push(vbar(100 + (i % 2 ? 0.05 : -0.05), 1000));
  const loud = [...built, vbar(105, 3000)];        // +5% on 3.0x volume — fires
  const quiet = [...built, vbar(105, 2000)];       // same move on 2.0x       — does not
  const ctxT = { uptrend: true, regime: "TREND_UP", symbol: "ETH" };
  const firedLoud = BOOK.volume_thrust(loud, ctxT);
  const firedQuiet = BOOK.volume_thrust(quiet, ctxT);

  chk("U9 volume_thrust is reachable, and its threshold does real work",
      !!firedLoud && !firedQuiet &&
      Math.abs(relativeVolume(loud) - 3) < 1e-9 &&
      reach.every((r) => Number.isFinite(r.rv) && r.rv > 0),
      `fires at 3.0x, silent at 2.0x (threshold ${P.thrust_volume}x) · ` +
      `live feed sane, best is ${top.sym} at ${top.rv.toFixed(2)}x`);

  const bar = (px) => ({ t: 0, open: px, high: px * 1.001, low: px * 0.999, close: px, volume: 1000 });
  chk("U10 the regime classifier is correct at its edges",
      regimeOf(Array.from({ length: 10 }, () => bar(100))) === "UNKNOWN" &&
      regimeOf(Array.from({ length: 60 }, (_, i) => bar(100 + i))) === "TREND_UP" &&
      regimeOf(Array.from({ length: 60 }, (_, i) => bar(160 - i))) === "RISK_OFF" &&
      regimeOf(Array.from({ length: 60 }, (_, i) => bar(100 + (i % 2 ? 3 : -3)))) === "CHOP" &&
      regimeOf(Array.from({ length: 60 }, () => bar(100))) === "CHOP",
      "UNKNOWN · TREND_UP · RISK_OFF · CHOP · flat is CHOP, not a divide-by-zero");

  const sc = await j("/scan");
  const errored = (sc.b.markets || []).filter((m) => m.error);
  chk("U11 a dead feed is reported, not hidden",
      sc.s === 200 && (sc.b.markets || []).length === SYMBOLS.length &&
      errored.every((m) => !(sc.b.signals || []).some((g) => g.symbol === m.symbol)),
      errored.length ? `${errored.length} market(s) errored, none contributed a signal` : "every feed answered");

  const live = (sc.b.markets || []).filter((m) => !m.error);
  chk("U12 indicators never emit NaN",
      live.length > 0 && live.every((m) => [m.rsi, m.emaGapPct, m.relVol, m.atrPct].every(Number.isFinite)),
      `${live.length} market(s), 4 indicators each, all finite`);

  chk("U13 the gate's prose matches its verdict",
      sc.b.gate.uptrend === /is above its 200-day mean/.test(sc.b.gate.reason),
      `${sc.b.gate.uptrend ? "above" : "below"} — "${sc.b.gate.reason.slice(0, 46)}…"`);

  // A number covering two of three positions reads exactly like one covering three.
  const padSrc = fs.readFileSync(new URL("../main/server.mjs", import.meta.url), "utf8");
  const pd = await j("/pad");
  chk("U14 partial P&L is not presented as whole-book P&L",
      /priced === held/.test(padSrc) && pd.s === 200 && Number.isFinite(pd.b.unpriced) &&
      (pd.b.unpriced === 0 || pd.b.unrealised === null),
      pd.b.unpriced === 0 ? `all ${pd.b.positions} position(s) priced, P&L stands`
                          : `${pd.b.unpriced} unpriced — unrealised withheld`);
} catch (e) { chk("U crashed", false, String(e.message || e).slice(0, 92)); }

section("V. two things at once");
{
  const { withTradeLock } = await import("../main/lock.mjs");
  const memV = new Memory(); memV.start();
  let originalLimits = null;
  try {
    const m0 = await j("/memory");
    originalLimits = m0.b.limits;
    const spent0 = Number(m0.b.spent_today) || 0;
    const ROOM = 30;                       // room for exactly one ~$25 trade
    const cap = spent0 + ROOM;
    await memV.setReference("risk/limits", { ...originalLimits, max_day_usd: cap });

    // Four ticks at once against a cap with room for one. Before the lock this
    // produced four real fills and not one rejection.
    const N = 4;
    const res = await Promise.all(Array.from({ length: N }, () =>
      fetch(`${B}/tick`, { method: "POST", headers: H, body: "{}", signal: AbortSignal.timeout(90000) })
        .then((r) => r.json()).catch((e) => ({ error: String(e.message || e) }))));
    const spent1 = Number((await j("/memory")).b.spent_today) || 0;
    const fills = res.filter((r) => r?.fill?.hash);

    chk("V1 concurrent ticks cannot outspend the day", spent1 <= cap + 1e-9,
        `${N} at once · $${spent0} -> $${spent1} against a $${cap} cap · ${fills.length} fill(s), ` +
        `overspend $${Math.max(0, spent1 - cap).toFixed(2)}`);

    // Zero room, deliberately: with the day already spent, a tick that would
    // otherwise execute has exactly one correct outcome. Whether a signal fires
    // at all depends on the live book, so a tick that proposes nothing is
    // reported rather than counted as agreement.
    await memV.setReference("risk/limits", { ...originalLimits, max_day_usd: spent1 });
    const dry = await Promise.all(Array.from({ length: 2 }, () =>
      fetch(`${B}/tick`, { method: "POST", headers: H, body: "{}", signal: AbortSignal.timeout(90000) })
        .then((r) => r.json()).catch((e) => ({ error: String(e.message || e) }))));
    const verdicts = dry.filter((r) => r?.verdict);
    const budgetRejects = verdicts.filter((r) => r.verdict.action === "REJECT" &&
                                                (r.verdict.why || []).some((w) => /budget exhausted/.test(w)));
    chk("V2 …and the rejection is the real one",
        dry.every((r) => !r.error && !r.fill) && budgetRejects.length === verdicts.length,
        verdicts.length
          ? `${budgetRejects.length}/${verdicts.length} refused citing the budget, 0 fills`
          : "no signal fired on this pass — nothing proposed, nothing spent");

    chk("V3 the budget is enforced when it signs, not when it proposes",
        fills.length === 0 || fills.every((f) => Number(f.verdict?.sizeUsd) > 0) &&
        res.some((r) => (r?.verdict?.why || []).some((w) => /re-read at execution/.test(w))) || spent1 <= cap,
        `total spent lands on the cap exactly, not past it`);

    await memV.setReference("risk/limits", originalLimits);

    // V4 — the operator's key and the automation share one day's money.
    const m1 = await j("/memory");
    const spentA = Number(m1.b.spent_today) || 0;
    await memV.setReference("risk/limits", { ...originalLimits, max_day_usd: spentA + ROOM });
    await j("/key", { method: "POST", body: JSON.stringify({ id: "buy" }) });
    const [yesR, tickR] = await Promise.all([
      fetch(`${B}/key`, { method: "POST", headers: H, body: JSON.stringify({ id: "yes" }), signal: AbortSignal.timeout(90000) }).then((r) => r.json()).catch((e) => ({ error: e.message })),
      fetch(`${B}/tick`, { method: "POST", headers: H, body: "{}", signal: AbortSignal.timeout(90000) }).then((r) => r.json()).catch((e) => ({ error: e.message })),
    ]);
    const spentB = Number((await j("/memory")).b.spent_today) || 0;
    chk("V4 the human path and the automated one share the limit", spentB <= spentA + ROOM + 1e-9,
        `YES + tick together · $${spentA} -> $${spentB} against $${spentA + ROOM}`);
    await memV.setReference("risk/limits", originalLimits);

    // V5 — the property G5 tests serially, now under a race.
    await j("/key", { method: "POST", body: JSON.stringify({ id: "buy" }) });
    const both = await Promise.all([1, 2].map(() =>
      fetch(`${B}/key`, { method: "POST", headers: H, body: JSON.stringify({ id: "yes" }), signal: AbortSignal.timeout(90000) })
        .then((r) => r.json()).catch((e) => ({ error: e.message }))));
    const filled = both.filter((r) => r?.fill?.hash);
    const nothing = both.filter((r) => /nothing pending/.test(r?.error || ""));
    chk("V5 two simultaneous YES still cannot double-fill",
        filled.length <= 1 && (filled.length + nothing.length) === 2,
        `${filled.length} fill(s), ${nothing.length} "nothing pending"`);

    // V6 — a throwing execution must not wedge every later one.
    let released = false;
    await withTradeLock(async () => { throw new Error("boom"); }).catch(() => {});
    await withTradeLock(async () => { released = true; });
    chk("V6 a failed execution releases the lock", released,
        released ? "the next trade ran after one threw" : "the lock stayed held — the server would wedge");

    // V7 — the pad's poll must not go dark because a swap is in flight.
    // /pad and /health are the two routes with an explicit no-503 contract --
    // the pad polls them once a second and a dark status light is worse than a
    // slow one. /scan is deliberately NOT in that set: it reads the chain and
    // is allowed to fail when the node is unwell.
    let slowDone = false;
    const slow = withTradeLock(async () => { await new Promise((r) => setTimeout(r, 1500)); slowDone = true; });
    const t0 = Date.now();
    const reads = await Promise.all([j("/health"), j("/pad")]);
    const readMs = Date.now() - t0;
    // Sampled here, NOT after `await slow` -- waiting for the holder is what
    // makes it finish, so reading the flag afterwards can only ever say "done"
    // and proves nothing about whether the reads overtook it.
    const stillHeld = !slowDone;
    await slow;
    chk("V7 reads never queue behind a trade",
        reads.every((r) => r.s === 200) && stillHeld && readMs < 1500,
        `/health ${reads[0].s} · /pad ${reads[1].s} — answered in ${readMs}ms while a trade held the lock ` +
        `(holder still running: ${stillHeld})`);
  } catch (e) {
    chk("V crashed", false, String(e.message || e).slice(0, 92));
  } finally {
    if (originalLimits) await memV.setReference("risk/limits", originalLimits).catch(() => {});
    memV.stop();
  }
}

section("Y. what the pad thinks it owns");
{
  const { applyFill } = await import("../main/trader.mjs");
  const memY = new Memory({ db: (await j("/health")).b?.memoryDb || process.env.SIBYL_DB });
  memY.start();
  const SYM = "MORPHO";                       // allowlisted, and not the market the run trades
  const posOf = async (sym) => ((await memY.getEntity("position", sym).catch(() => null))?.body || null);
  try {
    // ---- Y1: a real buy, end to end, against the chain itself --------------
    const mkt = "AERO";
    const chainQty = async () => Number((await balances())[mkt]?.amount ?? 0);
    await j("/key", { method: "POST", body: JSON.stringify({ id: mkt }) });
    const c0 = await chainQty(), s0 = Number((await posOf(mkt))?.qty ?? 0);
    await j("/key", { method: "POST", body: JSON.stringify({ id: "buy" }) });
    const yes = await j("/key", { method: "POST", body: JSON.stringify({ id: "yes" }) });
    if (yes.b?.fill?.hash) {
      const c1 = await chainQty(), s1 = Number((await posOf(mkt))?.qty ?? 0);
      const dChain = c1 - c0, dStore = s1 - s0;
      chk("Y1 a buy records what the chain gave", Math.abs(dStore - dChain) < 1e-8,
          `chain +${dChain.toFixed(8)} · store +${dStore.toFixed(8)} · drift ${(dStore - dChain).toExponential(1)}`);
    } else {
      skip("Y1 a buy records what the chain gave", `no fill: ${String(yes.b?.error || "").slice(0, 50)}`);
    }

    // ---- Y2/Y3/Y4: the arithmetic, on fills whose numbers are known --------
    // usd and price below are deliberately wrong: they are the PROPOSAL, and a
    // proposal is exactly what must not reach the ledger.
    await memY.archiveEntity("position", SYM, "Y-section reset").catch(() => {});
    const f1 = { sold: "25 USDC", received: 12.5, receivedSymbol: SYM };   // $2.00/unit
    await applyFill(memY, { symbol: SYM, side: "BUY", usd: 30, price: 9.99, fill: f1 });
    const y2 = await posOf(SYM);
    chk("Y2 …and what it actually cost",
        y2 && Math.abs(y2.qty - 12.5) < 1e-9 && Math.abs(y2.avg_entry_usd - 2) < 1e-9,
        `${y2?.qty} @ $${y2?.avg_entry_usd?.toFixed(4)} — the proposal said $30 at $9.99, both ignored`);

    // A clamp shows up as `sold` being smaller than the size that was approved.
    await memY.archiveEntity("position", SYM, "Y3 reset").catch(() => {});
    await applyFill(memY, { symbol: SYM, side: "BUY", usd: 100, price: 2, fill: { sold: "7 USDC", received: 3.5 } });
    const y3 = await posOf(SYM);
    chk("Y3 a clamped buy records the clamp",
        y3 && Math.abs(y3.qty - 3.5) < 1e-9 && Math.abs(y3.avg_entry_usd - 2) < 1e-9,
        `approved $100, actually sent $7 -> ${y3?.qty} @ $${y3?.avg_entry_usd?.toFixed(4)} (basis $${(y3.qty * y3.avg_entry_usd).toFixed(2)})`);

    await memY.archiveEntity("position", SYM, "Y4 reset").catch(() => {});
    await applyFill(memY, { symbol: SYM, side: "BUY", usd: 0, price: 0, fill: f1 });
    await applyFill(memY, { symbol: SYM, side: "BUY", usd: 0, price: 0, fill: { sold: "40 USDC", received: 16 } });
    const y4 = await posOf(SYM);
    const wq = 12.5 + 16, wavg = (25 + 40) / wq;
    chk("Y4 two buys average correctly",
        y4 && Math.abs(y4.qty - wq) < 1e-9 && Math.abs(y4.avg_entry_usd - wavg) < 1e-9,
        `${y4?.qty} @ $${y4?.avg_entry_usd?.toFixed(8)} — expected $${wavg.toFixed(8)}`);

    // ---- Y5/Y6: a partial sell -------------------------------------------
    await applyFill(memY, { symbol: SYM, side: "SELL", usd: 1, price: 3, fill: { sold: `10 ${SYM}`, received: 30 } });
    const y5 = await posOf(SYM);
    chk("Y5 a partial sell leaves the right quantity",
        y5 && Math.abs(y5.qty - (wq - 10)) < 1e-9, `${wq} - 10 -> ${y5?.qty}`);
    chk("Y6 …and does not move the cost basis",
        y5 && Math.abs(y5.avg_entry_usd - wavg) < 1e-9,
        `still $${y5?.avg_entry_usd?.toFixed(8)} — realising a gain is not a re-pricing`);

    // ---- Y7: the full exit ------------------------------------------------
    await applyFill(memY, { symbol: SYM, side: "SELL", usd: 1, price: 3, fill: { sold: `${wq - 10} ${SYM}`, received: 55 } });
    const y7 = await posOf(SYM);
    const archived = await memY.listArchived({ limit: 40 }).catch(() => []);
    chk("Y7 a full exit archives and leaves nothing",
        !y7 && (archived || []).some((a) => String(a.name || a.entity || "").includes(SYM)),
        `position gone, ${(archived || []).length} archived row(s) retain the history`);

    // ---- Y8/Y9: the two ledgers agree ------------------------------------
    const bal = await balances();
    const brief = await memY.recallBrief();
    const open = Object.entries(brief?.positions || {}).filter(([, p]) => Number(p.qty) > 0);
    const phantom = open.filter(([sym, p]) => Number(p.qty) - Number(bal[sym]?.amount ?? 0) > 1e-6);
    chk("Y8 the pad never claims tokens it does not hold", phantom.length === 0,
        phantom.length
          ? phantom.map(([s, p]) => `${s} remembers ${Number(p.qty).toFixed(6)} vs ${Number(bal[s]?.amount ?? 0).toFixed(6)} held`).join("; ")
          : `${open.length} open position(s), each within the on-chain balance`);

    const port = await j("/portfolio");
    chk("Y9 the desk and the store agree",
        port.s === 200 && open.every(([sym]) => sym in (port.b.balances || {})),
        `/portfolio lists ${Object.keys(port.b?.balances || {}).length} asset(s), covering all ${open.length} remembered position(s)`);
  } catch (e) {
    chk("Y crashed", false, String(e.message || e).slice(0, 92));
  } finally {
    await memY.archiveEntity("position", SYM, "Y-section cleanup").catch(() => {});
    memY.stop();
  }
}

section("Z. the routes and keys the matrix found");
try {
  const press = (id) => j("/key", { method: "POST", body: JSON.stringify({ id }) });

  const qr = await withDeadline(B + "/padqr", { headers: H });
  const qrNo = await withDeadline(B + "/padqr", { headers: {} });
  const qrb = await qr.json().catch(() => null);
  chk("Z1 GET /padqr serves the pad's setup payload",
      qr.status === 200 && /application\/json/.test(qr.headers.get("content-type") || "") &&
      !!qrb && qrNo.status === 401,
      `200 with ${Object.keys(qrb || {}).length} field(s), ${qrNo.status} without the token`);

  const fresh = await press("scan");
  const last = await j("/scan/last");
  chk("Z2 GET /scan/last returns the cached book",
      last.s === 200 && last.b?.at === fresh.b?.scan?.at,
      `same scan at ${String(last.b?.at || "").slice(11, 19)} — a read, not a re-run`);

  const idx = await withDeadline(B + "/index.html", { headers: {} });
  const idxText = await idx.text().catch(() => "");
  chk("Z3 GET /index.html serves the desk unauthenticated",
      idx.status === 200 && /text\/html/.test(idx.headers.get("content-type") || "") && idxText.length > 1000,
      `200 text/html, ${(idxText.length / 1024).toFixed(0)}KB, no token needed`);

  const m0 = (await j("/health")).b?.market;
  const m1 = await press("market");
  const m2 = await press("market");
  const mNow = (await j("/health")).b?.market;
  chk("Z4 the market key cycles the allowlist",
      m1.s === 200 && m1.b?.market && m1.b.market !== m0 &&
      m2.b?.market !== m1.b.market && mNow === m2.b.market,
      `${m0} -> ${m1.b?.market} -> ${m2.b?.market}, and /health agrees`);

  const pk = await press("portfolio");
  const pr = await j("/portfolio");
  chk("Z5 the portfolio key equals GET /portfolio",
      pk.s === 200 && pk.b?.ok === true &&
      ["chain", "route", "balances", "memory", "agents", "prices"].every((k) => k in (pk.b || {})) &&
      Object.keys(pk.b.balances || {}).length === Object.keys(pr.b?.balances || {}).length,
      `same snapshot: ${Object.keys(pk.b?.balances || {}).length} balance(s), route ${pk.b?.route?.name ?? pk.b?.route ?? "?"}`);

  chk("Z6 the scan key runs the book and stages the decision",
      fresh.s === 200 && fresh.b?.ok === true && (fresh.b.scan?.markets || []).length === SYMBOLS.length &&
      (fresh.b.signal ? (!!fresh.b.verdict && (fresh.b.verdict.action !== "EXECUTE" || fresh.b.awaiting === "yes/no")) : fresh.b.verdict === null),
      fresh.b?.signal
        ? `${fresh.b.scan.summary} -> ${fresh.b.signal.agent} ${fresh.b.verdict.action}` +
          `${fresh.b.awaiting ? ` awaiting ${fresh.b.awaiting}` : ""}`
        : `${fresh.b?.scan?.summary} — nothing staged, verdict null`);

  const base = await press("base");
  chk("Z7 the base key is the scan key",
      base.s === 200 && base.b?.ok === true &&
      JSON.stringify(Object.keys(base.b).sort()) === JSON.stringify(Object.keys(fresh.b).sort()),
      `the white key returns the same shape: ${Object.keys(base.b || {}).sort().join(", ")}`);

  const mic = await press("mic");
  chk("Z8 the mic key refuses server-side, with the reason",
      mic.s === 200 && mic.b?.ok === false && /\/voice/.test(mic.b?.error || ""),
      `"${String(mic.b?.error || "").slice(0, 62)}"`);
  // Found only in real Chrome: the in-app browser never asks for a favicon, so
  // ten runs of "zero network errors" had been measured without the one request
  // every real browser makes before it has a token.
  const fav = await withDeadline(B + "/favicon.ico", { headers: {} });
  const favBuf = await fav.arrayBuffer().catch(() => new ArrayBuffer(0));
  const stillGated = await withDeadline(B + "/pad", { headers: {} });
  chk("Z9 GET /favicon.ico serves the app's icon unauthenticated",
      fav.status === 200 && /image\//.test(fav.headers.get("content-type") || "") &&
      favBuf.byteLength > 1000 && stillGated.status === 401,
      `${fav.status} ${fav.headers.get("content-type")} ${(favBuf.byteLength / 1024).toFixed(1)}KB without a token · /pad still ${stillGated.status}`);
  // The display pod's chart: the market in hand as hourly closes, from the
  // same cached candle feed /pad prices from, and gated like every pad route.
  const pc = await j("/pad/chart");
  const pcNoAuth = await withDeadline(B + "/pad/chart", { headers: {} });
  const pcPost = await withDeadline(B + "/pad/chart", { method: "POST", headers: H });
  const pcMax = await j("/pad/chart?hours=500");
  const series = pc.b?.closes || [];
  chk("Z10 GET /pad/chart gives the screen a real series",
      pc.s === 200 && pc.b?.symbol === (await j("/health")).b?.market &&
      series.length === 49 && series.every(Number.isFinite) &&
      Math.abs(pc.b.hi - Math.max(...series)) < 1e-9 && Math.abs(pc.b.lo - Math.min(...series)) < 1e-9 &&
      pcNoAuth.status === 401 && pcPost.status === 405 && pcMax.b?.hours === 168,
      `${pc.b?.symbol} ${series.length} closes, ${pc.b?.change24h}% 24h · no token ${pcNoAuth.status} · ` +
      `POST ${pcPost.status} · hours=500 -> ${pcMax.b?.hours}`);
} catch (e) { chk("Z crashed", false, String(e.message || e).slice(0, 92)); }

console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}${pass} passed, ${fail} failed\x1b[0m` +
            (skipped ? `   (${skipped} skipped)` : "") + "\n");
process.exit(fail ? 1 : 0);
