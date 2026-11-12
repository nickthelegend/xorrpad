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
import { issueCertificate } from "../../firmware/factory-cert.mjs";

const dir = await mkdtemp(path.join(tmpdir(), "xorr-app-v3-"));
process.env.XORR_USER_DATA = dir;
process.env.PAD_TOKEN = "isolated-app-v3-test";
const { createServer } = await import("../main/server.mjs");
const { Memory } = await import("../main/memory.mjs");
const headers = { authorization: "Bearer isolated-app-v3-test", "content-type": "application/json" };
const routes = [["/pad/pair", "POST"], ["/desk/link", "GET"], ["/desk/status", "GET"]];
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
  const bundle = (await Promise.all((await readdir(assets)).filter((name) => name.endsWith(".js"))
    .map((name) => readFile(new URL(name, assets), "utf8")))).join("\n");
  for (const [route, method] of routes) {
    assert.ok(bundle.includes(route), `Built app must use ${route}`);
    assert.equal((await fetch(origin + route, { method })).status, 401);
    assert.equal((await fetch(origin + route, { method: "DELETE", headers })).status, 405);
  }
  const pairing = await fetch(origin + "/pad/pair", { method: "POST", headers, body: "{}" });
  assert.equal(pairing.status, 400);
  assert.equal((await pairing.json()).error, "scan device QR and enter its current code");
  for (const route of ["/desk/link", "/desk/status"]) {
    const response = await fetch(origin + route, { headers });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).devices, []);
  }
  assert.equal((await fetch(origin + "/classic")).status, 200);
});

test("Connect pairs real USB CRC pads, separates attestation, clears trust and fits 375/1440", { timeout: 120000 }, async () => {
  const browser = await chromium.launch({ headless: true, args: ["--disable-gpu"] });
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
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${state} ${width} overflow`);
      for (const control of await page.locator(".connect-page button, .connect-page input, .connect-page select, .connect-page a.button").all()) {
        const bounds = await control.boundingBox();
        if (bounds) assert.ok(bounds.height >= 44, `${state}: tap target below 44px`);
      }
      await page.screenshot({ path: path.join(fileURLToPath(output), `connect-${state}-${width}.png`), fullPage: true, animations: "disabled" });
    }
  }
  try {
    await mkdir(output, { recursive: true });
    await page.goto(origin + "/?token=isolated-app-v3-test#connect");
    await page.getByText("No pad connected.", { exact: false }).waitFor();
    await page.getByRole("button", { name: "Connect a pad", exact: true }).waitFor();
    await capture("empty");

    pad = new PadSimulatorV2({ device: "esp32-123456abcdef", serial: true, fragmentBytes: 73 });
    pad.firmware = "3.0.0";
    await pad.listen(8726);
    let peer = server.padlink.attach(net.createConnection(8726, "127.0.0.1"), "usb");
    await page.getByLabel("Code on the pad", { exact: true }).waitFor();
    await page.getByLabel("Code on the pad", { exact: true }).fill(pad.code);
    await capture("pair");
    await page.getByRole("button", { name: "Pair securely", exact: true }).click();
    await until(() => peer.verified && pad.verified);
    await page.getByText("Encrypted pairing confirmed by the pad.", { exact: true }).waitFor();
    await page.getByText("Unverified device", { exact: true }).first().waitFor();
    const snapshot = server.padlink.snapshot().devices[0];
    assert.equal(snapshot.secure, true);
    assert.equal(snapshot.attestation.verified, false);
    await page.getByText(snapshot.attestation.reason, { exact: true }).first().waitFor();
    assert.equal(await page.locator(".pairing-copy .badge").evaluate((node) => getComputedStyle(node).color), "rgb(255, 163, 173)");
    await capture("unverified");
    peer.close();
    await pad.close();
    await page.getByText("No pad connected.", { exact: false }).waitFor();
    assert.equal(await page.getByText("Unverified device", { exact: true }).count(), 0);

    // A transient test factory is injected through the PadLink constructor only.
    // The public production roots remain unchanged and empty.
    const factory = keypair("ed25519"), identity = keypair("ed25519");
    const certificate = issueCertificate({ serial: "esp32-abcdef123456", deviceKey: rawPublic(identity.publicKey) }, factory.privateKey);
    server.padlink.close();
    server.padlink = new PadLink({ dir: path.join(dir, "genuine"), token: process.env.PAD_TOKEN, signals: server.signals, factoryRoots: [rawPublic(factory.publicKey)] });
    server.executor.setPadLink(server.padlink);
    pad = new PadSimulatorV2({ device: certificate.serial, identity, certificate, serial: true });
    pad.firmware = "3.0.0";
    await pad.listen(8726);
    peer = server.padlink.attach(net.createConnection(8726, "127.0.0.1"), "usb");
    await page.getByLabel("Code on the pad", { exact: true }).waitFor();
    await page.getByLabel("Code on the pad", { exact: true }).fill("000000");
    await page.getByRole("button", { name: "Pair securely", exact: true }).click();
    await page.getByText("Setup required: pairing was not confirmed by the pad. Check its current code, try again and reconnect the pad.", { exact: true }).waitFor();
    assert.equal(await page.getByText(/Genuine xorrpad/).count(), 0);
    await page.getByLabel("Code on the pad", { exact: true }).fill(pad.code);
    const retried = page.waitForResponse((response) => response.url().endsWith("/pad/pair") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Pair securely", exact: true }).click();
    assert.equal((await retried).status(), 200);
    // Failed encrypted-session retries close the byte stream. Reconnect it as
    // instructed by the UI, using the corrected code now held by the desk.
    peer.close();
    await until(() => pad.stream.destroyed);
    peer = server.padlink.attach(net.createConnection(8726, "127.0.0.1"), "usb");
    await until(() => peer.verified && pad.verified);
    await page.getByText(`Genuine xorrpad #${pad.device}`, { exact: true }).first().waitFor();
    assert.equal(await page.locator(".pairing-copy .badge").evaluate((node) => getComputedStyle(node).color), "rgb(200, 245, 60)");
    await capture("genuine");
    for (const name of ["Wi-Fi", "Bluetooth"]) {
      await page.getByRole("button", { name: new RegExp(name) }).click();
      assert.equal(await page.getByText(/Genuine xorrpad/).count(), 0);
      await page.getByText("No pad connected.", { exact: false }).waitFor();
    }
    await page.getByRole("button", { name: /USB-C/ }).click();
    await page.getByText(`Genuine xorrpad #${pad.device}`, { exact: true }).first().waitFor();
    peer.close();
    await pad.close();
    await page.getByText("No pad connected.", { exact: false }).waitFor();
    assert.equal(await page.getByText(/Genuine xorrpad/).count(), 0);
    assert.equal(await page.getByText("Encrypted pairing confirmed by the pad.", { exact: true }).count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await pad?.close();
  }
});
