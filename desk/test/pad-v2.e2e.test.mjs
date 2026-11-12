import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { PadSimulatorV2 } from "../../tools/padsim/v2.mjs";
import { Memory } from "../main/memory.mjs";
import { fingerprint, sha } from "../main/pad-v2.mjs";
import { OTA_PUBLIC_KEY } from "../main/firmware-release.mjs";
process.env.PAD_TOKEN = "xorr-v2-integration-test";
const { createServer, state } = await import("../main/server.mjs");
async function waitUntil(fn) {
  for (let i = 0; i < 200; i++) {
    if (fn()) return;
    await delay(10);
  }
  throw Error("condition timeout");
}
async function lab(fn, { serial = false } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "xorr-v2-"));
  process.env.XORR_USER_DATA = dir;
  const mem = new Memory({ db: path.join(dir, "memory.db") });
  await mem.ping();
  const server = createServer(mem);
  let pad;
  try {
    await new Promise((r, j) => {
      server.once("error", j);
      server.listen(8719, "127.0.0.1", r);
    });
    state.armed = true;
    state.pending = null;
    state.sizeUsd = 1;
    state.market = "SOL";
    await mem.setReference("risk/limits", {
      allow: ["SOL"],
      max_trade_usd: 10,
      max_day_usd: 100,
    });
    const connect = async (next) => {
      pad = next;
      pad.on("protocol_error", (e) => {
        pad.lastError = e;
      });
      await pad.listen(8729);
      const stream = net.createConnection(8729, "127.0.0.1");
      server.padlink.attach(stream, serial ? "usb" : "tcp");
      await waitUntil(
        () =>
          server.padlink.pendingPairings.has(pad.device) ||
          pad.history.some((m) => m.type === "keymap"),
      );
      if (!pad.history.some((m) => m.type === "keymap"))
        server.padlink.pair(pad.pairing);
      await pad.waitFor((m) => m.type === "keymap", { timeout: 5000 });
      assert.equal(pad.lastError, undefined);
      return pad;
    };
    await connect(
      new PadSimulatorV2({
        device: "v2-integration-unit",
        serial,
        fragmentBytes: 97,
        stateFile: path.join(dir, "pad-nvs.json"),
      }),
    );
    await fn({ pad, server, mem, dir, connect });
  } finally {
    await pad?.close();
    if (server.listening) await new Promise((r) => server.close(r));
    server.padlink.close();
    server.signals.close();
    mem.stop();
    delete process.env.XORR_USER_DATA;
    state.armed = true;
    state.pending = null;
    await rm(dir, { recursive: true, force: true });
  }
}
test("v2 pairing, encrypted real key routes, replay rejection and no plaintext downgrade", async () =>
  lab(async ({ pad, server }) => {
    assert(server.padlink.snapshot().devices[0].secure);
    const id = pad.key("risk");
    assert.equal(
      (await pad.waitFor((m) => m.type === "result" && m.id === id)).ok,
      true,
    );
    const peer = [...server.padlink.peers][0];
    let events = 0;
    server.signals.on("event", (e) => {
      if (e.type === "pad" && e.message.id === "replay-test") events++;
    });
    await waitUntil(() => !pad.session.pending.size);
    const line = pad.session.seal({
      type: "key",
      id: "replay-test",
      action: "grid",
      edge: "down",
    });
    pad.write(line);
    await pad.waitFor((m) => m.type === "result" && m.id === "replay-test");
    pad.write(line);
    await delay(100);
    assert.equal(events, 1);
    pad.write(
      '{"v":1,"type":"key","id":"downgrade","action":"buy","edge":"down"}\n',
    );
    await delay(100);
    assert.equal(server.signals.list().length, 0);
    assert(peer.secure);
    const last = Date.now() - 14900;
    peer.last = last;
    pad.send({ type: "telemetry", uptime: 1 });
    await waitUntil(() => peer.telemetry?.uptime === 1);
    assert(peer.last > last);
  }));
test("v2 serial CRC pairing and management routes preserve authentication", async () =>
  lab(async ({ pad, server }) => {
    assert.equal(server.padlink.snapshot().devices[0].link, "usb");
    const origin = "http://127.0.0.1:8719";
    const headers = { authorization: "Bearer xorr-v2-integration-test", "content-type": "application/json" };
    for (const route of ["/pad/options", "/pad/pair", "/pad/rearm", "/pad/profiles", "/pad/profile", "/pad/manifest", "/pad/ota"]) {
      assert.equal((await fetch(origin + route, { method: "POST", headers: { "x-xorr-protocol": "2" }, body: "{}" })).status, 401);
    }
    assert.equal((await fetch(origin + "/pad/pair", { headers })).status, 405);
    const options = await fetch(origin + "/pad/options", { method: "POST", headers, body: JSON.stringify({ holdThreshold: 25, brightness: 100 }) });
    assert.equal(options.status, 200);
    await pad.waitFor((m) => m.type === "config" && m.holdThreshold === 25);
    assert.equal(pad.threshold, 25);
    const response = await fetch(origin + "/padlink?device=plaintext-injection", {
      method: "POST", headers: { "x-xorr-protocol": "2" },
      body: JSON.stringify({ v: 1, type: "hello", device: "plaintext-injection", fw: "1.0.0" }) + "\n",
    });
    assert.equal(response.status, 400);
    assert(!server.padlink.snapshot().devices.some((p) => p.device === "plaintext-injection"));
  }, { serial: true }));
test("v2 kill latch survives simulated reboot and requires desk plus physical hold", async () =>
  lab(async ({ pad, server, connect }) => {
    assert.throws(() => pad.kill(1999), /2s/);
    pad.kill(2000);
    await waitUntil(() => server.padlink.killed.has(pad.device));
    assert.equal(state.armed, false);
    assert.throws(() => pad.key("buy"), /killed/);
    const next = new PadSimulatorV2({
      device: pad.device,
      fragmentBytes: 97,
      stateFile: pad.stateFile,
      identity: pad.identity,
      exchange: pad.exchange,
    });
    await pad.close();
    await connect(next);
    assert.equal(next.killed, true);
    assert.equal(state.armed, false);
    server.padlink.rearm(next.device);
    await next.waitFor((m) => m.type === "rearm_request");
    next.send({ type: "rearm_confirm" });
    await next.waitFor((m) => m.type === "result" && /rearm hold/.test(m.error));
    assert.equal(server.padlink.killed.has(next.device), true);
    const peer = [...server.padlink.peers][0];
    peer.rearmUntil = Date.now() - 1;
    next.send({ type: "rearm_confirm", heldMs: 800 });
    await waitUntil(() => !next.session.pending.size);
    assert.equal(server.padlink.killed.has(next.device), true);
    const after = next.history.length;
    server.padlink.rearm(next.device);
    await next.waitFor((m) => m.type === "rearm_request", { after });
    next.pressConfirm();
    assert.throws(() => next.confirm(), /800ms/);
    await delay(810);
    next.confirm();
    await next.waitFor((m) => m.type === "rearm_complete");
    assert.equal(next.killed, false);
    assert.equal(state.armed, true);
  }));
test(
  "v2 OTA sends actual compiled signed release; bad signatures are rejected by desk and pad",
  { timeout: 120000 },
  async () =>
    lab(async ({ pad, server }) => {
      const manifest = JSON.parse(
        await readFile(
          new URL(
            "../../firmware/build/artifacts/manifest.json",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      const image = await readFile(
        new URL("../../firmware/build/artifacts/app.bin", import.meta.url),
      );
      pad.otaPublicKey = OTA_PUBLIC_KEY;
      await assert.rejects(
        server.padlink.update(
          pad.device,
          { ...manifest, signature: "00".repeat(64) },
          image,
          OTA_PUBLIC_KEY,
        ),
        /signature/,
      );
      const peer = [...server.padlink.peers][0];
      server.padlink.send(peer, {
        type: "ota_begin",
        id: "bad-ota",
        manifest: { ...manifest, signature: "00".repeat(64) },
      });
      await pad.waitFor((m) => m.id === "bad-ota");
      await waitUntil(() => !pad.session.pending.size);
      assert.equal(pad.ota, null);
      assert.equal(pad.installedHash, undefined);
      await server.padlink.update(pad.device, manifest, image, OTA_PUBLIC_KEY);
      assert.equal(pad.installedHash, sha(image).toString("hex"));
      assert.equal(peer.otaStatus.progress, 100);
    }),
);
const networkUnavailable = (e) =>
  /fetch failed|ECONN|ENOTFOUND|HTTP (408|429|5\d\d)|429\s*:|Too Many/i.test(
    e.message,
  );
test(
  "v2 encrypted live devnet signal, matching fingerprint, hold confirmation, and verified historical receipt",
  { timeout: 120000 },
  async (t) => {
    try {
      await lab(async ({ pad, server, mem }) => {
        const pm = await import("../main/chains/pmamm.mjs");
        const market = (await pm.markets())
          .filter(
            (m) =>
              m.liquidity > 10 &&
              m.yesPrice > 0.1 &&
              m.yesPrice < 0.9 &&
              m.endTs > Date.now() / 1000 + 180,
          )
          .sort((a, b) => b.liquidity - a.liquidity)[0];
        if (!market) throw Error("Setup required: liquid live devnet market");
        const action = `pmamm:${market.market}:yes`;
        await mem.setReference("risk/limits", {
          allow: [action],
          max_trade_usd: 1,
          max_day_usd: 1,
        });
        server.padlink.setOptions({ holdThreshold: 0 });
        const createdId = pad.key(action);
        const result = await pad.waitFor(
          (m) => m.type === "result" && m.id === createdId,
          { timeout: 90000 },
        );
        assert.equal(result.ok, true, result.error);
        const signal = await pad.waitFor(
          (m) => m.type === "signal" || m.type === "error",
          { timeout: 10000 },
        );
        assert.equal(signal.type, "signal", JSON.stringify(signal));
        assert.equal(signal.fingerprint, fingerprint(signal.trusted));
        assert.equal(
          signal.fingerprint,
          server.signals.get(signal.signalId).fingerprint,
        );
        assert.equal(signal.trusted.side, "yes");
        assert.throws(() => pad.key("yes"), /800ms/);
        pad.pressConfirm();
        await delay(810);
        const acceptedId = pad.confirm();
        await pad.waitFor((m) => m.type === "result" && m.id === acceptedId, {
          timeout: 90000,
        });
        assert.notEqual(server.signals.get(signal.signalId).state, "awaiting");
        const signature =
          "5hFEx7T33RLSekreevbuEZ1khnJojRi97eJ3EWndjpACwvxcFhtBfyPbRS8NQrcRtTW7ACcaCo2Be5kyxsqPnoKU";
        const tx = await (
          await pm.devnetConnection()
        ).getTransaction(signature, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        });
        assert(tx);
        assert.equal(tx.meta.err, null);
        server.signals.publish({
          type: "receipt",
          receipt: {
            signalId: "historical-replay",
            signature,
            explorer: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
          },
        });
        assert.equal(
          (await pad.waitFor((m) => m.type === "receipt")).signature,
          signature,
        );
        console.log(
          "v2 transport verified against a live devnet quote and an independently verified historical receipt; no new fill claimed",
        );
      });
    } catch (e) {
      if (networkUnavailable(e)) return t.skip(e.message);
      throw e;
    }
  },
);
