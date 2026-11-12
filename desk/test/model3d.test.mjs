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
      const snapshot = JSON.parse(
        await readFile(
          path.join(repo, "desk/app/public/media/pad/SCREEN-SNAPSHOT.json"),
          "utf8",
        ),
      );
      assert.ok(snapshot.price > 0 && snapshot.quote.contextSlot > 0);
      const home = spawnSync(binary, [
        String(snapshot.price),
        (snapshot.chart?.closes || []).join(","),
        String(snapshot.chart?.change24h || 0),
      ]);
      assert.equal(home.status, 0);
      const nativeHomeHash = createHash("sha256")
        .update(home.stdout)
        .digest("hex");
      const wasmHomeHash = await page.evaluate(async (snapshot) => {
        const { default: create } = await import("/firmware-screen.js"),
          m = await create();
        m._screen_reset();
        const fields = {
          ok: 1,
          market: "SOL",
          price: snapshot.price,
          chain: "solana",
          chainOk: 1,
          agent: "Custom",
          link: "STUDIO SNAPSHOT",
          remembers: 1,
          armed: 0,
          hoursState: "CRYPTO",
          marketOpen: 1,
          hoursNote: "public price snapshot",
        };
        for (const [k, v] of Object.entries(fields))
          m.ccall("screen_set", null, ["string", "string"], [k, String(v)]);
        if (snapshot.chart?.closes?.length) {
          for (const v of snapshot.chart.closes) m._screen_close(v);
          m.ccall(
            "screen_chart",
            null,
            ["string", "number", "number", "number"],
            ["SOL", snapshot.price, snapshot.chart.change24h || 0, 1],
          );
        }
        const ptr = m._screen_render(),
          bytes = new Uint8Array(m.HEAPU16.buffer, ptr, 320 * 240 * 2);
        return Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        )
          .map((v) => v.toString(16).padStart(2, "0"))
          .join("");
      }, snapshot);
      assert.equal(wasmHomeHash, nativeHomeHash);
      console.log("Actual home firmware RGB565 SHA-256:", nativeHomeHash);
    } finally {
      await browser?.close();
      if (server) await new Promise((r) => server.close(r));
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test("all sixteen commissioned art assets retain their dimensions and stay below 400 KB", async () => {
  const base = path.join(repo, "desk/app/public/media/art"),
    manifest = JSON.parse(
      await readFile(path.join(base, "ASSETS.json"), "utf8"),
    );
  assert.equal(manifest.assets.length, 16);
  for (const a of manifest.assets) {
    const b = await readFile(path.join(base, a.file));
    assert.equal(a.bytes, b.length);
    assert.ok(b.length < 400 * 1024);
    if (a.file.endsWith(".png")) {
      assert.equal(b.readUInt32BE(16), 1024);
      assert.equal(b.readUInt32BE(20), 1024);
      assert.ok(
        b.includes(Buffer.from("tRNS")),
        "Real indexed alpha is retained",
      );
    } else {
      assert.equal(a.width, 1536);
      assert.equal(a.height, 1024);
    }
  }
});

test("studio frames keep real CAD bounds inside padding and record genuine price provenance", async () => {
  const dir = path.join(repo, "desk/app/public/media/pad"),
    r = JSON.parse(await readFile(path.join(dir, "RENDERS.json"), "utf8"));
  assert.ok(r.screen.price > 0 && r.screen.quote.contextSlot > 0);
  assert.equal(
    r.screen.quote.outputMint,
    "So11111111111111111111111111111111111111112",
  );
  for (const f of r.framing)
    for (const n of Object.values(f.margins))
      assert.ok(n >= 0.08 - 1e-6, f.file + " clipped");
  assert.ok(r.framing.some((f) => f.file === "offline.png"));
  assert.equal(r.lighting.toneMapping, "ACES Filmic");
  assert.equal(r.lighting.output, "sRGB");
  const quality = JSON.parse(
    await readFile(
      path.join(repo, "desk/app/public/models/QUALITY.json"),
      "utf8",
    ),
  );
  assert.equal(quality.materials.enclosure.clearcoat, 0.3);
  assert.equal(quality.materials.enclosure.roughness, 0.45);
  assert.ok(quality.reports.every((x) => x.rays > 100000));
});

test('white key keeps the base action with compiled firmware SCAN label and the actual CAD magnifier in both GLBs', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'xorr-scan-key-'));
  try {
    const binary = path.join(dir, 'scan-key');
    const compile = spawnSync('c++', ['-std=c++17', '-I'+path.join(repo,'tools/uipreview/shim'), '-I'+repo, '-x','c++','-','-o',binary], {
      encoding:'utf8', input:'#include "firmware/xorrpad/agents.h"\n#include <cstring>\nint main(){const auto &k=defaultKeyAt(2,3); return strcmp(k.id,"base") || strcmp(k.label,"SCAN");}\n'
    });
    assert.equal(compile.status,0,compile.stderr);
    assert.equal(spawnSync(binary).status,0);
    const expected = spawnSync(path.join(repo,'cad/.venv/bin/python'), ['-c', `import sys,json;sys.path.insert(0,'cad');import partlib as pl,part_caps;key=next(k for k in pl.key_layout() if k['id']=='base');assert key['glyph']=='scan';m=next(m for n,m,c in part_caps.build() if n=='base-legend');print(json.dumps({'triangles':len(m.F),'bounds':[[min(v[i] for v in m.V),max(v[i] for v in m.V)] for i in range(3)]}))`], {cwd:repo,encoding:'utf8'});
    assert.equal(expected.status,0,expected.stderr);
    const cad=JSON.parse(expected.stdout);
    const THREE=req('three');
    const {NodeIO}=req('@gltf-transform/core'), {ALL_EXTENSIONS}=req('@gltf-transform/extensions'), {MeshoptDecoder}=req('meshoptimizer');
    await MeshoptDecoder.ready;
    const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
    for (const name of ['xorrpad.glb','xorrpad-exploded.glb']) {
      const doc=await io.read(path.join(repo,'desk/app/public/models',name));
      const key=doc.getRoot().listNodes().find(n=>n.getName()==='key-10');
      assert.equal(key.getExtras().action,'base');
      const legend=key.listChildren().find(n=>n.getName()==='base-legend');
      assert.ok(legend,'Magnifier legend remains attached to SCAN');
      const p=legend.getMesh().listPrimitives()[0], pos=p.getAttribute('POSITION');
      assert.equal((p.getIndices()?.getCount() || pos.getCount())/3,cad.triangles);
      // Exported positions retain the full CAD legend, including the ring and handle.
      for(let axis=0;axis<3;axis++) {
        const matrix=new THREE.Matrix4().fromArray(legend.getWorldMatrix());
        const values=Array.from({length:pos.getCount()},(_,i)=>new THREE.Vector3().fromArray(pos.getElement(i,[])).applyMatrix4(matrix).getComponent(axis) - (axis===2 && name.includes('exploded') ? 40 : 0));
        assert.ok(Math.abs(Math.min(...values)-cad.bounds[axis][0])<0.02);
        assert.ok(Math.abs(Math.max(...values)-cad.bounds[axis][1])<0.02);
      }
    }
  } finally { await rm(dir,{recursive:true,force:true}); }
});
