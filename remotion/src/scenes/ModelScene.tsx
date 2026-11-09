import React from "react";
import { AbsoluteFill, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Scene } from "../types";
import { Theme } from "../styles";
import { Backdrop } from "./Backdrop";
import { easeInOut, easeOut, easeOutExpo, hash01, prog } from "./motion";

/** `away`: the offset that moves the part away from the model's centre by its own distance, in its parent's space. */
type Part = { name: string; obj: THREE.Object3D; home: THREE.Vector3; center: THREE.Vector3; away: THREE.Vector3; mats: THREE.MeshStandardMaterial[] };
type Loaded = { root: THREE.Group; parts: Part[]; radius: number };

const FOV = 30;

/** Load a .glb once, centre it, scale it to a radius of 1, give every part its own material (so one part can be
 *  tinted) and dark outline edges (a technical, CAD-like look). */
const useModel = (src: string, edges: boolean, colors: Record<string, string> | undefined): Loaded | null => {
  const [model, setModel] = React.useState<Loaded | null>(null);
  const [handle] = React.useState(() => delayRender(`Loading 3D model ${src}`));
  React.useEffect(() => {
    new GLTFLoader().load(
      staticFile(src),
      (gltf) => {
        const root = new THREE.Group();
        const scene = gltf.scene;
        const box = new THREE.Box3().setFromObject(scene);
        const size = box.getSize(new THREE.Vector3());
        const scale = 2 / Math.max(size.x, size.y, size.z);
        scene.position.sub(box.getCenter(new THREE.Vector3()));
        const holder = new THREE.Group();
        holder.add(scene);
        holder.scale.setScalar(scale);
        root.add(holder);
        root.updateMatrixWorld(true);
        // Parts: the meshes' nearest named ancestors below the model root (FreeCAD exports one node per part).
        const parts: Part[] = [];
        const seen = new Set<THREE.Object3D>();
        scene.traverse((o) => {
          if (!(o as THREE.Mesh).isMesh) return;
          const mesh = o as THREE.Mesh;
          let node: THREE.Object3D = mesh;
          while (node.parent && node.parent !== scene && !node.name) node = node.parent;
          const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
            const std = (m as THREE.MeshStandardMaterial).clone();
            std.side = THREE.DoubleSide;
            const custom = colors?.[node.name];
            if (custom) std.color = new THREE.Color(custom);
            std.roughness = Math.max(0.45, std.roughness ?? 0.6);
            std.metalness = Math.min(0.1, std.metalness ?? 0);
            return std;
          });
          mesh.material = mats.length === 1 ? mats[0] : mats;
          if (edges) {
            const line = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 25), new THREE.LineBasicMaterial({ color: 0x1a1d22, transparent: true, opacity: 0.55 }));
            mesh.add(line);
          }
          if (seen.has(node)) {
            parts.find((p) => p.obj === node)!.mats.push(...mats);
            return;
          }
          seen.add(node);
          const c = new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());
          // Computed while the model is unrotated, so the explode direction belongs to the model, not the view.
          const inv = new THREE.Matrix4().copy(node.parent!.matrixWorld).invert();
          const away = c.clone().applyMatrix4(inv).sub(new THREE.Vector3(0, 0, 0).applyMatrix4(inv));
          parts.push({ name: node.name, obj: node, home: node.position.clone(), center: c, away, mats });
        });
        const all = new THREE.Box3().setFromObject(root);
        setModel({ root, parts, radius: all.getBoundingSphere(new THREE.Sphere()).radius });
        continueRender(handle);
      },
      undefined,
      (err) => {
        console.error(err);
        continueRender(handle);
      },
    );
  }, [src, edges, colors, handle]);
  return model;
};

/** 3D model scene (.glb): a slow turntable, an exploded view that lifts the parts apart on a stagger, breathes
 *  and comes back together, labels that follow their parts on leader lines, and parts tinted on a cue. */
export const ModelScene: React.FC<{ scene: Scene; theme: Theme }> = ({ scene, theme }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const k = Math.min(width, height) / 1080;
  const m = scene.model!;
  const model = useModel(m.src, m.edges !== false, m.colors);
  const tall = height / width > 1.5;
  // The model sits above the captions.
  const areaH = Math.round(height * (tall ? 0.7 : 0.78));
  const aspect = width / areaH;
  // Frame the model's bounding sphere with some room for the exploded parts and the labels.
  // The camera dollies out while the parts fly apart, so the exploded view stays in frame.
  const exAll = m.explode
    ? easeOutExpo(prog(frame, m.explode.at, fps * 1.2)) * (m.explode.hold !== undefined ? 1 - easeInOut(prog(frame, m.explode.at + m.explode.hold, fps * 0.9)) : 1)
    : 0;
  const radius = (model?.radius ?? 1.3) * (1 + (m.explode?.amount ?? 0.6) * 1.15 * exAll);
  const dist = ((radius * 1.35) / Math.sin(((FOV / 2) * Math.PI) / 180) / Math.min(1, aspect)) / (m.zoom ?? 1);

  // Turntable and tilt.
  const t = frame / Math.max(1, scene.duration);
  const az = ((m.az ?? 35) + (m.spin ?? 0.12) * 360 * t) * (Math.PI / 180);
  const el = (m.el ?? 18) * (Math.PI / 180);
  const intro = easeOutExpo(prog(frame, 0, fps * 1.0));

  // Explode: 0..1 per part, staggered by distance from the centre; breathes while held; optionally comes back.
  const ex = m.explode;
  const explodeAt = (i: number, n: number, rank: number) => {
    if (!ex) return 0;
    const start = ex.at + (rank / Math.max(1, n - 1)) * fps * 0.5 + hash01(i) * 3;
    const open = easeOutExpo(prog(frame, start, fps * 0.9));
    const breathe = 1 + 0.12 * easeInOut(prog(frame, start + fps * 0.9, fps * 1.6));
    const back = ex.hold !== undefined ? 1 - easeInOut(prog(frame, ex.at + ex.hold, fps * 0.9)) : 1;
    return open * breathe * back;
  };

  const camera = React.useMemo(() => {
    const c = new THREE.PerspectiveCamera(FOV, aspect, 0.01, 100);
    c.position.set(0, 0, dist);
    c.lookAt(0, 0, 0);
    c.updateMatrixWorld(true);
    c.updateProjectionMatrix();
    return c;
  }, [aspect, dist]);

  const labels: { x: number; y: number; text: string; o: number; side: number }[] = [];
  if (model) {
    const rot = new THREE.Euler(el, az, 0, "XYZ");
    const order = model.parts.map((p, i) => ({ i, d: p.center.length() })).sort((a, b) => a.d - b.d);
    const rank: number[] = [];
    order.forEach((o, r) => (rank[o.i] = r));
    const amount = ex?.amount ?? 0.6;
    model.parts.forEach((p, i) => {
      const e = explodeAt(i, model.parts.length, rank[i]);
      p.obj.position.copy(p.home).addScaledVector(p.away, amount * e);
      // Tint on cue.
      const hl = (m.highlight ?? []).filter((h) => h.part === p.name || p.name.startsWith(h.part));
      let glow = 0;
      let color = theme.accent;
      for (const h of hl) {
        const g = easeOut(prog(frame, h.at, fps * 0.3)) * (h.hold !== undefined ? 1 - prog(frame, h.at + h.hold, fps * 0.3) : 1);
        if (g > glow) {
          glow = g;
          color = h.color ?? theme.accent;
        }
      }
      for (const mat of p.mats) {
        mat.emissive = new THREE.Color(color);
        mat.emissiveIntensity = glow * (0.55 + 0.25 * Math.sin(frame / 4));
      }
    });
    model.root.rotation.copy(rot);
    model.root.scale.setScalar(0.85 + 0.15 * intro);
    model.root.updateMatrixWorld(true);
    // Labels follow their part's current centre on screen.
    (m.labels ?? []).forEach((l, li) => {
      const p = model.parts.find((pp) => pp.name === l.part) ?? model.parts.find((pp) => pp.name.startsWith(l.part));
      if (!p || frame < l.at) return;
      const c = new THREE.Box3().setFromObject(p.obj).getCenter(new THREE.Vector3());
      const v = c.project(camera);
      const gone = l.hold !== undefined ? prog(frame, l.at + l.hold, fps * 0.25) : 0;
      labels.push({ x: (v.x * 0.5 + 0.5) * width, y: (-v.y * 0.5 + 0.5) * areaH, text: l.text, o: easeOut(prog(frame, l.at, fps * 0.35)) * (1 - gone), side: li % 2 });
    });
  }

  // Labels sit in a column at each side, at the height of their part when they can (so leader lines stay
  // nearly level and never cross), pushed apart to keep an even gap.
  const colX = [width * 0.05, width * 0.95];
  const gap = 70 * k;
  const lastY = [-Infinity, -Infinity];
  const placed = labels
    .sort((a, b) => a.y - b.y)
    .map((l) => {
      const side = l.x > width / 2 ? 1 : 0;
      const ly = Math.min(areaH - gap, Math.max(areaH * 0.08, l.y, lastY[side] + gap));
      lastY[side] = ly;
      return { ...l, side, ly };
    });

  return (
    <AbsoluteFill>
      <Backdrop theme={theme} focus={[50, 35]} />
      <AbsoluteFill style={{ height: areaH }}>
        <ThreeCanvas width={width} height={areaH} camera={{ fov: FOV, position: [0, 0, dist], near: 0.01, far: 100 }} gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}>
          <ambientLight intensity={0.75} />
          <directionalLight position={[3, 5, 4]} intensity={1.6} />
          <directionalLight position={[-4, 2, -3]} intensity={0.5} color={theme.accent} />
          <hemisphereLight args={["#ffffff", "#30343a", 0.35]} />
          {model ? <primitive object={model.root} /> : null}
        </ThreeCanvas>
        <svg width={width} height={areaH} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          {placed.map((l, i) => {
            const lx = l.side ? colX[1] - 20 * k : colX[0] + 20 * k;
            return (
              <g key={i} opacity={l.o}>
                <path d={`M ${lx} ${l.ly} L ${lx + (l.side ? -60 : 60) * k} ${l.ly} L ${l.x} ${l.y}`} fill="none" stroke={theme.accent} strokeWidth={2.5 * k} />
                <circle cx={l.x} cy={l.y} r={7 * k} fill={theme.accent} />
              </g>
            );
          })}
        </svg>
        {placed.map((l, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              top: l.ly - 26 * k,
              left: l.side ? undefined : colX[0] - 0 * k,
              right: l.side ? width - colX[1] : undefined,
              transform: `translateX(${(1 - l.o) * (l.side ? 20 : -20) * k}px)`,
              opacity: l.o,
              padding: `${8 * k}px ${16 * k}px`,
              borderRadius: 10 * k,
              background: "rgba(10,12,16,0.82)",
              border: `1.5px solid ${theme.accent}`,
              color: theme.text,
              fontFamily: theme.font,
              fontWeight: 700,
              fontSize: 26 * k,
              whiteSpace: "nowrap",
            }}
          >
            {l.text}
          </div>
        ))}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
