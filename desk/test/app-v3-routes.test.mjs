/** D5: all brief routes in the shipped bundle + real authenticated HTTP,
 * encrypted padsim and responsive screenshots. No API interception.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { WebSocket } from "ws";
import { assertReadableLayout } from "./app-v3-layout.mjs";
import { PadSimulatorV2 } from "../../tools/padsim/v2.mjs";
import { AbilityPadSimulator } from "../../tools/padsim/abilities.mjs";
import { abilityText } from "../main/wasm-abilities.mjs";
import { PadLink } from "../main/padlink.mjs";
import { keypair, rawPublic } from "../main/pad-v2.mjs";
import { OTA_PUBLIC_KEY } from "../main/firmware-release.mjs";
import { issueCertificate } from "../../firmware/factory-cert.mjs";

const dir = await mkdtemp(path.join(tmpdir(), "xorr-app-v3-"));
process.env.XORR_USER_DATA = dir;
process.env.PAD_TOKEN = "isolated-app-v3-test";
const { createServer } = await import("../main/server.mjs");
const { Memory } = await import("../main/memory.mjs");
const headers = {
  authorization: "Bearer isolated-app-v3-test",
  "content-type": "application/json",
};
const routes = [
  ["/pad/pair", "POST"],
  ["/desk/link", "GET"],
  ["/desk/status", "GET"],
  ["/pad/manifest", "POST"],
  ["/pad/ota", "POST"],
  ["/pad/ota-channel", "POST"],
  ["/pad/ota-channel", "GET"],
  ["/pad/rearm", "POST"],
  ["/pad/profiles", "GET"],
  ["/pad/profiles", "POST"],
  ["/pad/profile", "POST"],
  ["/pad/options", "GET"],
  ["/pad/options", "POST"],
  ["/pad/abilities", "GET"],
  ["/pad/abilities", "POST"],
  ["/wallet/mode", "GET"],
  ["/wallet/mode", "POST"],
  ["/pad/session", "GET"],
  ["/pad/session", "POST"],
  ["/pad/clear-sign", "POST"],
  ["/pad/crew", "GET"],
  ["/pad/crew", "POST"],
  ["/pad/price-alerts", "GET"],
  ["/pad/price-alerts", "POST"],
  ["/events", "GET"],
];
const output = new URL("../../docs/screens/v3/", import.meta.url);
let server, mem, origin;

async function until(fn) {
  for (let i = 0; i < 500; i++) {
    if (fn()) return;
    await delay(10);
  }
  throw Error("Encrypted padsim handshake timed out");
}
before(async () => {
  mem = new Memory({ db: path.join(dir, "memory.db") });
  server = createServer(mem);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.padlink.close();
  server.signals.close();
  await new Promise((resolve) => server.close(resolve));
  mem.stop();
  await rm(dir, { recursive: true, force: true });
});

test("D5 built app references every brief route; auth, methods and no-pad states are honest", async () => {
  const assets = new URL("../app/dist/assets/", import.meta.url);
  const bundle = (
    await Promise.all(
      (await readdir(assets))
        .filter((name) => name.endsWith(".js"))
        .map((name) => readFile(new URL(name, assets), "utf8")),
    )
  ).join("\n");
  for (const [route, method] of routes) {
    assert.ok(bundle.includes(route), `Built app must use ${route}`);
    assert.equal((await fetch(origin + route, { method })).status, 401);
    assert.equal((await fetch(origin + route, {
      method, headers: { ...headers, authorization: "Bearer wrong-token" },
    })).status, 401, `${method} ${route}: reject invalid auth`);
    assert.equal(
      (await fetch(origin + route, { method: "DELETE", headers })).status,
      405,
    );
  }
  const pairing = await fetch(origin + "/pad/pair", {
    method: "POST",
    headers,
    body: "{}",
  });
  assert.equal(pairing.status, 400);
  assert.equal(
    (await pairing.json()).error,
    "scan device QR and enter its current code",
  );
  for (const route of ["/desk/link", "/desk/status"]) {
    const response = await fetch(origin + route, { headers });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).devices, []);
  }
  for (const [route, body] of [
    ["/pad/rearm", { device: "absent" }],
    ["/pad/profile", { device: "absent", profile: 0, layer: 0 }],
    ["/pad/ota-channel", { device: "absent", channel: "stable" }],
    ["/pad/manifest", { manifest: {} }],
    ["/pad/ota", {}],
    ["/pad/abilities", { device: "absent", action: "developer", developerPublicKey: "ab".repeat(32) }],
    ["/pad/abilities", { device: "absent", action: "remove", slot: 0 }],
    ["/pad/session", { device: "absent", policy: {} }],
    ["/pad/clear-sign", { device: "absent" }],
    ["/pad/price-alerts", { device: "absent", alerts: [] }],
  ]) {
    const response = await fetch(origin + route, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    assert.ok(response.status >= 400, route);
    assert.ok((await response.json()).error.length > 0, route);
  }
  assert.deepEqual(
    await (await fetch(origin + "/pad/profiles", { headers })).json(),
    [],
  );
  assert.equal(
    typeof (await (await fetch(origin + "/pad/options", { headers })).json())
      .night,
    "boolean",
  );
  assert.equal((await fetch(origin + "/classic")).status, 200);
  const session = await fetch(origin + "/pad/session?device=absent", { headers });
  assert.ok(session.status >= 400);
  assert.equal((await session.json()).error, "Setup required: select one paired, online, rearmed pad");
  const alerts = await fetch(origin + "/pad/price-alerts?device=absent", { headers });
  assert.ok(alerts.status >= 400);
  assert.equal((await alerts.json()).error, "Setup required: select one paired, online, rearmed pad");
  const crew = await (await fetch(origin + "/pad/crew", { headers })).json();
  assert.deepEqual(crew.rounds, []);
  assert.equal(crew.policy.enabled, false);
  const absent = await fetch(origin + "/pad/abilities?device=absent", { headers });
  assert.ok(absent.status >= 400);
  assert.equal((await absent.json()).error, "Setup required: select one paired, online, rearmed pad");
});

test("D5 remaining no-pad reads and writes return actual settings or readable errors", async () => {
  for (const [route, method, body] of [
    ["/pad/ota-channel?device=absent", "GET"],
    ["/pad/session", "POST", { device: "absent", policy: {} }],
    ["/pad/crew", "POST", { enabled: true, aboveUsd: 100, required: 2, members: [] }],
    ["/pad/profiles", "POST", { profiles: [] }],
    ["/pad/options", "POST", { unknownSetting: true }],
    ["/wallet/mode", "POST", { mode: "invented" }],
  ]) {
    const response = await fetch(origin + route, {
      method, headers, ...(body ? { body: JSON.stringify(body) } : {}),
    });
    assert.ok(response.status >= 400 && response.status < 500, `${method} ${route}`);
    const result = await response.json();
    assert.equal(typeof result.error, "string");
    assert.ok(result.error.trim().length > 0, `${route}: readable error`);
  }
  // These are persisted desk configuration, not a claim of a connected pad.
  const mode = await fetch(origin + "/wallet/mode", { headers });
  assert.equal(mode.status, 200);
  assert.deepEqual(await mode.json(), { mode: "phone" });
  const options = await fetch(origin + "/pad/options", { headers });
  assert.equal(options.status, 200);
  assert.deepEqual(await options.json(), server.padlink.options);
  const crew = await fetch(origin + "/pad/crew", { headers });
  assert.equal(crew.status, 200);
  assert.deepEqual(await crew.json(), { policy: server.executor.crew.read(), rounds: [] });
  assert.deepEqual(server.padlink.snapshot().devices, []);
});

test("D5 events require WebSocket authentication and begin with an honest empty snapshot", { timeout: 10000 }, async () => {
  const url = origin.replace("http:", "ws:") + "/events";
  for (const protocols of [[], ["xorrpad", "pad-token.wrong-token"]]) {
    const ws = new WebSocket(url, protocols);
    try {
      await new Promise((resolve, reject) => {
        ws.once("open", () => reject(Error("Unauthenticated events opened")));
        ws.once("error", reject);
        ws.once("unexpected-response", (_req, res) => {
          res.resume();
          try { assert.equal(res.statusCode, 401); resolve(); } catch (error) { reject(error); }
        });
      });
    } finally { ws.terminate(); }
  }
  const http = await fetch(origin + "/events", { headers });
  assert.equal(http.status, 426);
  assert.equal((await http.json()).error, "use WebSocket at /events");
  const ws = new WebSocket(url, ["xorrpad", "pad-token.isolated-app-v3-test"]);
  try {
    const snapshot = await new Promise((resolve, reject) => {
      ws.once("error", reject);
      ws.once("message", (data) => {
        try { resolve(JSON.parse(data)); } catch (error) { reject(error); }
      });
    });
    assert.deepEqual(snapshot, { type: "snapshot", signals: [] });
    assert.equal(ws.protocol, "xorrpad");
  } finally { ws.terminate(); }
});

test(
  "Connect pairs real USB CRC pads, separates attestation, clears trust and fits 375/1440",
  { timeout: 120000 },
  async () => {
    const browser = await chromium.launch({
      headless: true,
      args: ["--disable-gpu"],
    });
    const page = await browser.newPage({ reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let pad;
    async function capture(state) {
      for (const width of [1440, 375]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(async () => {
          window.scrollTo(0, 0);
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
        });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
          `${state} ${width} overflow`,
        );
        for (const control of await page
          .locator(
            ".connect-page button, .connect-page input, .connect-page select, .connect-page a.button",
          )
          .all()) {
          const bounds = await control.boundingBox();
          if (bounds)
            assert.ok(bounds.height >= 44, `${state}: tap target below 44px`);
        }
        await assertReadableLayout(page, page.locator(".connect-page"), `Connect ${state} ${width}`);
        await page.screenshot({
          path: path.join(
            fileURLToPath(output),
            `connect-${state}-${width}.png`,
          ),
          fullPage: true,
          animations: "disabled",
        });
      }
    }
    try {
      await mkdir(output, { recursive: true });
      await page.goto(origin + "/?token=isolated-app-v3-test#connect");
      await page.getByText("No pad connected.", { exact: false }).waitFor();
      await page
        .getByRole("button", { name: "Connect a pad", exact: true })
        .waitFor();
      await capture("empty");

      pad = new PadSimulatorV2({
        device: "esp32-123456abcdef",
        serial: true,
        fragmentBytes: 73,
      });
      pad.firmware = "3.0.0";
      await pad.listen(8726);
      let peer = server.padlink.attach(
        net.createConnection(8726, "127.0.0.1"),
        "usb",
      );
      await page.getByLabel("Code on the pad", { exact: true }).waitFor();
      await page.getByLabel("Code on the pad", { exact: true }).fill(pad.code);
      await capture("pair");
      await page
        .getByRole("button", { name: "Pair securely", exact: true })
        .click();
      await until(() => peer.verified && pad.verified);
      await page
        .getByText("Encrypted pairing confirmed by the pad.", { exact: true })
        .waitFor();
      await page
        .getByText("Unverified device", { exact: true })
        .first()
        .waitFor();
      const snapshot = server.padlink.snapshot().devices[0];
      assert.equal(snapshot.secure, true);
      assert.equal(snapshot.attestation.verified, false);
      await page
        .getByText(snapshot.attestation.reason, { exact: true })
        .first()
        .waitFor();
      assert.equal(
        await page
          .locator(".pairing-copy .badge")
          .evaluate((node) => getComputedStyle(node).color),
        "rgb(255, 163, 173)",
      );
      await capture("unverified");
      peer.close();
      await pad.close();
      await page.getByText("No pad connected.", { exact: false }).waitFor();
      assert.equal(
        await page.getByText("Unverified device", { exact: true }).count(),
        0,
      );

      // A transient test factory is injected through the PadLink constructor only.
      // The public production roots remain unchanged and empty.
      const factory = keypair("ed25519"),
        identity = keypair("ed25519");
      const certificate = issueCertificate(
        {
          serial: "esp32-abcdef123456",
          deviceKey: rawPublic(identity.publicKey),
        },
        factory.privateKey,
      );
      server.padlink.close();
      server.padlink = new PadLink({
        baseUrl: origin,
        dir: path.join(dir, "genuine"),
        token: process.env.PAD_TOKEN,
        signals: server.signals,
        factoryRoots: [rawPublic(factory.publicKey)],
      });
      server.padlink.bind(server);
      server.executor.setPadLink(server.padlink);
      pad = new PadSimulatorV2({
        device: certificate.serial,
        identity,
        certificate,
        serial: true,
      });
      pad.firmware = "3.0.0";
      await pad.listen(8726);
      peer = server.padlink.attach(
        net.createConnection(8726, "127.0.0.1"),
        "usb",
      );
      await page.getByLabel("Code on the pad", { exact: true }).waitFor();
      await page.getByLabel("Code on the pad", { exact: true }).fill("000000");
      await page
        .getByRole("button", { name: "Pair securely", exact: true })
        .click();
      await page
        .getByText(
          "Setup required: pairing was not confirmed by the pad. Check its current code, try again and reconnect the pad.",
          { exact: true },
        )
        .waitFor();
      assert.equal(await page.getByText(/Genuine xorrpad/).count(), 0);
      await page.getByLabel("Code on the pad", { exact: true }).fill(pad.code);
      const retried = page.waitForResponse(
        (response) =>
          response.url().endsWith("/pad/pair") &&
          response.request().method() === "POST",
      );
      await page
        .getByRole("button", { name: "Pair securely", exact: true })
        .click();
      assert.equal((await retried).status(), 200);
      // Failed encrypted-session retries close the byte stream. Reconnect it as
      // instructed by the UI, using the corrected code now held by the desk.
      peer.close();
      await until(() => pad.stream.destroyed);
      peer = server.padlink.attach(
        net.createConnection(8726, "127.0.0.1"),
        "usb",
      );
      await until(() => peer.verified && pad.verified);
      await page
        .getByText(`Genuine xorrpad #${pad.device}`, { exact: true })
        .first()
        .waitFor();
      assert.equal(
        await page
          .locator(".pairing-copy .badge")
          .evaluate((node) => getComputedStyle(node).color),
        "rgb(200, 245, 60)",
      );
      await capture("genuine");
      for (const name of ["Wi-Fi", "Bluetooth"]) {
        await page.getByRole("button", { name: new RegExp(name) }).click();
        assert.equal(await page.getByText(/Genuine xorrpad/).count(), 0);
        await page.getByText("No pad connected.", { exact: false }).waitFor();
      }
      await page.getByRole("button", { name: /USB-C/ }).click();
      await page
        .getByText(`Genuine xorrpad #${pad.device}`, { exact: true })
        .first()
        .waitFor();
      peer.close();
      await pad.close();
      await page.getByText("No pad connected.", { exact: false }).waitFor();
      assert.equal(await page.getByText(/Genuine xorrpad/).count(), 0);
      assert.equal(
        await page
          .getByText("Encrypted pairing confirmed by the pad.", { exact: true })
          .count(),
        0,
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await pad?.close();
    }
  },
);

test(
  "Device uses real firmware, channel, hold, profile-layer editing and options routes",
  { timeout: 300000 },
  async () => {
    const browser = await chromium.launch({
      headless: true,
      args: ["--disable-gpu"],
    });
    const page = await browser.newPage({ reducedMotion: "reduce" });
    const errors = [],
      progress = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const pad = new PadSimulatorV2({
      device: "esp32-d2abcdef1234",
      serial: true,
    });
    pad.otaPublicKey = OTA_PUBLIC_KEY;
    const capture = async (state) => {
      for (const width of [1440, 375]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(async () => {
          window.scrollTo(0, 0);
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
        });
        // Viewport changes also switch the real 3D pad to its mobile poster.
        // Wait for that responsive lifecycle before measuring or capturing it.
        await page.waitForFunction(
          () => document.documentElement.scrollWidth <= innerWidth,
          null,
          { timeout: 5000 },
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
          `${state} ${width} overflow`,
        );
        for (const control of await page
          .locator(
            ".device-controls button, .device-controls input, .device-controls select",
          )
          .all()) {
          const bounds = await control.boundingBox();
          if (bounds)
            assert.ok(bounds.height >= 44, `${state}: tap target below 44px`);
        }
        await assertReadableLayout(page, page.locator(".device-controls"), `Device ${state} ${width}`);
        await page.screenshot({
          path: path.join(
            fileURLToPath(output),
            `device-${state}-${width}.png`,
          ),
          fullPage: true,
          animations: "disabled",
        });
      }
    };
    const publish = server.signals.publish.bind(server.signals);
    server.signals.publish = (event) => {
      if (event.type === "ota_progress") progress.push(event);
      return publish(event);
    };
    try {
      await page.goto(origin + "/?token=isolated-app-v3-test#device");
      await page
        .getByRole("heading", { name: "No pad connected", exact: true })
        .waitFor();
      await page
        .getByRole("link", { name: "Connect a pad", exact: true })
        .waitFor();
      await capture("empty");
      await pad.listen(8726);
      pad.server.on("connection", (socket) => socket.setNoDelay(true));
      const peer = server.padlink.attach(
        net.createConnection(8726, "127.0.0.1").setNoDelay(true),
        "usb",
      );
      await until(() => server.padlink.pendingPairings.has(pad.device));
      server.padlink.pair(pad.pairing);
      await until(() => peer.verified && pad.verified);
      await page
        .getByRole("heading", { name: "Firmware", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Read channel", exact: true })
        .click();
      await page.getByText("Pad channel: stable", { exact: true }).waitFor();
      await page
        .getByRole("combobox", { name: /^OTA channel/ })
        .selectOption("beta");
      assert.equal(
        pad.otaChannel,
        "stable",
        "selection alone cannot opt into beta",
      );
      await page
        .getByRole("button", { name: "Save channel", exact: true })
        .click();
      await page
        .getByText("Pad channel saved: beta", { exact: true })
        .waitFor();
      assert.equal(pad.otaChannel, "beta");

      await page.getByLabel("Brightness (1–255)").fill("77");
      await page
        .getByRole("combobox", { name: /^Night mode/ })
        .selectOption("true");
      await page
        .getByRole("button", { name: "Save pad options", exact: true })
        .click();
      await page.getByText("Pad options saved.", { exact: true }).waitFor();
      assert.equal(server.padlink.options.brightness, 77);
      assert.equal(server.padlink.options.night, true);
      await pad.waitFor(
        (m) => m.type === "config" && m.brightness === 77 && m.night,
      );

      await page.getByLabel("New profile name").fill("D2 keys");
      await page
        .getByRole("button", { name: "Create profile from current keys" })
        .click();
      await page
        .getByRole("button", { name: "Activate selected layer", exact: true })
        .waitFor();
      // Fill all eight real persisted slots, then exercise the last layer through the UI.
      const first = server.padlink.profiles[0];
      server.padlink.setProfiles(
        Array.from({ length: 8 }, (_, i) => ({
          ...structuredClone(first),
          name: `D2 ${i + 1}`,
        })),
      );
      await page.reload();
      await page
        .getByRole("combobox", { name: /^Pad profile/ })
        .selectOption("7");
      await page.getByRole("button", { name: "Layer 3", exact: true }).click();
      await page.getByRole("button", { name: /Configure key 1:/ }).click();
      await page
        .getByLabel("Key label", { exact: true })
        .fill("D2 LAYER THREE");
      await page.getByRole("button", { name: /Save & push key/ }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      assert.equal(
        server.padlink.profiles[7].layers[2].keys[0].label,
        "D2 LAYER THREE",
      );
      assert.notEqual(
        server.padlink.profiles[7].layers[1].keys[0].label,
        "D2 LAYER THREE",
      );
      assert.notEqual(server.padlink.keymap.keys[0].label, "D2 LAYER THREE");
      await page
        .getByRole("button", { name: "Activate selected layer", exact: true })
        .click();
      await pad.waitFor(
        (m) => m.type === "profile_select" && m.profile === 7 && m.layer === 2,
      );
      // The simulator exposes explicit pad-origin state, just as a physical hold is explicit below.
      pad.send({ type: "profile_state", ok: true, profile: 7, layer: 2 });
      await page
        .getByText("Pad reports: profile 8, layer 3 · active", { exact: true })
        .waitFor();
      pad.kill(2000);
      await page.getByText("Kill latch active", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Re-arm", exact: true }).click();
      await page
        .getByText("Hold YES on the pad for 800ms", { exact: true })
        .waitFor();
      assert.equal(server.padlink.killed.has(pad.device), true);
      await capture("connected");
      pad.pressConfirm();
      await delay(820);
      pad.confirm();
      await page.getByText("Kill latch clear", { exact: true }).waitFor();

      await page.getByLabel("Signed manifest.json").setInputFiles({
        name: "invalid.json",
        mimeType: "application/json",
        buffer: Buffer.from("{}"),
      });
      await page
        .getByRole("heading", { name: "Device request failed" })
        .waitFor();
      await capture("error");
      const release = new URL(
        "../../firmware/build/artifacts/",
        import.meta.url,
      );
      await page
        .getByLabel("Signed manifest.json")
        .setInputFiles(fileURLToPath(new URL("manifest.json", release)));
      await page.getByText(/Verified firmware/).waitFor();
      await page
        .getByRole("button", { name: "Save pad options", exact: true })
        .click();
      await page.getByText("Pad options saved.", { exact: true }).waitFor();
      await page.getByText(/Verified firmware/).waitFor();
      assert.equal(
        await page
          .getByLabel("Signed manifest.json")
          .evaluate((input) => input.files.length),
        1,
      );
      await page
        .getByLabel("Firmware app.bin")
        .setInputFiles(fileURLToPath(new URL("app.bin", release)));
      await page.getByLabel("Optional delta.bin").setInputFiles({
        name: "wrong-delta.bin",
        mimeType: "application/octet-stream",
        buffer: Buffer.from([1, 2, 3]),
      });
      await page
        .getByRole("button", { name: "Update firmware", exact: true })
        .click();
      await page
        .getByText("Select the delta.bin matching this manifest", {
          exact: true,
        })
        .waitFor();
      await page.getByLabel("Optional delta.bin").setInputFiles([]);
      await page
        .getByRole("button", { name: "Update firmware", exact: true })
        .click();
      await page
        .getByText("OTA: rebooting · 100% transferred", { exact: true })
        .waitFor({ timeout: 180000 });
      assert.ok(
        progress.some((e) => e.progress === 0 && e.state === "uploading"),
      );
      assert.ok(progress.some((e) => e.progress > 0 && e.progress < 100));
      assert.equal(progress.at(-1).state, "rebooting");
      assert.equal(progress.at(-1).device, pad.device);
      const manifest = JSON.parse(
        await readFile(new URL("manifest.json", release), "utf8"),
      );
      assert.equal(pad.installedHash, manifest.sha256);
      await capture("updated");
      peer.close();
      await pad.close();
      await page
        .getByRole("heading", { name: "No pad connected", exact: true })
        .waitFor();
      assert.equal(
        await page
          .getByRole("heading", { name: "Firmware", exact: true })
          .count(),
        0,
      );
      assert.deepEqual(errors, []);
    } catch (error) {
      console.error(
        "Device browser failure:",
        error.message,
        errors,
        await page.locator("body").innerText(),
        await page.evaluate(() =>
          [...document.querySelectorAll("body *")]
            .filter((n) => n.getBoundingClientRect().right > innerWidth + 1)
            .map((n) => [n.className, n.getBoundingClientRect().right])
            .slice(0, 15),
        ),
      );
      throw error;
    } finally {
      server.signals.publish = publish;
      await browser.close();
      await pad.close();
    }
  },
);

test("D3 Abilities trusts on pad, installs both signed SDK examples and removes slots", { timeout: 120000 }, async () => {
  const browser = await chromium.launch({ headless: true, args: ["--disable-gpu"] });
  const page = await browser.newPage({ reducedMotion: "reduce" });
  const errors = [], requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.url().endsWith("/pad/abilities") && r.method() === "POST") requests.push(r.postDataJSON());
  });
  const pad = new AbilityPadSimulator({ device: "esp32-d3abcdef1234", serial: true });
  let other;
  const keys = generateKeyPairSync("ed25519");
  const developer = rawPublic(keys.publicKey);
  const area = page.locator(".on-pad-abilities");
  async function bundle(id) {
    const base = new URL("../../sdk/abilities/", import.meta.url);
    const sample = JSON.parse(await readFile(new URL(`samples/${id}.json`, base), "utf8"));
    const wasm = await readFile(new URL(`out/${id}.wasm`, base));
    const manifest = { ...sample, abi: 1, sha256: createHash("sha256").update(wasm).digest("hex"), size: wasm.length,
      developerPublicKey: developer, signature: "0".repeat(128) };
    // Transient test-only signer. No existing private material is read or persisted.
    manifest.signature = sign(null, Buffer.from(abilityText(manifest)), keys.privateKey).toString("hex");
    return { manifest, wasm: wasm.toString("hex") };
  }
  const pulse = await bundle("market-pulse"), timer = await bundle("pomodoro");
  const upload = async (slot, value) => area.getByLabel(`Signed bundle for slot ${slot} (.json)`).setInputFiles({
    name: "sample.bundle.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)),
  });
  async function capture(state) {
    await mkdir(output, { recursive: true });
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(async () => { window.scrollTo(0, 0); await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${state} ${width} overflow`);
      for (const control of await area.locator("button, input, select, a.button").all()) {
        const bounds = await control.boundingBox();
        if (bounds) assert.ok(bounds.height >= 44, `${state}: tap target below 44px`);
      }
      await assertReadableLayout(page, area, `Abilities ${state} ${width}`);
      await page.screenshot({ path: path.join(fileURLToPath(output), `abilities-${state}-${width}.png`), fullPage: true, animations: "disabled" });
    }
  }
  try {
    await page.goto(origin + "/?token=isolated-app-v3-test#abilities");
    await area.getByRole("heading", { name: "No pad connected", exact: true }).waitFor();
    await area.getByRole("link", { name: "Connect a pad", exact: true }).waitFor();
    // The incumbent desktop catalog is still present, independent of pad trust.
    await page.getByRole("heading", { name: "Find your next ability.", exact: true }).waitFor();
    await capture("empty");
    await pad.listen(8726);
    pad.server.on("connection", (socket) => socket.setNoDelay(true));
    const peer = server.padlink.attach(net.createConnection(8726, "127.0.0.1").setNoDelay(true), "usb");
    await until(() => peer.candidate);
    server.padlink.pair(pad.pairing);
    await until(() => peer.verified && pad.verified);
    await area.getByRole("heading", { name: "Slot 1 · Empty", exact: true }).waitFor();
    assert.equal(await area.getByRole("button", { name: "Verify & install slot 1", exact: true }).isDisabled(), true);
    await area.getByLabel("Developer public key", { exact: true }).fill(developer);
    await area.getByRole("button", { name: "Review developer on pad", exact: true }).click();
    await area.getByText("Developer review requested.", { exact: false }).waitFor();
    assert.equal((await server.padlink.abilities(pad.device)).developerPublicKey, "");
    await capture("review");
    await assert.rejects(pad.approveDeveloper(799), /hold/);
    await pad.approveDeveloper();
    await area.getByRole("button", { name: "Refresh abilities", exact: true }).click();
    await area.getByText(developer, { exact: true }).waitFor();
    await upload(1, pulse);
    await area.getByRole("button", { name: "Verify & install slot 1", exact: true }).click();
    await area.getByRole("heading", { name: "Slot 1 · Market Pulse", exact: true }).waitFor();
    await upload(2, timer);
    await area.getByRole("button", { name: "Verify & install slot 2", exact: true }).click();
    await area.getByRole("heading", { name: "Slot 2 · Pomodoro discipline", exact: true }).waitFor();
    const installed = await server.padlink.abilities(pad.device);
    assert.deepEqual(installed.slots.map((s) => s.running), [true, true]);
    for (const [slot, caps] of [[1, pulse.manifest.capabilities], [2, timer.manifest.capabilities]]) {
      const card = area.locator(".surface").filter({ has: page.getByRole("heading", { name: new RegExp(`^Slot ${slot} ·`) }) });
      for (const cap of caps) await card.locator(".badge").getByText(cap, { exact: true }).first().waitFor();
    }
    await capture("installed");
    await upload(1, { ...pulse, manifest: { ...pulse.manifest, signature: "0".repeat(128) } });
    await area.getByRole("button", { name: "Verify & replace slot 1", exact: true }).click();
    await area.getByText("Ability developer signature refused", { exact: true }).waitFor();
    assert.equal((await server.padlink.abilities(pad.device)).slots[0].running, true);
    await capture("error");
    await upload(1, {});
    await area.getByText("Choose a signed ability bundle", { exact: true }).waitFor();
    assert.equal(await area.getByRole("button", { name: "Verify & replace slot 1", exact: true }).isDisabled(), true);
    for (const slot of [1, 2]) {
      await area.getByRole("button", { name: `Remove from slot ${slot}`, exact: true }).click();
      await area.getByRole("heading", { name: `Slot ${slot} · Empty`, exact: true }).waitFor();
    }
    assert.deepEqual((await server.padlink.abilities(pad.device)).slots.map((s) => s.installed), [false, false]);
    assert.ok(requests.every((r) => r.device === pad.device));
    assert.deepEqual(requests.filter((r) => r.action === "install").map((r) => r.slot), [0, 1, 0]);

    other = new AbilityPadSimulator({ device: "esp32-d3fedcba4321", serial: true });
    await other.listen(8728);
    const otherPeer = server.padlink.attach(net.createConnection(8728, "127.0.0.1"), "usb");
    await until(() => otherPeer.candidate);
    server.padlink.pair(other.pairing);
    await until(() => otherPeer.verified && other.verified);
    await area.getByRole("option", { name: other.device, exact: true }).waitFor({ state: "attached" });
    await area.getByLabel("Ability pad", { exact: true }).selectOption(other.device);
    await area.getByText("Setup required: trust your developer on the pad.", { exact: true }).waitFor();
    assert.equal(await area.getByText(developer, { exact: true }).count(), 0);
    assert.equal(await area.getByText("Choose a signed ability bundle", { exact: true }).count(), 0);
    assert.equal(await area.getByLabel("Developer public key", { exact: true }).inputValue(), "");
    otherPeer.close();
    await other.close();
    await area.getByRole("heading", { name: "Selected pad disconnected", exact: true }).waitFor();
    assert.equal(await area.getByLabel("Developer public key", { exact: true }).count(), 0,
      "Disconnect must never silently redirect writes to the other pad");
    await area.getByLabel("Ability pad", { exact: true }).selectOption(pad.device);
    await area.getByText(developer, { exact: true }).waitFor();
    peer.close();
    await pad.close();
    await area.getByRole("heading", { name: "No pad connected", exact: true }).waitFor();
    assert.equal(await area.getByText(developer, { exact: true }).count(), 0);
    assert.equal(await area.getByLabel("Developer public key", { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await pad.close();
    await other?.close();
  }
});
