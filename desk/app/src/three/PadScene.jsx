import React, { useMemo, useRef, useEffect, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";
import { drawFirmware } from "./screen.mjs";
function Model(p) {
  const { scene } = useGLTF("/desktop/models/xorrpad.glb", false, true),
    { invalidate, camera, size } = useThree(),
    group = useRef(),
    [hover, setHover] = useState(null),
    [focus, setFocus] = useState(null);
  const model = useMemo(() => {
    const s = scene.clone(true);
    s.traverse((n) => {
      if (n.isMesh) {
        n.material = n.material.clone();
        n.castShadow = true;
        n.receiveShadow = true;
      }
    });
    return s;
  }, [scene]);
  const originals = useMemo(
    () =>
      new Map(
        Array.from({ length: 14 }, (_, i) => {
          const n = model.getObjectByName(
            "key-" + String(i + 1).padStart(2, "0"),
          );
          return [n.name, n.position.z];
        }),
      ),
    [model],
  );
  const nodes = useMemo(
    () =>
      Object.fromEntries(
        [...originals.keys(), "knob"].map((n) => [n, model.getObjectByName(n)]),
      ),
    [model, originals],
  );
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 320;
    c.height = 240;
    const t = new THREE.CanvasTexture(c);
    t.flipY = false;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => {
    let dead = false;
    const update = async () => {
      try {
        await drawFirmware(texture.image, p);
        if (!dead) {
          texture.needsUpdate = true;
          invalidate();
        }
      } catch (e) {
        p.root.current.dataset.screenError = e.message;
      }
    };
    update();
    const timer = setInterval(update, 1000);
    return () => {
      dead = true;
      clearInterval(timer);
    };
  }, [p.device, p.pending, p.status, p.chart, texture, invalidate]);
  useEffect(() => {
    model.traverse((n) => {
      if (n.isMesh && n.material.name === "Screen") {
        n.material.emissiveMap = texture;
        n.material.emissive.set("#fff");
        n.material.emissiveIntensity = 0.75;
      }
    });
    p.onReady();
    invalidate();
    return () => {
      model.traverse((n) => {
        if (n.isMesh) n.material.dispose();
      });
      texture.dispose();
    };
  }, [model]);
  useEffect(() => {
    const lines = [];
    for (let i = 0; i < p.keys.length; i++) {
      const k = p.keys[i],
        n = nodes["key-" + String(i + 1).padStart(2, "0")];
      if (
        !n ||
        !p.layout ||
        (k.action === p.layout.keys[i].action &&
          k.label === k.action.toUpperCase())
      )
        continue;
      n.traverse((c) => {
        if (c.isMesh && !c.name.endsWith("-legend")) {
          const edge = new THREE.LineSegments(
            new THREE.EdgesGeometry(c.geometry, 35),
            new THREE.LineBasicMaterial({
              color: "#c8f53c",
              transparent: true,
              opacity: 0.24,
              depthWrite: false,
            }),
          );
          c.add(edge);
          lines.push(edge);
        }
      });
    }
    invalidate();
    return () =>
      lines.forEach((l) => {
        l.removeFromParent();
        l.geometry.dispose();
        l.material.dispose();
      });
  }, [p.keys, p.layout, nodes, invalidate]);
  useEffect(() => {
    invalidate();
  }, [hover, p.angle, p.reduced, p.pressed]);
  const point = useMemo(() => new THREE.Vector3(), []);
  const rendered = useRef(0),
    started = useRef(performance.now());
  useFrame(({ clock }, dt) => {
    if (!group.current) return;
    group.current.rotation.y = p.reduced
      ? 0
      : Math.sin(clock.elapsedTime * 0.25) * 0.035;
    for (const [name, z] of originals) {
      const i = Number(name.slice(4)) - 1,
        n = nodes[name],
        target =
          z +
          (hover === name ? 1.5 : 0) -
          (p.pressed === p.keys[i]?.action ? 1.2 : 0);
      n.position.z = p.reduced
        ? target
        : THREE.MathUtils.damp(n.position.z, target, 18, dt);
    }
    nodes.knob.rotation.z = (p.angle * Math.PI) / 180;
    group.current.updateWorldMatrix(true, true);
    for (const [name, n] of Object.entries(nodes)) {
      point.set(0, 0, 7.5).applyMatrix4(n.matrixWorld).project(camera);
      const el = p.hitRefs.current[name];
      if (el) {
        el.style.left = ((point.x + 1) / 2) * size.width + "px";
        el.style.top = ((1 - point.y) / 2) * size.height + "px";
      }
    }
    const root = p.root.current;
    if (root) {
      root.dataset.knobRadians = nodes.knob.rotation.z;
      root.dataset.sway = group.current.rotation.y;
      root.dataset.hoverKey = hover || "";
      root.dataset.hoverLift = hover
        ? nodes[hover].position.z - originals.get(hover)
        : 0;
      root.dataset.frames = ++rendered.current;
      root.dataset.elapsed = performance.now() - started.current;
    }
  });
  function node(e) {
    let n = e.object;
    while (n && !/^key-\d\d$|^knob$/.test(n.name)) n = n.parent;
    return n;
  }
  return (
    <group ref={group}>
      <primitive
        object={model}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerOver={(e) => {
          const n = node(e);
          if (n) {
            e.stopPropagation();
            setHover(n.name === "knob" ? null : n.name);
            document.body.style.cursor = "pointer";
          }
        }}
        onPointerOut={() => {
          setHover(null);
          document.body.style.cursor = "";
        }}
        onClick={(e) => {
          const n = node(e);
          if (!n) return;
          e.stopPropagation();
          if (n.name === "knob") p.onKnob();
          else {
            const k = p.keys[Number(n.name.slice(4)) - 1];
            if (k) p.onKey(k);
          }
        }}
      />
    </group>
  );
}
export default function PadScene(p) {
  return (
    <Canvas
      className="model-canvas"
      dpr={[1, 1.5]}
      frameloop={p.reduced ? "demand" : "always"}
      camera={{ position: [170, 155, 230], fov: 34, near: 1, far: 1200 }}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      shadows
      onCreated={({ camera, gl }) => {
        camera.lookAt(0, 43, -10);
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.15;
      }}
    >
      <hemisphereLight args={["#f3f0e8", "#111126", 2]} />
      <directionalLight
        position={[60, 210, 160]}
        intensity={3}
        color="#f3f0e8"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-150}
        shadow-camera-right={150}
        shadow-camera-top={150}
        shadow-camera-bottom={-150}
        shadow-camera-far={700}
        shadow-bias={-0.0004}
      />
      <directionalLight
        position={[-160, 100, -100]}
        intensity={2.2}
        color="#2f5bff"
      />
      <directionalLight
        position={[130, 140, -160]}
        intensity={2}
        color="#b7a6ff"
      />
      <directionalLight
        position={[-90, 60, 120]}
        intensity={0.65}
        color="#c8f53c"
      />
      <Environment resolution={64}>
        <Lightformer
          intensity={1}
          scale={[200, 200, 1]}
          position={[0, 200, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        />
        <Lightformer
          intensity={0.5}
          scale={[150, 150, 1]}
          position={[0, 60, -200]}
        />
      </Environment>
      <Model {...p} />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.2, 0]}
        receiveShadow
      >
        <planeGeometry args={[1000, 1000]} />
        <shadowMaterial transparent opacity={0.36} />
      </mesh>
    </Canvas>
  );
}
