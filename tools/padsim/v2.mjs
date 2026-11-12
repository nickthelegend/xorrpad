/** Stateful v2 protocol endpoint, with real cryptography and disk-backed kill state. */
import { PadSimulator } from "./index.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import {
  keypair,
  rawPublic,
  transcript,
  sessionKeys,
  SecureSession,
  wire,
  checkCRC,
  signHandshake,
  fingerprint,
  verifyManifest,
  sha,
  challenge,
} from "../../desk/main/pad-v2.mjs";
import { Lines } from "../../desk/main/padlink.mjs";
export class PadSimulatorV2 extends PadSimulator {
  constructor({
    serial = false,
    code = "123456",
    stateFile,
    identity = keypair("ed25519"),
    exchange = keypair(),
    ...options
  } = {}) {
    super(options);
    Object.assign(this, { serial, code, stateFile, identity, exchange });
    this.killed = false;
    this.threshold = 100;
    this.holding = null;
    this.ota = null;
    try {
      this.killed = JSON.parse(readFileSync(stateFile, "utf8")).killed === true;
    } catch (e) {
      if (stateFile && e.code !== "ENOENT") throw e;
    }
  }
  get qr() {
    return `xorrpad://pair?id=${this.device}&pk=${rawPublic(this.identity.publicKey)}${rawPublic(this.exchange.publicKey)}&v=2`;
  }
  get pairing() {
    return {
      device: this.device,
      pk: rawPublic(this.identity.publicKey),
      xpk: rawPublic(this.exchange.publicKey),
      code: this.code,
    };
  }
  attach(stream) {
    this.stream = stream;
    this.session = null;
    this.nonce = challenge();
    this.verified = false;
    this.out = [];
    const lines = new Lines((frame) => {
      try {
        this.receive(frame);
      } catch (e) {
        this.emit("protocol_error", e);
      }
    });
    stream.on("data", (b) => {
      try {
        lines.feed(b);
      } catch (e) {
        this.emit("protocol_error", e);
      }
    });
    stream.on("error", (e) => this.emit("protocol_error", e));
    this.retryTimer = setInterval(() => {
      if (this.session)
        try {
          for (const l of this.session.retry()) this.write(l);
        } catch (e) {
          this.emit("protocol_error", e);
        }
    }, 100);
    this.retryTimer.unref();
    this.heartbeatTimer = setInterval(() => {
      if (this.verified) this.send({ type: "ping" });
      else {
        if (this.session && Date.now() - this.offerAt >= 10000) {
          this.session = null;
          this.nonce = challenge();
          this.out = [];
        }
        if (!this.session) this.hello();
      }
    }, 5000);
    this.heartbeatTimer.unref();
    stream.once("close", () => {
      clearInterval(this.retryTimer);
      clearInterval(this.heartbeatTimer);
      this.session = null;
      this.verified = false;
      this.out = [];
    });
    this.hello();
    return this;
  }
  write(line) {
    const bytes = Buffer.from(line);
    for (let i = 0; i < bytes.length; i += this.fragmentBytes)
      this.stream.write(bytes.subarray(i, i + this.fragmentBytes));
  }
  hello() {
    this.write(
      wire(
        {
          v: 2,
          type: "hello",
          device: this.device,
          fw: "2.0.0",
          pk: rawPublic(this.identity.publicKey),
          xpk: rawPublic(this.exchange.publicKey),
          nonce: this.nonce,
        },
        this.serial,
      ),
    );
  }
  send(message) {
    if (!this.session) throw Error("offline: nothing will execute");
    if (message.type === "ack" || message.type === "ping") {
      this.write(this.session.seal(message, { reliable: false }));
      return;
    }
    if (!this.verified && message.type !== "ready") throw Error("encrypted ready required");
    if (this.out.length >= 32) throw Error("pad input backlog");
    this.out.push(message);
    this.flush();
  }
  flush() {
    if (this.session && !this.session.pending.size && this.out.length)
      this.write(this.session.seal(this.out.shift()));
  }
  receive(input) {
    if (input.v === 1 && input.type === "ping") {
      if (!this.session) this.hello();
      return;
    }
    if (input.v !== 2) throw Error("v2 required");
    if (input.type === "pair") {
      if (this.session || input.nonce !== this.nonce) throw Error("stale pairing offer");
      const m = this.serial ? checkCRC(input) : input,
        text = transcript(
          this.device,
          rawPublic(this.exchange.publicKey),
          m.deskpk,
          m.challenge,
          m.nonce,
        );
      const keys = sessionKeys(
        this.exchange.privateKey,
        m.deskpk,
        this.code,
        text,
      );
      this.session = new SecureSession(keys.pad, keys.desk, {
        serial: this.serial,
      });
      this.offerAt = Date.now();
      this.write(
        wire(
          {
            v: 2,
            type: "pair_proof",
            signature: signHandshake(text, this.identity.privateKey),
          },
          this.serial,
        ),
      );
      return;
    }
    if (!this.session) throw Error("pairing required");
    let m;
    try {
      m = this.session.open(input);
    } catch (e) {
      if (e.message === "replayed frame") {
        this.send({ type: "ack" });
        this.emit("replay_rejected");
        return;
      }
      throw e;
    }
    if (m.type !== "ack") this.send({ type: "ack" });
    this.flush();
    if (m.type === "ack") return;
    this.history.push(m);
    this.emit("message", m);
    if (m.type === "ready") {
      this.verified = true;
      this.threshold = m.holdThreshold;
      this.send({ type: "ready", killed: this.killed });
    }
    if (m.type === "config") this.threshold = m.holdThreshold;
    if (m.type === "signal") {
      if (this.killed) return;
      if (fingerprint(m.trusted) !== m.fingerprint)
        throw Error("fingerprint mismatch");
      this.signal = { ...m, expiresAt: Date.now() + m.remainingMs };
      this.holding = null;
    }
    if (m.type === "signal_state" && m.signalId === this.signal?.signalId)
      this.signal = { ...this.signal, state: m.state };
    if (m.type === "keymap") {
      this.keymap = m;
      this.send({ type: "keymap_state", revision: m.revision, ok: true });
    }
    if (m.type === "rearm_request") {
      this.rearmRequested = Date.now() + 15000;
      this.holding = null;
    }
    if (m.type === "rearm_complete") {
      if (this.rearmRequested) {
        this.killed = false;
        this.rearmRequested = false;
        this.persist();
      }
    }
    if (m.type === "kill_sync") {
      this.killed = true;
      this.signal = null;
      this.persist();
    }
    if (m.type.startsWith("ota_")) this.update(m);
  }
  key(
    action,
    {
      signalId = this.signal?.signalId,
      id = this.device + ":" + ++this.seq,
      heldMs = 0,
    } = {},
  ) {
    if (this.killed || !this.session || !this.verified)
      throw Error("offline or killed: nothing will execute");
    if (["yes", "no"].includes(action)) {
      if (
        !this.signal ||
        this.signal.state !== "awaiting" ||
        Date.now() >= this.signal.expiresAt
      )
        throw Error("signal expired");
      if (
        action === "yes" &&
        Number(this.signal.trusted.size) > this.threshold &&
        heldMs < 800
      )
        throw Error("hold-to-confirm requires 800ms");
    }
    this.send({
      type: "key",
      id,
      action,
      edge: "down",
      ...(["yes", "no"].includes(action)
        ? { signalId, fingerprint: this.signal.fingerprint, heldMs }
        : {}),
    });
    return id;
  }
  pressConfirm() {
    this.holding = Date.now();
  }
  releaseConfirm() {
    this.holding = null;
  }
  confirm() {
    if (this.holding === null) throw Error("press YES first");
    const heldMs = Date.now() - this.holding;
    if (this.rearmRequested) {
      if (Date.now() >= this.rearmRequested) throw Error("rearm request expired");
      if (heldMs < 800) throw Error("hold-to-confirm requires 800ms");
      this.send({ type: "rearm_confirm", heldMs });
      return;
    }
    return this.key("yes", { heldMs });
  }
  kill(heldMs) {
    if (heldMs < 2000) throw Error("hold KILL for 2s");
    this.killed = true;
    this.signal = null;
    this.persist();
    this.send({ type: "kill", id: this.device + ":" + ++this.seq });
  }
  persist() {
    if (this.stateFile)
      writeFileSync(this.stateFile, JSON.stringify({ killed: this.killed }), {
        mode: 0o600,
      });
  }
  update(m) {
    try {
      if (m.type === "ota_begin") {
        // OTA public key is provisioned as part of the simulated board, never accepted from the sender.
        if (!this.otaPublicKey) throw Error("OTA public key missing");
        const { verifyManifestSignature } = this.crypto;
        verifyManifestSignature(m.manifest, this.otaPublicKey);
        this.ota = { manifest: m.manifest, chunks: [], offset: 0 };
      } else if (m.type === "ota_chunk") {
        if (!this.ota || m.offset !== this.ota.offset) throw Error("OTA order");
        const b = Buffer.from(m.data, "base64");
        if (
          !b.length ||
          b.length > 512 ||
          this.ota.offset + b.length > this.ota.manifest.size
        )
          throw Error("OTA size");
        this.ota.chunks.push(b);
        this.ota.offset += b.length;
      } else if (m.type === "ota_end") {
        if (!this.ota) throw Error("OTA state");
        const image = Buffer.concat(this.ota.chunks);
        verifyManifest(this.ota.manifest, image, this.otaPublicKey);
        this.installedHash = sha(image).toString("hex");
        this.ota = null;
      }
      this.send({ type: "ota_result", id: m.id, ok: true });
    } catch (e) {
      this.ota = null;
      this.send({ type: "ota_result", id: m.id, ok: false, error: e.message });
    }
  }
  async close() {
    clearInterval(this.retryTimer);
    clearInterval(this.heartbeatTimer);
    return super.close();
  }
}
import { verifyManifestSignature } from "../../desk/main/pad-v2.mjs";
PadSimulatorV2.prototype.crypto = { verifyManifestSignature };
