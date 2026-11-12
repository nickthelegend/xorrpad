import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { fitCamera, boxCorners, HERO_DIRECTION } from "/shared/fit-camera.mjs";
import { Reflector } from "three/addons/objects/Reflector.js";
import {
  STUDIO,
  configureStudio,
  prepareProduct,
} from "/shared/studio-quality.mjs";
const scene = new THREE.Scene(),
  camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 1, 1200);
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  preserveDrawingBuffer: true,
});
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(1);
document.body.append(renderer.domElement);
configureStudio(renderer, scene);
scene.add(new THREE.HemisphereLight("#f3f0e8", "#111126", 0.22));
for (const [name, l] of Object.entries(STUDIO)) {
  if (!l?.position) continue;
  const light = new THREE.DirectionalLight(l.color, l.intensity);
  light.position.set(...l.position);
  if (name === "key") {
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    Object.assign(light.shadow.camera, {
      left: -200,
      right: 200,
      top: 200,
      bottom: -200,
      near: 1,
      far: 700,
    });
    light.shadow.bias = -0.0001;
    light.shadow.radius = 4;
  }
  scene.add(light);
}
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(1500, 1500),
  new THREE.ShadowMaterial({ opacity: 0.18 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.2;
floor.receiveShadow = true;
scene.add(floor);
const reflectiveFloor = new Reflector(new THREE.PlaneGeometry(1500, 1500), {
  color: 0x030304,
  textureWidth: 768,
  textureHeight: 768,
  multisample: 0,
  clipBias: 0.003,
});
reflectiveFloor.rotation.x = -Math.PI / 2;
reflectiveFloor.position.y = -0.35;
reflectiveFloor.material.fragmentShader =
  reflectiveFloor.material.fragmentShader.replace(
    "blendOverlay( base.rgb, color )",
    "mix( color, base.rgb, 0.075 )",
  );
reflectiveFloor.visible = false;
scene.add(reflectiveFloor);
const root = new THREE.Group();
scene.add(root);
let model;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
window.ready = (async () => {
  const g = await loader.loadAsync("/models/xorrpad.glb");
  model = g.scene;
  model.rotation.x = -Math.PI / 2;
  prepareProduct(model);
  root.add(model);
  const ao = await (await fetch("/models/AO.json")).json(),
    aoTexture = await new THREE.TextureLoader().loadAsync(
      "/models/contact-ao.png",
    );
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(ao.plane.width, ao.plane.depth),
    new THREE.MeshBasicMaterial({
      map: aoTexture,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.set(ao.plane.center[0], -0.1, ao.plane.center[1]);
  root.add(contact);
  let screenTexture;
  const applyScreen = () =>
    model.traverse((n) => {
      if (n.isMesh && n.material.name === "Screen") {
        n.material.emissiveMap = screenTexture;
        n.material.emissive.set("#ffffff");
        n.material.emissiveIntensity = 0.7;
      }
    });
  try {
    const { default: create } = await import("/firmware-screen.js");
    const wasm = await create({ locateFile: (f) => "/" + f });
    const snapshot = await (await fetch("/screen-snapshot.json")).json();
    const pixels = (offline = false) => {
      wasm._screen_reset();
      if (!offline) {
        const config = snapshot.previewConfiguration,
          fields = {
            ok: 1,
            market: "SOL",
            price: snapshot.price,
            chain: "solana",
            chainOk: 1,
            agent: config.agent,
            link: config.link,
            remembers: 1,
            armed: 0,
            hoursState: "CRYPTO",
            marketOpen: 1,
            hoursNote: "public price snapshot",
          };
        for (const [k, v] of Object.entries(fields))
          wasm.ccall("screen_set", null, ["string", "string"], [k, String(v)]);
        // The current live quote remains the large price; pool closes supply only the real historical trace.
        if (snapshot.chart?.closes?.length) {
          for (const v of snapshot.chart.closes) wasm._screen_close(v);
          wasm.ccall(
            "screen_chart",
            null,
            ["string", "number", "number", "number"],
            [
              "SOL",
              snapshot.price,
              snapshot.chart.change24h || 0,
              Number(snapshot.chart.change24h != null),
            ],
          );
        }
      }
      return wasm._screen_render();
    };
    const p = pixels(false);
    const px = new Uint16Array(wasm.HEAPU16.buffer, p, 320 * 240);
    const c = document.createElement("canvas");
    c.width = 320;
    c.height = 240;
    const ctx = c.getContext("2d"),
      im = ctx.createImageData(320, 240);
    px.forEach((v, i) => {
      im.data.set(
        [
          Math.round(((v >> 11) * 255) / 31),
          Math.round((((v >> 5) & 63) * 255) / 63),
          Math.round(((v & 31) * 255) / 31),
          255,
        ],
        i * 4,
      );
    });
    ctx.putImageData(im, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.flipY = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    screenTexture = tex;
    const offlineCanvas = document.createElement("canvas");
    offlineCanvas.width = 320;
    offlineCanvas.height = 240;
    const ptr = pixels(true),
      data = new Uint16Array(wasm.HEAPU16.buffer, ptr, 320 * 240),
      context = offlineCanvas.getContext("2d"),
      image = context.createImageData(320, 240);
    data.forEach((v, i) =>
      image.data.set(
        [
          Math.round(((v >> 11) * 255) / 31),
          Math.round((((v >> 5) & 63) * 255) / 63),
          Math.round(((v & 31) * 255) / 31),
          255,
        ],
        i * 4,
      ),
    );
    context.putImageData(image, 0, 0);
    window.offlineScreenTexture = new THREE.CanvasTexture(offlineCanvas);
    window.offlineScreenTexture.flipY = false;
    window.offlineScreenTexture.colorSpace = THREE.SRGBColorSpace;
    window.homeScreenTexture = tex;
    applyScreen();
  } catch (e) {
    throw Error("Actual firmware screen required: " + e.message);
  }
  window.renderFrame = async ({
    view = "hero",
    dark = false,
    angle = 0,
    offline = false,
  } = {}) => {
    screenTexture = offline
      ? window.offlineScreenTexture
      : window.homeScreenTexture;
    applyScreen();
    if ((view === "exploded") !== !!model.userData.exploded) {
      root.remove(model);
      const g = await loader.loadAsync(
        "/models/xorrpad" + (view === "exploded" ? "-exploded" : "") + ".glb",
      );
      model = g.scene;
      model.rotation.x = -Math.PI / 2;
      model.userData.exploded = view === "exploded";
      model.traverse((n) => {
        if (n.isMesh) {
          n.castShadow = true;
          n.receiveShadow = true;
        }
      });
      prepareProduct(model);
      root.add(model);
      applyScreen();
    }
    root.rotation.y = angle;
    reflectiveFloor.visible = dark && ["hero", "turntable"].includes(view);
    renderer.setClearColor("#030304", dark ? 1 : 0);
    scene.background = dark ? new THREE.Color("#030304") : null;
    model.updateWorldMatrix(true, true);
    let bounds = new THREE.Box3().setFromObject(model, true);
    if (view === "turntable") {
      root.rotation.y = 0;
      root.updateWorldMatrix(true, true);
      const fixed = new THREE.Box3().setFromObject(model, true),
        corners = boxCorners(fixed),
        sweep = new THREE.Box3();
      for (let i = 0; i < 180; i++) {
        const rotation = new THREE.Matrix4().makeRotationY(
          (i * Math.PI * 2) / 180,
        );
        for (const p of corners)
          sweep.expandByPoint(p.clone().applyMatrix4(rotation));
      }
      bounds = sweep;
      root.rotation.y = angle;
      root.updateWorldMatrix(true, true);
    }
    const framing = fitCamera(camera, bounds, {
      direction:
        view === "top"
          ? [0, 1, 0]
          : view === "side"
            ? [1, 0.12, 0]
            : HERO_DIRECTION,
      aspect: innerWidth / innerHeight,
      padding: 0.08,
    });
    renderer.setSize(innerWidth, innerHeight);
    renderer.render(scene, camera);
    const hotspots = {};
    for (let i = 1; i <= 14; i++) {
      const name = "key-" + String(i).padStart(2, "0"),
        n = model.getObjectByName(name),
        p = new THREE.Vector3(0, 0, 7.5)
          .applyMatrix4(n.matrixWorld)
          .project(camera);
      hotspots[name] = [(p.x + 1) / 2, (1 - p.y) / 2];
    }
    const knob = model.getObjectByName("knob"),
      k = new THREE.Vector3(0, 0, 10)
        .applyMatrix4(knob.matrixWorld)
        .project(camera);
    hotspots.knob = [(k.x + 1) / 2, (1 - k.y) / 2];
    return { ...framing, hotspots };
  };
  await window.renderFrame();
  return {
    triangles: renderer.info.render.triangles,
    renderer: renderer
      .getContext()
      .getParameter(renderer.getContext().RENDERER),
  };
})();
