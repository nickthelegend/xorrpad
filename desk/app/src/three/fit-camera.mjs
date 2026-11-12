import * as THREE from "three";
export const HERO_DIRECTION = [170, 112, 240];
export function boxCorners(box) {
  return [0, 1].flatMap((x) =>
    [0, 1].flatMap((y) =>
      [0, 1].map(
        (z) =>
          new THREE.Vector3(
            x ? box.max.x : box.min.x,
            y ? box.max.y : box.min.y,
            z ? box.max.z : box.min.z,
          ),
      ),
    ),
  );
}
/** Solve perspective distance for all eight actual bound corners, including perspective depth. */
export function fitCamera(
  camera,
  box,
  {
    direction = HERO_DIRECTION,
    aspect = 1,
    padding = 0.08,
    points = boxCorners(box),
  } = {},
) {
  const center = box.getCenter(new THREE.Vector3()),
    back = new THREE.Vector3(...direction).normalize(),
    worldUp =
      Math.abs(back.y) > 0.999
        ? new THREE.Vector3(0, 0, -1)
        : new THREE.Vector3(0, 1, 0),
    right = new THREE.Vector3().crossVectors(worldUp, back).normalize(),
    up = new THREE.Vector3().crossVectors(back, right),
    tan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2),
    usable = 1 - 2 * padding;
  let distance = 0;
  for (const c of points.map((p) => p.clone())) {
    const v = c.sub(center),
      z = v.dot(back);
    distance = Math.max(
      distance,
      z + Math.abs(v.dot(right)) / (tan * aspect * usable),
      z + Math.abs(v.dot(up)) / (tan * usable),
    );
  }
  camera.aspect = aspect;
  camera.up.copy(up);
  camera.position.copy(center).addScaledVector(back, distance);
  camera.near = Math.max(
    0.1,
    distance - box.getSize(new THREE.Vector3()).length(),
  );
  camera.far = distance + box.getSize(new THREE.Vector3()).length() * 3;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const uv = points
    .map((p) => p.clone())
    .map((p) => p.project(camera))
    .map((p) => [(p.x + 1) / 2, (1 - p.y) / 2]);
  const margins = {
    left: Math.min(...uv.map((p) => p[0])),
    right: 1 - Math.max(...uv.map((p) => p[0])),
    top: Math.min(...uv.map((p) => p[1])),
    bottom: 1 - Math.max(...uv.map((p) => p[1])),
  };
  if (Object.values(margins).some((m) => m < padding - 1e-6))
    throw Error("Actual model bounds exceed frame padding");
  return {
    camera: camera.position.toArray(),
    target: center.toArray(),
    padding,
    margins,
    bounds: { min: box.min.toArray(), max: box.max.toArray() },
  };
}
