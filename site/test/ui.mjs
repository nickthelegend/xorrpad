import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";
import { localApi } from "../server/local-api.js";

for (const key of [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "PREORDER_PRICE_USDC",
  "PREORDER_MERCHANT_ADDRESS",
  "PREORDER_TERMS_URL",
  "PREORDER_NETWORK",
  "PREORDER_SOLANA_RPC_URL",
  "VERCEL",
])
  delete process.env[key];
const root = fileURLToPath(new URL("..", import.meta.url));
const output = fileURLToPath(
  new URL("../../docs/screens/v1/site/", import.meta.url),
);
await mkdir(output, { recursive: true });
const server = await createServer({
  root,
  configFile: false,
  envDir: false,
  plugins: [localApi()],
  server: { host: "127.0.0.1", port: 8719, strictPort: true },
});
let browser;
const manifest = {
  capturedAt: new Date().toISOString(),
  source:
    "real Vite site and API handlers; no interception or business fixtures",
  captures: [],
  runtimeErrors: [],
};
try {
  await server.listen();
  browser = await chromium.launch();
  for (const width of [1440, 375]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => manifest.runtimeErrors.push(error.message));
    await page.goto("http://127.0.0.1:8719", { waitUntil: "networkidle" });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await page
      .locator("#waitlist-message")
      .filter({ hasText: "Setup required: UPSTASH_REDIS_REST_URL" })
      .waitFor();
    assert.equal(
      await page.locator("#preorder-button").textContent(),
      "Pre-orders open soon",
    );
    assert.equal(await page.locator("#preorder-button").isDisabled(), true);
    assert.match(
      await page.locator("#preorder-message").textContent(),
      /Setup required: PREORDER_PRICE_USDC/,
    );
    assert.match(
      await page.locator("#waitlist-count").textContent(),
      /unavailable/,
    );
    await page.locator("#email").fill("reader@example.com");
    await page.locator("#waitlist-form button").click();
    await page
      .locator("#waitlist-message")
      .filter({ hasText: "Setup required: UPSTASH_REDIS_REST_URL" })
      .waitFor();
    assert.equal(
      await page.locator("#email").inputValue(),
      "reader@example.com",
    );
    assert.equal(await page.locator("#waitlist-form button").isEnabled(), true);
    await page.locator("summary").first().click();
    assert.equal(
      await page.locator("details").first().getAttribute("open"),
      "",
    );
    await page.locator("summary").first().click();
    await page.locator("#email").fill("");
    // Load all real lazy images before capture; then return to document top.
    await page.evaluate(async () => {
      for (const img of document.images) {
        img.loading = "eager";
        await img.decode();
      }
      window.scrollTo(0, 0);
      document.activeElement?.blur();
    });
    const layout = await page.evaluate(() => ({
      viewport: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      brokenImages: [...document.images].filter(
        (img) => !img.complete || !img.naturalWidth,
      ).length,
      clippedControls: [
        ...document.querySelectorAll('button,input:not([tabindex="-1"])'),
      ].filter((el) => {
        const box = el.getBoundingClientRect();
        return box.width && (box.left < 0 || box.right > innerWidth + 1);
      }).length,
    }));
    assert.equal(layout.documentWidth, width);
    assert.equal(layout.brokenImages, 0);
    assert.equal(layout.clippedControls, 0);
    const filename = `landing-${width}.png`;
    await page.screenshot({ path: `${output}${filename}`, fullPage: true });
    manifest.captures.push({
      width,
      filename,
      ...layout,
      setupStates: ["UPSTASH_REDIS_REST_URL", "PREORDER_PRICE_USDC"],
      signupErrorPreservesInput: true,
      preorderDisabled: true,
      faqWorks: true,
    });
    await context.close();
  }
  assert.deepEqual(manifest.runtimeErrors, []);
  await writeFile(
    `${output}manifest.json`,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(JSON.stringify(manifest, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
