/** T10 capture: actual desk HTTP, real pool candles, no intercepted API responses. */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const dir = await mkdtemp(path.join(tmpdir(), "xorrpad-t10-ui-"));
process.env.XORR_USER_DATA = dir;
process.env.PAD_TOKEN = "xorrpad-t10-history-ui";
const { createServer } = await import("../main/server.mjs"),
  { Memory } = await import("../main/memory.mjs");
const mem = new Memory({ db: path.join(dir, "memory.db") }),
  server = createServer(mem),
  origin = "http://127.0.0.1:8727";
const output = fileURLToPath(
  new URL("../../docs/screens/v1/", import.meta.url),
);
let browser;
const errors = [],
  issues = [],
  checks = [],
  screenshots = [];
try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(8727, "127.0.0.1", resolve);
  });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ reducedMotion: "reduce" });
  page.on("pageerror", (e) => errors.push(e.message));
  async function ready(name) {
    await page.waitForFunction(
      (n) =>
        document.querySelector("#content").dataset.ready === n &&
        !document.querySelector("#content .loading"),
      name,
      { timeout: 120000 },
    );
    await page.evaluate(() => document.fonts.ready);
  }
  async function realChart(reference) {
    await page.locator("#price-candles:visible").waitFor({ timeout: 120000 });
    await page.waitForFunction(
      () => document.querySelector("#price-candles").width > 0,
    );
    assert.match(
      await page.locator("#history-source").innerText(),
      /GeckoTerminal · .+ · .+/,
    );
    if (reference)
      assert.match(
        await page.locator("#history-source").innerText(),
        /spot reference for the perp/,
      );
    const pixels = await page.locator("#price-candles").evaluate((canvas) => {
      const a = canvas
        .getContext("2d")
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let n = 0;
      for (let i = 3; i < a.length; i += 4) if (a[i]) n++;
      return n;
    });
    assert.ok(pixels > 1000, "Real canvas candles are drawn");
  }
  async function theme(name, width) {
    if (width === 375) await page.locator("#menu").click();
    await page.locator("#theme").selectOption(name);
    if (width === 375) await page.locator("#menu").click();
  }
  async function shot(file, kind, width, name) {
    await page.evaluate(() => {
      document.activeElement?.blur();
      window.scrollTo(0, 0);
    });
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    const size = await page.evaluate(() => ({
      view: innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    if (size.scroll > width) issues.push(`${file}: overflow ${size.scroll}`);
    await page.screenshot({ path: path.join(output, file), fullPage: true });
    screenshots.push({
      file,
      kind,
      width,
      theme: name,
      source:
        kind === "backtest"
          ? await page.locator("#backtest-result").innerText()
          : await page.locator("#history-source").innerText(),
    });
    console.log("Captured " + file);
  }
  await page.goto(origin + "/v1?token=" + process.env.PAD_TOKEN + "#trade");
  await ready("trade");
  await realChart(false);
  for (const period of ["1m", "15m", "1h", "1d"]) {
    await page.locator(`[data-period="${period}"]`).click();
    await realChart(false);
    assert.equal(
      await page
        .locator(`[data-period="${period}"]`)
        .getAttribute("aria-pressed"),
      "true",
    );
  }
  await page.locator('[data-period="1h"]').click();
  await realChart(false);
  checks.push(
    "All four timeframe chips draw real pool candles, including daily history",
  );
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 812 });
    for (const name of ["floor", "paper", "neon"]) {
      await theme(name, width);
      await realChart(false);
      const first = page.locator("[data-spot]").first();
      if (await first.count()) {
        await first.locator("xpath=ancestor::tr").scrollIntoViewIfNeeded();
        await page.waitForFunction(
          () =>
            !document
              .querySelector("[data-spot]")
              .textContent.includes("Fetching"),
          null,
          { timeout: 45000 },
        );
      }
      await shot(`trade-${name}-${width}.png`, "spot", width, name);
    }
  }
  await page.locator('#ticket [name="kind"]').selectOption("perp");
  await realChart(true);
  await page.waitForFunction(
    () =>
      !document
        .querySelector(".market-price")
        .textContent.includes("Unavailable"),
    null,
    { timeout: 90000 },
  );
  assert.match(
    await page.locator("#market-head").innerText(),
    /phoenix live mark/,
  );
  checks.push(
    "SOL perpetual uses its exact spot mint and labels the reference separately from the live Phoenix mark",
  );
  await mkdir(path.join(output, "evidence"), { recursive: true });
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 812 });
    for (const name of ["floor", "paper", "neon"]) {
      await theme(name, width);
      await realChart(true);
      await shot(
        `evidence/trade-perp-${name}-${width}.png`,
        "perp",
        width,
        name,
      );
    }
  }
  await page.goto(origin + "/v1?token=" + process.env.PAD_TOKEN + "#backtest");
  await ready("backtest");
  await page.locator('[name="strategy"]').selectOption("rule");
  await page.locator('[name="venue"]').selectOption("phoenix");
  await page.locator('[name="from"]').fill("2026-11-01T00:00");
  await page.locator('[name="to"]').fill("2026-11-08T00:00");
  await page.locator('[name="tradeUsd"]').fill("100");
  await page.locator('[name="rule"]').fill(
    JSON.stringify({
      name: "Positive close verification",
      entry: [{ left: { indicator: "close" }, op: "gt", right: 0 }],
      maxHoldMin: 240,
    }),
  );
  await page.getByRole("button", { name: "Run backtest", exact: true }).click();
  await page.locator("#backtest-result .stats").waitFor({ timeout: 120000 });
  assert.match(
    await page.locator("#backtest-result").innerText(),
    /GeckoTerminal · SOL \/ (USDC|USDT) · .+/,
  );
  checks.push(
    "Actual HTTP replay displays metrics, trade log and pool provenance",
  );
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 812 });
    for (const name of ["floor", "paper", "neon"]) {
      await theme(name, width);
      await shot(`backtest-${name}-${width}.png`, "backtest", width, name);
    }
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(issues, []);
  await writeFile(
    path.join(output, "history-manifest.json"),
    JSON.stringify(
      {
        task: "T10",
        capturedAt: new Date().toISOString(),
        origin: "Actual isolated desk on loopback 8727",
        data: "Real public GeckoTerminal OHLCV, live venue marks and actual read-only replay. No intercepted responses, signed transactions or submissions.",
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
      captures: screenshots.length,
      checks: checks.length,
      errors,
      issues,
    }),
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  mem.stop();
  await rm(dir, { recursive: true, force: true });
}
