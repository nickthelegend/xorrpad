/** Shared offline studio rig; product geometry and cap hues are never replaced. */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
export const STUDIO = {
  exposure: 1,
  key: { color: "#fff7ef", intensity: 3.2, position: [-100, 200, 140] },
  fill: { color: "#dce3ff", intensity: 0.65, position: [150, 80, 110] },
  cobalt: { color: "#2f5bff", intensity: 2.5, position: [-150, 80, -120] },
  lavender: { color: "#b7a6ff", intensity: 2.2, position: [140, 120, -150] },
  glint: { color: "#c8f53c", intensity: 0.25, position: [-90, 60, 120] },
};
export function configureStudio(renderer, scene) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = STUDIO.exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const pmrem = new THREE.PMREMGenerator(renderer),
    room = new RoomEnvironment(),
    env = pmrem.fromScene(room, 0.07);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.8;
  room.dispose();
  pmrem.dispose();
  return () => {
    scene.environment = null;
    env.dispose();
  };
}
export function prepareProduct(model) {
  model.traverse((n) => {
    if (!n.isMesh) return;
    n.castShadow = n.material.name !== "Screen";
    n.receiveShadow = true;
    if (n.material.name === "Screen") {
      n.material.emissiveIntensity = 0.7;
      n.material.envMapIntensity = 0.45;
    } else n.material.envMapIntensity = 0.9;
  });
}
