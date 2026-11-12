/** Real shipped artifacts + real native/WASM firmware. No API interception or financial fixtures. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { tmpdir, homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { chromium } from "playwright";
const repo = fileURLToPath(new URL("../..", import.meta.url)),
  req = createRequire(
    new URL("../../tools/render3d/package.json", import.meta.url),
  ),
  { validateBytes } = req("gltf-validator");
test("both real CAD web models validate, retain 14 named controls and UV TFT, and stay below 3 MB", async () => {
  for (const name of ["xorrpad.glb", "xorrpad-exploded.glb"]) {
    const b = await readFile(path.join(repo, "desk/app/public/models", name));
    assert.ok(b.length < 3 * 1024 * 1024);
    const g = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
    const result = await validateBytes(b, { uri: name });
    assert.equal(result.issues.numErrors, 0);
    assert.equal(result.issues.numWarnings, 0);
    for (let i = 1; i <= 14; i++)
      assert.ok(
        g.nodes.find((n) => n.name === "key-" + String(i).padStart(2, "0")),
      );
    for (const n of ["knob", "screen", "tray", "plate"])
      assert.ok(g.nodes.find((x) => x.name === n));
    const screen = g.meshes.find((m) => m.name === "Screen");
    assert.ok(screen.primitives[0].attributes.TEXCOORD_0 != null);
    assert.ok(g.extensionsUsed.includes("EXT_meshopt_compression"));
    assert.ok(g.extensionsUsed.includes("EXT_texture_webp"));
  }
});
test("real studio movies are six seconds at 1080p, with genuine alpha stills", async () => {
  for (const name of ["turntable.mp4", "turntable.webm"]) {
    const r = spawnSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "stream=width,height",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        path.join(repo, "desk/app/public/media/pad", name),
      ],
      { encoding: "utf8" },
    );
    assert.equal(r.status, 0);
    const j = JSON.parse(r.stdout);
    assert.equal(j.streams[0].width, 1920);
    assert.equal(j.streams[0].height, 1080);
    assert.ok(Math.abs(Number(j.format.duration) - 6) < 0.05);
  }
  for (const name of ["hero-34.png", "top.png", "side.png", "exploded.png"]) {
    const b = await readFile(
      path.join(repo, "desk/app/public/media/pad", name),
    );
    assert.equal(b.readUInt32BE(16), 2400);
    assert.equal(b[25], 6, "RGBA PNG");
  }
});
test(
  "browser TFT pixels equal the actual firmware native RGB565 frame byte for byte",
  { timeout: 120000 },
  async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "xorr-screen-parity-")),
      gfx =
        process.env.GFX ||
        path.join(
          homedir(),
          "Documents/Arduino/libraries/Adafruit_GFX_Library",
        );
    let browser, server;
    try {
      const binary = path.join(dir, "firmware-native");
      const compile = spawnSync(
        "c++",
        [
          "-std=c++17",
          "-include",
          "cmath",
          "-O1",
          "-w",
          "-DARDUINO=10819",
          "-DSCREEN_NATIVE_TEST",
          "-I" + path.join(repo, "tools/uipreview/shim"),
          "-I" + gfx,
          path.join(repo, "tools/uipreview/firmware-screen.cpp"),
          path.join(gfx, "Adafruit_GFX.cpp"),
          "-o",
          binary,
        ],
        { encoding: "utf8" },
      );
      assert.equal(compile.status, 0, compile.stderr);
      const native = spawnSync(binary);
      assert.equal(native.status, 0);
      assert.equal(native.stdout.length, 320 * 240 * 2);
      const hash = createHash("sha256").update(native.stdout).digest("hex");
      server = createServer(async (r, s) => {
        try {
          const p = new URL(r.url, "http://localhost").pathname;
          if (!["/firmware-screen.js", "/firmware-screen.wasm"].includes(p)) {
            s.writeHead(200, { "content-type": "text/html" });
            return s.end(
              "<!doctype html><title>Actual firmware parity</title>",
            );
          }
          const bytes = await readFile(
            path.join(repo, "desk/app/public", p.slice(1)),
          );
          s.writeHead(200, {
            "content-type": p.endsWith(".wasm")
              ? "application/wasm"
              : "text/javascript",
          });
          s.end(bytes);
        } catch (e) {
          s.writeHead(500);
          s.end(e.message);
        }
      });
      await new Promise((r, j) => {
        server.once("error", j);
        server.listen(8724, "127.0.0.1", r);
      });
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto("http://127.0.0.1:8724");
      const wasm = await page.evaluate(async () => {
        const { default: create } = await import("/firmware-screen.js");
        const m = await create();
        m._screen_reset();
        const p = m._screen_render(),
          b = new Uint8Array(m.HEAPU16.buffer, p, 320 * 240 * 2);
        return Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", b)),
        )
          .map((v) => v.toString(16).padStart(2, "0"))
          .join("");
      });
      assert.equal(wasm, hash);
      console.log("Actual offline firmware RGB565 SHA-256:", hash);
    } finally {
      await browser?.close();
      if (server) await new Promise((r) => server.close(r));
      await rm(dir, { recursive: true, force: true });
    }
  },
);
