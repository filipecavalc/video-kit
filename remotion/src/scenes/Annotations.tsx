import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Annotation } from "../types";
import { Theme } from "../styles";
import { easeIn, easeOut, hash01, prog } from "./motion";

/** A slightly wobbly point: hand-drawn marks are never perfectly straight. */
const wob = (seed: number, amount: number) => (hash01(seed) - 0.5) * 2 * amount;

/** SVG path for each mark, in pixels. `seed` keeps every mark's wobble different but stable across frames. */
const shape = (a: Annotation, W: number, H: number, seed: number, k: number): { d: string; arrowHead?: string } => {
  const x = a.x * W;
  const y = a.y * H;
  const w = (a.w ?? 0.2) * W;
  const h = (a.h ?? 0.06) * H;
  const j = 6 * k;
  switch (a.type) {
    case "circle": {
      // A loop that overshoots its start, like a quick pen stroke around a word.
      const cx = x + w / 2;
      const cy = y + h / 2;
      const rx = w / 2 + 18 * k;
      const ry = h / 2 + 14 * k;
      const pts: string[] = [];
      const n = 40;
      const a0 = -2.2 + wob(seed, 0.3);
      for (let i = 0; i <= n; i++) {
        const t = a0 + (i / n) * Math.PI * 2.15;
        const r = 1 + 0.04 * Math.sin(t * 3 + seed) + (i / n) * 0.05;
        pts.push(`${(cx + Math.cos(t) * rx * r).toFixed(1)},${(cy + Math.sin(t) * ry * r).toFixed(1)}`);
      }
      return { d: `M${pts.join(" L")}` };
    }
    case "underline": {
      const yy = y + h + 8 * k;
      return {
        d: `M${x - 6 * k},${yy + wob(seed, j)} Q${x + w / 2},${yy + 10 * k + wob(seed + 1, j)} ${x + w + 8 * k},${yy - 4 * k + wob(seed + 2, j)}` +
          ` M${x + w * 0.08},${yy + 14 * k + wob(seed + 3, j)} Q${x + w / 2},${yy + 18 * k} ${x + w * 0.9},${yy + 10 * k + wob(seed + 4, j)}`,
      };
    }
    case "box": {
      const p = (px: number, py: number, s: number) => `${(px + wob(seed + s, j)).toFixed(1)},${(py + wob(seed + s + 9, j)).toFixed(1)}`;
      const m = 12 * k;
      return { d: `M${p(x - m, y - m, 1)} L${p(x + w + m, y - m, 2)} L${p(x + w + m, y + h + m, 3)} L${p(x - m, y + h + m, 4)} L${p(x - m + 4 * k, y - m - 6 * k, 5)}` };
    }
    case "strike":
      return { d: `M${x - 6 * k},${y + h * 0.55 + wob(seed, j)} L${x + w + 6 * k},${y + h * 0.45 + wob(seed + 1, j)}` };
    case "arrow": {
      // From (x, y) to (x + w, y + h), bowed to one side, with a two-stroke head.
      const x2 = x + w;
      const y2 = y + h;
      const mx = (x + x2) / 2 - h * 0.25;
      const my = (y + y2) / 2 + w * 0.25;
      const ang = Math.atan2(y2 - my, x2 - mx);
      const L = 26 * k;
      const head = `M${x2 - L * Math.cos(ang - 0.5)},${y2 - L * Math.sin(ang - 0.5)} L${x2},${y2} L${x2 - L * Math.cos(ang + 0.5)},${y2 - L * Math.sin(ang + 0.5)}`;
      return { d: `M${x},${y} Q${mx},${my} ${x2},${y2}`, arrowHead: head };
    }
    default:
      return { d: "" };
  }
};

/** Marks drawn by hand over a scene at a spoken word: circle, underline, box, strike, arrow, highlight.
 *  Positions are fractions of the frame (x, y = top-left of the thing marked; w, h = its size). */
export const Annotations: React.FC<{ items?: Annotation[]; theme: Theme }> = ({ items, theme }) => {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();
  if (!items || items.length === 0) return null;
  const k = Math.min(W, H) / 1080;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        {items.map((a, i) => {
          if (frame < a.at) return null;
          const draw = easeOut(prog(frame, a.at, fps * (a.type === "arrow" ? 0.45 : 0.55)));
          const out = a.hold !== undefined ? 1 - easeIn(prog(frame, a.at + a.hold, fps * 0.3)) : 1;
          const color = a.color ?? theme.accent;
          if (a.type === "highlight") {
            // Marker pen behind the text: a band that sweeps left to right.
            const x = a.x * W;
            const y = a.y * H;
            const w = (a.w ?? 0.2) * W;
            const h = (a.h ?? 0.06) * H;
            return (
              <rect key={i} x={x - 6 * k} y={y + wob(i, 3 * k)} width={(w + 12 * k) * draw} height={h} rx={6 * k} fill={color} opacity={0.38 * out} />
            );
          }
          const { d, arrowHead } = shape(a, W, H, i * 13 + 5, k);
          const sw = (a.type === "underline" ? 7 : 6) * k;
          const headDraw = arrowHead ? easeOut(prog(frame, a.at + fps * 0.4, fps * 0.15)) : 0;
          return (
            <g key={i} opacity={out} style={{ filter: `drop-shadow(0 ${2 * k}px ${4 * k}px rgba(0,0,0,0.45))` }}>
              <path d={d} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
              {arrowHead ? (
                <path d={arrowHead} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - headDraw} />
              ) : null}
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};
