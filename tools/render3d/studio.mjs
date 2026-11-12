import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
const scene = new THREE.Scene(),
  camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 1, 1200);
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  preserveDrawingBuffer: true,
});
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.append(renderer.domElement);
const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
const env = pmrem.fromScene(room, 0.04);
scene.environment = env.texture;
scene.environmentIntensity = 0.45;
room.dispose();
pmrem.dispose();
scene.add(new THREE.HemisphereLight("#f3f0e8", "#111126", 2));
function light(color, intensity, pos) {
  const l = new THREE.DirectionalLight(color, intensity);
  l.position.set(...pos);
  scene.add(l);
  return l;
}
const key = light("#f3f0e8", 3, [60, 210, 160]);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, {
  left: -200,
  right: 200,
  top: 200,
  bottom: -200,
  near: 1,
  far: 700,
});
key.shadow.bias = -0.0004;
light("#2f5bff", 2.2, [-160, 100, -100]);
light("#b7a6ff", 2, [130, 140, -160]);
light("#c8f53c", 0.65, [-90, 60, 120]);
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(1500, 1500),
  new THREE.ShadowMaterial({ opacity: 0.36 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.2;
floor.receiveShadow = true;
scene.add(floor);
const root = new THREE.Group();
scene.add(root);
let model;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
window.ready = (async () => {
  const g = await loader.loadAsync("/models/xorrpad.glb");
  model = g.scene;
  model.rotation.x = -Math.PI / 2;
  model.traverse((n) => {
    if (n.isMesh) {
      n.castShadow = true;
      n.receiveShadow = true;
    }
  });
  root.add(model);
  let screenTexture;
  const applyScreen = () =>
    model.traverse((n) => {
      if (n.isMesh && n.material.name === "Screen") {
        n.material.emissiveMap = screenTexture;
        n.material.emissive.set("#ffffff");
        n.material.emissiveIntensity = 0.75;
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
      root.add(model);
      applyScreen();
    }
    root.rotation.y = angle;
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
