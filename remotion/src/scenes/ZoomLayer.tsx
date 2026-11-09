import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Scene } from "../types";
import { Theme } from "../styles";

const ease = Easing.bezier(0.45, 0, 0.2, 1);

/** Zoom toward a point (eased in, held, eased out) and a cursor gliding between clicks with a ripple.
 *  Coordinates are fractions of the media frame; the layer must exactly cover the visible media. */
export const ZoomLayer: React.FC<{ scene: Scene; theme: Theme; children: React.ReactNode }> = ({ scene, theme, children }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const k = Math.min(width, useVideoConfig().height) / 1080; // scale by the short side, so 16:9 is not oversized
  const ramp = Math.round(fps * 0.55);

  // Zoom: strongest active keyframe wins; ease in over `ramp`, hold, ease out over `ramp`.
  let scale = 1;
  let ox = 0.5;
  let oy = 0.5;
  for (const z of scene.zooms ?? []) {
    const t = frame - z.at;
    if (t < 0 || t > z.dur + ramp) continue;
    const a = t < ramp ? ease(t / ramp) : t > z.dur ? 1 - ease((t - z.dur) / ramp) : 1;
    const s = 1 + (z.scale - 1) * a;
    if (s > scale) {
      scale = s;
      ox = z.x;
      oy = z.y;
    }
  }

  // Cursor: glide from the previous click to the next over 0.6 s before it lands.
  const clicks = scene.clicks ?? [];
  let cx: number | null = null;
  let cy: number | null = null;
  let ripple = 0;
  if (clicks.length) {
    const next = clicks.findIndex((c) => c.at > frame);
    const prev = next === -1 ? clicks.length - 1 : next - 1;
    if (next === -1) {
      cx = clicks[prev].x;
      cy = clicks[prev].y;
    } else {
      const from = prev >= 0 ? clicks[prev] : { at: 0, x: clicks[next].x - 0.08, y: clicks[next].y + 0.1 };
      const travel = Math.min(fps * 0.6, clicks[next].at - from.at);
      const u = interpolate(frame, [clicks[next].at - travel, clicks[next].at], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
      cx = from.x + (clicks[next].x - from.x) * u;
      cy = from.y + (clicks[next].y - from.y) * u;
    }
    if (prev >= 0) ripple = frame - clicks[prev].at;
  }

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: `${ox * 100}% ${oy * 100}%` }}>
        {children}
        {cx !== null && cy !== null ? (
          <>
            {ripple >= 0 && ripple < fps * 0.6 ? (
              <div
                style={{
                  position: "absolute",
                  left: `${cx * 100}%`,
                  top: `${cy * 100}%`,
                  width: 90 * k,
                  height: 90 * k,
                  marginLeft: -45 * k,
                  marginTop: -45 * k,
                  borderRadius: 999,
                  border: `${4 * k}px solid ${theme.accent}`,
                  transform: `scale(${0.3 + (ripple / (fps * 0.6)) * 0.9})`,
                  opacity: 1 - ripple / (fps * 0.6),
                }}
              />
            ) : null}
            <svg style={{ position: "absolute", left: `${cx * 100}%`, top: `${cy * 100}%`, width: 38 * k, height: 38 * k, overflow: "visible", filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.5))" }} viewBox="0 0 24 24">
              <path d="M2 1 L2 19 L7 14.5 L10.5 22 L13.5 20.6 L10 13.2 L17 13 Z" fill="#fff" stroke="#111" strokeWidth={1.4} strokeLinejoin="round" />
            </svg>
          </>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
