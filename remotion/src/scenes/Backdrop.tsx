import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Theme } from "../styles";
import { hash01 } from "./motion";

export type BackdropKind = "plain" | "glow" | "grid" | "dots";

/** First frame of the scene being drawn, so backdrops move on the video's clock: two scenes cross-fading
 *  show the very same backdrop, and the cut is seamless. */
export const SceneStart = React.createContext(0);
/** Windows (terminal, code, chat) float in 3D: they arrive from depth at an angle and keep turning slowly. */
export const Depth = React.createContext(false);
/** Backdrop chosen for the video (or the scene); scenes fall back to their theme's. */
export const BackdropChoice = React.createContext<BackdropKind | undefined>(undefined);

/** A living background behind titles, cards, windows, stats and diagrams: slow drifting light, and a technical
 *  grid or dot matrix with a few cells catching the light. Always subtle: it carries motion, not attention. */
export const Backdrop: React.FC<{ theme: Theme; kind?: BackdropKind; focus?: [number, number] }> = ({ theme, kind, focus = [50, 30] }) => {
  const local = useCurrentFrame();
  const start = React.useContext(SceneStart);
  const chosen = React.useContext(BackdropChoice);
  const { fps, width, height } = useVideoConfig();
  const k = Math.min(width, height) / 1080;
  const frame = local + start;
  const t = frame / fps;
  const mode = kind ?? chosen ?? theme.backdrop ?? "glow";
  const base = `linear-gradient(160deg, ${theme.bg[0]}, ${theme.bg[1]})`;
  if (mode === "plain") {
    return <AbsoluteFill style={{ background: `radial-gradient(circle at ${focus[0]}% ${focus[1]}%, ${theme.accent}26 0%, transparent 55%), ${base}` }} />;
  }
  // Two soft lights drifting on slow, unrelated periods.
  const ax = focus[0] + 16 * Math.sin(t / 3.3);
  const ay = focus[1] + 10 * Math.cos(t / 4.1);
  const bx = 100 - focus[0] + 14 * Math.cos(t / 5.2);
  const by = 78 + 8 * Math.sin(t / 3.7);
  const glow = `radial-gradient(circle at ${ax}% ${ay}%, ${theme.accent}30 0%, transparent 50%), radial-gradient(circle at ${bx}% ${by}%, ${theme.accent}18 0%, transparent 45%), ${base}`;
  if (mode === "glow") return <AbsoluteFill style={{ background: glow }} />;

  const cell = (mode === "grid" ? 90 : 46) * k;
  const dx = (t * 9 * k) % cell; // the pattern drifts slowly, diagonally
  const dy = (t * 6 * k) % cell;
  const cols = Math.ceil(width / cell) + 2;
  const rows = Math.ceil(height / cell) + 2;
  // A handful of cells light up and fade, each on its own rhythm.
  const lit: React.ReactNode[] = [];
  const period = 2.6;
  for (let n = 0; n < 9; n++) {
    const cycle = Math.floor((t + n * 0.37) / period);
    const phase = ((t + n * 0.37) % period) / period;
    const cx = Math.floor(hash01(n * 31 + cycle * 7) * cols) - 1;
    const cy = Math.floor(hash01(n * 17 + cycle * 13) * rows) - 1;
    const a = Math.sin(Math.PI * phase) * 0.13;
    lit.push(
      mode === "grid" ? (
        <rect key={n} x={cx * cell + dx} y={cy * cell + dy} width={cell} height={cell} fill={theme.accent} opacity={a * 0.5} />
      ) : (
        <circle key={n} cx={cx * cell + dx} cy={cy * cell + dy} r={4.5 * k} fill={theme.accent} opacity={Math.min(1, a * 4)} />
      ),
    );
  }
  const id = `bd-${mode}`;
  return (
    <AbsoluteFill style={{ background: glow }}>
      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <pattern id={id} width={cell} height={cell} patternUnits="userSpaceOnUse" patternTransform={`translate(${dx} ${dy})`}>
            {mode === "grid" ? (
              <path d={`M ${cell} 0 L 0 0 0 ${cell}`} fill="none" stroke={theme.text} strokeOpacity={0.085} strokeWidth={1.2 * k} />
            ) : (
              <circle cx={0} cy={0} r={2.2 * k} fill={theme.text} fillOpacity={0.14} />
            )}
          </pattern>
          <radialGradient id={`${id}-fade`} cx="50%" cy="45%" r="70%">
            <stop offset="0%" stopColor="white" stopOpacity={1} />
            <stop offset="100%" stopColor="white" stopOpacity={0.15} />
          </radialGradient>
          <mask id={`${id}-mask`}>
            <rect width={width} height={height} fill={`url(#${id}-fade)`} />
          </mask>
        </defs>
        <g mask={`url(#${id}-mask)`}>
          <rect width={width} height={height} fill={`url(#${id})`} />
          {lit}
        </g>
      </svg>
    </AbsoluteFill>
  );
};
