/**
 * voice.mjs — hold the mic key, talk, hear the answer.
 *
 *   PCM in -> speech-to-text -> a brain that has read memory -> text-to-speech
 *
 * Speech is Deepgram (verified working). The brain is whichever is available:
 *
 *   claude   the Claude Code CLI (`claude -p`). Preferred, because Sibyl wires
 *            itself into Claude Code as a memory provider, so the same store
 *            the pad writes is the one the model reads.
 *   groq     a Groq chat model, when GROQ_API_KEY has model access. On this
 *            account every model is currently blocked at the project level.
 *
 * Whatever answers, it is handed recallBrief() first — the spoken reply is
 * grounded in the same memory that gates the trades.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);

// Read the credentials at CALL time, not at import time. Caching them in a
// const here means a key that arrives later is invisible forever — which is
// exactly what happens when the packaged app collects one on first run and
// writes it into the environment after the modules have already loaded. It also
// made the test suite report "DEEPGRAM_API_KEY missing" as a product failure
// when the only thing missing was a shell export.
const dgKey   = () => process.env.DEEPGRAM_API_KEY || "";
const groqKey = () => process.env.GROQ_API_KEY || "";
// The models this account can actually reach, newest first. Groq retires model
// ids often, so try a list rather than pinning one that will 404 next month.
const GROQ_MODELS = (process.env.GROQ_MODEL || "").split(",").filter(Boolean).length
  ? process.env.GROQ_MODEL.split(",").map((m) => m.trim())
  : ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "groq/compound-mini", "qwen/qwen3.6-27b"];
const SR = 16000;

export const BRAIN = process.env.BRAIN || "claude";

/** raw 16-bit PCM -> a WAV Deepgram will accept */
export function pcmToWav(pcm, sampleRate = SR) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22); h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/**
 * Every call out of this file carries a deadline. Without one, a hung provider
 * hangs POST /voice forever: the browser's request never returns, the mic key
 * sits on "TRANSCRIBING…", and there is nothing on screen to say why.
 */
const DEADLINE = (ms) => ({ signal: AbortSignal.timeout(ms) });

export async function stt(wav) {
  if (!dgKey()) throw new Error("DEEPGRAM_API_KEY missing");
  const r = await fetch(
    "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true",
    { method: "POST", headers: { Authorization: `Token ${dgKey()}`, "content-type": "audio/wav" },
      body: wav, ...DEADLINE(30_000) });
  if (!r.ok) throw new Error(`stt ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const j = await r.json();
  return j.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() || "";
}

export async function tts(text) {
  if (!dgKey()) throw new Error("DEEPGRAM_API_KEY missing");
  const r = await fetch(
    `https://api.deepgram.com/v1/speak?model=aura-2-thalia-en&encoding=linear16&sample_rate=${SR}`,
    { method: "POST", headers: { Authorization: `Token ${dgKey()}`, "content-type": "application/json" },
      body: JSON.stringify({ text }), ...DEADLINE(30_000) });
  if (!r.ok) throw new Error(`tts ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return Buffer.from(await r.arrayBuffer());
}

/** The memory a spoken answer must be grounded in. */
// The pad trades assets from $0.64 to $79,000. Rounding to whole dollars said
// AERO was "at $1" out loud, which is simply a wrong number spoken with
// confidence — scale the precision to the magnitude, as the readout does.
function usd(v) {
  const n = Number(v);
  if (!isFinite(n)) return "unknown";
  const a = Math.abs(n);
  return "$" + n.toFixed(a >= 1000 ? 0 : a >= 100 ? 2 : a >= 1 ? 2 : a >= 0.01 ? 4 : 6);
}

function groundIn(brief, market) {
  const pos = Object.entries(brief.positions || {})
    .map(([s, p]) => `${s} ${Number(p.qty).toFixed(5)} @ ${usd(p.avg_entry_usd)}`).join(", ") || "none";
  const px = Object.entries(market?.prices || {})
    .map(([s, v]) => `${s} ${usd(v)}`).join(", ") || "unknown";
  return [
    // Every field is optional. A brief missing one is a caller's bug, but the
    // brain answering "I cannot" beats it throwing where the answer would go.
    `Risk limits: ${brief?.limits ? `$${brief.limits.max_trade_usd}/trade, $${brief.limits.max_day_usd}/day, allowed ${(brief.limits.allow || []).join("/")}` : "NONE REMEMBERED"}.`,
    `Open positions: ${pos}.`,
    `Learned rules: ${(brief.rules || []).map((r) => r.text || r.id).join("; ") || "none"}.`,
    `Prices: ${px}.`,
    `Active agent: ${brief.baton?.agent || "momentum"}.`,
  ].join("\n");
}

const SYSTEM =
  "You are the voice of xorr-pad, a trading deck on someone's desk. Answer in ONE short " +
  "spoken sentence, under 25 words, no markdown, no lists. You are given the pad's memory " +
  "— use it and cite the concrete number when it matters. Never invent a price or a balance.";

/**
 * The Claude brain, through the CLI rather than the API.
 *
 * Auth is the operator's own Claude subscription, so there is no
 * ANTHROPIC_API_KEY and no per-token billing. That is the entire reason for the
 * CLI path and it is why this is the default brain.
 *
 * Three things this call does that the naive version did not:
 *
 * 1. **Every tool is disallowed.** The prompt embeds a Deepgram transcript and
 *    the pad's own journal — text the operator spoke and text other code wrote.
 *    Handing that to a CLI that can run Bash, edit files or fetch URLs is a
 *    prompt-injection surface on a machine holding a funded wallet. The brain
 *    needs to produce one sentence; it needs no tools at all.
 * 2. **It never blocks on a permission prompt.** Headless with a tty-less
 *    parent, a permission request would hang until the timeout and look like a
 *    dead brain. Skipping prompts is only safe *because* of (1).
 * 3. **JSON, not scraped text.** `--output-format json` returns an envelope
 *    with an `is_error` flag; the old code took the last non-empty stdout line,
 *    which silently turned an error message into the pad's spoken answer.
 */
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-opus-5";
const CLAUDE_TIMEOUT_MS = Number(process.env.CLAUDE_TIMEOUT_MS || 60000);
const NO_TOOLS = ["Bash", "Read", "Edit", "Write", "Glob", "Grep",
                  "WebSearch", "WebFetch", "Task", "NotebookEdit"];

async function brainClaude(question, context) {
  const prompt = `${SYSTEM}\n\n--- pad memory ---\n${context}\n--- end memory ---\n\nOperator said: "${question}"`;
  const args = [
    "-p", prompt,
    "--output-format", "json",
    "--model", CLAUDE_MODEL,
    "--dangerously-skip-permissions",
    "--disallowed-tools", ...NO_TOOLS,
  ];
  const { stdout } = await exec("claude", args,
    { timeout: CLAUDE_TIMEOUT_MS, maxBuffer: 1 << 20 });

  // The envelope, or the raw text if a future CLI stops wrapping it.
  let env = null;
  try { env = JSON.parse(stdout); } catch { return stdout.trim().split("\n").filter(Boolean).pop() || ""; }
  if (env?.is_error) throw new Error(`claude: ${String(env.result || "unknown error").slice(0, 160)}`);
  const out = String(env?.result ?? "").trim();
  // One sentence is what gets spoken; a model that reasons out loud gets its
  // last line taken rather than the whole monologue read to the operator.
  return out.split("\n").filter(Boolean).pop() || "";
}

async function brainGroq(question, context) {
  const refusals = [];
  for (const model of GROQ_MODELS) {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey()}`, "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 80, messages: [
        { role: "system", content: SYSTEM + "\n\n--- pad memory ---\n" + context },
        { role: "user", content: question }] }),
      ...DEADLINE(20_000),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) return j.choices?.[0]?.message?.content?.trim() || "";
    const code = j?.error?.code || `http_${r.status}`;
    refusals.push(`${model}: ${code}`);
    // A blocked or missing model is worth trying the next one for; anything
    // else (bad key, rate limit) will fail identically on every model.
    if (!/model_not_found|model_permission_blocked/.test(code)) break;
  }
  // Say what is actually wrong and where to fix it, rather than "groq failed".
  const blocked = refusals.every((x) => /model_permission_blocked/.test(x));
  throw new Error(blocked
    ? `every Groq model is disabled for this project/org — enable them at ` +
      `console.groq.com > Settings > Model permissions. Tried: ${refusals.join(", ")}`
    : `groq unavailable — ${refusals.join(", ")}`);
}

// Spoken tickers get spelled out, and speech-to-text renders "E T H" as
// anything from "eth" to "e t h" to "an e t". Glue single-letter runs back
// together before matching so the pad hears a ticker as a ticker.
const glue = (s) => s.replace(/\b(?:[a-z][\s.]+)+[a-z]\b/g, (m) => m.replace(/[\s.]/g, ""));

// One alias set per tradeable market, spelled the way people actually say them.
const ALIASES = {
  // "ETA" is what Deepgram returns for a spoken "ETH" often enough to have
  // bought the wrong asset once. "E T A" and "eath" are the same slip.
  // "e t eight" is Deepgram spelling E-T-H aloud and hearing the H as "eight".
  // Same slip as "eta", same consequence if it goes unmatched.
  ETH:     /\b(eth|eta|eath|ether|ethereum|eeth|aeth|e\s?t\s?a|e\s?t\s?(?:eight|ate|h))\b/,
  USDC:    /\b(usdc|usd\s?c|you\s?s\s?d\s?c|dollars?coin)\b/,
  cbBTC:   /\b(cbbtc|bitcoin|btc|cb\s?btc|bit\s?coin)\b/,
  EURC:    /\b(eurc|euro|euros|eur|yuroc)\b/,
  AERO:    /\b(aero|aerodrome|arrow)\b/,
  MORPHO:  /\b(morpho|morfo|morph)\b/,
  VIRTUAL: /\b(virtual|virtuals|vertual)\b/,
};

/**
 * Pull the operator's own history into the answer.
 *
 * recallBrief() carries the current state: limits, open positions, accepted
 * rules. It does not carry what HAPPENED — and "have I bought AERO before?" is
 * a question about the journal, not the balance sheet. Sibyl's FTS5 search
 * spans every tier, so ask it with the question's own salient words and hand
 * the model what it finds.
 */
const STOP = new Set(["what","when","where","which","have","has","did","do","does","is","are","was",
  "the","a","an","my","me","i","you","of","in","on","at","to","for","and","or","how","much","many",
  "ever","before","again","any","it","that","this","tell","show","about","with"]);

/**
 * Positions the operator used to hold, read from the archive.
 *
 * Closed positions are archived rather than deleted, but `archived_entities` is
 * a separate table and is NOT in Sibyl's FTS index — so searching the tiers for
 * "AERO" finds the journal entries and the baton and misses the one record that
 * actually says what was held and what it closed at. Without this the agent
 * answers "no record" to "have I ever held AERO?" while holding exactly that
 * record.
 */
async function closedPositions(mem, terms) {
  if (!mem?.listArchived || !terms?.length) return "";
  try {
    const rows = await mem.listArchived({ limit: 50 });
    // Match on what the ARCHIVE holds, not on the alias table. Filtering by
    // known tickers meant a closed position could only be recalled if its
    // symbol was also a configured market — so anything delisted, renamed, or
    // simply not in ALIASES became unrecallable the moment it closed, which is
    // exactly the history the archive exists to keep.
    const want = new Set(terms.map((t) => String(t).toUpperCase()));
    const mine = (rows || []).filter(
      (r) => r.category === "position" && want.has(String(r.name).toUpperCase()));
    if (!mine.length) return "";
    const lines = mine.map((r) => {
      const when = r.archived_at ? String(r.archived_at).slice(0, 16).replace("T", " ") : "";
      return `- ${r.name} — ${r.reason || "closed"}${when ? ` (${when})` : ""}`;
    });
    return `\nPositions you USED to hold, from the archive (these are closed, not open):\n${lines.join("\n")}`;
  } catch { return ""; }
}

async function recallHistory(mem, question) {
  if (!mem) return "";
  const raw = String(question).toLowerCase();
  // Speech-to-text hears "Arrow" for AERO and "virtuals" for VIRTUAL. Search
  // the store for the TICKER the journal actually wrote, not the word the
  // transcriber guessed, or the history is invisible to the question about it.
  const tickers = Object.keys(ALIASES).filter((sym) => ALIASES[sym].test(glue(raw)));
  const words = raw.replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w)).slice(0, 3);
  const terms = [...new Set([...tickers, ...words])].slice(0, 5);
  if (!terms.length) return "";
  try {
    // searchTiers carries Sibyl's verdict. "I have no record of that" and "I
    // have never recorded anything" are different answers, and an agent that
    // cannot tell them apart is guessing at which one it is giving.
    const res = await mem.searchTiers(terms.join(" "), { limit: 6 });
    const hits = res?.hits || [];
    const code = res?.verdict?.code;
    if (!hits.length) {
      // The archive is NOT in the FTS index — closed positions live in their own
      // table — so a miss here does not mean the operator never held it.
      const closed = await closedPositions(mem, terms);
      if (closed) return closed;
      if (code === "EMPTY_STORE")
        return "\nYour memory is EMPTY — nothing has ever been recorded. Say so plainly; do not imply you checked a history that does not exist.";
      if (code === "NO_MATCH")
        return `\nYou searched your history for "${terms.join(" ")}" and found nothing, but the store DOES hold other records. The honest answer is "no record of that", not "I do not know".`;
      return "";
    }
    const lines = hits.map((h) => {
      const when = h.ts ? String(h.ts).slice(0, 16).replace("T", " ") : "";
      const what = typeof h.snippet === "string" ? h.snippet.slice(0, 120) : JSON.stringify(h.body || {}).slice(0, 120);
      return `- ${h.tier}${h.category ? `/${h.category}` : ""} ${when} ${what}`;
    });
    const note = tickers.length
      ? `\nThe operator may have said a ticker the transcriber garbled; it resolves to ${tickers.join(", ")}. Answer about that ticker.`
      : "";
    return `${note}\nFrom your own history (searched for "${terms.join(" ")}"):\n${lines.join("\n")}${await closedPositions(mem, terms)}`;
  } catch { return ""; }
}

/**
 * The answer when no language model can be reached at all.
 *
 * Not a mock and not an invention: every number below is read straight out of
 * the pad's own memory, and the reply says plainly that it is answering without
 * a brain. The alternative — throwing — means a spoken question gets silence
 * from a pad that is holding the answer, which is the worse failure. It is the
 * same posture as the rest of the product: refuse out loud, with the reason.
 */
function brainFallback(question, brief, market) {
  const q = String(question || "").toLowerCase();
  const lim = brief?.limits;
  const say = [];

  if (/\b(limits?|caps?|per.?trade|how much can i)\b/.test(q))
    say.push(lim ? `Your limits are ${lim.max_trade_usd} dollars a trade and ${lim.max_day_usd} a day`
                 : "I have no limits remembered");
  if (/\b(hold|holding|positions?|own|bags?)\b/.test(q)) {
    const pos = Object.entries(brief?.positions || {});
    say.push(pos.length
      ? `You are holding ${pos.map(([sym, p]) => `${Number(p.qty).toFixed(4)} ${sym}`).join(", ")}`
      : "You are holding nothing");
  }
  if (/\b(spent|spend|today|budget|left)\b/.test(q) && Number.isFinite(brief?.spent_today))
    say.push(`You have spent ${Math.round(brief.spent_today)} dollars today`);
  if (/\b(rules?|learn(ed|t)?|remember(ed)?|taught)\b/.test(q)) {
    const rules = brief?.rules || [];
    say.push(rules.length ? `${rules.length} rule${rules.length > 1 ? "s" : ""} learned from your answers`
                          : "no rules learned yet");
  }
  if (/\b(prices?|worth|trading at)\b/.test(q)) {
    const px = Object.entries(market?.prices || {});
    if (px.length) say.push(px.map(([sym, v]) => `${sym} at ${Math.round(v)} dollars`).join(", "));
  }

  const head = "My language model is unreachable, so this is straight from memory.";
  return say.length ? `${head} ${say.join(". ")}.`
                    : `${head} Ask me about your limits, your positions, or what you have spent today.`;
}

/**
 * Answer a spoken question. Returns the text and which brain produced it, so the
 * desk and the pad can show whether they are hearing Claude, Groq, or memory
 * alone — a degraded answer that looks identical to a real one is a trap.
 */
export async function think(question, brief, market, mem = null) {
  const context = groundIn(brief, market) + (await recallHistory(mem, question));
  const order = BRAIN === "groq" && groqKey()
    ? [["groq", () => brainGroq(question, context)], ["claude", () => brainClaude(question, context)]]
    : [["claude", () => brainClaude(question, context)], ["groq", () => groqKey() ? brainGroq(question, context) : Promise.reject(new Error("no groq key"))]];

  const tried = [];
  for (const [name, run] of order) {
    try {
      const text = await run();
      if (text) return { text, brain: name };
      tried.push(`${name}: empty answer`);
    } catch (e) { tried.push(`${name}: ${String(e.message || e).slice(0, 80)}`); }
  }
  // Both brains are gone. Answer from memory rather than saying nothing.
  console.error("[voice] no brain reachable —", tried.join(" | "));
  return { text: brainFallback(question, brief, market), brain: "memory" };
}

const WORDS = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10,
  eleven:11, twelve:12, fifteen:15, twenty:20, thirty:30, forty:40, fifty:50, sixty:60,
  seventy:70, eighty:80, ninety:90, hundred:100, "a hundred":100, thousand:1000 };

/** "$50", "50 dollars", "fifty bucks", "two hundred" -> 50 / 50 / 50 / 200 */
export function parseAmount(t) {
  const digits = t.match(/\$\s*(\d+(?:\.\d+)?)|\b(\d+(?:\.\d+)?)\s*(?:dollars|dollar|usd|bucks)\b/);
  if (digits) return Number(digits[1] ?? digits[2]);
  const two = t.match(/\b(one|two|three|four|five|six|seven|eight|nine)\s+(hundred|thousand)\b/);
  if (two) return WORDS[two[1]] * WORDS[two[2]];
  for (const [w, n] of Object.entries(WORDS))
    if (new RegExp(`\\b${w}\\b`).test(t)) return n;
  const bare = t.match(/\b(\d+(?:\.\d+)?)\b/);
  return bare ? Number(bare[1]) : null;
}

/** Does this sound like an order? Returns a signal, or null for chit-chat. */
export function parseIntent(text, fallbackAgent = "momentum", market = "ETH") {
  const raw = (text || "").toLowerCase();
  const t = glue(raw);
  // "buy", "by" and "my" are homophones and speech-to-text picks the wrong one
  // often enough to kill a real order — Deepgram has returned both "By $50 of
  // ETH." and "My $50 of ETH." for the same sentence. Accept the impostors as
  // the verb ONLY when immediately followed by an amount, where no other
  // reading exists: "by the way", "go by", "my per-trade limit" and "what's my
  // balance" never match that shape.
  const AMOUNT_WORD = "(one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|a\\s+hundred|hundred)";
  const impostor = new RegExp(`\\b(?:by|my)\\s+(?:\\$?\\d|${AMOUNT_WORD}\\b)`);
  const buyish = /\b(buy|long|add|accumulate)\b/.test(t) || impostor.test(t);
  const side = buyish ? "BUY"
             : /\b(sell|short|dump|exit|close)\b/.test(t) ? "SELL" : null;
  if (!side) return null;
  const usd = parseAmount(t);
  if (usd == null) return null;
  const matched = Object.keys(ALIASES).find((s) => ALIASES[s].test(t));

  // "buy forty dollars" with NO market named is still an order — the pad always
  // has one in hand, so use it. But if the operator clearly named something and
  // it resolved to nothing, substituting the market in hand is how you buy the
  // wrong asset: "Buy $50 of ETH" came back from the transcriber as "ETA" and
  // bought VIRTUAL, because VIRTUAL happened to be in hand. Say so instead.
  if (!matched) {
    // What is left after the verb, the amount and the filler words? Anything
    // still standing was meant to name a market, and it resolved to nothing.
    //
    // This used to require an "of" before the name. The transcriber does not
    // reliably produce one: "Buy fifty dollars of Zorblax" came back as
    // "Buy $50 Absorb Locks." — no preposition, no alias match — so the guard
    // never fired and the pad proposed BUY $50 of ETH, the market that happened
    // to be in hand. Substituting a different asset for a word it did not
    // recognise is the worst failure this product has, and it is exactly the
    // bug the "ETA" case was supposed to close.
    const leftover = t
      .replace(/\b(buy|long|add|accumulate|sell|short|dump|exit|close|by|my)\b/g, " ")
      .replace(/\$?\d[\d,.]*/g, " ")
      .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\b/g, " ")
      .replace(/\b(dollars?|bucks?|usd|of|in|into|worth|please|now|the|a|an|some|more|it|that|this|them|market|position|again|and|for|to|my)\b/g, " ")
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/).filter((w) => w.length > 1);

    if (leftover.length)
      return { needsMarket: true, side, sizeUsd: usd, heard: leftover.join(" "),
               reason: `spoken: "${text}"` };
  }

  const sym = matched || market;
  return { agent: fallbackAgent, side, symbol: sym,
           sizeUsd: usd, reason: `spoken: "${text}"`, confidence: 1,
           assumedMarket: matched ? undefined : market };
}
