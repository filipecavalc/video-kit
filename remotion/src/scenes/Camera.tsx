import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { CameraKey } from "../types";
import { easeInOut, easeOut, prog } from "./motion";

type View = { x: number; y: number; s: number };
const HOME: View = { x: 0.5, y: 0.5, s: 1 };

/** Blend two views; scale moves in log space so a 1→2 zoom feels as fast as 2→4. */
const mix = (a: View, b: View, t: number): View => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  s: Math.exp(Math.log(a.s) + (Math.log(b.s) - Math.log(a.s)) * t),
});

/** Where the camera is at a frame. Each key "snaps" most of the way in two frames, then settles (snap + tail),
 *  like a camera operator who punches in and finds focus; a key with `hold` eases back out after it. */
export const cameraView = (keys: CameraKey[], frame: number, fps: number): View => {
  const moves: { at: number; to: View; snap: boolean }[] = [];
  for (const k of [...keys].sort((a, b) => a.at - b.at)) {
    moves.push({ at: k.at, to: { x: k.x, y: k.y, s: Math.max(1, k.scale) }, snap: true });
    if (k.hold !== undefined) moves.push({ at: k.at + k.hold, to: HOME, snap: false });
  }
  moves.sort((a, b) => a.at - b.at);
  let view = HOME;
  for (const m of moves) {
    if (frame < m.at) break;
    const t = frame - m.at;
    const amount = m.snap ? 0.6 * prog(t, 0, 2) + 0.4 * easeOut(prog(t, 2, fps * 0.5)) : easeInOut(prog(t, 0, fps * 0.7));
    view = mix(view, m.to, amount);
  }
  return view;
};

/** Wraps a scene: scales around the chosen point, which stays where it is on screen (so a corner zoom never
 *  shows past the edge of the scene). */
export const Camera: React.FC<{ keys?: CameraKey[]; children: React.ReactNode }> = ({ keys, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!keys || keys.length === 0) return <>{children}</>;
  const v = cameraView(keys, frame, fps);
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(${v.s})`, transformOrigin: `${v.x * 100}% ${v.y * 100}%` }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};
