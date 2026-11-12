/** Geometry-derived vertex AO and footprint; preserves every supplied CAD position/triangle. */
import { NodeIO } from "@gltf-transform/core";
import {
  ALL_EXTENSIONS,
  KHRMaterialsClearcoat,
} from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { MeshBVH } from "three-mesh-bvh";
import * as T from "three";
import sharp from "sharp";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../..", import.meta.url)),
  dir = path.join(root, "desk/app/public/models");
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const temp = await mkdtemp(path.join(root, "exports/quality-"));
const reports = [];
try {
  for (const file of ["xorrpad.glb", "xorrpad-exploded.glb"]) {
    const doc = await io.read(path.join(dir, file)),
      vertices = [],
      entries = [];
    for (const n of doc.getRoot().listNodes()) {
      const mesh = n.getMesh();
      if (!mesh) continue;
      const matrix = new T.Matrix4()
          .fromArray(n.getWorldMatrix())
          .premultiply(new T.Matrix4().makeRotationX(-Math.PI / 2)),
        normal = new T.Matrix3().getNormalMatrix(matrix);
      for (const p of mesh.listPrimitives()) {
        const pos = p.getAttribute("POSITION"),
          nor = p.getAttribute("NORMAL"),
          idx = p.getIndices();
        entries.push({ p, pos, nor, matrix, normal });
        for (let i = 0; i < (idx?.getCount() || pos.getCount()); i++) {
          const v = new T.Vector3()
            .fromArray(pos.getElement(idx ? idx.getScalar(i) : i, []))
            .applyMatrix4(matrix);
          vertices.push(v.x, v.y, v.z);
        }
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      "position",
      new T.Float32BufferAttribute(vertices, 3),
    );
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox.clone(),
      bvh = new MeshBVH(geometry, { targetLeafSize: 12 }),
      ray = new T.Ray(),
      point = new T.Vector3(),
      normal = new T.Vector3(),
      tangent = new T.Vector3(),
      bitangent = new T.Vector3();
    let cached = 0,
      rays = 0;
    const cache = new Map();
    for (const e of entries) {
      if (e.p.getMaterial()?.getName() === "Screen") continue;
      const colors = new Uint8Array(e.pos.getCount() * 3);
      for (let i = 0; i < e.pos.getCount(); i++) {
        point.fromArray(e.pos.getElement(i, [])).applyMatrix4(e.matrix);
        normal.fromArray(e.nor.getElement(i, [])).applyNormalMatrix(e.normal);
        const key = [...point.toArray(), ...normal.toArray()]
          .map((x) => x.toFixed(3))
          .join(",");
        let ao = cache.get(key);
        if (ao === undefined) {
          tangent
            .crossVectors(
              Math.abs(normal.y) > 0.95
                ? new T.Vector3(1, 0, 0)
                : new T.Vector3(0, 1, 0),
              normal,
            )
            .normalize();
          bitangent.crossVectors(normal, tangent);
          ray.origin.copy(point).addScaledVector(normal, 0.16);
          let hits = 0;
          for (let j = 0; j < 8; j++) {
            const radius = Math.sqrt((j + 0.5) / 8),
              theta = j * 2.3999632297;
            ray.direction
              .copy(normal)
              .multiplyScalar(Math.sqrt(1 - radius * radius))
              .addScaledVector(tangent, radius * Math.cos(theta))
              .addScaledVector(bitangent, radius * Math.sin(theta))
              .normalize();
            const hit = bvh.raycastFirst(ray, T.DoubleSide, 0.06, 9);
            rays++;
            if (hit) hits += 1 - hit.distance / 9;
          }
          ao = Math.round(255 * (1 - (0.16 * hits) / 8));
          cache.set(key, ao);
        } else cached++;
        colors.fill(ao, i * 3, i * 3 + 3);
      }
      e.p.setAttribute(
        "COLOR_0",
        doc
          .createAccessor("Geometry-baked ambient occlusion")
          .setType("VEC3")
          .setArray(colors)
          .setNormalized(true)
          .setBuffer(doc.getRoot().listBuffers()[0]),
      );
    }
    const clearcoat = doc.createExtension(KHRMaterialsClearcoat);
    for (const mat of doc.getRoot().listMaterials()) {
      const name = mat.getName(),
        enclosure = /tray|display-pod|display-cap/.test(name),
        screen = name === "Screen",
        cap =
          entries.some(
            (e) => e.p.getMaterial() === mat && e.pos.getCount() > 0,
          ) &&
          !enclosure &&
          !/plate|deck|legend|knob|Screen/.test(name);
      mat
        .setRoughnessFactor(screen ? 0.12 : enclosure ? 0.45 : cap ? 0.35 : 0.5)
        .setMetallicFactor(0);
      if (enclosure) {
        const c =
          mat.getExtras().studioOriginalColor || mat.getBaseColorFactor();
        mat.setExtras({ ...mat.getExtras(), studioOriginalColor: c });
        mat.setBaseColorFactor([c[0] * 0.76, c[1] * 0.76, c[2] * 0.76, c[3]]);
      }
      if (enclosure || cap || screen)
        mat.setExtension(
          "KHR_materials_clearcoat",
          clearcoat
            .createClearcoat()
            .setClearcoatFactor(screen ? 0.4 : enclosure ? 0.3 : 0.12)
            .setClearcoatRoughnessFactor(screen ? 0.08 : 0.22),
        );
    }
    for (const ext of doc.getRoot().listExtensionsUsed())
      if (ext.extensionName === "EXT_meshopt_compression") ext.dispose();
    const raw = path.join(temp, file);
    await io.write(raw, doc);
    const c = spawnSync(
      path.join(root, "tools/render3d/node_modules/.bin/gltf-transform"),
      ["meshopt", raw, path.join(dir, file), "--level", "medium"],
      { encoding: "utf8" },
    );
    if (c.status !== 0) throw Error(c.stderr);
    if (file === "xorrpad.glb") {
      const margin = 14,
        w = bounds.max.x - bounds.min.x + 2 * margin,
        d = bounds.max.z - bounds.min.z + 2 * margin,
        N = 256,
        rgba = new Uint8Array(N * N * 4);
      ray.direction.set(0, 1, 0);
      for (let z = 0; z < N; z++)
        for (let x = 0; x < N; x++) {
          ray.origin.set(
            bounds.min.x - margin + (w * (x + 0.5)) / N,
            bounds.min.y - 0.3,
            bounds.min.z - margin + (d * (z + 0.5)) / N,
          );
          const h = bvh.raycastFirst(ray, T.DoubleSide, 0, 150);
          rgba[(z * N + x) * 4 + 3] = h
            ? Math.round(125 * Math.exp(-h.distance / 14))
            : 0;
        }
      await sharp(rgba, { raw: { width: N, height: N, channels: 4 } })
        .blur(4)
        .png()
        .toFile(path.join(dir, "contact-ao.png"));
      await writeFile(
        path.join(dir, "AO.json"),
        JSON.stringify(
          {
            source:
              "Baked from actual CAD triangle BVH: eight cosine hemisphere rays per unique vertex/normal, 9 mm occlusion distance, 16% maximum darkening. Ground alpha is the actual nearest underside distance, blurred for soft contact.",
            plane: {
              width: w,
              depth: d,
              center: [
                (bounds.min.x + bounds.max.x) / 2,
                (bounds.min.z + bounds.max.z) / 2,
              ],
            },
            texture: "contact-ao.png",
          },
          null,
          2,
        ) + "\n",
      );
    }
    reports.push({
      file,
      triangles: vertices.length / 9,
      rays,
      cachedVertices: cached,
      bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
    });
    console.log("Baked", file, rays, "rays");
    geometry.dispose();
  }
  await writeFile(
    path.join(dir, "QUALITY.json"),
    JSON.stringify(
      {
        geometry:
          "Original positions/triangles retained; meshopt requantization only",
        materials: {
          enclosure: { roughness: 0.45, clearcoat: 0.3 },
          caps: { roughness: 0.35, clearcoat: 0.12 },
          screen: { roughness: 0.12, clearcoat: 0.4 },
        },
        reports,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
