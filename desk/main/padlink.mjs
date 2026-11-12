/** v1/v2 NDJSON bridge. All trade inputs use the authenticated/gated API. */
import OpusScript from "opusscript";
import { EventEmitter } from "node:events";
import { Duplex } from "node:stream";
import { readFileSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  SecureSession,
  checkCRC,
  wire,
  keypair,
  rawPublic,
  transcript,
  sessionKeys,
  verifyHandshake,
  challenge,
  trustedSignal,
  fingerprint,
  verifyManifest,
  ReconnectBackoff,
} from "./pad-v2.mjs";
import { WebSocketServer, WebSocket } from "ws";
import { appDataDir } from "./permissions.mjs";

export const UART = "6e400001b5a3f393e0a9e50e24dcca9e";
export const CELLS = [
  [0, 0],
  [0, 1],
  [0, 2],
  [1, 0],
  [1, 1],
  [1, 2],
  [2, 0],
  [2, 1],
  [2, 2],
  [2, 3],
  [3, 0],
  [3, 1],
  [3, 2],
  [3, 3],
];
const ACTIONS = [
  "momentum",
  "grid",
  "dca",
  "risk",
  "yield",
  "rebalance",
  "no",
  "yes",
  "buy",
  "base",
  "kill",
  "mic",
  "sell",
  "portfolio",
];
export const DEFAULT_KEYMAP = {
  revision: 0,
  keys: CELLS.map(([row, col], i) => ({
    row,
    col,
    action: ACTIONS[i],
    label: ACTIONS[i].toUpperCase(),
  })),
};
export function validateKeymap(map) {
  if (
    !map ||
    !Number.isSafeInteger(map.revision) ||
    map.revision < 0 ||
    map.revision > 0xffffffff ||
    !Array.isArray(map.keys) ||
    map.keys.length !== 14
  )
    throw new Error("invalid keymap");
  const cells = new Set();
  for (const k of map.keys) {
    const index = CELLS.findIndex(([r, c]) => r === k.row && c === k.col);
    if (
      index < 0 ||
      cells.has(index) ||
      !/^[a-zA-Z0-9_.:-]{1,96}$/.test(k.action) ||
      !/^[\x20-\x7e]{1,16}$/.test(k.label)
    )
      throw new Error("invalid key binding");
    cells.add(index);
    for (const control of ["mic", "kill", "yes", "no"])
      if ((k.action === control) !== (ACTIONS[index] === control))
        throw new Error(`preserve ${control} control`);
  }
  return structuredClone({
    revision: map.revision,
    keys: map.keys.map(({ row, col, action, label }) => ({
      row,
      col,
      action,
      label,
    })),
  });
}
export class Lines {
  pending = Buffer.alloc(0);
  constructor(onLine) {
    this.onLine = onLine;
  }
  feed(data) {
    this.pending = Buffer.concat([this.pending, Buffer.from(data)]);
    let end;
    while ((end = this.pending.indexOf(10)) >= 0) {
      const line = this.pending.subarray(0, end);
      this.pending = this.pending.subarray(end + 1);
      if (line.length > 4095) throw new Error("pad record too large");
      const text = line.toString("utf8").trim();
      if (!text.startsWith("{")) continue; // boot/telnet diagnostics on CDC
      const message = JSON.parse(text);
      if (![1, 2].includes(message.v) || typeof message.type !== "string")
        throw new Error("unsupported pad record");
      if (
        message.v === 2 &&
        ![
          "hello",
          "pair",
          "pair_proof",
          "encrypted",
          "factory_result",
        ].includes(message.type)
      )
        throw new Error("v2 payload must be encrypted");
      this.onLine(message);
    }
    if (this.pending.length > 4095) throw new Error("pad record too large");
  }
}
const encode = (m) =>
  JSON.stringify({ v: 1, ...m }, (_k, v) =>
    typeof v === "bigint" ? v.toString() : v,
  ) + "\n";

export class PadLink extends EventEmitter {
  peers = new Set();
  seen = new Map();
  stopped = false;
  pairings = new Map();
  pendingPairings = new Map();
  killed = new Set();
  options = {
    legacyV1: false,
    holdThreshold: 100,
    brightness: 220,
    night: false,
    highContrast: false,
    speakAmounts: false,
    leftHanded: false,
    usbDebug: false,
  };
  constructor({
    baseUrl,
    token,
    signals,
    voiceInput,
    speak,
    status = () => ({}),
    dir = appDataDir(),
  } = {}) {
    super();
    Object.assign(this, { baseUrl, token, signals, status, voiceInput, speak });
    this.keymapFile = path.join(dir, "pad-keymap.json");
    this.stateDir = dir;
    this.profiles = [];
    try {
      this.profiles = JSON.parse(
        readFileSync(path.join(dir, "pad-profiles.json"), "utf8"),
      );
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    try {
      this.options = {
        ...this.options,
        ...JSON.parse(readFileSync(path.join(dir, "pad-options.json"), "utf8")),
      };
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    try {
      this.keymap = validateKeymap(
        JSON.parse(readFileSync(this.keymapFile, "utf8")),
      );
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      this.keymap = structuredClone(DEFAULT_KEYMAP);
    }
    this.onEvent = (e) => this.forward(e);
    signals?.on("event", this.onEvent);
    this.heartbeat = setInterval(() => this.maintain(), 5000);
    this.heartbeat.unref();
    this.retryTimer = setInterval(() => {
      for (const p of this.peers)
        if (p.secure) {
          try {
            for (const line of p.secure.retry()) p.write(line);
          } catch {
            this.remove(p);
          }
        }
    }, 100);
    this.retryTimer.unref();
  }
  maintain(now = Date.now()) {
      for (const peer of this.peers) {
        for (const [id, s] of peer.streams)
          if (Date.now() - (s.at || peer.last) > 15000 && !s.answering) {
            s.live?.abort();
            peer.streams.delete(id);
          }
        if (now - peer.last >= 15000)
          this.remove(peer);
        else if (peer.device) {
          if (peer.secure && peer.verified) this.send(peer, { type: "ping" });
          this.send(peer, this.getStatus(peer));
          if (peer.secure && peer.verified) this.marketPulse(peer);
        }
      }
  }
  preferred(device) {
    const rank = (p) => ({ usb: 3, ble: 2, wifi: 1 }[p.name] || 1);
    return [...this.peers].filter(p => p.device === device &&
      (!p.secure || p.verified) && Date.now() - p.last < 15000)
      .sort((a,b) => rank(b) - rank(a))[0];
  }
  snapshot() {
    return {
      observedAt: new Date().toISOString(),
      options: this.options,
      pairing: [...this.pendingPairings.values()].map(
        ({ device, pk, xpk }) => ({ device, pk, xpk }),
      ),
      devices: [...this.peers]
        .filter((p) => p.device && (!p.secure || p.verified))
        .map((p) => ({
          device: p.device,
          link: p.name,
          firmware: p.firmware,
          secure: !!p.secure,
          ota: p.otaStatus,
          telemetry: p.telemetry,
          killed: this.killed.has(p.device),
          lastSeen: new Date(p.last).toISOString(),
          status: this.getStatus(p),
        })),
    };
  }
  getStatus(peer) {
    try {
      return {
        type: "status",
        ...this.status(),
        ...this.options,
        killed: this.killed.has(peer.device),
        link: peer.name,
      };
    } catch {
      return {
        type: "status",
        armed: false,
        autoAccept: false,
        venue: "",
        link: peer.name,
      };
    }
  }
  peer(name, write, close = () => {}) {
    if (this.stopped || this.peers.size >= 16)
      throw new Error("pad link unavailable");
    const p = {
      name,
      write,
      close,
      last: Date.now(),
      tail: Promise.resolve(),
      streams: new Map(),
    };
    p.inflight = new Set();
    p.lines = new Lines((m) => {
      if (p.v2Only && m.v !== 2) throw Error("encrypted v2 transport required");
      if (p.inflight.size >= 64) throw Error("pad input backlog");
      const work = this.ingress(p, m).catch((e) =>
        this.send(p, {
          type: "result",
          id: m.id,
          ok: false,
          error: e.message,
          status: e.message.startsWith("Setup required:")
            ? "Setup required"
            : undefined,
        }),
      );
      p.inflight.add(work);
      work.finally(() => p.inflight.delete(work));
    });
    this.peers.add(p);
    return p;
  }
  remove(p) {
    if (this.peers.delete(p)) {
      this.signals?.publish({ type: "pad_link", ...this.snapshot() });
      for (const s of p.streams.values()) s.live?.abort();
      p.streams.clear();
      p.opusEncoder?.delete();
      p.opusDecoder?.delete();
      p.close();
    }
  }
  send(p, m) {
    if (!this.peers.has(p)) return;
    if (p.secure) {
      if (m.type === "tts") {
        p.audioQueue ||= [];
        if (p.audioQueue.length >= 8192) {
          p.audioQueue = [];
          this.send(p, {
            type: "error",
            code: "AUDIO_BACKLOG",
            fix: "Retry a shorter voice reply",
          });
          return;
        }
        p.audioQueue.push(m);
        this.flush(p);
        return;
      }
      if (m.type === "ack" || m.type === "ping") {
        try { p.write(p.secure.seal(m, { reliable: false })); }
        catch { this.remove(p); }
        return;
      }
      p.sendQueue ||= [];
      if (p.sendQueue.length >= 128) {
        this.remove(p);
        return;
      }
      p.sendQueue.push(m.type === "signal" ?
        { ...m, expiresAt: Date.now() + m.remainingMs } : m);
      this.flush(p);
      return;
    }
    const line = m.v === 2 ? wire(m, p.name === "usb") : encode(m);
    if (Buffer.byteLength(line) > 4096)
      throw new Error("outbound pad record too large");
    try {
      p.write(line);
    } catch {
      this.remove(p);
    }
  }
  attach(stream, name = "usb") {
    const peer = this.peer(
      name,
      (line) => {
        if (stream.writableLength > 1024 * 1024) throw new Error("pad stalled");
        stream.write(line);
      },
      () => {
        if (
          stream.isOpen &&
          !stream.closing &&
          typeof stream.close === "function"
        )
          stream.close(() => stream.destroy());
        else stream.destroy();
      },
    );
    stream.on("data", (data) => {
      try {
        peer.lines.feed(data);
      } catch {
        this.remove(peer);
      }
    });
    stream.on("error", () => this.remove(peer));
    stream.on("close", () => this.remove(peer));
    this.send(peer, { type: "ping" });
    return peer;
  }
  setKeymap(map) {
    const value = validateKeymap(map);
    if (value.revision <= this.keymap.revision)
      throw new Error("keymap revision must increase");
    mkdirSync(path.dirname(this.keymapFile), { recursive: true });
    writeFileSync(this.keymapFile + ".tmp", JSON.stringify(value) + "\n", {
      mode: 0o600,
    });
    renameSync(this.keymapFile + ".tmp", this.keymapFile);
    this.keymap = value;
    for (const p of this.peers)
      if (p.device) this.send(p, { type: "keymap", ...value });
    return value;
  }
  flush(p) {
    if (!p.secure || p.secure.pending.size) return;
    let next = p.sendQueue?.shift() || p.audioQueue?.shift();
    if (next?.type === "signal") {
      const { expiresAt, ...message } = next;
      const remainingMs = expiresAt - Date.now();
      if (remainingMs <= 0) {
        if (p.displayed?.id === next.signalId) p.displayed = null;
        this.flush(p);
        return;
      }
      next = { ...message, remainingMs };
    }
    if (!next) return;
    try {
      p.write(p.secure.seal(next));
    } catch {
      this.remove(p);
    }
  }
  async marketPulse(p) {
    if (p.pulseBusy) return;
    p.pulseBusy = true;
    try {
      const read = async (route) => {
        const r = await fetch(this.baseUrl + route, {
          headers: { authorization: `Bearer ${this.token}` },
          signal: AbortSignal.timeout(5000),
        });
        if (!r.ok) throw Error("market feed unavailable");
        return r.json();
      };
      const [pad, chart] = await Promise.all([
        read("/pad"),
        read("/pad/chart"),
      ]);
      this.send(p, {
        type: "pulse",
        market: pad.market,
        price: pad.price,
        change24h: chart.change24h,
        closes: chart.closes?.slice(-48) || [],
        unrealised: pad.unrealised,
        positions: pad.positions,
        chainOk: pad.chainOk,
        spentToday: pad.spentToday,
        dayLimit: pad.dayLimit,
        hoursState: pad.hoursState,
        hoursNote: pad.hoursNote,
        nyTime: pad.nyTime,
        marketOpen: pad.marketOpen,
      });
    } catch {
      this.send(p, {
        type: "pulse",
        price: null,
        change24h: null,
        unrealised: null,
        closes: [],
      });
    } finally {
      p.pulseBusy = false;
    }
  }
  setOptions(value) {
    const next = { ...this.options, ...value };
    for (const k of Object.keys(next))
      if (!(k in this.options)) throw Error("unknown pad setting");
    if (
      !Number.isFinite(next.holdThreshold) ||
      next.holdThreshold < 0 ||
      next.holdThreshold > 1000000 ||
      !Number.isInteger(next.brightness) ||
      next.brightness < 1 ||
      next.brightness > 255
    )
      throw Error("invalid pad settings");
    for (const k of [
      "legacyV1",
      "night",
      "highContrast",
      "speakAmounts",
      "leftHanded",
      "usbDebug",
    ])
      if (typeof next[k] !== "boolean") throw Error("invalid pad setting");
    mkdirSync(this.stateDir, { recursive: true });
    writeFileSync(
      path.join(this.stateDir, "pad-options.json"),
      JSON.stringify(next),
      { mode: 0o600 },
    );
    this.options = next;
    for (const p of this.peers)
      if (p.device) this.send(p, { type: "config", ...next });
    return next;
  }
  pair({ device, pk, xpk, code }) {
    const candidate = this.pendingPairings.get(device);
    if (
      !candidate ||
      candidate.pk !== pk ||
      candidate.xpk !== xpk ||
      !/^\d{6}$/.test(code)
    )
      throw Error("scan device QR and enter its current code");
    const previous = this.pairings.get(device);
    this.pairings.set(device, { pk, xpk, code });
    for (const p of this.peers)
      if (p.candidate?.device === device && !p.verified) {
        if (p.handshake && previous?.code === code) continue;
        p.secure = null;
        p.handshake = null;
        this.startPair(p, p.candidate);
      }
    return { ok: true };
  }
  startPair(p, m) {
    if (p.handshake && Date.now() - p.handshake.at < 10000 &&
        p.handshake.candidate.nonce === m.nonce) return;
    const pin = this.pairings.get(m.device);
    if (!pin || pin.pk !== m.pk || pin.xpk !== m.xpk) return;
    p.handshake = { keys: keypair(), challenge: challenge(), candidate: m, at: Date.now() };
    const h = p.handshake;
    h.text = transcript(
      m.device,
      m.xpk,
      rawPublic(h.keys.publicKey),
      h.challenge,
      m.nonce,
    );
    h.session = sessionKeys(h.keys.privateKey, m.xpk, pin.code, h.text);
    this.send(p, {
      v: 2,
      type: "pair",
      deskpk: rawPublic(h.keys.publicKey),
      challenge: h.challenge,
      nonce: m.nonce,
    });
  }
  signal(p, e) {
    const remainingMs = Math.max(0, e.expiresAt - Date.now());
    if (this.killed.has(p.device)) return;
    if (e.state === "awaiting") {
      const { signal: s, verdict: v, routing } = e.proposal;
      let trusted;
      try {
        trusted = trustedSignal(e);
      } catch {
        if (p.secure) {
          this.send(p, {
            type: "error",
            code: "QUOTE_REQUIRED",
            fix: "Refresh the executable quote and fees",
          });
          return;
        }
      }
      const fp = trusted ? fingerprint(trusted) : undefined;
      p.displayed = {
        id: e.id,
        fingerprint: fp,
        size: Number(trusted?.size || v.sizeUsd),
      };
      this.send(p, {
        type: "signal",
        signalId: e.id,
        state: e.state,
        remainingMs,
        autoAccept: !!v.autoAccept,
        market: s.symbol,
        side: s.side,
        sizeUsd: v.sizeUsd,
        venue: trusted?.venue || routing?.best?.venue || s.venue || "",
        why: (v.why || []).join("; ").slice(0, 180),
        trusted,
        fingerprint: fp,
        holdThreshold: this.options.holdThreshold,
      });
    } else {
      if (p.displayed?.id === e.id) p.displayed = null;
      this.send(p, {
        type: "signal_state",
        signalId: e.id,
        state: e.state,
        remainingMs,
        autoAccept: !!e.automatic,
      });
    }
  }
  rearm(device) {
    const peers = [...this.peers].filter(
      (p) => p.device === device && p.secure && p.verified,
    );
    if (!peers.length) throw Error("connect the paired pad");
    for (const p of peers) {
      p.rearmUntil = Date.now() + 15000;
      this.send(p, { type: "rearm_request" });
    }
    return { ok: true, pending: "Hold YES on the pad for 800ms" };
  }
  setProfiles(profiles) {
    if (!Array.isArray(profiles) || !profiles.length || profiles.length > 8)
      throw Error("one to eight profiles required");
    const names = new Set();
    const next = profiles.map((p) => {
      if (
        typeof p.name !== "string" ||
        !p.name.length ||
        p.name.length > 20 ||
        names.has(p.name) ||
        !Array.isArray(p.layers) ||
        p.layers.length !== 3
      )
        throw Error("invalid profile");
      names.add(p.name);
      return { name: p.name, layers: p.layers.map(validateKeymap) };
    });
    mkdirSync(this.stateDir, { recursive: true });
    writeFileSync(
      path.join(this.stateDir, "pad-profiles.json"),
      JSON.stringify(next),
      { mode: 0o600 },
    );
    this.profiles = next;
    for (const p of this.peers)
      if (p.secure && p.verified) this.syncProfiles(p);
    return next;
  }
  syncProfiles(p) {
    if (!this.profiles.length) return;
    this.send(p, { type: "profiles", names: this.profiles.map((p) => p.name) });
    this.profiles.forEach((v, profile) =>
      v.layers.forEach((map, layer) =>
        this.send(p, { type: "profile_map", profile, layer, map }),
      ),
    );
  }
  selectProfile({ device, profile, layer }) {
    if (
      !Number.isInteger(profile) ||
      profile < 0 ||
      profile >= this.profiles.length ||
      !Number.isInteger(layer) ||
      layer < 0 ||
      layer > 2
    )
      throw Error("invalid profile selection");
    const peers=[...this.peers].filter(p=>p.device===device&&p.secure&&p.verified);if(!peers.length)throw Error("connect the paired pad");
    for (const p of peers)this.send(p,{type:"profile_select",profile,layer});
    return { ok: true };
  }
  async update(device, manifest, image, publicKey) {
    verifyManifest(manifest, image, publicKey);
    const p = [...this.peers]
      .filter((p) => p.device === device && p.secure && p.verified)
      .sort(
        (a, b) =>
          ["usb", "ble", "wifi"].indexOf(a.name) -
          ["usb", "ble", "wifi"].indexOf(b.name),
      )[0];
    if (!p) throw Error("secure device connection required");
    if (p.updating) throw Error("update already running");
    p.updating = true;
    p.otaStatus = {
      version: manifest.version,
      progress: 0,
      state: "uploading",
    };
    const exchange = async (message) => {
      const id = randomUUID();
      const wait = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.off("ota", done);
          reject(Error("OTA response timeout"));
        }, 15000);
        const done = (e) => {
          if (e.peer === p && e.message.id === id) {
            clearTimeout(timer);
            this.off("ota", done);
            e.message.ok
              ? resolve(e.message)
              : reject(Error(e.message.error || "OTA refused"));
          }
        };
        this.on("ota", done);
      });
      this.send(p, { ...message, id });
      return wait;
    };
    try {
      await exchange({ type: "ota_begin", manifest });
      for (let offset = 0; offset < image.length; offset += 512) {
        await exchange({
          type: "ota_chunk",
          offset,
          data: image.subarray(offset, offset + 512).toString("base64"),
        });
        p.otaStatus.progress = Math.floor(
          (Math.min(image.length, offset + 512) * 100) / image.length,
        );
      }
      await exchange({ type: "ota_end" });
      p.otaStatus.state = "rebooting";
      return { ok: true };
    } catch (e) {
      p.otaStatus.state = "error";
      p.otaStatus.error = e.message;
      throw e;
    } finally {
      p.updating = false;
    }
  }
  forward(e) {
    for (const p of this.peers)
      if (p.device && (!p.secure || p.verified)) {
        if (e.type === "signal") this.signal(p, e.signal);
        if (e.type === "receipt")
          this.send(p, {
            type: "receipt",
            signalId: e.id || e.signalId,
            ...e.receipt,
          });
        if (e.type === "speech_chunk" && e.seq === 0 && e.text)
          this.send(p, { type: "reply", text: e.text.slice(0, 2000) });
        if (e.type === "speech_chunk")
          this.audioChunk(p, Buffer.from(e.pcm, "base64"), e);
        if (e.type === "speech" && e.pcm)
          this.audio(p, Buffer.from(e.pcm, "base64"));
      }
  }
  audioChunk(p, pcm, { stream, seq, end }) {
    if (!p.secure || p.name !== "ble") {
      this.send(p, {
        type: "tts",
        stream,
        seq,
        end,
        sampleRate: 16000,
        pcm: pcm.toString("base64"),
      });
      return;
    }
    if (seq === 0) {
      p.ttsState = { stream, pending: Buffer.alloc(0), seq: 0 };
      p.opusEncoder ||= new OpusScript(16000, 1, OpusScript.Application.VOIP);
      p.opusEncoder.encoderCTL(4002, 24000);
    }
    const s = p.ttsState;
    if (!s || s.stream !== stream) return;
    s.pending = Buffer.concat([s.pending, pcm]);
    while (s.pending.length >= 640 || (end && s.pending.length)) {
      const frame = Buffer.alloc(640);
      s.pending.copy(frame, 0, 0, 640);
      s.pending = s.pending.subarray(Math.min(640, s.pending.length));
      const data = Buffer.from(p.opusEncoder.encode(frame, 320)).toString(
        "base64",
      );
      this.send(p, {
        type: "tts",
        stream,
        seq: s.seq++,
        end: false,
        sampleRate: 16000,
        codec: "opus",
        data,
      });
    }
    if (end) {
      this.send(p, {
        type: "tts",
        stream,
        seq: s.seq++,
        end: true,
        sampleRate: 16000,
        codec: "opus",
        data: "",
      });
      p.ttsState = null;
    }
  }
  audio(p, pcm) {
    const stream = randomUUID();
    let seq = 0;
    for (let i = 0; i < pcm.length; i += 512)
      this.audioChunk(p, pcm.subarray(i, i + 512), {
        stream,
        seq: seq++,
        end: i + 512 >= pcm.length,
      });
  }
  async request(route, body, raw = false) {
    const response = await fetch(this.baseUrl + route, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": raw ? "application/octet-stream" : "application/json",
      },
      body: raw ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(65000),
    });
    if (raw && response.ok) return Buffer.from(await response.arrayBuffer());
    const result = await response.json();
    if (!response.ok || result.ok === false || result.execution?.ok === false)
      throw new Error(
        result.error || result.execution?.error || `backend ${response.status}`,
      );
    return result;
  }
  async ingress(p, m) {
    if (!this.peers.has(p)) return;
    if (p.secure && m.v !== 2) throw Error("encrypted frame required");
    if (m.v === 2) {
      if (m.type === "hello" && (!p.secure ||
          (!p.verified && Date.now() - p.handshake?.at >= 10000))) {
        const hello = p.name === "usb" ? checkCRC(m) : m;
        if (
          hello.fw !== "2.0.0" ||
          !/^\w[\w-]{0,63}$/.test(hello.device) ||
          !/^[0-9a-f]{64}$/.test(hello.pk) ||
          !/^[0-9a-f]{64}$/.test(hello.xpk) ||
          !/^[0-9a-f]{64}$/.test(hello.nonce)
        )
          throw Error("invalid v2 identity");
        p.candidate = hello;
        if (p.secure) {
          p.secure = null;
          p.handshake = null;
          p.sendQueue = [];
        }
        this.pendingPairings.set(hello.device, hello);
        this.startPair(p, hello);
        return;
      }
      if (m.type === "pair_proof" && p.handshake && !p.secure) {
        const proof = p.name === "usb" ? checkCRC(m) : m;
        const h = p.handshake;
        if (!verifyHandshake(h.text, proof.signature, h.candidate.pk))
          throw Error("device identity mismatch");
        p.secure = new SecureSession(h.session.desk, h.session.pad, {
          serial: p.name === "usb",
        });
        p.device = h.candidate.device;
        p.firmware = "2.0.0";
        this.send(p, { type: "ready", ...this.options });
        return;
      }
      if (!p.secure) throw Error("pairing required");
      try {
        m = p.secure.open(m);
      } catch (e) {
        if (e.message === "replayed frame") {
          this.send(p, { type: "ack" });
          return;
        }
        throw e;
      }
      p.last = Date.now();
      if (m.type !== "ack") this.send(p, { type: "ack" });
      this.flush(p);
      if (m.type === "ack") return;
      if (m.type === "ready") {
        if (p.verified) throw Error("session already ready");
        if (typeof m.killed !== "boolean") throw Error("kill latch state required");
        p.verified = true;
        if (m.killed) this.killed.add(p.device);
        if (this.killed.has(p.device)) {
          await this.request("/key", { id: "kill" });
          this.send(p, { type: "kill_sync" });
        }
        this.pendingPairings.delete(p.device);
        this.signals?.publish({ type: "pad_link", ...this.snapshot() });
        this.send(p, { type: "keymap", ...this.keymap });
        this.send(p, { type: "config", ...this.options });
        this.send(p, this.getStatus(p));
        this.syncProfiles(p);
        for (const e of this.signals?.list() || [])
          if (e.state === "awaiting") this.signal(p, e);
        p.last = Date.now();
        return;
      }
      if (!p.verified) throw Error("encrypted ready required");
      if (m.type === "telemetry") {
        p.telemetry = m;
        this.signals?.publish({
          type: "pad_telemetry",
          device: p.device,
          telemetry: m,
        });
        p.last = Date.now();
        return;
      }
      if (m.type === "crash") {
        if (
          !Number.isInteger(m.offset) ||
          m.offset < 0 ||
          m.offset > 262144 ||
          typeof m.data !== "string" ||
          m.data.length > 684 ||
          typeof m.end !== "boolean" ||
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(m.data)
        )
          throw Error("invalid crash chunk");
        p.crash ||= [];
        if (m.offset !== p.crash.reduce((n, b) => n + b.length, 0))
          throw Error("crash order");
        const chunk = Buffer.from(m.data, "base64");
        if (!chunk.length || chunk.length > 512 || m.offset + chunk.length > 262144)
          throw Error("crash size limit");
        p.crash.push(chunk);
        if (m.end) {
          mkdirSync(path.join(this.stateDir, "crashes"), { recursive: true });
          writeFileSync(
            path.join(
              this.stateDir,
              "crashes",
              p.device + "-" + Date.now() + ".elf",
            ),
            Buffer.concat(p.crash),
            { mode: 0o600 },
          );
          p.crash = null;
          this.send(p, { type: "crash_saved" });
        }
        return;
      }
      if (m.type === "ota_result") {
        this.emit("ota", { peer: p, message: m });
        return;
      }
      if (m.type === "speak_amount") {
        if (m.signalId !== p.displayed?.id)
          throw Error("displayed signal required");
        await this.speak?.(`Confirm ${p.displayed.size} dollars`);
        return;
      }
      if (m.type === "factory_result") {
        if(m.pk!==p.candidate.pk||!verifyHandshake(m.payload,m.signature,m.pk)||JSON.parse(m.payload).serial!==p.device)throw Error("invalid factory signature");
        this.signals?.publish({
          type: "factory_result",
          device: p.device,
          result: m,
        });
        return;
      }
      if (m.type === "kill") {
        this.killed.add(p.device);
        await this.request("/key", { id: "kill" });
        this.send(p, { type: "result", id: m.id, ok: true });
        return;
      }
      if (m.type === "rearm_confirm") {
        if (!Number.isFinite(m.heldMs) || m.heldMs < 800 ||
            !p.rearmUntil || Date.now() >= p.rearmUntil || !this.killed.has(p.device))
          throw Error("rearm hold required");
        p.rearmUntil = 0;
        this.killed.delete(p.device);
        try{if(!this.killed.size)await this.request("/arm",{});}catch(e){this.killed.add(p.device);throw e;}
        this.send(p, { type: "rearm_complete" });
        return;
      }
      if (this.killed.has(p.device)) throw Error("pad kill latch active");
    }
    p.last = Date.now();
    if (m.type === "ping") {
      this.send(p, this.getStatus(p));
      return;
    }
    const work = p.tail.then(() => this.receive(p, m));
    p.tail = work.catch(() => {});
    return work.catch((e) =>
      this.send(p, {
        type: "result",
        id: m.id,
        ok: false,
        error: e.message,
        status: e.message.startsWith("Setup required:")
          ? "Setup required"
          : undefined,
      }),
    );
  }
  async receive(p, m) {
    if (!this.peers.has(p)) return;
    if (["key", "knob", "voice", "signal_state"].includes(m.type) &&
        (Date.now() - p.last >= 15000 || this.preferred(p.device) !== p))
      throw Error("inactive transport: nothing will execute");
    if (p.secure && this.killed.has(p.device)) throw Error("pad kill latch active");
    if (m.type === "hello") {
      if (
        typeof m.device !== "string" ||
        !/^[\w-]{1,64}$/.test(m.device) ||
        m.fw !== "1.0.0"
      )
        throw new Error("invalid pad hello");
      p.device = m.device;
      p.firmware = m.fw;
      this.signals?.publish({ type: "pad_link", ...this.snapshot() });
      this.send(p, {
        type: "caps",
        heartbeatMs: 5000,
        maxLine: 4096,
        sampleRate: 16000,
      });
      this.send(p, { type: "keymap", ...this.keymap });
      this.send(p, this.getStatus(p));
      for (const e of this.signals?.list() || [])
        if (e.state === "awaiting") this.signal(p, e);
      return;
    }
    if (m.type === "ping") {
      this.send(p, this.getStatus(p));
      return;
    }
    if (!p.device) throw new Error("hello required");
    if (m.type === "keymap_state") {
      this.signals?.publish({ type: "pad", device: p.device, message: m });
      return;
    }
    if (!["key", "knob", "signal_state", "voice"].includes(m.type))
      throw new Error("unsupported pad message");
    if (typeof m.id !== "string" || !/^[\w:-]{1,96}$/.test(m.id))
      throw new Error("event id required");
    const identity = p.device + ":" + m.id;
    if (this.seen.has(identity)) {
      this.send(p, {
        type: "result",
        id: m.id,
        ok: false,
        error: "duplicate event; refresh state",
      });
      return;
    }
    this.seen.set(identity, true);
    if (this.seen.size > 8192) this.seen.delete(this.seen.keys().next().value);
    this.signals?.publish({
      type: "pad",
      device: p.device,
      link: p.name,
      message:
        m.type === "voice"
          ? {
              ...m,
              pcm: undefined,
              data: undefined,
              bytes: Buffer.from(m.pcm || m.data || "", "base64").length,
            }
          : m,
    });
    if (m.type === "key") {
      if (p.secure && m.action === "yes") {
        if (
          m.signalId !== p.displayed?.id ||
          m.fingerprint !== p.displayed?.fingerprint ||
          !(
            Number.isFinite(m.heldMs) &&
            m.heldMs >=
              (p.displayed.size > this.options.holdThreshold ? 800 : 0)
          )
        )
          throw Error("trusted display confirmation required");
      }
      if (m.edge !== "down" || !/^[a-zA-Z0-9_.:-]{1,96}$/.test(m.action))
        throw new Error("invalid key");
      if (["yes", "no"].includes(m.action)) {
        if (!m.signalId) throw new Error("displayed signal id required");
        await this.request(
          `/signals/${encodeURIComponent(m.signalId)}/${m.action === "yes" ? "accept" : "refuse"}`,
          p.secure && m.action === "yes" ? { fingerprint: m.fingerprint } : {},
        );
      } else {
        const outcome = m.action.match(
          /^pmamm:([1-9A-HJ-NP-Za-km-z]{32,44}):(yes|no)$/,
        );
        if (outcome)
          await this.request("/signals", {
            kind: "predict",
            market: outcome[1],
            side: outcome[2],
            size: this.getStatus(p).sizeUsd,
          });
        else await this.request("/key", { id: m.action, ...p.knobDefaults });
      }
    } else if (m.type === "signal_state") {
      if (p.secure) throw Error("use trusted key confirmation");
      if (
        !["accept", "refuse"].includes(m.state) ||
        !/^[\w-]{1,96}$/.test(m.signalId)
      )
        throw new Error("invalid signal answer");
      await this.request(`/signals/${m.signalId}/${m.state}`, {});
    } else if (m.type === "knob") {
      if (!Number.isFinite(m.sizeUsd) || m.sizeUsd <= 0)
        throw new Error("invalid knob size");
      if (m.mode && m.mode !== "size") {
        if (
          !["leverage", "slippage"].includes(m.mode) ||
          !Number.isFinite(m.value) ||
          m.value < 1 ||
          m.value > (m.mode === "leverage" ? 100 : 5000)
        )
          throw Error("invalid knob setting");
        p.knobDefaults = {
          ...p.knobDefaults,
          [m.mode === "slippage" ? "slippageBps" : "leverage"]: m.value,
        };
      } else await this.request("/size", { usd: m.sizeUsd });
    } else {
      let pcm;
      if (m.codec === "opus") {
        if (
          !p.secure ||
          m.sampleRate !== 16000 ||
          !Number.isInteger(m.seq) ||
          typeof m.stream !== "string" ||
          m.stream.length > 96 ||
          typeof m.end !== "boolean" ||
          typeof m.data !== "string" ||
          m.data.length > 344
        )
          throw Error("invalid Opus frame");
        const packet = Buffer.from(m.data, "base64");
        if (packet.length > 256) throw Error("Opus packet too large");
        p.opusDecoder ||= new OpusScript(16000, 1, OpusScript.Application.VOIP);
        pcm = packet.length
          ? Buffer.from(p.opusDecoder.decode(packet))
          : Buffer.alloc(0);
        if (pcm.length > 1920 || pcm.length % 2)
          throw Error("invalid decoded audio");
      } else {
        if (p.secure && p.name === "ble") throw Error("BLE requires Opus");
        if (
          m.sampleRate !== 16000 ||
          !Number.isInteger(m.seq) ||
          typeof m.stream !== "string" ||
          m.stream.length > 96 ||
          typeof m.end !== "boolean" ||
          typeof m.pcm !== "string" ||
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
            m.pcm,
          )
        )
          throw new Error("invalid PCM chunk");
        pcm = Buffer.from(m.pcm, "base64");
        if (pcm.length > 512 || pcm.length % 2)
          throw Error("invalid PCM length");
      }
      // One bounded utterance per connection. Idle streams expire even on a live link.
      for (const [id, s] of p.streams)
        if (Date.now() - s.at > 15000) {
          s.live?.abort();
          p.streams.delete(id);
        }
      if (m.seq === 0 && p.streams.size === 0)
        p.streams.set(m.stream, {
          seq: 0,
          chunks: [],
          bytes: 0,
          live: await this.voiceInput?.(p.device),
        });
      const s = p.streams.get(m.stream);
      if (!s || s.seq !== m.seq || s.bytes + pcm.length > 384000) {
        s?.live?.abort();
        p.streams.delete(m.stream);
        throw new Error("voice sequence/limit");
      }
      s.seq++;
      s.at = Date.now();
      s.bytes += pcm.length;
      if (s.live) {
        try {
          s.live.write(pcm);
          if (m.end) {
            s.answering = true;
            await s.live.finish();
          }
        } catch (e) {
          s.live.abort();
          p.streams.delete(m.stream);
          throw e;
        } finally {
          if (m.end) {
            p.streams.delete(m.stream);
            p.last = Date.now();
          }
        }
      } else {
        s.chunks.push(pcm);
        if (m.end) {
          p.streams.delete(m.stream);
          this.audio(
            p,
            await this.request("/voice", Buffer.concat(s.chunks), true),
          );
        }
      }
    }
    this.send(p, { type: "result", id: m.id, ok: true });
  }
  async http(req, res, device) {
    let p = [...this.peers].find((p) => p.httpDevice === device);
    if (!/^[\w-]{1,64}$/.test(device || "")) {
      res.writeHead(400);
      res.end();
      return;
    }
    if (!p) {
      const out = [];
      p = this.peer("wifi", (line) => {
        if (out.length >= 1024) throw new Error("pad stalled");
        out.push(line);
      });
      p.out = out;
      p.httpDevice = device;
    }
    try {
      const input = req.padV2Only
        ? new Lines((m) => {
            if (m.v !== 2) throw Error("v2 required");
            p.lines.feed(JSON.stringify(m) + "\n");
          })
        : p.lines;
      let bytes = 0;
      for await (const data of req) {
        bytes += data.length;
        if (bytes > 65536) throw new Error("pad request too large");
        input.feed(data);
      }
      if (input.pending.length) throw new Error("incomplete pad record");
      await Promise.all([...p.inflight]);
      await p.tail;
      if (p.device && p.device !== device) throw new Error("device mismatch");
      res.writeHead(200, { "content-type": "application/x-ndjson" });
      res.end(p.out.splice(0).join(""));
    } catch {
      this.remove(p);
      res.writeHead(400);
      res.end();
    }
  }
  bind(server) {
    const wss = new WebSocketServer({
      noServer: true,
      maxPayload: 65536,
      handleProtocols: (ps) =>
        ps.has("xorrpad-v2")
          ? "xorrpad-v2"
          : ps.has("xorrpad")
            ? "xorrpad"
            : false,
    });
    server.on("upgrade", (req, socket, head) => {
      if (new URL(req.url, "http://localhost").pathname !== "/padlink") return;
      const protocols = String(req.headers["sec-websocket-protocol"] || "")
        .split(",")
        .map((s) => s.trim());
      const given =
        req.headers.authorization?.replace(/^Bearer /, "") ||
        req.headers["x-pad-token"] ||
        protocols.find((s) => s.startsWith("pad-token."))?.slice(10);
      if (given !== this.token && !protocols.includes("xorrpad-v2")) {
        socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        let p;
        try {
          p = this.peer(
            "wifi",
            (line) => {
              if (ws.bufferedAmount > 1024 * 1024)
                throw new Error("pad stalled");
              ws.send(line);
            },
            () => ws.terminate(),
          );
        } catch {
          ws.terminate();
          return;
        }
        p.v2Only = given !== this.token;
        ws.on("message", (data) => {
          try {
            p.lines.feed(data);
          } catch {
            this.remove(p);
          }
        });
        ws.on("error", () => this.remove(p));
        ws.on("close", () => this.remove(p));
      });
    });
    server.once("listening", () => {
      this.baseUrl ||= `http://127.0.0.1:${server.address().port}`;
    });
    server.once("close", () => {
      this.close();
      wss.close();
    });
  }
  async discover() {
    const { SerialPort } = await import("serialport");
    const attempts = new Map();
    const scan = async () => {
      if (this.stopped) return;
      try {
        const ports = await SerialPort.list();
        const paths = process.env.XORR_PAD_SERIAL
          ? [process.env.XORR_PAD_SERIAL]
          : ports
              .filter((p) => p.vendorId?.toLowerCase() === "303a")
              .map((p) => p.path);
        for (const path of paths)
          if (
            ![...this.peers].some((p) => p.path === path) &&
            Date.now() >= (attempts.get(path)?.next || 0)
          ) {
            const serial = new SerialPort({ path, baudRate: 115200 });
            const peer = this.attach(serial, "usb");
            peer.path = path;
            serial.once("close", () => {
              const n = peer.verified ? 0 : (attempts.get(path)?.n || 0) + 1;
              attempts.set(path, {
                n,
                next: Date.now() + Math.min(30000, 250 * 2 ** Math.min(n, 7)),
              });
            });
          }
      } catch (e) {
        this.emit("diagnostic", `USB discovery: ${e.message}`);
      }
    };
    await scan();
    this.scanTimer = setInterval(scan, 5000);
    this.scanTimer.unref();
    try {
      await this.discoverBle();
    } catch {
      this.emit(
        "diagnostic",
        "BLE adapter unavailable; phone relay or USB/Wi-Fi remains available",
      );
    }
  }
  async discoverBle() {
    const noble = (await import("@abandonware/noble")).default;
    this.noble = noble;
    const backoff = new ReconnectBackoff();
    const scan = () => {
      clearTimeout(this.bleScanTimer);
      this.bleScanTimer = setTimeout(() => {
        if (!this.stopped && noble.state === "poweredOn")
          noble.startScanningAsync([UART], false).catch(() => {
            backoff.fail();
            scan();
          });
      }, Math.max(0, backoff.next - Date.now()));
      this.bleScanTimer.unref();
    };
    this.bleDiscover = async (peripheral) => {
      if (this.bleConnecting || this.stopped || !backoff.ready()) return;
      this.bleConnecting = true;
      try {
        await noble.stopScanningAsync();
        await peripheral.connectAsync();
        const { characteristics } =
          await peripheral.discoverSomeServicesAndCharacteristicsAsync(
            [UART],
            [],
          );
        const rx = characteristics.find(
          (c) => c.uuid.replace(/-/g, "") === UART.replace("0001", "0002"),
        );
        const tx = characteristics.find(
          (c) => c.uuid.replace(/-/g, "") === UART.replace("0001", "0003"),
        );
        if (!rx || !tx) throw new Error("UART characteristics unavailable");
        const mtu = Math.max(20, (peripheral.mtu || 23) - 3);
        const stream = new Duplex({
          read() {},
          write(data, _enc, cb) {
            (async () => {
              for (let i = 0; i < data.length; i += mtu)
                await rx.writeAsync(data.subarray(i, i + mtu), false);
            })().then(() => cb(), cb);
          },
          destroy(err, cb) {
            peripheral.disconnectAsync().catch(() => {});
            cb(err);
          },
        });
        tx.on("data", (data) => stream.push(data));
        await tx.subscribeAsync();
        let peer;
        peripheral.once("disconnect", () => {
          stream.destroy();
          this.bleConnecting = false;
          if (peer?.verified) backoff.reset();
          backoff.fail();
          scan();
        });
        peer = this.attach(stream, "ble");
      } catch {
        this.bleConnecting = false;
        await peripheral.disconnectAsync().catch(() => {});
        backoff.fail();
        scan();
      }
    };
    this.bleState = (state) => {
      if (state === "poweredOn" && !this.stopped)
        scan();
    };
    noble.on("discover", this.bleDiscover);
    noble.on("stateChange", this.bleState);
    this.bleState(noble.state);
  }
  close() {
    this.stopped = true;
    clearInterval(this.heartbeat);
    clearInterval(this.scanTimer);
    clearInterval(this.retryTimer);
    clearTimeout(this.bleScanTimer);
    this.signals?.off("event", this.onEvent);
    this.noble?.off("discover", this.bleDiscover);
    this.noble?.off("stateChange", this.bleState);
    this.noble?.stopScanningAsync().catch(() => {});
    for (const p of this.peers) this.remove(p);
  }
}
