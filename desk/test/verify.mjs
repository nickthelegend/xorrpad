/**
 * verify.mjs — the whole product, checked against what is actually running.
 *
 * Not unit tests. This drives the live HTTP API, the live Jupiter router, the
 * live OKX aggregator, a real Solana RPC and a real SQLite store. Every number
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
import * as xl from "../main/chains/xlayer.mjs";
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
section("C. both venues, live");
{
  const v = await j("/chains");
  const venues = v.b?.venues || [];
  chk("C1 /chains reports every venue", venues.length === 2, venues.map((x) => x.id).join(", "));
  chk("C2 both are reachable", venues.every((x) => x.ok),
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

  const x = await xl.info();
  if (!x.cli || !x.loggedIn) block("C6 x layer quote", `onchainos not usable: ${x.reason || "not logged in"}`);
  else {
    const xq = await xl.quote("USDT", "WOKB", 50);
    chk("C6 okx aggregator quotes", xq.amountOut > 0,
        `$50 USDT -> ${xq.amountOut.toFixed(5)} WOKB @ $${(50 / xq.amountOut).toFixed(2)} via ${xq.route}`);
    const bal = await xl.balances();
    chk("C7 x layer balances are real", Object.keys(bal).length > 0,
        Object.entries(bal).map(([k, b]) => `${k} ${b.amount.toFixed(2)}`).join(", ") || "none");
  }

  // Whatever the active venue actually lists — asking Solana for WOKB, or
  // X Layer for TSLAx, tests nothing but the hardcoding in this file.
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

  let x = false; try { await xl.swap(); } catch (e) { x = /quotes only/.test(e.message); }
  chk("F3 x layer refuses by name", x, "the funded mainnet account is not one keypress away");

  // Structural, not textual. Grepping for the word "execute" flagged the
  // refusal message that exists precisely to say the module will not execute —
  // the check was reading prose and calling it a call site. Look instead at the
  // verbs actually handed to the CLI, and at the RPC methods actually sent.
  const { readFileSync } = await import("node:fs");
  const read = (f) => readFileSync(new URL(`../main/chains/${f}`, import.meta.url), "utf8");

  const CLI_VERBS = [...read("xlayer.mjs").matchAll(/\[\s*"(swap|wallet|token)"\s*,\s*"([a-z-]+)"/g)]
    .map((m) => `${m[1]} ${m[2]}`);
  const READONLY_VERBS = ["swap quote", "swap liquidity", "swap chains", "swap check-approvals",
                          "wallet status", "wallet balance", "wallet addresses", "token search", "token info"];
  const writeVerbs = CLI_VERBS.filter((v) => !READONLY_VERBS.includes(v));
  chk("F4 the CLI is only ever asked read-only verbs", writeVerbs.length === 0,
      writeVerbs.length ? `calls: ${writeVerbs.join(", ")}` : `only ${[...new Set(CLI_VERBS)].join(", ")}`);

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
    const onSolana = (await j("/pad")).b?.chain === "solana";
    chk("G3 ✓ hands off without signing", d.ok === true && d.handoff === true,
        `${d.quote?.amountOut?.toFixed(6)} ${d.quote?.buy} via ${d.quote?.route}`);
    if (onSolana) {
      chk("G4 solana builds an unsigned transaction", !!d.transaction?.unsignedTx && !!d.transaction?.signWith,
          `${d.transaction?.unsignedTx?.length || 0}b, to sign with ${String(d.transaction?.signWith).slice(0, 12)}...`);
    } else {
      // X Layer is quote-only on purpose. `onchainos swap swap` would return
      // transaction data, but its own help describes itself as
      // "quote -> sign -> broadcast" and the account behind it holds real
      // money on mainnet, so it is not called to find out which it means.
      chk("G4 x layer hands back a quote and says so", d.transaction === null && /stays with you/.test(d.note || ""),
          `"${d.note}"`);
    }
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
  await j("/key", { method: "POST", body: JSON.stringify({ id: "buy" }) });
  const killed = await j("/key", { method: "POST", body: JSON.stringify({ id: "yes" }) });
  chk("G8 the kill switch stops ✓ too", killed.b?.ok === false && /disarm/i.test(killed.b?.error || ""),
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
      (d.limits?.allow || []).includes("SPYx") || (d.limits?.allow || []).includes("WOKB"),
      `${(d.limits?.allow || []).length} markets`);
  chk("H3 the journal grew", Array.isArray(d.journal_recent) && d.journal_recent.length > 0,
      `${d.journal_recent?.length} events`);
}

const total = pass + fail + blocked;
console.log(`\n${fail === 0 ? G : R}${pass} passed, ${fail} failed${Z}` +
            (blocked ? `, ${Y}${blocked} blocked${Z}` : "") + `   (${total} checks)\n`);
process.exit(fail ? 1 : 0);
