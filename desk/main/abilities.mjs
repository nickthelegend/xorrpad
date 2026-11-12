import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import path from "node:path";
import { appDataDir } from "./permissions.mjs";
export const ABILITIES = [
  [
    "voice",
    "Voice Trader",
    "Hold to talk. Your agent hears you, checks your rules, and proposes the next move.",
    "wave",
    "Microphone · Deepgram · your model",
    "VOICE",
  ],
  [
    "auto",
    "Auto-accept",
    "A little more autonomy. Always inside the boundaries you set.",
    "shieldCheck",
    "Explicit venue/product scope · all trading gates",
    "AUTO",
  ],
  [
    "signals",
    "Signals",
    "Your measured-edge book, one real market at a time.",
    "trendingUp",
    "Public history · proposal queue",
    "SIGNALS",
  ],
  [
    "hedge",
    "Prediction Hedge",
    "Find an outcome that pays when your perp position loses.",
    "shield",
    "Public Phoenix authority · pm-AMM quotes",
    "HEDGE",
  ],
  [
    "pulse",
    "Market Pulse",
    "Give your TFT a live market to follow.",
    "bolt",
    "Public Jupiter quotes · TFT state",
    "PULSE",
  ],
  [
    "discipline",
    "Discipline",
    "A daily budget, and space to reset after a confirmed loss.",
    "lock",
    "Daily cap · confirmed realized PnL · cooldown",
    "DISCIPLINE",
  ],
  [
    "backtest",
    "Backtest a key",
    "Replay the strategy on real history before it earns a key.",
    "repeat",
    "Historical candles · current fees · gated proposals",
    "BACKTEST",
  ],
  [
    "morning",
    "Morning Brief",
    "Plug in. Hear your positions and markets before you start.",
    "calendar",
    "Watched wallet · Deepgram speaker",
    "BRIEF",
  ],
].map(([id, name, description, icon, permissions, label]) => ({
  id,
  name,
  description,
  icon,
  permissions,
  label,
}));
export class Abilities {
  constructor({
    pad,
    permissions,
    configured,
    request,
    scan,
    speak,
    publish,
    capture,
    dir = appDataDir(),
  }) {
    Object.assign(this, {
      pad,
      permissions,
      configured,
      request,
      scan,
      speak,
      publish,
      capture,
    });
    this.file = path.join(dir, "abilities.json");
  }
  state() {
    try {
      return JSON.parse(readFileSync(this.file, "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      return {};
    }
  }
  save(s) {
    mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    writeFileSync(this.file + ".tmp", JSON.stringify(s), { mode: 0o600 });
    renameSync(this.file + ".tmp", this.file);
  }
  async missing(id) {
    if (
      ["voice", "morning"].includes(id) &&
      !(await this.configured("deepgram"))
    )
      return "Setup required: Deepgram API key in Agent";
    if (id === "voice" && !(await this.configured("model")))
      return "Setup required: select a model in Agent";
    if (
      ["hedge", "morning"].includes(id) &&
      !process.env[id === "hedge" ? "PHOENIX_AUTHORITY" : "SOLANA_ADDRESS"]
    )
      return (
        "Setup required: " +
        (id === "hedge" ? "PHOENIX_AUTHORITY" : "SOLANA_ADDRESS")
      );
    return null;
  }
  async list() {
    const s = this.state();
    return {
      abilities: await Promise.all(
        ABILITIES.map(async (a) => ({
          ...a,
          installed: !!s[a.id]?.installed,
          config: s[a.id]?.config || {},
          setupRequired:
            (await this.missing(a.id)) ||
            (a.id === "discipline" && s[a.id]?.installed
              ? "Setup required: verified realized-PnL receipts for loss detection; the daily cap is active"
              : null),
          bindings: this.pad.keymap.keys
            .map((k, i) => ({ ...k, index: i }))
            .filter((k) => k.action === "ability:" + a.id),
          evidence: s[a.id]?.evidence || null,
        })),
      ),
    };
  }
  validateBindings(map) {
    const s = this.state();
    for (const k of map.keys || [])
      if (k.action?.startsWith("ability:") && !s[k.action.slice(8)]?.installed)
        throw Error("Setup required: install the ability before binding it");
  }
  captureBindings(before, after) {
    const s = this.state();
    for (const [i, k] of after.keys.entries())
      if (k.action.startsWith("ability:")) {
        const a = s[k.action.slice(8)];
        a.previous ??= {};
        if (!a.previous[i])
          a.previous[i] = before.keys.find(
            (b) => b.row === k.row && b.col === k.col,
          );
      }
    this.save(s);
  }
  async install(id, body) {
    const def = ABILITIES.find((a) => a.id === id);
    if (!def) throw Error("unknown ability");
    if (typeof body.installed !== "boolean")
      throw Error("installed must be boolean");
    const s = this.state(),
      prior = s[id];
    if (!body.installed) {
      let changed = false;
      const keys = this.pad.keymap.keys.map((k, i) => {
        if (k.action === "ability:" + id && prior?.previous?.[i]) {
          changed = true;
          return prior.previous[i];
        }
        return k;
      });
      if (changed)
        this.pad.setKeymap({ revision: this.pad.keymap.revision + 1, keys });
      s[id] = { ...prior, installed: false };
      if (id === "auto") {
        const p = this.permissions.read();
        p.autoAccept = { venues: {}, kinds: {} };
        this.permissions.write(p);
      }
      if (id === "discipline") {
        const p = this.permissions.read();
        p.lossCooldownSeconds = 0;
        this.permissions.write(p);
      }
      this.save(s);
      this.capture();
      return this.list();
    }
    const missing = await this.missing(id);
    if (missing) throw Error(missing);
    const config = body.config || {};
    if (
      Object.keys(config).some(
        (k) =>
          ![
            "market",
            "strategy",
            "venue",
            "dailyCapUsd",
            "lossCooldownSeconds",
            "autoVenue",
            "autoKind",
            "enableAuto",
          ].includes(k),
      )
    )
      throw Error("invalid ability configuration");
    const indices = body.keys || [0];
    if (
      !Array.isArray(indices) ||
      indices.length > 10 ||
      !indices.length ||
      indices.some(
        (i) =>
          !Number.isInteger(i) ||
          i < 0 ||
          i > 13 ||
          ["yes", "no", "kill", "mic"].includes(this.pad.keymap.keys[i].action),
      )
    )
      throw Error("choose programmable keys; preserve safety controls");
    for (const other of ABILITIES)
      if (
        other.id !== id &&
        indices.some(
          (i) => this.pad.keymap.keys[i].action === "ability:" + other.id,
        )
      )
        throw Error("Uninstall the other ability from this key first");
    let evidence = prior?.evidence;
    if (id === "backtest") {
      if (!config.strategy)
        throw Error("Setup required: select a BOOK strategy to replay");
      const to = Math.floor(Date.now() / 86400000) * 86400;
      const replay = await this.request("/backtest", {
        symbol: config.market || "SOL",
        from: to - 7 * 86400,
        to,
        venue: "phoenix",
        strategy: config.strategy,
        tradeUsd: 50,
      });
      if (!replay.history?.barCount)
        throw Error("Setup required: real replay history");
      evidence = {
        source: replay.history.source,
        barCount: replay.history.barCount,
        trades: replay.tradeCount,
        pnl: replay.pnl,
        at: new Date().toISOString(),
        basis:
          "Research replay with Phoenix current fees; live routing is quoted and gated again.",
      };
    }
    if (id === "auto" && config.enableAuto) {
      if (
        !["jupiter", "meteora", "phoenix", "jupperps", "pmamm"].includes(
          config.autoVenue,
        ) ||
        !["spot", "perp", "predict"].includes(config.autoKind)
      )
        throw Error("Choose the exact auto-accept venue and product");
      const p = this.permissions.read();
      p.autoAccept.venues[config.autoVenue] = true;
      p.autoAccept.kinds[config.autoKind] = true;
      this.permissions.write(p);
    }
    if (id === "discipline") {
      if (!(config.dailyCapUsd > 0) || !(config.lossCooldownSeconds > 0))
        throw Error("Daily cap and loss cooldown must be positive");
      const p = this.permissions.read();
      p.maxDayUsd = Number(config.dailyCapUsd);
      p.lossCooldownSeconds = Number(config.lossCooldownSeconds);
      this.permissions.write(p);
    }
    if (id === "pulse")
      await this.request("/key", { id: config.market || "SOL" });
    const previous = { ...(prior?.previous || {}) };
    const keys = this.pad.keymap.keys.map((k, i) => {
      if (!indices.includes(i)) return k;
      if (!previous[i]) previous[i] = k;
      return { ...k, action: "ability:" + id, label: def.label };
    });
    this.pad.setKeymap({ revision: this.pad.keymap.revision + 1, keys });
    s[id] = { installed: true, config, previous, evidence };
    this.save(s);
    this.capture();
    this.publish({ type: "abilities", id, installed: true });
    return this.list();
  }
  async run(id) {
    const a = this.state()[id];
    if (!a?.installed)
      throw Error(
        "Setup required: install " +
          (ABILITIES.find((x) => x.id === id)?.name || id),
      );
    const missing = await this.missing(id);
    if (missing) throw Error(missing);
    const c = a.config || {};
    if (id === "signals" || id === "backtest")
      return this.scan({
        ...c,
        strategy: id === "backtest" ? c.strategy : undefined,
      });
    if (id === "hedge")
      return this.request(
        "/hedge?authority=" + encodeURIComponent(process.env.PHOENIX_AUTHORITY),
      );
    if (id === "pulse") return this.request("/key", { id: c.market || "SOL" });
    if (id === "auto" || id === "discipline") return this.permissions.read();
    if (id === "voice") {
      await this.speak("Hold the microphone key. I am listening when you are.");
      return {
        ok: true,
        note: "Hold the fixed microphone key to stream audio. No recording is invented.",
      };
    }
    const p = await this.request("/portfolio");
    if (p.chain?.error) throw Error(p.chain.error);
    const entries = Object.entries(p.balances || {});
    await this.speak(
      "Morning. Here is your book. " +
        (entries.length
          ? entries
              .map(
                ([s, b]) =>
                  `${b.amount} ${s}${p.prices?.[s] ? " at " + p.prices[s] + " dollars" : ""}`,
              )
              .join(". ")
          : "The watched wallet returned no holdings."),
    );
    return { ok: true, spoken: true };
  }
}
