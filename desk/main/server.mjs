/**
 * server.mjs — what the pad on your desk talks to.
 *
 *   GET  /health                 open, so the pad can check connectivity
 *   POST /key    {id}            a key press: agent select, buy/sell, yes/no...
 *   GET  /portfolio              balances + positions + P&L
 *   GET  /memory                 what Sibyl currently knows (the judge's pane)
 *   POST /memory/wipe            the demo's "what breaks without memory"
 *   POST /tick                   run one agent pass
 *   POST /panic                  kill switch: disarm everything
 *
 * Bearer PAD_TOKEN on everything except /health.
 */
import http from "node:http";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Memory, DEFAULT_LIMITS, NO_MEMORY_LIMITS } from "./memory.mjs";
import { runOnce, getMarket, snapshot, applyFill } from "./trader.mjs";
import { decide } from "./decide.mjs";
import { evaluate } from "./agents.mjs";
import { swap, spendable } from "./dex.mjs";
import { IS_FORK, fundOnFork, chainReachable, pub, READ_ONLY } from "./chain.mjs";
import { reflect, acceptRule, rejectRule, findContradictions, decayRules } from "./reflect.mjs";
import { prices as feedPrices } from "./scan.mjs";
import { withTradeLock, dayBudget } from "./lock.mjs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { stt, tts, think, parseIntent, pcmToWav } from "./voice.mjs";
import { scan } from "./scan.mjs";
import { klines } from "./candles.mjs";
import { MARKETS, SYMBOLS, DELISTED, delistReason } from "./markets.mjs";
import { STOCKS, STOCKS_UNLISTED, STOCK_SYMBOLS, isStock, stockBlocker, stockPrices } from "./stocks.mjs";
import { usable } from "./routers/index.mjs";
import { active as activeChain, survey as surveyChains, assertNeverSigns } from "./chains/index.mjs";
import { marketHours } from "./xstocks.mjs";

/** The venue in hand — Solana by default, X Layer with CHAIN=xlayer. */
const CHAIN = activeChain();

/**
 * Is an aggregator available? Equities need one; the six crypto markets do not.
 *
 * This used to test for an API key, and so was always false. KyberSwap's
 * aggregator needs no key, so the honest question is whether a router that can
 * reach concentrated-liquidity venues is built and enabled — not whether the
 * operator has bought credentials.
 */
const HAS_AGGREGATOR = usable().some((r) => r.name !== "uniswap");

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
/**
 * The pad listens on 0.0.0.0 so the hardware can reach it over Wi-Fi, which
 * means an unset token would leave a trading API open to the whole network.
 * Generate one instead of running without auth, and print it once so the pad
 * and the browser can be pointed at it.
 */
const GENERATED = !process.env.PAD_TOKEN;

/** The address the pad can actually reach — not 127.0.0.1, which it cannot. */
function lanAddress() {
  for (const list of Object.values(networkInterfaces()))
    for (const n of list || [])
      if (n.family === "IPv4" && !n.internal) return `http://${n.address}:${PORT}`;
  return `http://127.0.0.1:${PORT}`;
}
const TOKEN = process.env.PAD_TOKEN || randomBytes(16).toString("hex");

/**
 * The market the pad opens on.
 *
 * It used to be hardcoded "ETH", which on a Solana build meant the panel led
 * with a ticker the venue cannot trade and a price from a different chain's
 * feed. The first symbol the active venue lists is the only defensible default.
 */
const DEFAULT_MARKET = process.env.MARKET || CHAIN.markets().symbols[0];

/**
 * The risk limits a fresh store is seeded with, for THIS build.
 *
 * DEFAULT_LIMITS carries Base's allowlist, and seeding it on a Solana build
 * meant the gate refused every real market with "SPYx is not in the allowlist
 * [ETH, WETH, USDC, cbBTC, ...]" — a correct refusal for an incorrect reason.
 * An allowlist is a statement about what may be traded, so it has to be drawn
 * from what this venue can trade at all.
 */
const CHAIN_LIMITS = {
  ...DEFAULT_LIMITS,
  allow: [...CHAIN.markets().symbols, CHAIN.markets().quoteAsset],
};

export const state = {
  agent: "momentum",        // the baton: which agent the keys act through
  market: DEFAULT_MARKET,
  sizeUsd: 50,              // the knob
  armed: true,
  pending: null,            // a signal waiting on YES/NO
  lastFill: null,
  lastScan: null,
  // What the last wipe cost, settled at the moment it happened. Kept in the
  // process and never written back — a record of the wipe living inside the
  // store would mean the wipe had not really wiped, which is the one claim
  // this product must not fudge.
  wipeCost: null,
  log: [],
};

const note = (m) => { state.log.unshift({ t: new Date().toISOString(), m }); state.log.length = Math.min(state.log.length, 50); console.log("  " + m); };

/**
 * Spot price from the active venue, cached briefly.
 *
 * /pad is polled by the hardware and by every open browser tab. Quoting the
 * aggregator on each of those would be rude and slow; a few seconds of staleness
 * on a price that is already a quote is not a lie worth avoiding.
 */
const PRICE_TTL_MS = Number(process.env.PRICE_TTL_MS || 6000);
const priceCache = new Map();
async function chainPrice(symbol) {
  const hit = priceCache.get(symbol);
  if (hit && Date.now() - hit.at < PRICE_TTL_MS) return hit.v;
  try {
    const v = await CHAIN.price(symbol);
    priceCache.set(symbol, { at: Date.now(), v });
    return v;
  } catch {
    // Say nothing rather than something stale: a price with no timestamp on a
    // 2.8" panel reads as current no matter how old it is.
    return hit ? hit.v : null;
  }
}

export function createServer(mem) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    // viem hands back bigints (wei, raw balances); JSON has no bigint, so
    // serialise them as strings rather than crashing the server.
    const jsonSafe = (_k, v) => (typeof v === "bigint" ? v.toString() : v);
    const send = (code, body) => {
      if (res.headersSent) return;
      res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" });
      res.end(JSON.stringify(body, jsonSafe));
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" });
      return res.end();
    }

    // /setup is deliberately open: it is where the operator supplies the token,
    // so requiring the token to reach it would lock a fresh install out of
    // itself. It only ever writes to the app's own config file, and it binds to
    // the LAN, so it refuses any request that did not come from this machine.
    const open = url.pathname === "/setup" || url.pathname === "/health"
      || url.pathname === "/" || url.pathname === "/index.html"
      || url.pathname === "/favicon.ico"
      || url.pathname.startsWith("/fonts/");
    if (!open && TOKEN) {
      const auth = req.headers.authorization || "";
      const given = auth.startsWith("Bearer ") ? auth.slice(7) : req.headers["x-pad-token"];
      if (given !== TOKEN) return send(401, { error: "bad pad token" });
    }

    // A known path reached with the wrong verb is 405, not 404. Answering
    // "no such route" for `POST /pad` is a lie — the route exists — and it
    // sends the caller looking for a missing endpoint instead of a wrong
    // method. It misled me while testing this very server.
    //
    // This runs BEFORE any handler, and that placement is the whole point.
    // The check used to sit at the bottom, after every route, so it only ever
    // saw requests nothing had matched — and seven handlers matched on the
    // path alone without looking at the method. `POST /markets` therefore
    // answered 200 and quietly did a GET's work. Enforcing the table up front
    // means a handler cannot accept a verb the table does not list, and a new
    // route cannot reintroduce the hole by forgetting to check.
    const allowedMethods = ROUTE_METHODS[url.pathname];
    if (allowedMethods && !allowedMethods.includes(req.method)) {
      res.setHeader("Allow", allowedMethods.join(", "));
      return send(405, {
        error: `${req.method} is not allowed on ${url.pathname} — use ${allowedMethods.join(" or ")}`,
      });
    }

    if (url.pathname === "/voice" && req.method === "POST") {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const pcm = Buffer.concat(chunks);
      // A request with no audio in it is not a question.
      if (pcm.length === 0) return send(400, { error: "no audio in the request body" });
      try {
        const transcript = await stt(pcmToWav(pcm));
        // Deepgram heard nothing — silence, or noise it could not resolve. Say
        // so and stop. Handing an empty transcript to the brain made it answer
        // as though something had been asked: an empty POST came back with a
        // confident spoken portfolio summary, invented out of no input at all.
        // That is the one thing this agent must never do, and it cost a
        // Deepgram call and a Claude call to do it.
        if (!transcript.trim()) {
          const reply = "I didn't catch that. Say it again?";
          note("heard nothing — no answer invented");
          const quiet = await tts(reply);
          res.writeHead(200, { "content-type": "application/octet-stream",
            "x-transcript": "", "x-reply": encodeURIComponent(reply), "x-action": "UNHEARD" });
          return res.end(quiet);
        }
        const brief = await mem.recallBrief();
        const market = await getMarket([state.market]).catch(() => ({ prices: {} }));

        // An order goes through the same decide() gate as an automated signal;
        // anything else is just answered out loud.
        let reply, verdict = null;
        // Which brain answered. "memory" means both language models were
        // unreachable and the reply came from the store alone.
        let brain = null;
        const sig = parseIntent(transcript, state.agent, state.market);
        // The operator named a market and it resolved to nothing. Refusing and
        // asking again is the only safe answer: falling back to whatever is in
        // hand is how a spoken "ETH" becomes a VIRTUAL position.
        if (sig?.needsMarket) {
          const say = `I heard ${sig.side.toLowerCase()} ${sig.sizeUsd} dollars, but not which market — ` +
                      `"${sig.heard}" is not one I trade. Say it again.`;
          note(`heard "${transcript}" -> unresolved market "${sig.heard}"`);
          const out2 = await tts(say);
          res.writeHead(200, { "content-type": "application/octet-stream",
            "x-transcript": encodeURIComponent(transcript), "x-reply": encodeURIComponent(say),
            "x-action": "UNCLEAR" });
          return res.end(out2);
        }
        if (sig) {
          verdict = decide(sig, brief);
          state.pending = { sig, verdict, market };
          reply = verdict.action === "EXECUTE"
            ? `${sig.side} ${sig.sizeUsd} dollars of ${sig.symbol}. ${verdict.why.slice(-1)[0]}. Press yes to confirm.`
            : `I can't. ${verdict.why.slice(-1)[0]}.`;
        } else {
          const answer = await think(transcript, brief, market, mem);
          reply = answer.text;
          brain = answer.brain;
        }
        await mem.journal({ evaluated: { heard: transcript },
                            acted: { action: sig ? "PROPOSED" : "ANSWERED", executed: false },
                            forward: { reply } });
        note(`heard "${transcript}" -> ${reply.slice(0, 60)}`);
        const out = await tts(reply);
        res.writeHead(200, { "content-type": "application/octet-stream",
          "x-transcript": encodeURIComponent(transcript), "x-reply": encodeURIComponent(reply),
          "x-action": verdict ? verdict.action : "ANSWER",
          // "memory" means both language models were unreachable and this came
          // from the store alone. The pad and the desk say so rather than
          // presenting a degraded answer as a normal one.
          ...(brain ? { "x-brain": brain } : {}) });
        return res.end(out);
      } catch (e) {
        console.error("[voice]", e.message);
        if (!res.headersSent) { res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: String(e.message) })); }
        return;
      }
    }

    // An unparseable body used to become `{}`, so `POST /key` with broken JSON
    // answered "unknown key ''" — a true statement about a consequence, and a
    // useless one about the cause. An empty body is still `{}`, because several
    // routes legitimately take none; only a non-empty body that will not parse
    // is an error, and it says so.
    const body = await new Promise((r) => {
      const c = []; req.on("data", (d) => c.push(d));
      req.on("end", () => {
        const raw = Buffer.concat(c).toString().trim();
        if (!raw) return r({});
        try { r(JSON.parse(raw)); } catch (e) { r({ __malformed: e.message }); }
      });
    });
    if (body.__malformed)
      return send(400, { error: `request body is not valid JSON: ${body.__malformed}` });

    try {
      // ── first run: no credentials anywhere ──────────────────────────────
      // A packaged app has no .env and no shell environment. Without this the
      // window opens onto a working-looking desk whose mic silently fails.
      if (url.pathname === "/setup") {
        const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
        if (!local) return send(403, { error: "setup is only reachable from the machine running the app" });

        if (req.method === "GET") {
          const html = await readFile(new URL("../renderer/setup.html", import.meta.url));
          res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
          return res.end(html);
        }
        if (req.method === "POST") {
          // What was sent is checked before where it would go: a submission that
          // is empty is the caller's mistake either way, and answering 500 for
          // it points the finger at the wrong side.
          const fields = { DEEPGRAM_API_KEY: body.deepgram, PAD_TOKEN: body.token, CHAIN_MODE: body.chainMode };
          const lines = Object.entries(fields)
            .filter(([, v]) => typeof v === "string" && v.trim())
            .map(([k, v]) => `${k}=${v.trim()}`);
          if (!lines.length) return send(400, { error: "nothing to save" });

          const dir = process.env.XORR_USER_DATA;
          if (!dir) return send(500, { error: "no config directory — the desk app supplies this" });

          await mkdir(dir, { recursive: true });
          const file = path.join(dir, ".env");

          // MERGE, never replace. Re-opening setup to change the pad token and
          // submitting without re-typing the Deepgram key must not delete the
          // Deepgram key — which is exactly what writing the whole file did.
          const existing = new Map();
          try {
            for (const line of (await readFile(file, "utf8")).split("\n")) {
              const at = line.indexOf("=");
              if (at > 0 && !line.startsWith("#")) existing.set(line.slice(0, at), line.slice(at + 1));
            }
          } catch { /* first run — nothing to keep */ }
          for (const [k, v] of Object.entries(fields))
            if (typeof v === "string" && v.trim()) existing.set(k, v.trim());
          const body_ = [...existing].map(([k, v]) => `${k}=${v}`).join("\n");
          await writeFile(file, body_ + "\n", { mode: 0o600 });
          // Live, without a restart — every credential in this app is read at
          // call time precisely so this works.
          for (const [k, v] of Object.entries(fields)) if (v && String(v).trim()) process.env[k] = String(v).trim();
          // Hand back the token that is actually in force, not the one typed.
          // An empty field means "leave it alone", so the page must not redirect
          // with the blank it was given — that opens the desk with ?token= and
          // locks the operator out of their own app with every pane empty.
          return send(200, { ok: true, saved: lines.map((l) => l.split("=")[0]), file,
                             token: existing.get("PAD_TOKEN") || TOKEN });
        }
        return send(405, { error: "GET or POST" });
      }

      if (url.pathname === "/" || url.pathname === "/index.html") {
        const html = await readFile(new URL("../renderer/index.html", import.meta.url));
        // The page is the app. Letting a client cache it means an edit ships
        // and the window keeps rendering yesterday's build, which reads as
        // "the fix did not work" rather than "you are looking at a cached page".
        res.writeHead(200, { "content-type": "text/html; charset=utf-8",
                             "cache-control": "no-store, must-revalidate" });
        return res.end(html);
      }

      // The two faces ship with the repo rather than loading from a CDN: the
      // pad has to work on venue wi-fi, and a readout whose type fails to
      // arrive is a readout nobody can trust.
      // Every real browser asks for this before it has a token, and an app
      // whose first request 401s shows a blank icon in the tab and a red line
      // in the network panel on every single load. It is the same icon the
      // packaged .app ships, so there is nothing here to protect.
      if (url.pathname === "/favicon.ico") {
        try {
          const buf = await readFile(new URL("../build/icon.png", import.meta.url));
          res.writeHead(200, { "content-type": "image/png", "cache-control": "public, max-age=86400" });
          return res.end(buf);
        } catch { return send(404, { error: "no icon" }); }
      }

      if (url.pathname.startsWith("/fonts/")) {
        const name = path.basename(url.pathname);
        if (!/^[a-z0-9-]+\.woff2$/.test(name)) return send(404, { error: "no such font" });
        try {
          const buf = await readFile(new URL(`../renderer/fonts/${name}`, import.meta.url));
          res.writeHead(200, { "content-type": "font/woff2", "cache-control": "public, max-age=31536000, immutable" });
          return res.end(buf);
        } catch { return send(404, { error: "no such font" }); }
      }

      // ── the display pod's chart ─────────────────────────────────────────
      // The pad's 1.54" screen draws the market in hand as a line. Hourly
      // closes from the same cached candle feed /pad prices from, so this
      // never touches the chain either, and the newest close is the live
      // price. A dead feed still answers 200 — with no closes and the reason —
      // so the screen can say why instead of freezing on a stale line.
      if (url.pathname === "/pad/chart" && req.method === "GET") {
        const sym = state.market;
        const hours = Math.min(Math.max(Number(url.searchParams.get("hours")) || 48, 12), 168);
        try {
          const ref = MARKETS[sym]?.binance;
          if (!ref) throw new Error(`${sym} has no reference feed`);
          const c = await klines(ref, { limit: hours + 1 });
          const closes = c.map((k) => Number(k.close.toPrecision(6)));
          const last = closes[closes.length - 1];
          const dayAgo = closes.length > 24 ? closes[closes.length - 25] : NaN;
          return send(200, {
            symbol: sym, price: last,
            change24h: dayAgo > 0 ? +(((last - dayAgo) / dayAgo) * 100).toFixed(2) : null,
            hi: Math.max(...closes), lo: Math.min(...closes), hours, closes,
          });
        } catch (e) {
          return send(200, { symbol: sym, price: null, change24h: null, closes: [],
                             error: String(e.message || e).slice(0, 80) });
        }
      }

      // ── the physical pad's one poll ──────────────────────────────────────
      // Everything the ESP32 needs to light its LED and label its keys, in a
      // single cheap request it can make once a second.
      //
      // It deliberately touches NEITHER the chain nor a swap quote: prices come
      // from the cached candle feed. A pad whose status light goes dark every
      // time the Base node hiccups is worse than no light at all, so this route
      // must not be able to 503.
      if (url.pathname === "/pad" && req.method === "GET") {
        const brief = await mem.recallBrief().catch(() => null);
        const px = await feedPrices().catch(() => ({}));
        const hrs = marketHours();
        // Reachability and price both come from the venue in hand. Asking the
        // Base fork whether Solana is up produced `chainOk: false` next to a
        // live Jupiter quote — two true-looking fields disagreeing about the
        // same chain.
        const [chainOk, livePrice] = await Promise.all([
          CHAIN.info().then(() => true).catch(() => false),
          chainPrice(state.market),
        ]);

        // Unrealised P&L against the entry prices the store remembers. With no
        // remembered entry there is no cost basis, and the field is null rather
        // than a zero the pad would render as "flat".
        let unrealised = null, basis = 0, open = 0, held = 0, priced = 0;
        for (const [sym, pos] of Object.entries(brief?.positions || {})) {
          if (!(pos.qty > 0)) continue;
          held++;
          const p = sym === "USDC" ? 1 : px[sym] ?? (sym === "WETH" ? px.ETH : null);
          if (p == null) continue;
          priced++;
          open  += pos.qty * p;
          basis += pos.qty * Number(pos.avg_entry_usd || 0);
        }
        // The pad prints this as the book's P&L, so it has to be the book's. A
        // market whose reference feed is down drops out of `prices()` silently,
        // and a number covering two of three positions reads exactly like a
        // number covering three. Same reasoning as the null above: say nothing
        // rather than something that reads as more than it is.
        if (basis > 0 && priced === held) unrealised = Math.round((open - basis) * 100) / 100;

        return send(200, {
          ok: true,
          mode: CHAIN.id === "solana" ? "solana" : CHAIN.id,
          armed: state.armed,
          agent: state.agent,
          market: state.market,
          sizeUsd: state.sizeUsd,
          pending: !!state.pending,
          verdict: state.pending?.verdict?.action || null,
          chainOk,
          remembers: !!brief?.limits,
          positions: Object.keys(brief?.positions || {}).length,
          rules: (brief?.rules || []).length,
          spentToday: Number.isFinite(brief?.spent_today) ? brief.spent_today : null,
          dayLimit: brief?.limits?.max_day_usd ?? null,
          unrealised,
          unpriced: held - priced,   // why `unrealised` is null, when it is
          price: livePrice ?? px[state.market] ?? null,

          // Which venue is in hand, and — the part the display leads on —
          // whether the exchange behind the asset is even open. A tokenized
          // share trades around the clock; the market it tracks does not. The
          // pad states which of those two worlds it is in rather than letting
          // a price imply the exchange is open.
          chain: CHAIN.id,
          chainLabel: CHAIN.label,
          venue: CHAIN.id === "solana" ? "jupiter" : "okx-dex",
          signing: "external",       // no venue here can sign; see chains/index.mjs
          // Flat as well as nested, on purpose: the firmware parses this body
          // by hand with a flat scanner (net.h), and giving it a nested object
          // to dig into would be handing the smallest machine in the system the
          // hardest job.
          hoursState: hrs.state,
          marketOpen: hrs.open,
          hoursNote: hrs.short,   // the pad's bar is one short line; see marketHours()
          nyTime: hrs.nyTime,
          hours: hrs,
        });
      }

      // ── the venues, and what each can actually do ────────────────────────
      // Both are reported whichever one is in hand, because "the other chain
      // is reachable" and "the other chain is configured" are different facts
      // and the difference is what you want to know before a demo.
      if (url.pathname === "/chains" && req.method === "GET") {
        const venues = await surveyChains();
        let neverSigns = false;
        try { neverSigns = await assertNeverSigns(); } catch { neverSigns = false; }
        return send(200, { active: CHAIN.id, neverSigns, venues });
      }

      // A quote from the active venue. Read-only: this prices a trade, it
      // cannot place one.
      if (url.pathname === "/quote" && req.method === "GET") {
        const sell = url.searchParams.get("sell") || "USDC";
        const buy = url.searchParams.get("buy") || state.market;
        const amount = Number(url.searchParams.get("amount") || state.sizeUsd);
        try {
          return send(200, { ...(await CHAIN.quote(sell, buy, amount)), raw: undefined });
        } catch (e) {
          return send(400, { error: String(e.message || e) });
        }
      }

      // ── speech, for the pad's amp ────────────────────────────────────────
      // The pad has no TTS of its own. It asks for a sentence and streams the
      // raw PCM straight to the amp, which is why this answers octet-stream at
      // the same 16 kHz the mic records at rather than a container format the
      // firmware would have to parse.
      if (url.pathname === "/speak" && req.method === "GET") {
        const text = (url.searchParams.get("text") || "").trim();
        // An empty body would reach the amp as a click. Say what was wrong.
        if (!text) return send(400, { error: "pass ?text= — there is nothing to say" });
        if (text.length > 400) return send(400, { error: "text too long: 400 characters is the ceiling" });
        try {
          const pcm = await tts(text);
          res.writeHead(200, { "content-type": "application/octet-stream",
                               "content-length": pcm.length,
                               "x-sample-rate": "16000" });
          return res.end(pcm);
        } catch (e) {
          return send(502, { error: `speech failed: ${String(e.message || e).slice(0, 120)}` });
        }
      }

      if (url.pathname === "/health")
        return send(200, { ok: true, mode: IS_FORK ? "fork" : "mainnet", agent: state.agent,
                           armed: state.armed, pending: !!state.pending,
                           market: state.market, sizeUsd: state.sizeUsd,
                           // The store this process actually opened. Anything that
                           // reads the same memory should ask rather than assume.
                           memoryDb: state.memoryDb || null });

      if (url.pathname === "/memory" && req.method === "GET")
        return send(200, await mem.recallBrief());

      // Everything Sibyl holds, tier by tier — not the decision-shaped summary.
      // The operator asked to see the whole store, so show the whole store.
      if (url.pathname === "/memory/full" && req.method === "GET")
        return send(200, await mem.fullStore(Number(url.searchParams.get("limit")) || 60));

      // The deck's own history. Without this the UI could only ever show what
      // was clicked in that one tab — every physical pad press and every
      // automated tick would be invisible, and a refresh would erase it all.
      if (url.pathname === "/log" && req.method === "GET")
        return send(200, { log: state.log });

      if (url.pathname === "/memory/wipe" && req.method === "POST") {
        // Photograph the store on the way out and settle the cost immediately.
        // Recomputing it later compared a historical snapshot against a store
        // that had since regrown, which reported "lost -7 journal events" and
        // listed nothing as lost from tiers the wipe had certainly emptied.
        const preWipe = await mem.fullStore(200).catch(() => null);
        const out = await mem.wipe();
        if (preWipe)
          state.wipeCost = { at: new Date().toISOString(),
                             ...diffStores(preWipe, await mem.fullStore(200).catch(() => null)) };
        // Any outstanding ✓ was reasoned from limits, positions and rules that
        // no longer exist. Honouring it would execute against forgotten facts,
        // so the wipe invalidates it and the operator has to decide again.
        const dropped = !!state.pending;
        state.pending = null;
        note("MEMORY WIPED — the agent has forgotten its limits, positions and rules"
             + (dropped ? "; the pending decision was voided with it" : ""));
        return send(200, { ...out, pendingVoided: dropped });
      }

      // Teach it its limits again. Without this a wipe is one-way until the
      // process restarts, so the demo could only ever be run once.
      if (url.pathname === "/memory/seed" && req.method === "POST") {
        const limits = body.limits || CHAIN_LIMITS;
        await mem.setReference("risk/limits", limits);
        note(`re-taught: $${limits.max_trade_usd}/trade, $${limits.max_day_usd}/day`);
        return send(200, { limits });
      }

      // Run the measured-edge book across every market. This is the pad's
      // actual trading brain, and it is honest about finding nothing.
      if (url.pathname === "/scan") {
        const r = await scan();
        state.lastScan = r;
        note(`SCAN — ${r.summary}`);
        return send(200, r);
      }

      // A live ✓ must survive a page refresh. Without this the signal pane came
      // back empty while the pad would still have executed on YES — a decision
      // you can no longer see is not a decision you can consent to.
      if (url.pathname === "/pending")
        return send(200, state.pending
          ? { pending: true, signal: state.pending.sig, verdict: state.pending.verdict }
          : { pending: false });

      // The last book run, whoever ran it. Without this a scan triggered from
      // the physical pad updated the server and never appeared on the desk.
      if (url.pathname === "/scan/last")
        return send(200, state.lastScan || { markets: [], signals: [], summary: null });

      // ── the code that provisions the pad ────────────────────────────────
      // Typing http://192.168.1.19:8080 and a token into a captive portal on a
      // phone keyboard, in front of an audience, is where a demo dies.
      if (url.pathname === "/padqr") {
        const { svg } = await import("./qr.mjs");
        const lan = lanAddress();
        const payload = `${lan}|${TOKEN}`;
        try {
          return send(200, { svg: svg(payload, { scale: 5 }), url: lan, token: TOKEN, payload });
        } catch (e) { return send(500, { error: String(e.message || e) }); }
      }

      if (url.pathname === "/markets")
        return send(200, {
          markets: MARKETS, delisted: DELISTED, active: state.market,
          // Shown, priced and explained — never silently omitted. A judge should
          // see that the equities are real and why the pad will not trade them
          // from a fork.
          equities: STOCKS, equitiesUnlisted: STOCKS_UNLISTED,
          // Read from each equity's own pool. The B20 token reverts on a fork
          // but the pool is ordinary bytecode, so these are real prices even
          // here — and they are the POOL's price, which is what you would pay,
          // not the share price on an exchange.
          equityPrices: await stockPrices(pub).catch(() => ({})),
          equitiesBlocked: Object.fromEntries(STOCK_SYMBOLS.map((s) =>
            [s, stockBlocker(s, { isFork: IS_FORK, hasAggregator: HAS_AGGREGATOR })])),
        });

      if (url.pathname === "/reflect" && req.method === "GET")
        return send(200, await reflect(mem));

      if (url.pathname === "/reflect/accept" && req.method === "POST") {
        if (!body.proposal?.id) return send(400, { error: "body must be {proposal:{id,…}}" });
        const r = await acceptRule(mem, body.proposal);
        note(`learned a rule: ${r.text}`);
        return send(200, r);
      }
      if (url.pathname === "/reflect/reject" && req.method === "POST") {
        if (!body.proposal?.id) return send(400, { error: "body must be {proposal:{id,…}}" });
        return send(200, await rejectRule(mem, body.proposal));
      }

      // Rules that cannot do what they claim. An accepted rule reads like a
      // guarantee; one that can never fire is worse than none at all.
      if (url.pathname === "/memory/contradictions" && req.method === "GET") {
        const b = await mem.recallBrief();
        return send(200, { findings: findContradictions(b.rules || [], b.limits), rules: (b.rules || []).length });
      }

      // Forget deliberately: retire rules nothing has needed. Archived with the
      // reason, never deleted, so the operator can still read them back.
      if (url.pathname === "/memory/decay" && req.method === "POST") {
        // `Number(body.days) || 14` would turn an explicit 0 back into 14 —
        // silently ignoring the caller and retiring nothing.
        const d = Number(body.days);
        const r = await decayRules(mem, { days: Number.isFinite(d) && d >= 0 ? d : 14 });
        if (r.archived.length) note(`retired ${r.archived.length} unused rule(s): ${r.archived.join(", ")}`);
        return send(200, r);
      }

      // What the pad knew at a moment in the past, rebuilt by replaying the
      // journal up to that timestamp — the temporal tier used as a time
      // machine rather than a log.
      if (url.pathname === "/memory/at" && req.method === "GET") {
        const ts = url.searchParams.get("ts");
        if (!ts || Number.isNaN(Date.parse(ts)))
          return send(400, { error: "pass ?ts=<ISO timestamp>" });
        return send(200, await stateAt(mem, ts));
      }

      // What a wipe actually cost, measured against the snapshot taken as it
      // happened. Held in the process, not the store — writing it to the store
      // would mean the wipe had not really wiped.
      if (url.pathname === "/memory/diff" && req.method === "GET") {
        if (!state.wipeCost) return send(200, { had: null, note: "nothing has been wiped this session" });
        return send(200, state.wipeCost);
      }

      // Recall as the first thing that happens: what the pad remembers, in one
      // sentence, before it is trusted with anything.
      if (url.pathname === "/briefing" && req.method === "GET")
        return send(200, { text: await briefing(mem) });

      // Trade size. The pad's knob is a mock part with no encoder, so the size
      // has to be settable from somewhere — it was pinned at $50 with no route,
      // no key and no control, which meant the operator could not size a trade
      // at all. Clamped to the remembered per-trade cap so this cannot be used
      // to walk around the risk limits.
      if (url.pathname === "/size" && req.method === "POST") {
        const asked = Number(body.usd);
        if (!Number.isFinite(asked) || asked <= 0)
          return send(400, { error: "body must be {usd:<positive number>}" });
        const brief = await mem.recallBrief();
        const cap = brief.limits?.max_trade_usd ?? NO_MEMORY_LIMITS.max_trade_usd;
        const sizeUsd = Math.min(Math.round(asked * 100) / 100, cap);
        state.sizeUsd = sizeUsd;
        await mem.setState("baton", { agent: state.agent, market: state.market, sizeUsd,
                                      at: new Date().toISOString() });
        note(`size -> $${sizeUsd}${sizeUsd < asked ? ` (asked $${asked}, capped by the remembered $${cap} limit)` : ""}`);
        return send(200, { sizeUsd, asked, cappedBy: sizeUsd < asked ? cap : null });
      }

      // Disarming is one-way from the red key and from /panic. Re-arming is
      // its own deliberate act, so nobody re-arms by mashing KILL twice.
      if (url.pathname === "/arm" && req.method === "POST") {
        state.armed = true;
        note("ARMED — trading re-enabled");
        return send(200, { armed: true });
      }

      if (url.pathname === "/portfolio")
        return send(200, await snapshot(mem));

      if (url.pathname === "/tick" && req.method === "POST") {
        const r = await runOnce(mem, { execute: state.armed && IS_FORK });
        if (r.fill) { state.lastFill = r.fill; note(`FILL ${r.fill.hash.slice(0, 12)}… ${Number(r.fill.received).toFixed(6)} ${r.fill.receivedSymbol}`); }
        return send(200, r);
      }

      if (url.pathname === "/panic" && req.method === "POST") {
        state.armed = false; state.pending = null;
        note("PANIC — disarmed, pending cleared");
        return send(200, { armed: false });
      }

      if (url.pathname === "/key" && req.method === "POST") {
        // Key ids are lowercase, but market symbols are not (cbBTC, EURC).
        // Resolve a symbol case-insensitively before flattening the rest.
        const raw = String(body.id || "");
        const asSymbol = SYMBOLS.find((k) => k.toLowerCase() === raw.toLowerCase())
          || Object.keys(DELISTED).find((k) => k.toLowerCase() === raw.toLowerCase())
          || STOCK_SYMBOLS.find((k) => k.toLowerCase() === raw.toLowerCase())
          || Object.keys(STOCKS_UNLISTED).find((k) => k.toLowerCase() === raw.toLowerCase());
        return send(200, await onKey(mem, asSymbol || raw.toLowerCase()));
      }

      // Wrong-verb requests never reach here — ROUTE_METHODS is enforced
      // before any handler runs. What is left is genuinely an unknown path.
      return send(404, { error: "no such route" });
    } catch (e) {
      console.error("[route]", url.pathname, e.message);
      if (res.headersSent) return;
      // Distinguish "the trade failed" from "the chain is not answering": they
      // need completely different things from the operator.
      const msg = String(e.message || e);
      if (/timed out|took too long|fetch failed|ECONNREFUSED/i.test(msg))
        return send(503, { error: "the Base node at :8545 did not answer in time. Nothing was traded." });
      return send(500, { error: msg.split("\n")[0] });
    }
  });
}

/** The deck. Every physical key lands here — and so does every UI click, so a
 *  dead switch never blocks a demo. */
async function onKey(mem, id) {
  const AGENTS = ["dca", "grid", "momentum", "rebalance", "yield", "risk"];

  if (AGENTS.includes(id)) {
    state.agent = id;
    await mem.setState("baton", { agent: id, market: state.market, sizeUsd: state.sizeUsd,
                                  at: new Date().toISOString() });
    note(`baton -> ${id}`);
    return { ok: true, agent: id };
  }

  // Pick which market the buy/sell keys act on. The pad has one knob and a
  // fixed deck, so the market cycles rather than needing a key each.
  if (id === "market" || SYMBOLS.includes(id) || DELISTED[id] || isStock(id) || STOCKS_UNLISTED[id]) {
    const next = id === "market"
      ? SYMBOLS[(SYMBOLS.indexOf(state.market) + 1) % SYMBOLS.length]
      : id;
    // Tokenized equities are real markets with real depth, but they cannot be
    // reached from here yet — and the two reasons are different, so say which.
    if (isStock(next) || STOCKS_UNLISTED[next]) {
      const why = stockBlocker(next, { isFork: IS_FORK, hasAggregator: HAS_AGGREGATOR });
      if (why) return { ok: false, error: why };
    }
    if (!MARKETS[next]) {
      const why = delistReason(next);
      return { ok: false, error: why ? `${next} is delisted — ${why}` : `unknown market '${next}'` };
    }
    state.market = next;
    await mem.setState("baton", { agent: state.agent, market: next, sizeUsd: state.sizeUsd,
                                  at: new Date().toISOString() });
    note(`market -> ${next} (${MARKETS[next].class})`);
    return { ok: true, market: next, class: MARKETS[next].class };
  }

  if (id === "scan") {
    const r = await scan();
    state.lastScan = r;
    note(`SCAN — ${r.summary}`);
    if (r.signals.length) {
      const top = r.signals[0];
      const brief = await mem.recallBrief();
      const sig = { agent: top.strategy, side: top.side, symbol: top.symbol,
                    sizeUsd: state.sizeUsd, reason: top.rationale, confidence: top.confidence };
      const verdict = decide(sig, brief);
      state.pending = { sig, verdict, market: { prices: Object.fromEntries(r.markets.filter(m=>m.price).map(m=>[m.symbol,m.price])) } };
      note(`${sig.side} ${sig.symbol} $${sig.sizeUsd} -> ${verdict.action} $${verdict.sizeUsd}`);
      return { ok: true, scan: r, signal: sig, verdict, awaiting: verdict.action === "EXECUTE" ? "yes/no" : null };
    }
    return { ok: true, scan: r, signal: null, verdict: null };
  }

  if (id === "buy" || id === "sell") {
    const brief = await mem.recallBrief();
    const market = await getMarket([state.market]);
    const sig = { agent: state.agent, side: id.toUpperCase(), symbol: state.market,
                  sizeUsd: state.sizeUsd, reason: `${id} pressed on the pad`, confidence: 1 };
    const verdict = decide(sig, brief);
    state.pending = { sig, verdict, market };
    // A refusal decided HERE used to leave no trace at all. The journal only
    // ever recorded what the operator rejected by pressing NO — never what the
    // gate itself refused — so the store could not answer "what did you turn
    // down, and which rule did it", and a rule that had just vetoed a trade
    // still looked like it had never fired.
    if (verdict.action === "REJECT")
      await mem.journal({
        evaluated: { signal: sig },
        acted: { action: "REJECT", usd: 0, executed: false,
                 ...(verdict.vetoedBy ? { vetoedBy: verdict.vetoedBy } : {}) },
        forward: { why: verdict.why },
      });
    note(`${id.toUpperCase()} ${state.market} $${state.sizeUsd} -> ${verdict.action} $${verdict.sizeUsd}`);
    return { ok: true, signal: sig, verdict, awaiting: verdict.action === "EXECUTE" ? "yes/no" : null };
  }

  if (id === "yes" || id === "no") {
    const p = state.pending;
    if (!p) return { ok: false, error: "nothing pending" };
    // The kill switch has to stop the HUMAN path too, not just the automated
    // one. Pending is deliberately left intact: re-arm and the same ✓ stands.
    if (id === "yes" && !state.armed) {
      note("YES refused — the pad is disarmed");
      return { ok: false, error: "disarmed — re-arm before trading", armed: false };
    }
    state.pending = null;
    // The answer is the training signal reflection later learns from.
    await mem.journal({
      evaluated: { signal: p.sig, verdict: p.verdict },
      acted: { action: id === "yes" ? "APPROVED" : "REJECTED", usd: p.verdict.sizeUsd, executed: false },
      forward: { by: "operator", key: id },
    });
    if (id === "no") { note(`rejected ${p.sig.side} ${p.sig.symbol}`); return { ok: true, rejected: true }; }
    if (p.verdict.action !== "EXECUTE") return { ok: false, error: "that signal was not executable" };

    // ── the ✓ on a venue the pad cannot sign for ──────────────────────────
    //
    // Solana and X Layer both hand back an unsigned transaction rather than a
    // receipt. The pad has reasoned its way to a trade and a person has agreed
    // to it; what remains is a signature, and the key for that is not here.
    //
    // The quote is taken again at this moment rather than reused from the
    // proposal. Seconds have passed since the gate ran — on a market that
    // trades while its exchange is shut, that is exactly when a price moves —
    // and confirming against a stale number would be signing for something
    // other than what was shown.
    if (CHAIN.id !== "base") {
      const [sell, buy] = p.sig.side === "BUY"
        ? [CHAIN.markets().quoteAsset, p.sig.symbol]
        : [p.sig.symbol, CHAIN.markets().quoteAsset];
      try {
        const fresh = await CHAIN.quote(sell, buy, p.verdict.sizeUsd);
        const built = CHAIN.buildSwap ? await CHAIN.buildSwap(fresh).catch((e) => ({ error: String(e.message || e) })) : null;

        // Journalled as handed off, never as filled. The pad does not watch the
        // chain for this signature and must not claim an outcome it cannot see.
        await mem.journal({
          evaluated: { signal: p.sig, verdict: p.verdict, quote: { out: fresh.amountOut, price: fresh.price, route: fresh.route } },
          acted: { action: "HANDED_OFF", usd: p.verdict.sizeUsd, executed: false },
          forward: { venue: fresh.venue, signing: "external" },
        });
        note(`${p.sig.side} ${p.sig.symbol} $${p.verdict.sizeUsd} -> ${fresh.amountOut.toFixed(6)} via ${fresh.route} — built, unsigned`);

        return {
          ok: true,
          handoff: true,
          quote: { ...fresh, raw: undefined },
          transaction: built?.unsignedTx ? { unsignedTx: built.unsignedTx, signWith: built.signWith } : null,
          buildError: built?.error || null,
          note: built?.unsignedTx
            ? "built and unsigned — sign it with your own wallet; the pad holds no key"
            : `quoted only — ${CHAIN.label} execution stays with you`,
        };
      } catch (e) {
        return { ok: false, error: `could not price that on ${CHAIN.label}: ${String(e.message || e)}` };
      }
    }

    // A read-only mainnet session has no wallet at all. Say that here, before
    // the balance check below — otherwise the refusal reads "no USDC to spend",
    // which is true of the zero address but describes the wrong problem, and
    // would let a funded WATCH_ADDRESS get further than it should.
    if (READ_ONLY)
      return { ok: false, error:
        "this is a read-only mainnet session — there is no signing key, so nothing can be executed. " +
        "Set AGENT_PRIVATE_KEY to trade." };

    const px = p.market.prices[p.sig.symbol];
    const [sell, buy] = p.sig.side === "BUY" ? ["USDC", p.sig.symbol] : [p.sig.symbol, "USDC"];
    let amountIn = p.sig.side === "BUY" ? p.verdict.sizeUsd : p.verdict.sizeUsd / px;
    // On a fork, top the quote asset up rather than running dry mid-session.
    // fundOnFork only replenishes below its floor and is a no-op on mainnet by
    // construction, so this can never mint money where money is real. Without
    // it the wallet drained over a long session and the next buy came back
    // "insufficient USDC: need 25, have 0.000034" — which reads as a broken app
    // and is really a sandbox that ran out of pretend money.
    if (IS_FORK && sell === "USDC" && (await spendable("USDC")) < amountIn) {
      const f = await fundOnFork().catch((e) => ({ funded: false, quoteAsset: e.message }));
      note(f.funded ? `topped the fork wallet up to ${Number(f.usdc || 0).toFixed(2)} USDC`
                    : `could not top up the fork wallet: ${f.quoteAsset || f.reason}`);
    }

    // The operator's ✓ and the automation spend the same day's money, so they
    // take the same lock and re-read the same number. Without it a YES landing
    // mid-tick reasons against a spend figure the tick is about to change.
    return await withTradeLock(async () => {
      const day = await dayBudget(mem, { NO_MEMORY_LIMITS });
      if (day.left <= 0) {
        note(`YES refused — $${day.spent} already executed today, the day's budget is gone`);
        return { ok: false, error: `daily budget exhausted — $${day.spent} of $${day.max} already executed today` };
      }
      if (p.verdict.sizeUsd > day.left) {
        note(`clamped to the day's room: $${p.verdict.sizeUsd} -> $${day.left}`);
        p.verdict.sizeUsd = day.left;
        amountIn = p.sig.side === "BUY" ? day.left : day.left / px;
      }

      // clamp to what the wallet actually holds, so an over-sized proposal
      // degrades to a smaller real trade instead of reverting
      const have = await spendable(sell);
      if (have <= 0) return { ok: false, error: `no ${sell} to spend` };
      if (amountIn > have) { note(`clamped to balance: ${amountIn.toFixed(4)} -> ${have.toFixed(4)} ${sell}`); amountIn = have * 0.999; }
      const fill = await swap(sell, buy, Number(amountIn.toFixed(6)));
      // The fill, not the proposal: amountIn above may have been clamped twice
      // over — to the day's remaining room and again to the wallet balance —
      // and the position has to record the trade that happened.
      await applyFill(mem, { symbol: p.sig.symbol, side: p.sig.side, usd: p.verdict.sizeUsd, price: px, agent: p.sig.agent, fill });
      await mem.journal({ evaluated: { signal: p.sig },
                          acted: { action: "FILL", usd: p.verdict.sizeUsd, executed: true, hash: fill.hash },
                          forward: { received: fill.received } });
      state.lastFill = fill;
      note(`FILL ${fill.hash.slice(0, 12)}… ${Number(fill.received).toFixed(6)} ${fill.receivedSymbol}`);
      return { ok: true, fill };
    });
  }

  if (id === "base") return onKey(mem, "scan");   // the white key runs the book
  if (id === "portfolio") return { ok: true, ...(await snapshot(mem)) };
  // Stopping voids the decision on the table as well as disarming — the same
  // as POST /panic. A loaded ✓ left behind a kill switch is exactly what bites:
  // the operator stops, walks away, and a later re-arm makes a decision reasoned
  // from stale prices executable again. Proposing while stopped is still
  // allowed, and THAT proposal is held across a re-arm (see the yes/no branch).
  if (id === "kill")      { state.armed = false; state.pending = null; note("KILL"); return { ok: true, armed: false }; }
  // The physical pad's mic key streams straight to POST /voice; the on-screen
  // one records in the browser and does the same. Neither routes through here,
  // and answering {ok:true} made a dead on-screen key look like it had worked.
  if (id === "mic")
    return { ok: false, error: "the mic is not a server-side key — record and POST to /voice" };

  return { ok: false, error: `unknown key '${id}'` };
}


/**
 * What the pad knew at a past moment.
 *
 * read_events(until=ts) gives the journal up to that instant; replaying it
 * rebuilds the positions it held and the rules it had accepted by then. This
 * is the temporal tier used as a time machine rather than a log — and it is
 * honest about its limits: it reconstructs what the journal recorded, so
 * anything never journalled cannot be recovered.
 */
export async function stateAt(mem, ts) {
  const events = await mem.eventsBetween({ until: ts, limit: 1000 }).catch(() => []);
  const positions = {}, rules = [], fills = [];
  let spent = 0;
  const parse = (v) => (typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return null; } })() : v);

  for (const e of events) {
    const ev = parse(e.evaluated), ac = parse(e.acted), fw = parse(e.forward);
    if (ac?.action === "RULE_ACCEPTED" && ev?.proposal) rules.push(ev.proposal);
    if (ac?.action !== "FILL" || !ev?.signal) continue;
    const sig = ev.signal, usd = Number(ac.usd) || 0;
    spent += usd;
    const got = Number(fw?.received) || 0;
    const px = got > 0 ? usd / got : 0;
    const cur = positions[sig.symbol] || { qty: 0, avg_entry_usd: 0 };
    if (sig.side === "BUY") {
      const q = px > 0 ? usd / px : 0;
      const newQty = cur.qty + q;
      positions[sig.symbol] = { qty: newQty,
        avg_entry_usd: newQty ? ((cur.qty * cur.avg_entry_usd) + usd) / newQty : px };
    } else {
      const q = px > 0 ? usd / px : cur.qty;
      const newQty = Math.max(0, cur.qty - q);
      if (newQty * (px || 0) < 0.01) delete positions[sig.symbol];
      else positions[sig.symbol] = { qty: newQty, avg_entry_usd: cur.avg_entry_usd };
    }
    fills.push({ ts: e.ts, side: sig.side, symbol: sig.symbol, usd });
  }
  return { at: ts, replayed: events.length, positions, rules, spent, fills: fills.slice(-12) };
}

/** What a wipe cost, tier by tier. */
export function diffStores(before, after) {
  const rows = (s, cat) => (s?.entities?.[cat] || []).map((r) => r.name);
  const cats = [...new Set([...Object.keys(before?.entities || {}), ...Object.keys(after?.entities || {})])];
  const lost = {};
  for (const c of cats) {
    const b = rows(before, c), a = new Set(rows(after, c));
    const gone = b.filter((n) => !a.has(n));
    if (gone.length) lost[c] = gone;
  }
  const refs = Object.keys(before?.references || {}).filter((k) => !(after?.references || {})[k]);
  const states = Object.keys(before?.state || {}).filter((k) => !(after?.state || {})[k]);
  return {
    had: {
      entities: Object.fromEntries(cats.map((c) => [c, rows(before, c).length])),
      references: Object.keys(before?.references || {}).length,
      state: Object.keys(before?.state || {}).length,
      journal: (before?.journal || []).length,
    },
    lost: { entities: lost, references: refs, state: states,
            journal: Math.max(0, (before?.journal || []).length - (after?.journal || []).length) },
  };
}

/**
 * What the pad remembers, in one sentence, said before it is trusted with
 * anything. If it remembers nothing it says exactly that, because an agent
 * that opens by implying it knows you when it does not is the failure this
 * whole product is about.
 */
export async function briefing(mem) {
  const b = await mem.recallBrief().catch(() => null);
  if (!b) return "I cannot reach my memory, so I know nothing. Nothing should be traded on my say-so.";
  if (!b.limits)
    return "I remember nothing — no limits, no positions, no rules. Until you teach me again I will refuse anything but the smallest trade.";
  const bits = [`I remember your limits: $${b.limits.max_trade_usd} a trade, $${b.limits.max_day_usd} a day.`];
  const pos = Object.entries(b.positions || {});
  bits.push(pos.length
    ? `You are holding ${pos.map(([s, p]) => `${Number(p.qty).toFixed(4)} ${s}`).join(" and ")}.`
    : "You are flat.");
  if (b.rules?.length) bits.push(`${b.rules.length} rule${b.rules.length === 1 ? "" : "s"} you taught me ${b.rules.length === 1 ? "is" : "are"} in force.`);
  if (Number.isFinite(b.spent_today) && b.spent_today > 0) bits.push(`$${b.spent_today} has already gone out today.`);
  return bits.join(" ");
}


/**
 * Touch everything the pad will read, so the fork answers from its own state.
 * Same job as warm.mjs, run automatically at boot rather than by hand.
 */
async function warmFork() {
  const t0 = Date.now();
  const { quote } = await import("./dex.mjs");
  const { balances } = await import("./chain.mjs");
  const { SYMBOLS } = await import("./markets.mjs");
  const jobs = [balances().then(() => true).catch(() => false)];
  for (const sym of SYMBOLS) {
    jobs.push(quote("USDC", sym, 25).then(() => true).catch(() => false));
    jobs.push(quote(sym, "USDC", sym === "cbBTC" ? 0.0005 : sym === "ETH" ? 0.01 : 5)
      .then(() => true).catch(() => false));
  }
  const done = await Promise.all(jobs);
  return { ok: done.filter(Boolean).length, total: done.length, ms: Date.now() - t0 };
}

/**
 * Which verbs each route answers. Used only to turn a wrong-method request into
 * a truthful 405 instead of a 404 that claims the route does not exist.
 */
const ROUTE_METHODS = {
  "/pad/chart": ["GET"],
  "/health": ["GET"], "/pad": ["GET"], "/speak": ["GET"], "/portfolio": ["GET"],
  "/markets": ["GET"], "/memory": ["GET"], "/memory/full": ["GET"], "/log": ["GET"],
  "/briefing": ["GET"], "/reflect": ["GET"], "/pending": ["GET"], "/scan/last": ["GET"],
  "/memory/contradictions": ["GET"], "/memory/at": ["GET"], "/memory/diff": ["GET"],
  "/padqr": ["GET"], "/scan": ["GET"], "/chains": ["GET"], "/quote": ["GET"],
  "/voice": ["POST"], "/key": ["POST"], "/arm": ["POST"], "/panic": ["POST"],
  "/tick": ["POST"], "/size": ["POST"], "/memory/wipe": ["POST"], "/memory/seed": ["POST"],
  "/memory/decay": ["POST"], "/reflect/accept": ["POST"], "/reflect/reject": ["POST"],
  "/setup": ["GET", "POST"],
};

export async function start() {
  const mem = new Memory();
  await mem.ping();
  // Resolved once, at boot: Memory falls back to ~/.sibyl-memory/memory.db when
  // SIBYL_DB is unset, and nothing downstream could tell which store it got.
  try { state.memoryDb = (await mem.where())?.db || null; } catch { state.memoryDb = null; }
  const brief = await mem.recallBrief();
  // The baton remembers the size, so a restart does not silently reset it.
  if (Number.isFinite(brief.baton?.sizeUsd)) state.sizeUsd = brief.baton.sizeUsd;
  if (!brief.limits) {
    await mem.setReference("risk/limits", CHAIN_LIMITS);
    console.log(`  seeded risk limits: $${CHAIN_LIMITS.max_trade_usd}/trade, ` +
                `$${CHAIN_LIMITS.max_day_usd}/day, ${CHAIN_LIMITS.allow.length} markets on ${CHAIN.label}`);
  }
  const srv = createServer(mem);
  // Wait for the bind to actually succeed. Returning as soon as listen() is
  // called reported success while the port was owned by someone else, and the
  // desk app then opened a window onto a backend it did not start — which for
  // a trading app means confirming trades against the wrong server.
  await new Promise((resolve, reject) => {
    srv.once("error", (e) => reject(e.code === "EADDRINUSE"
      ? new Error(`port ${PORT} is already in use. Another xorr-pad (or a stale one) is running: stop it, or set PORT to something else.`)
      : e));
    srv.listen(PORT, HOST, () => { srv.removeAllListeners("error"); resolve(); });
  });
  {
    console.log(`xorrpad backend on http://${HOST}:${PORT}  (${CHAIN.label}, quotes only, auth on)`);
    if (GENERATED) {
      console.log(`  no PAD_TOKEN was set, so one was generated for this run:`);
      console.log(`  ${TOKEN}`);
      console.log(`  open  http://localhost:${PORT}/?token=${TOKEN}`);
      console.log(`  set PAD_TOKEN in the environment to keep it stable across restarts.`);
    }
  }
  // A fork's wallet starts with nothing the pad can spend: anvil's account #0
  // holds no USDC in Base mainnet state, so the operator's very first buy came
  // back "insufficient USDC" on a freshly-started fork. Top it up at boot —
  // never on mainnet, where fundOnFork is a no-op by construction.
  // Only when the Base venue is the one in hand. On a Solana or X Layer build
  // there is no fork to fund, and trying produced two alarming lines at every
  // boot ("fork wallet could NOT be funded", "0/13 reads cached") describing a
  // chain this run never touches.
  if (IS_FORK && CHAIN.id === "base") {
    const f = await fundOnFork().catch((e) => ({ funded: false, quoteAsset: e.message }));
    if (f.funded) console.log(`  fork wallet: ${f.usdc?.toFixed(2) ?? "?"} USDC${f.swapped ? " (topped up)" : ""}`);
    else console.log(`  fork wallet could NOT be funded: ${f.quoteAsset || f.reason}`);

    // Pull every pool and balance the pad will touch into the fork's cache,
    // in the background. anvil fetches state lazily from a rate-limited
    // upstream, so the FIRST read of an uncached slot can take 30s or simply
    // time out — and it happens mid-trade, which reads as the app hanging.
    // Leaving this to the operator to remember running by hand is not a
    // property you want a demo to depend on. It does not block the bind.
    warmFork().then((r) => console.log(`  fork warmed: ${r.ok}/${r.total} reads cached in ${r.ms}ms`))
              .catch((e) => console.log(`  fork could not be warmed: ${String(e.message || e).slice(0, 80)}`));
  }

  // A listener from here on keeps a late socket error from taking the app down.
  srv.on("error", (e) => console.error("[server]", e.message));
  return { srv, mem };
}

// run directly (argv[1] may be relative, so resolve before comparing)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) start();
