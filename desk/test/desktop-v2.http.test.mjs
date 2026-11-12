/** Real local app state/HTTP. No external API responses or chain fills are mocked. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const dir = await mkdtemp(path.join(tmpdir(), "xorr-v2-http-"));
process.env.XORR_USER_DATA = dir;
process.env.PAD_TOKEN = "v2-http-test";
const { Memory } = await import("../main/memory.mjs"),
  { createServer } = await import("../main/server.mjs"),
  { DEFAULT_POLICY, checkPolicy } = await import("../main/permissions.mjs");
let server, mem;
const origin = "http://127.0.0.1:8719",
  headers = {
    authorization: "Bearer v2-http-test",
    "content-type": "application/json",
  };
async function call(p, body) {
  const r = await fetch(origin + p, {
    headers,
    method: body === undefined ? "GET" : "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: r.status, data: await r.json() };
}
before(async () => {
  mem = new Memory({ db: path.join(dir, "memory.db") });
  await mem.ping();
  server = createServer(mem);
  await new Promise((r, j) => {
    server.once("error", j);
    server.listen(8719, "127.0.0.1", r);
  });
});
after(async () => {
  await new Promise((r) => server.close(r));
  mem.stop();
  await rm(dir, { recursive: true, force: true });
});
test("v2 app is public and bundled; v1 and Classic remain public; writes require auth", async () => {
  for (const p of ["/", "/v1", "/classic"])
    assert.equal((await fetch(origin + p)).status, 200);
  const html = await (await fetch(origin + "/")).text();
  assert.match(html, /XOR Desktop/);
  assert.match(html, /\/desktop\/assets\//);
  for (const p of ["/desk/profiles", "/abilities", "/desk/connection"])
    assert.equal((await fetch(origin + p)).status, 401);
  assert.equal(
    (await fetch(origin + "/abilities/pulse", { method: "DELETE", headers }))
      .status,
    405,
  );
});
test("profiles persist keymaps and preserve four safety controls", async () => {
  const before = (await call("/pad/keymap")).data;
  const r = await call("/desk/profiles", { name: "Swing" });
  assert.equal(r.status, 200);
  assert.equal(r.data.active, "Swing");
  const after = (await call("/pad/keymap")).data;
  assert.ok(after.revision > before.revision);
  for (const a of ["yes", "no", "mic", "kill"])
    assert.deepEqual(
      after.keys.find((k) => k.action === a),
      before.keys.find((k) => k.action === a),
    );
  assert.equal((await call("/desk/profiles", { name: "unsafe" })).status, 400);
});
test("ability installation actually changes bindings and uninstall restores them", async () => {
  const before = (await call("/pad/keymap")).data;
  const r = await call("/abilities/pulse", {
    installed: true,
    keys: [0],
    config: { market: "SOL" },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const a = r.data.abilities.find((a) => a.id === "pulse");
  assert.equal(a.installed, true);
  assert.equal(a.bindings[0].action, "ability:pulse");
  assert.equal((await call("/abilities/pulse/run", {})).data.market, "SOL");
  assert.equal(
    (await call("/abilities/pulse", { installed: false })).status,
    200,
  );
  assert.deepEqual((await call("/pad/keymap")).data.keys[0], before.keys[0]);
});
test("missing voice setup never installs fake capability or rebinds safety keys", async () => {
  const before = (await call("/pad/keymap")).data;
  const r = await call("/abilities/voice", {
    installed: true,
    keys: [0],
    config: {},
  });
  assert.equal(r.status, 503);
  assert.match(r.data.error, /Setup required: Deepgram/);
  assert.deepEqual((await call("/pad/keymap")).data, before);
  const no = before.keys.findIndex((k) => k.action === "no");
  assert.notEqual(
    (
      await call("/abilities/pulse", {
        installed: true,
        keys: [no],
        config: { market: "SOL" },
      })
    ).status,
    200,
  );
  assert.equal((await call("/agent/voice-test", {})).status, 503);
});
test("firmware status cannot claim an unsigned update is ready", async () => {
  const r = await call("/desk/connection");
  assert.equal(r.data.firmware.available, false);
  assert.match(r.data.firmware.setupRequired, /signed firmware/);
  assert.equal(r.data.host.backend, "reachable");
});
test("loss cooldown uses confirmed realized loss metadata; unknown PnL is not fabricated", () => {
  const now = Date.now(),
    policy = { ...DEFAULT_POLICY, lossCooldownSeconds: 900 };
  const signal = {
    symbol: "SOL",
    side: "BUY",
    kind: "spot",
    venue: "jupiter",
    sizeUsd: 1,
  };
  const record = {
    ts: new Date(now - 10000).toISOString(),
    acted: { executed: true },
    forward: {
      receipt: {
        signature: "unit-input-not-a-chain-receipt",
        confirmedAt: new Date(now - 10000).toISOString(),
      },
    },
  };
  assert.equal(
    checkPolicy(signal, { journal_recent: [record] }, policy, { now }).action,
    "EXECUTE",
  );
  const loss = structuredClone(record);
  loss.forward.receipt.realizedPnlUsd = -1;
  assert.equal(
    checkPolicy(signal, { journal_recent: [loss] }, policy, { now }).ruleId,
    "permissions.loss_cooldown",
  );
  loss.acted.executed = false;
  assert.equal(
    checkPolicy(signal, { journal_recent: [loss] }, policy, { now }).action,
    "EXECUTE",
  );
});
