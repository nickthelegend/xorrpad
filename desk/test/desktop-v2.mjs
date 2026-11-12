/** Actual server, SQLite, browser and public venues. No API interception or fake fills. */
import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const dir = await mkdtemp(path.join(tmpdir(), "xorr-v2-browser-"));
process.env.XORR_USER_DATA = dir;
process.env.PAD_TOKEN = "v2-browser-verification";
const { Memory } = await import("../main/memory.mjs"),
  { createServer } = await import("../main/server.mjs"),
  { DEFAULT_KEYMAP } = await import("../main/padlink.mjs");
const mem = new Memory({ db: path.join(dir, "memory.db") }),
  server = createServer(mem),
  origin = "http://127.0.0.1:8729",
  headers = {
    authorization: "Bearer " + process.env.PAD_TOKEN,
    "content-type": "application/json",
  },
  output = fileURLToPath(new URL("../../docs/screens/v2/", import.meta.url));
let browser;
const errors = [],
  issues = [],
  checks = [],
  screenshots = [];
async function api(p, body) {
  const r = await fetch(origin + p, {
    headers,
    method: body === undefined ? "GET" : "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j));
  return j;
}
try {
  await mkdir(output, { recursive: true });
  await new Promise((r, j) => {
    server.once("error", j);
    server.listen(8729, "127.0.0.1", r);
  });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  page.on("pageerror", (e) => errors.push(e.message));
  const url = origin + "/?token=" + process.env.PAD_TOKEN;
  await page.goto(url + "#device");
  await page.locator(".physical-key:not([disabled])").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator(".physical-key").count(), 14);
  assert.equal(
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    "rgb(3, 3, 4)",
  );
  assert.ok(
    await page.evaluate(() =>
      document.fonts.check('16px "Plus Jakarta Sans Variable"'),
    ),
  );
  await page.locator('[data-model-ready="webgl"]').waitFor({ timeout: 60000 });
  const hit = await page
    .getByRole("button", { name: /Configure key 1:/ })
    .boundingBox();
  await page.mouse.click(hit.x + hit.width / 2, hit.y + hit.height / 2);
  await page.getByRole("dialog", { name: "Make this key yours" }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Configure key 1:/ }).focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("Key label", { exact: true }).fill("LIVE PREVIEW");
  assert.equal(await page.locator(".key-preview").innerText(), "LIVE PREVIEW");
  assert.notEqual((await api("/pad/keymap")).keys[0].label, "LIVE PREVIEW");
  await page.getByRole("button", { name: /Save & push key/ }).click();
  await page.waitForFunction(() =>
    document
      .querySelector(".physical-key")
      ?.textContent.includes("LIVE PREVIEW"),
  );
  assert.equal((await api("/pad/keymap")).keys[0].label, "LIVE PREVIEW");
  await page.locator(".notice").waitFor();
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  assert.equal(await page.locator(".notice").count(), 0);
  checks.push(
    "Key preview stays local until the actual keymap save; 14 keys and offline brand fonts",
  );
  await page.getByRole("button", { name: "Swing", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector(".profile-pills [aria-pressed=true]")
        ?.textContent === "Swing",
  );
  assert.equal((await api("/desk/profiles")).active, "Swing");
  await api("/desk/profiles", { name: "Custom" });
  const map = await api("/pad/keymap");
  await api("/pad/keymap", {
    revision: map.revision + 1,
    keys: DEFAULT_KEYMAP.keys,
  });
  await page.reload();
  await page.locator(".physical-key:not([disabled])").first().waitFor();
  await page.locator('[data-model-ready="webgl"]').waitFor();
  const keyHit = await page
    .getByRole("button", { name: /Configure key 1:/ })
    .boundingBox();
  await page.mouse.move(
    keyHit.x + keyHit.width / 2,
    keyHit.y + keyHit.height / 2,
  );
  await page.waitForFunction(
    () =>
      document.querySelector(".real-pad").dataset.hoverKey === "key-01" &&
      Number(document.querySelector(".real-pad").dataset.hoverLift) > 1,
  );
  await page.mouse.move(20, 20);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const sample = () =>
    page.locator(".real-pad").evaluate((n) => ({
      frames: Number(n.dataset.frames),
      at: performance.now(),
      sway: Number(n.dataset.sway),
    }));
  const start = await sample();
  await page.waitForTimeout(2200);
  const end = await sample();
  const performanceSample = {
    fps: ((end.frames - start.frames) * 1000) / (end.at - start.at),
    frames: end.frames - start.frames,
    elapsedMs: end.at - start.at,
    scope:
      "Actual animated CAD scene in headless Chromium; hardware renderer recorded below",
  };
  performanceSample.renderer = await page
    .locator(".model-canvas canvas")
    .evaluate((c) => {
      const gl = c.getContext("webgl2") || c.getContext("webgl"),
        e = gl.getExtension("WEBGL_debug_renderer_info");
      return e
        ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER);
    });
  assert.notEqual(start.sway, end.sway, "Idle sway uses real scene frames");
  await writeFile(
    path.join(output, "model-performance.json"),
    JSON.stringify(performanceSample, null, 2) + "\n",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForFunction(
    () => Number(document.querySelector(".real-pad").dataset.sway) === 0,
  );
  checks.push(
    "CAD raycasting and keyboard controls open the existing sheet; real hover lift and idle sway stop under reduced motion",
  );
  const hello = await fetch(origin + "/padlink?device=v2-ui-simulator", {
    method: "POST",
    headers: { ...headers, "content-type": "application/x-ndjson" },
    body:
      JSON.stringify({
        v: 1,
        type: "hello",
        device: "v2-ui-simulator",
        fw: "1.0.0",
      }) + "\n",
  });
  assert.equal(hello.status, 200);
  await page
    .locator(".device-island")
    .filter({ hasText: "v2-ui-simulator" })
    .waitFor();
  const before = await page
    .locator(".real-pad")
    .getAttribute("data-knob-radians");
  await fetch(origin + "/padlink?device=v2-ui-simulator", {
    method: "POST",
    headers: { ...headers, "content-type": "application/x-ndjson" },
    body:
      JSON.stringify({ v: 1, type: "knob", id: "v2-knob", sizeUsd: 75 }) + "\n",
  });
  await page.waitForFunction(
    (s) =>
      document.querySelector(".real-pad").getAttribute("data-knob-radians") !==
      s,
    before,
  );
  for (const peer of server.padlink.peers)
    if (peer.device === "v2-ui-simulator") server.padlink.remove(peer);
  await page
    .locator(".device-island")
    .filter({ hasText: "No pad connected" })
    .waitFor();
  checks.push(
    "Real NDJSON hello/knob/disconnect updates the device island and physical marker; no hardware flash claimed",
  );
  await page.goto(url + "#abilities");
  await page.locator(".ability-row").first().waitFor();
  assert.equal(await page.getByRole("switch").count(), 8);
  await page.getByRole("switch", { name: "Install Market Pulse" }).click();
  await page.getByRole("button", { name: /Install & bind/ }).click();
  await page.locator(".sheet").waitFor({ state: "hidden" });
  assert.equal(
    (await api("/abilities")).abilities.find((a) => a.id === "pulse").installed,
    true,
  );
  await page.getByRole("switch", { name: "Install Market Pulse" }).click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[aria-label="Install Market Pulse"]')
        .getAttribute("aria-checked") === "false",
  );
  await page.locator(".notice").waitFor();
  await page.locator(".notice").waitFor({ state: "hidden", timeout: 5000 });
  checks.push(
    "Action notifications can be closed and automatically dismiss within four seconds",
  );
  checks.push(
    "All eight abilities are present; Market Pulse actually installs, binds and uninstalls through the real API",
  );
  const names = {
    device: ".premium-pad",
    abilities: ".ability-row",
    connect: ".pairing-theater",
    agent: ".model-card",
    markets: "#price-candles",
    activity: ".activity-filters",
  };
  const headlines = {
    device: "Your edge, at your fingertips.",
    abilities: "Small additions. Entirely yours.",
    agent: "A voice that knows your rules.",
    connect: "Good things take one cable.",
  };
  async function ready(name) {
    await page.locator(names[name]).first().waitFor({ timeout: 120000 });
    await page.evaluate(() => document.fonts.ready);
    if (headlines[name])
      assert.equal(await page.locator("h1").innerText(), headlines[name]);
    assert.ok(
      await page
        .locator("h1")
        .evaluate((h) =>
          [h, ...h.querySelectorAll("*")].every(
            (n) =>
              Number(getComputedStyle(n).opacity) === 1 &&
              ["none", "blur(0px)"].includes(getComputedStyle(n).filter),
          ),
        ),
      "Entire headline is revealed",
    );
    if (name === "markets") {
      await page.locator("#price-candles:visible").waitFor({ timeout: 120000 });
      await page.waitForFunction(
        () =>
          !document
            .querySelector(".venue-strip")
            ?.textContent.includes("Reading venues"),
        null,
        { timeout: 130000 },
      );
      assert.match(
        await page.locator("#history-source").innerText(),
        /GeckoTerminal/,
      );
    }
    if (name === "connect")
      assert.equal(
        await page
          .locator(".rings-film")
          .evaluate((n) => getComputedStyle(n).objectFit),
        "contain",
      );
    if (name === "device") {
      await page.locator(".physical-key:not([disabled])").first().waitFor();
      await page
        .locator(
          page.viewportSize().width === 375
            ? '[data-model-ready="poster"]'
            : '[data-model-ready="webgl"]',
        )
        .waitFor();
    }
  }
  async function capture(name, width) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 812 });
    await page.goto(url + "#" + name);
    await page.reload(); // A fresh app session: preceding verification actions cannot leak into captures.
    await ready(name);
    await page
      .locator("img:visible")
      .evaluateAll((images) => Promise.all(images.map((im) => im.decode())));
    if (name === "connect")
      await page.locator("video").evaluate(async (v) => {
        const im = new Image();
        im.src = v.poster;
        await im.decode();
      });
    assert.equal(
      await page.locator(".notice").count(),
      0,
      "No action toast on clean load",
    );
    await page.waitForTimeout(120);
    const layout = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    if (width === 375) {
      const nav = await page
        .locator("nav[aria-label='Main navigation']")
        .evaluate((n) => ({
          position: getComputedStyle(n).position,
          top: n.getBoundingClientRect().top,
          bottom: n.getBoundingClientRect().bottom,
        }));
      assert.equal(nav.position, "fixed");
      if (name === "device")
        assert.equal(
          await page.locator(".model-canvas canvas").count(),
          0,
          "Mobile uses a true poster without a WebGL context",
        );
      assert.ok(
        nav.top > 650 && nav.bottom <= 812,
        "Mobile navigation is a reachable bottom bar",
      );
      if (name === "device")
        assert.ok(
          await page.locator(".premium-pad").evaluate((n) => {
            const r = n.getBoundingClientRect();
            const nav = document
              .querySelector("nav[aria-label='Main navigation']")
              .getBoundingClientRect();
            return r.left >= 0 && r.right <= innerWidth && r.bottom <= nav.top;
          }),
          "Device fits 375px",
        );
    }
    if (layout.scroll > width)
      issues.push(name + "/" + width + " overflow " + layout.scroll);
    await page.evaluate(() => {
      document.activeElement?.blur();
      window.scrollTo(0, 0);
    });
    const file = name + "-" + width + ".png";
    await page.screenshot({ path: path.join(output, file) });
    screenshots.push({ name, width, height: width === 1440 ? 900 : 812, file });
    console.log("Captured " + file);
  }
  for (const width of [1440, 375])
    for (const name of Object.keys(names)) await capture(name, width);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(url + "#device");
  await ready("device");
  await page.keyboard.press("Meta+k");
  await page.getByRole("dialog", { name: "Command palette" }).waitFor();
  const commandSearch = page.getByRole("combobox", {
    name: "Search screens and actions",
  });
  for (const command of [
    "Device",
    "Abilities",
    "Connect",
    "Agent",
    "Markets",
    "Activity",
    "signal decisions",
    "Disarm",
    "permission policy",
    "real-history backtest",
  ]) {
    await commandSearch.fill(command);
    assert.ok(
      await page.getByRole("option").count(),
      "Search finds " + command,
    );
  }
  await commandSearch.fill("Open");
  await page.keyboard.press("ArrowDown");
  assert.equal(
    await commandSearch.getAttribute("aria-activedescendant"),
    "command-1",
  );
  await page.keyboard.press("ArrowUp");
  assert.equal(
    await commandSearch.getAttribute("aria-activedescendant"),
    "command-0",
  );
  await page.keyboard.press("Tab");
  assert.ok(await commandSearch.evaluate((e) => e === document.activeElement));
  await page.screenshot({ path: path.join(output, "palette-1440.png") });
  screenshots.push({
    name: "palette",
    width: 1440,
    height: 900,
    file: "palette-1440.png",
  });
  await page.getByRole("combobox").fill("Activity");
  await page.keyboard.press("Enter");
  await page.locator(".activity-filters").waitFor();
  assert.equal(new URL(page.url()).hash, "#activity");
  checks.push(
    "Command palette searches all six screens and four actions, moves with arrows, contains Tab and opens Activity with Enter",
  );
  await page.keyboard.press("Control+k");
  await page.getByRole("dialog", { name: "Command palette" }).waitFor();
  await page.keyboard.press("Escape");
  assert.equal(
    await page.getByRole("dialog", { name: "Command palette" }).count(),
    0,
  );
  await page.locator(".skip").focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.evaluate(() => document.activeElement.id), "main");
  assert.equal(new URL(page.url()).hash, "#activity");
  checks.push("Skip link keeps the active screen and focuses content");
  for (const route of ["/v1", "/classic"])
    assert.equal((await fetch(origin + route)).status, 200);
  checks.push(
    "v1 and Classic remain reachable; all six screens have no 375px overflow",
  );
  // An actual devnet quote creates a proposal, which we refuse; no signing or sending.
  const markets = await api("/pm/markets"),
    candidate = markets.markets.find(
      (m) => m.liquidity > 10 && m.yesPrice > 0.1 && m.yesPrice < 0.9,
    );
  if (candidate) {
    const action = `pmamm:${candidate.market}:yes`;
    await mem.setReference("risk/limits", {
      allow: [action],
      max_trade_usd: 1,
      max_day_usd: 10,
    });
    const p = await api("/signals", {
      kind: "predict",
      market: candidate.market,
      side: "yes",
      size: 1,
    });
    if (p.signalState === "awaiting") {
      await page.locator(".signal-toast").waitFor();
      await page
        .locator(".signal-toast")
        .getByRole("button", { name: "Refuse", exact: true })
        .click();
      await page.locator(".signal-toast").waitFor({ state: "hidden" });
      assert.equal(
        (await api("/signals")).signals.find((s) => s.id === p.signalId).state,
        "refused",
      );
      checks.push(
        "Real quote-backed devnet proposal arrives on Activity and is refused through the global gate; no signing",
      );
    } else checks.push("Devnet proposal gate: " + p.signalState);
  } else
    checks.push(
      "Devnet signal dependency unavailable: no eligible liquid market",
    );
  assert.deepEqual(errors, []);
  assert.deepEqual(issues, []);
  await writeFile(
    path.join(output, "manifest.json"),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        data: "Actual isolated server, SQLite, authenticated events and real venue APIs. NDJSON host simulator verified and disconnected before screenshots. Real devnet proposal may be created then refused. No API interception, fake data, signing or transaction submission.",
        checks,
        runtimeErrors: errors,
        layoutIssues: issues,
        screenshots,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      screenshots: screenshots.length,
      checks: checks.length,
      errors,
      issues,
    }),
  );
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
  mem.stop();
  await rm(dir, { recursive: true, force: true });
}
