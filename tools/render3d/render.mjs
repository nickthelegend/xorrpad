/** Deterministic true renders of the supplied parametric CAD, never generated product geometry. */
import { createServer } from "node:http";
import { readFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
const here = fileURLToPath(new URL(".", import.meta.url)),
  repo = resolve(here, "../.."),
  out = resolve(repo, "desk/app/public/media/pad");
await mkdir(out, { recursive: true });
const frames = await mkdtemp(resolve(repo, "exports/turntable-"));
let browser;
const server = createServer(async (req, res) => {
  try {
    const p = new URL(req.url, "http://localhost").pathname;
    let base = resolve(here),
      name = p.slice(1) || "index.html";
    if (p.startsWith("/vendor/")) {
      base = resolve(here, "node_modules");
      name = p.slice(8);
    } else if (p.startsWith("/models/") || p.startsWith("/firmware-screen"))
      base = resolve(repo, "desk/app/public");
    const file = resolve(base, name);
    if (!file.startsWith(base + "/")) throw Error("path");
    const b = await readFile(file);
    res.writeHead(200, {
      "content-type":
        {
          ".mjs": "text/javascript",
          ".js": "text/javascript",
          ".html": "text/html",
          ".glb": "model/gltf-binary",
          ".wasm": "application/wasm",
        }[extname(file)] || "application/octet-stream",
    });
    res.end(b);
  } catch (e) {
    res.writeHead(404);
    res.end("Not found");
  }
});
try {
  await new Promise((r, j) => {
    server.once("error", j);
    server.listen(8724, "127.0.0.1", r);
  });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 2400, height: 1800 },
    reducedMotion: "reduce",
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:8724");
  await page.waitForFunction(() => !!window.ready);
  const info = await page.evaluate(() => window.ready);
  for (const [file, view, dark] of [
    ["hero-34.png", "hero", false],
    ["hero-34-dark.png", "hero", true],
    ["top.png", "top", false],
    ["side.png", "side", false],
    ["exploded.png", "exploded", false],
  ]) {
    await page.evaluate((o) => window.renderFrame(o), { view, dark });
    await page.screenshot({ path: resolve(out, file), omitBackground: !dark });
    console.log("Rendered " + file);
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  for (let i = 0; i < 180; i++) {
    await page.evaluate(
      (angle) => window.renderFrame({ angle, dark: true }),
      (i * Math.PI * 2) / 180,
    );
    await page.screenshot({
      path: resolve(frames, String(i).padStart(4, "0") + ".png"),
    });
    if (i % 30 === 0) console.log("Turntable " + i + "/180");
  }
  for (const [file, args] of [
    [
      "turntable.mp4",
      [
        "-c:v",
        "libx264",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
      ],
    ],
    ["turntable.webm", ["-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0"]],
  ]) {
    const r = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-framerate",
        "30",
        "-i",
        resolve(frames, "%04d.png"),
        ...args,
        "-an",
        resolve(out, file),
      ],
      { encoding: "utf8" },
    );
    if (r.status !== 0) throw Error(r.stderr);
  }
  await page.evaluate(() => window.renderFrame({ dark: true }));
  await page.screenshot({ path: resolve(out, "turntable-poster.png") });
  if (errors.length) throw Error(errors.join("\n"));
  await writeFile(
    resolve(out, "RENDERS.json"),
    JSON.stringify(
      {
        source:
          "True three.js renders of cad/assembly.py + 2.8-inch CAD display pod. Not photographs or generated device geometry.",
        info,
        stills: { width: 2400, height: 1800 },
        turntable: {
          width: 1920,
          height: 1080,
          fps: 30,
          frames: 180,
          seconds: 6,
          loop: "Periodic camera-relative model angle 2π*i/180, endpoint excluded",
        },
        errors,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
  await rm(frames, { recursive: true, force: true });
}
