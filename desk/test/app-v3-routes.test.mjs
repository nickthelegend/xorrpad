/** D1: shipped Connect bundle + real authenticated HTTP and encrypted padsim.
 * Extend the route list as the remaining v3 screens land. No API interception.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { PadSimulatorV2 } from "../../tools/padsim/v2.mjs";
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
  ["/pad/rearm", "POST"],
  ["/pad/profiles", "GET"],
  ["/pad/profile", "POST"],
  ["/pad/options", "GET"],
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

test("D1 built app references real routes; auth, methods and no-pad states are honest", async () => {
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
