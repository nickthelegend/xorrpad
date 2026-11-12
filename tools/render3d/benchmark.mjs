/** Native Metal benchmark of the shipped app, isolated app data; never a trading fill. */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
const repo = fileURLToPath(new URL("../..", import.meta.url)),
  dir = await mkdtemp(path.join(tmpdir(), "xorr-cad-metal-"));
process.env.XORR_USER_DATA = dir;
process.env.PAD_TOKEN = "isolated-cad-metal-benchmark";
const { Memory } = await import("../../desk/main/memory.mjs"),
  { createServer } = await import("../../desk/main/server.mjs"),
  mem = new Memory({ db: path.join(dir, "memory.db") }),
  server = createServer(mem);
let browser;
try {
  await new Promise((r, j) => {
    server.once("error", j);
    server.listen(8725, "127.0.0.1", r);
  });
  browser = await chromium.launch({
    headless: false,
    args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    reducedMotion: "no-preference",
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    "http://127.0.0.1:8725/?token=" + process.env.PAD_TOKEN + "#device",
  );
  await page.locator('[data-model-ready="webgl"]').waitFor({ timeout: 60000 });
  await page.waitForTimeout(3000);
  const sample = () =>
      page.locator(".real-pad").evaluate((n) => ({
        frames: Number(n.dataset.frames),
        at: performance.now(),
        sway: Number(n.dataset.sway),
      })),
    a = await sample();
  await page.waitForTimeout(5000);
  const b = await sample();
  const renderer = await page.locator(".model-canvas canvas").evaluate((c) => {
    const gl = c.getContext("webgl2") || c.getContext("webgl"),
      ext = gl.getExtension("WEBGL_debug_renderer_info");
    return ext
      ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
  });
  const result = {
    capturedAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    renderer,
    fps: ((b.frames - a.frames) * 1000) / (b.at - a.at),
    frames: b.frames - a.frames,
    elapsedMs: b.at - a.at,
    viewport: { width: 1440, height: 900 },
    dpr: await page.evaluate(() => devicePixelRatio),
    animated: b.sway !== a.sway,
    errors,
    scope:
      "Actual production CAD scene, native headed Chromium with --use-angle=metal; real local backend; no trading actions",
  };
  await writeFile(
    path.join(repo, "docs/screens/v2/model-metal-performance.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
  if (errors.length) throw Error(errors.join("\n"));
} catch (e) {
  await writeFile(
    path.join(repo, "docs/screens/v2/model-metal-performance.json"),
    JSON.stringify(
      { blocked: e.message, platform: process.platform, arch: process.arch },
      null,
      2,
    ) + "\n",
  );
  throw e;
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
  mem.stop();
  await rm(dir, { recursive: true, force: true });
}
