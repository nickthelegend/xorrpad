import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
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
    wasm._screen_reset();
    const p = wasm._screen_render();
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
    applyScreen();
  } catch (e) {
    throw Error("Actual firmware screen required: " + e.message);
  }
  window.renderFrame = async ({
    view = "hero",
    dark = false,
    angle = 0,
  } = {}) => {
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
    reflectiveFloor.visible = dark && view === "hero";
    renderer.setClearColor("#030304", dark ? 1 : 0);
    scene.background = dark ? new THREE.Color("#030304") : null;
    const p =
      view === "top"
        ? [0, 280, 5]
        : view === "side"
          ? [260, 70, 0]
          : view === "exploded"
            ? [190, 175, 260]
            : [170, 155, 230];
    camera.position.set(...p);
    camera.lookAt(0, view === "exploded" ? 68 : 43, -10);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    renderer.render(scene, camera);
  };
  await window.renderFrame();
  return {
    triangles: renderer.info.render.triangles,
    renderer: renderer
      .getContext()
      .getParameter(renderer.getContext().RENDERER),
  };
})();
