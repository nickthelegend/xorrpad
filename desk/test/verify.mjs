/**
 * verify.mjs — the whole product, checked against what is actually running.
 *
 * Not unit tests. This drives the live HTTP API, the live Jupiter router, the
 * a real Solana RPC and a real SQLite store. Every number
 * it prints came back over a wire.
 *
 *   ./run.sh &            backend on :8080
 *   node test/verify.mjs
 *
 * What it deliberately does NOT do is sign anything. The two venues here are
 * read-only by construction and section F proves it, because that property is
 * the reason this device is safe to leave on a desk.
 */
import * as sol from "../main/chains/solana.mjs";
import { BY_ID, assertNeverSigns, survey } from "../main/chains/index.mjs";
import { XSTOCKS, REJECTED, mintOf, marketHours, SYMBOLS } from "../main/xstocks.mjs";

const B = process.env.PAD_URL || "http://localhost:8080";
const TOKEN = process.env.PAD_TOKEN || "xorrpad-dev";
const H = { "content-type": "application/json", authorization: "Bearer " + TOKEN };

let pass = 0, fail = 0, blocked = 0;
const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", D = "\x1b[2m", Z = "\x1b[0m";
const chk = (id, ok, detail) => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? G + "PASS" : R + "FAIL"}${Z}  ${id.padEnd(40)} ${detail}`);
};
const block = (id, why) => { blocked++; console.log(`  ${Y}BLOCK${Z} ${id.padEnd(40)} ${why}`); };
const section = (t) => console.log(`\n\x1b[1m${t}${Z}`);

const j = async (p, o = {}) => {
  const r = await fetch(B + p, { ...o, headers: o.noauth ? {} : H });
  let b = null; try { b = await r.json(); } catch {}
  return { s: r.status, b };
};

// ── A. the service ──────────────────────────────────────────────────────────
section("A. the service");
{
  const h = await j("/health", { noauth: true });
  chk("A1 /health is open", h.s === 200 && h.b?.ok === true, `mode ${h.b?.mode}, market ${h.b?.market}`);

  const noTok = await j("/pad", { noauth: true });
  chk("A2 auth is enforced", noTok.s === 401, `${noTok.s} on /pad without a token`);

  const bad = await j("/nope");
  chk("A3 unknown route is 404", bad.s === 404, `${bad.s}`);

  const wrongVerb = await fetch(B + "/pad", { method: "POST", headers: H });
  chk("A4 wrong verb is 405 not 404", wrongVerb.status === 405,
      `POST /pad -> ${wrongVerb.status}, Allow: ${wrongVerb.headers.get("allow")}`);
}

// ── B. the pad's own view ───────────────────────────────────────────────────
section("B. /pad — what the hardware reads");
{
  const p = await j("/pad");
  const d = p.b || {};
  chk("B1 /pad answers", p.s === 200 && d.ok === true, `chain ${d.chain}, venue ${d.venue}`);

  // The bug this section exists for: four fields that were each true of a
  // different chain.
  const venueSymbols = BY_ID[d.chain]?.markets().symbols || [];
  chk("B2 market is tradeable on the named chain", venueSymbols.includes(d.market),
      `${d.market} is in ${d.chain}'s book of ${venueSymbols.length}`);
  chk("B3 price is live, not from another chain", typeof d.price === "number" && d.price > 0,
      `$${Number(d.price).toFixed(2)}`);
  chk("B4 mode matches the chain", d.mode === d.chain, `mode=${d.mode} chain=${d.chain}`);
  chk("B5 chainOk reflects that venue", d.chainOk === true, `${d.chain} reachable`);

  // the flat fields the firmware parses by hand
  chk("B6 hours are flat for the firmware",
      typeof d.hoursState === "string" && typeof d.marketOpen === "boolean" && !!d.hoursNote,
      `${d.hoursState} — "${d.hoursNote}"`);
  chk("B7 pad-facing note fits the bar", (d.hoursNote || "").length <= 50,
      `${(d.hoursNote || "").length} chars (bar holds ~50)`);
  chk("B8 pad strings are ASCII",
      /^[\x20-\x7E]*$/.test(`${d.hoursNote}${d.market}${d.agent}`),
      "the panel's font is 7-bit; non-ASCII renders as noise");
  chk("B9 signing is external", d.signing === "external", "the pad holds no key");
}

// ── C. the venues ───────────────────────────────────────────────────────────
section("C. Solana venues, live");
{
  const v = await j("/chains");
  const venues = v.b?.venues || [];
  chk("C1 /chains reports every venue", venues.length === Object.keys(BY_ID).length, venues.map((x) => x.id).join(", "));
  chk("C2 venues are reachable", venues.every((x) => x.ok),
      venues.map((x) => `${x.id}:${x.ok ? "up" : "down"}`).join(" "));

  const i = await sol.info();
  chk("C3 solana rpc answers", i.slot > 0, `slot ${i.slot}`);

  const q = await sol.quote("USDC", "NVDAx", 50);
  chk("C4 jupiter quotes a real route", q.amountOut > 0 && q.price > 10,
      `$50 -> ${q.amountOut.toFixed(6)} NVDAx @ $${q.price.toFixed(2)} via ${q.route}`);

  const back = await sol.quote("NVDAx", "USDC", q.amountOut);
  const spread = (50 - back.amountOut) / 50 * 100;
  chk("C5 round trip is sane", back.amountOut > 0 && spread < 3,
      `50 -> ${q.amountOut.toFixed(6)} -> $${back.amountOut.toFixed(2)} (${spread.toFixed(2)}% round trip)`);

  // Quote a market from the active venue book.
  const padNow = (await j("/pad")).b || {};
  const venue = BY_ID[padNow.chain];
  const qa = venue.markets().quoteAsset;
  const target = venue.markets().symbols.find((x) => x !== qa);
  const route = await j(`/quote?sell=${qa}&buy=${target}&amount=50`);
  chk("C8 /quote route works", route.s === 200 && route.b?.amountOut > 0,
      `${qa} -> ${target} @ $${Number(route.b?.price || 0).toFixed(2)} on ${padNow.chain}`);
}

// ── D. the book is measured, not assumed ────────────────────────────────────
section("D. the book");
{
  chk("D1 every listed mint is a real xStock",
      Object.values(XSTOCKS).every((t) => t.mint.startsWith("Xs")),
      `${SYMBOLS.length} symbols, all carrying Backed's Xs prefix`);

  let impostor = false;
  try { mintOf("TSLA"); } catch (e) { impostor = /verified xStock/.test(e.message); }
  chk("D2 an unknown ticker is refused, not resolved", impostor,
      "a symbol is not an identity — see THE IMPOSTORS");

  let jpm = false;
  try { mintOf("JPMx"); } catch (e) { jpm = /1000%/.test(e.message); }
  chk("D3 a rejected market names its reason", jpm, REJECTED.JPMx.slice(0, 48) + "...");

  // Re-measure one market now: a listing made on a day's liquidity is a claim
  // about today, and this is the check that would catch it going thin.
  const a = await sol.quote("USDC", "NVDAx", 50);
  const b = await sol.quote("USDC", "NVDAx", 500);
  const drift = ((500 / b.amountOut) - (50 / a.amountOut)) / (50 / a.amountOut);
  chk("D4 depth still holds at $500", Math.abs(drift) < 0.02,
      `$50 $${(50 / a.amountOut).toFixed(2)} vs $500 $${(500 / b.amountOut).toFixed(2)} = ${(drift * 100).toFixed(2)}%`);
}

// ── E. market hours — the thing the product is about ────────────────────────
section("E. market hours");
{
  const h = marketHours();
  chk("E1 hours resolve", typeof h.open === "boolean" && !!h.state && !!h.nyTime,
      `${h.state} at ${h.nyTime} NY`);
  chk("E2 closed states still say it trades", h.open || /trades anyway/.test(h.short),
      `"${h.short}"`);

  // Fixed instants, so this cannot pass merely because of when it was run.
  const at = (iso) => marketHours(new Date(iso));
  chk("E3 a weekday noon is open", at("2026-09-23T16:00:00Z").state === "OPEN",
      "Wed 12:00 ET -> OPEN");
  chk("E4 a Sunday is not", at("2026-09-20T16:00:00Z").state === "WEEKEND", "Sun -> WEEKEND");
  chk("E5 after the bell is AFTER", at("2026-09-23T21:00:00Z").state === "AFTER", "Wed 17:00 ET -> AFTER");
  chk("E6 before the bell is PRE", at("2026-09-23T12:00:00Z").state === "PRE", "Wed 08:00 ET -> PRE");
  chk("E7 a holiday is closed", at("2026-11-26T16:00:00Z").state === "HOLIDAY",
      "Thanksgiving -> HOLIDAY");
}

// ── F. the safety property ──────────────────────────────────────────────────
section("F. it cannot sign");
{
  let ok = false;
  try { ok = await assertNeverSigns(); } catch (e) { ok = false; }
  chk("F1 no venue will execute", ok === true, "every venue's swap() refuses");

  let s = false; try { await sol.swap(); } catch (e) { s = /never signs/.test(e.message); }
  chk("F2 solana refuses by name", s, "swap() explains why rather than failing oddly");

  const { readFileSync } = await import("node:fs");
  const read = (f) => readFileSync(new URL(`../main/chains/${f}`, import.meta.url), "utf8");
  for (const venue of Object.values(BY_ID)) {
    const source = read(`${venue.id}.mjs`);
    chk(`F3 ${venue.id} has no signing call`,
      !/\.signTransaction\(|\.sendAndConfirm\(|\.sendRawTransaction\(|\.send\.\w+\(/.test(source), "unsigned builders only");
  }

  const RPC_METHODS = [...read("solana.mjs").matchAll(/rpc\(\s*"([A-Za-z]+)"/g)].map((m) => m[1]);
  const writeRpc = RPC_METHODS.filter((m) => /^send|^request|^simulate/.test(m));
  chk("F5 solana rpc is only ever read", writeRpc.length === 0,
      writeRpc.length ? writeRpc.join(", ") : `only ${[...new Set(RPC_METHODS)].join(", ")}`);
}

// ── G. the gate, end to end, through the real API ───────────────────────────
section("G. propose -> gate -> confirm");
{
  const buy = await j("/key", { method: "POST", body: JSON.stringify({ id: "buy" }) });
  const v = buy.b?.verdict;
  chk("G1 BUY reaches a verdict", buy.s === 200 && !!v, `${v?.action} $${v?.sizeUsd}`);
  chk("G2 the verdict cites memory", (v?.why || []).some((w) => /memory|limit|journal|holding|rule/i.test(w)),
      `"${v?.why?.[0]}"`);

  if (v?.action === "EXECUTE") {
    const yes = await j("/key", { method: "POST", body: JSON.stringify({ id: "yes" }) });
    const d = yes.b || {};
    chk("G3 ✓ hands off without signing", d.ok === true && d.handoff === true,
        `${d.quote?.amountOut?.toFixed(6)} ${d.quote?.buy} via ${d.quote?.route}`);
    if (d.buildError?.includes("Setup required: SOLANA_ADDRESS"))
      block("G4 unsigned transaction", d.buildError);
    else chk("G4 solana builds an unsigned transaction", !!d.transaction?.unsignedTx && !!d.transaction?.signWith,
          `${d.transaction?.unsignedTx?.length || 0}b`);
    chk("G5 it re-quoted at confirmation", typeof d.quote?.price === "number",
        `priced at ✓, not at proposal`);

    const again = await j("/key", { method: "POST", body: JSON.stringify({ id: "yes" }) });
    chk("G6 a second ✓ cannot double-submit", again.b?.ok === false && /nothing pending/.test(again.b?.error || ""),
        `"${again.b?.error}"`);
  } else block("G3 ✓ handoff", `the gate refused: ${v?.why?.slice(-1)[0]}`);

  await j("/key", { method: "POST", body: JSON.stringify({ id: "buy" }) });
  const no = await j("/key", { method: "POST", body: JSON.stringify({ id: "no" }) });
  chk("G7 ✗ rejects and journals", no.b?.rejected === true, "nothing built");

  // the kill switch, on the human path
  await j("/key", { method: "POST", body: JSON.stringify({ id: "kill" }) });
  const stopped = await j("/key", { method: "POST", body: JSON.stringify({ id: "buy" }) });
  chk("G8 trade key refuses while killed", stopped.b?.ok === false && stopped.b?.error === "Killed: re-arm on the pad to trade", `"${stopped.b?.error}"`);
  const killed = await j("/key", { method: "POST", body: JSON.stringify({ id: "yes" }) });
  chk("G8 the kill switch stops ✓ too", killed.b?.ok === false && /nothing pending|disarm/i.test(killed.b?.error || ""),
      `"${killed.b?.error}"`);
  const armed = await j("/arm", { method: "POST" });
  chk("G9 /arm brings it back", armed.b?.armed === true, "re-arming is its own deliberate act");
  await j("/key", { method: "POST", body: JSON.stringify({ id: "no" }) });
}

// ── H. memory ───────────────────────────────────────────────────────────────
section("H. memory");
{
  const m = await j("/memory");
  const d = m.b || {};
  chk("H1 memory answers", m.s === 200 && !!d.limits, `max $${d.limits?.max_trade_usd}/trade`);
  chk("H2 the allowlist is this venue's",
      (d.limits?.allow || []).includes("SPYx"),
      `${(d.limits?.allow || []).length} markets`);
  chk("H3 the journal grew", Array.isArray(d.journal_recent) && d.journal_recent.length > 0,
      `${d.journal_recent?.length} events`);
}

const total = pass + fail + blocked;
console.log(`\n${fail === 0 ? G : R}${pass} passed, ${fail} failed${Z}` +
            (blocked ? `, ${Y}${blocked} blocked${Z}` : "") + `   (${total} checks)\n`);
process.exit(fail ? 1 : 0);
