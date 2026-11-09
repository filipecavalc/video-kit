import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { DiagramNode, Scene } from "../types";
import { Theme } from "../styles";
import { Backdrop } from "./Backdrop";
import { hash01, prog } from "./motion";

type Pt = { x: number; y: number };
/** Point on a cubic Bezier curve. */
const bez = (c: Pt[], t: number): Pt => {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const cc = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * c[0].x + b * c[1].x + cc * c[2].x + d * c[3].x, y: a * c[0].y + b * c[1].y + cc * c[2].y + d * c[3].y };
};

const ease = Easing.bezier(0.22, 1, 0.36, 1);

/** Architecture / process diagram: nodes pop in by level and edges draw. Then it runs like a live system:
 *  small packets keep travelling every edge (each on its own rhythm), the entry nodes send a pulse every few
 *  seconds, and cued flows send a bright packet with a trail along the curves, bumping each node it reaches. */
export const DiagramScene: React.FC<{ scene: Scene; theme: Theme }> = ({ scene, theme }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const k = Math.min(width, useVideoConfig().height) / 1080; // scale by the short side, so 16:9 is not oversized
  const d = scene.diagram!;
  const tall = height / width > 1.5;
  // Content box: below the title, above the captions.
  const top = height * (d.title ? 0.16 : 0.08);
  const bottom = height * (tall ? 0.66 : 0.74);
  const left = width * 0.07;
  const right = width * 0.93;
  // Nodes are as wide as their text needs (one line each), within the room their row or column leaves.
  const textW = (n: DiagramNode) => Math.max(n.label.length * 30 * k * 0.6, (n.sub ?? "").length * 20 * k * 0.62) + (n.icon ? 54 * k : 0) + 70 * k;
  const slot = ((right - left) / (d.vertical ? Math.max(...countPerLevel(d.nodes)) : levels(d.nodes))) * (d.vertical ? 0.92 : 0.8);
  const nodeW = Math.min(slot, Math.max(300 * k, ...d.nodes.map(textW)));
  // A node whose text still does not fit shrinks its text rather than wrapping it.
  const fit = (n: DiagramNode) => Math.min(1, nodeW / textW(n));
  const nodeH = 112 * k;
  const pos = (n: DiagramNode) => ({ x: left + n.x * (right - left), y: top + n.y * (bottom - top) });
  const byId = Object.fromEntries(d.nodes.map((n) => [n.id, n]));
  const appear = (n: DiagramNode) => Math.round(fps * 0.25 + n.level * fps * 0.45 + d.nodes.filter((m) => m.level === n.level).indexOf(n) * fps * 0.12);

  const curve = (a: DiagramNode, b: DiagramNode): Pt[] => {
    const p = pos(a);
    const q = pos(b);
    if (d.vertical) {
      const y1 = p.y + nodeH / 2;
      const y2 = q.y - nodeH / 2;
      const my = (y1 + y2) / 2;
      return [{ x: p.x, y: y1 }, { x: p.x, y: my }, { x: q.x, y: my }, { x: q.x, y: y2 }];
    }
    const x1 = p.x + nodeW / 2;
    const x2 = q.x - nodeW / 2;
    const mx = (x1 + x2) / 2;
    return [{ x: x1, y: p.y }, { x: mx, y: p.y }, { x: mx, y: q.y }, { x: x2, y: q.y }];
  };
  const edgePath = (a: DiagramNode, b: DiagramNode) => {
    const c = curve(a, b);
    return { d: `M ${c[0].x} ${c[0].y} C ${c[1].x} ${c[1].y}, ${c[2].x} ${c[2].y}, ${c[3].x} ${c[3].y}`, mid: bez(c, 0.5) };
  };
  const edgeReady = (a: DiagramNode, b: DiagramNode) => Math.max(appear(a), appear(b)) + fps * 0.65;

  // Packets: a flow walks its path one edge per 0.45 s, starting at `at`, along the curves, with a short trail.
  const hop = fps * 0.45;
  const packets: { x: number; y: number; color: string; trail: Pt[] }[] = [];
  const lit = new Set<string>();
  const arrivals: Record<string, number> = {}; // node id -> frame a cued packet last reached it
  for (const f of d.flows ?? []) {
    const t = frame - f.at;
    if (t < 0) continue;
    const i = Math.floor(t / hop);
    if (i < f.path.length - 1) {
      const a = byId[f.path[i]];
      const b = byId[f.path[i + 1]];
      if (a && b) {
        const c = curve(a, b);
        const at = (tt: number) => bez(c, ease(Math.max(0, Math.min(1, tt / hop))));
        packets.push({ ...at(t - i * hop), color: f.color ?? theme.accent, trail: [1.5, 3, 4.5].map((dt) => at(t - i * hop - dt)) });
        if (ease((t - i * hop) / hop) > 0.85) lit.add(b.id);
      }
      lit.add(f.path[i]);
    } else if (t < (f.path.length - 1) * hop + fps * 0.4) {
      lit.add(f.path[f.path.length - 1]);
    }
    for (let j = 1; j < f.path.length; j++) {
      const reached = f.at + j * hop - hop * 0.15;
      if (frame >= reached) arrivals[f.path[j]] = Math.max(arrivals[f.path[j]] ?? -1e9, reached);
    }
  }

  // Ambient traffic: every drawn edge carries a small, dim packet on its own period (1.6-3 s).
  const ambient: { x: number; y: number; o: number }[] = [];
  if (d.ambient !== false) {
    d.edges.forEach((e, i) => {
      const a = byId[e.from];
      const b = byId[e.to];
      if (!a || !b) return;
      const ready = edgeReady(a, b);
      if (frame < ready) return;
      const period = fps * (1.6 + 1.4 * hash01(i * 7 + 1));
      const ph = ((frame - ready + hash01(i * 13 + 2) * period) % period) / period;
      const fade = Math.min(1, ph * 6, (1 - ph) * 6) * Math.min(1, (frame - ready) / (fps * 0.5));
      ambient.push({ ...bez(curve(a, b), ph), o: 0.6 * fade });
    });
  }
  // Entry nodes (level 0) send a ring every 4.5 s: the slow beat of the system.
  const beat = fps * 4.5;

  return (
    <AbsoluteFill>
      <Backdrop theme={theme} focus={[50, 30]} />
      <AbsoluteFill >
      {d.title ? (
        <div style={{ position: "absolute", top: height * 0.05, width: "100%", textAlign: "center", color: theme.text, fontFamily: theme.headlineFont, fontWeight: 800, fontSize: 58 * k }}>
          {d.title}
        </div>
      ) : null}
      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth={7} markerHeight={7} orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={`${theme.text}88`} />
          </marker>
        </defs>
        {d.edges.map((e, i) => {
          const a = byId[e.from];
          const b = byId[e.to];
          if (!a || !b) return null;
          const start = Math.max(appear(a), appear(b)) + fps * 0.15;
          const p = interpolate(frame - start, [0, fps * 0.5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
          const { d: path, mid } = edgePath(a, b);
          return (
            <g key={i} opacity={p > 0 ? 1 : 0}>
              <path d={path} fill="none" stroke={`${theme.text}55`} strokeWidth={3 * k} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} markerEnd={p > 0.95 ? "url(#arrow)" : undefined} />
              {e.label ? (
                <text x={mid.x} y={mid.y - 10 * k} fill={`${theme.text}AA`} fontSize={22 * k} textAnchor="middle" fontFamily={theme.monoFont} opacity={p}>
                  {e.label}
                </text>
              ) : null}
            </g>
          );
        })}
        {ambient.map((pk, i) => (
          <circle key={`am${i}`} cx={pk.x} cy={pk.y} r={5 * k} fill={theme.accent} opacity={pk.o} />
        ))}
        {packets.map((pk, i) => (
          <g key={`pk${i}`}>
            {pk.trail.map((tp, j) => (
              <circle key={j} cx={tp.x} cy={tp.y} r={(7 - j * 1.6) * k} fill={pk.color} opacity={0.35 - j * 0.1} />
            ))}
            <circle cx={pk.x} cy={pk.y} r={18 * k} fill={pk.color} opacity={0.25} />
            <circle cx={pk.x} cy={pk.y} r={9 * k} fill={pk.color} />
          </g>
        ))}
      </svg>
      {d.nodes.map((n) => {
        const s = spring({ frame: frame - appear(n), fps, config: { damping: 14, stiffness: 140 } });
        const p = pos(n);
        const on = lit.has(n.id);
        // A node reacts when a cued packet lands on it: a short bump, then back.
        const bump = arrivals[n.id] !== undefined ? Math.sin(Math.PI * prog(frame, arrivals[n.id], fps * 0.3)) : 0;
        const ringAge = n.level === 0 && d.ambient !== false && frame > appear(n) + fps ? (frame - appear(n) - fps) % beat : -1;
        const ring = ringAge >= 0 ? prog(ringAge, 0, fps * 1.1) : 1;
        return (
          <div
            key={n.id}
            style={{
              position: "absolute",
              left: p.x - nodeW / 2,
              top: p.y - nodeH / 2,
              width: nodeW,
              height: nodeH,
              borderRadius: 18 * k,
              background: n.accent ? `${theme.accent}26` : "rgba(18,22,30,0.92)",
              border: `${2.5 * k}px solid ${on || n.accent ? theme.accent : "rgba(255,255,255,0.18)"}`,
              boxShadow: on ? `0 0 ${36 * k}px ${theme.accent}88` : "0 12px 30px rgba(0,0,0,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 14 * k,
              color: theme.text,
              transform: `scale(${(0.6 + 0.4 * s) * (1 + 0.06 * bump)})`,
              opacity: s,
            }}
          >
            {ring < 1 ? (
              <div style={{ position: "absolute", inset: -2.5 * k, borderRadius: 18 * k, border: `${2.5 * k}px solid ${theme.accent}`, opacity: 0.7 * (1 - ring), transform: `scale(${1 + 0.35 * ring})` }} />
            ) : null}
            {n.icon ? <span style={{ fontSize: 40 * k * fit(n) }}>{n.icon}</span> : null}
            <div style={{ textAlign: n.icon ? "left" : "center", lineHeight: 1.15, whiteSpace: "nowrap" }}>
              <div style={{ fontWeight: 800, fontSize: 30 * k * fit(n), fontFamily: theme.headlineFont }}>{n.label}</div>
              {n.sub ? <div style={{ fontSize: 20 * k * fit(n), color: theme.accent, fontFamily: theme.monoFont, marginTop: 4 * k }}>{n.sub}</div> : null}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
    </AbsoluteFill>
  );
};

function levels(nodes: DiagramNode[]) {
  return Math.max(...nodes.map((n) => n.level)) + 1;
}
function countPerLevel(nodes: DiagramNode[]) {
  const c: Record<number, number> = {};
  nodes.forEach((n) => (c[n.level] = (c[n.level] ?? 0) + 1));
  return Object.values(c);
}
