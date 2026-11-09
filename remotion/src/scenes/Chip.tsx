import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Scene } from "../types";
import { Theme } from "../styles";

/** Label chip (what is on screen) and/or a green "checked" badge, just under the headline area. */
export const Chip: React.FC<{ scene: Scene; theme: Theme; placement?: "top" | "bottom"; delay?: number }> = ({ scene, theme, placement = "top", delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  if (!scene.label && !scene.badge) return null;
  const k = Math.min(width, height) / 1080; // scale by the short side, so 16:9 is not oversized
  const a = spring({ frame: frame - 6 - delay, fps, config: { damping: 16, stiffness: 140 } });
  const b = spring({ frame: frame - 14 - delay, fps, config: { damping: 12, stiffness: 160 } });
  const top = scene.headline ? height * 0.135 : height * 0.06;
  const tall = height / width > 1.5;
  // Bottom placement sits just above the caption band of window-style scenes.
  const pos: React.CSSProperties = placement === "bottom" ? { justifyContent: "flex-end", paddingBottom: height * (tall ? 0.31 : 0.235) } : { paddingTop: top };

  return (
    <AbsoluteFill style={{ alignItems: "center", gap: 14 * k, pointerEvents: "none", ...pos }}>
      {scene.label ? (
        <div
          style={{
            fontFamily: theme.headlineFont,
            fontSize: 34 * k,
            fontWeight: 800,
            color: "#111",
            background: theme.accent,
            padding: `${10 * k}px ${26 * k}px`,
            borderRadius: 999,
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
            opacity: a,
            transform: `translateY(${(1 - a) * -16}px)`,
          }}
        >
          {scene.label}
        </div>
      ) : null}
      {scene.badge ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12 * k,
            fontSize: 32 * k,
            fontWeight: 700,
            color: "#fff",
            background: "rgba(22,163,74,0.92)",
            padding: `${10 * k}px ${24 * k}px`,
            borderRadius: 999,
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
            opacity: b,
            transform: `scale(${0.7 + 0.3 * b})`,
          }}
        >
          <span style={{ fontSize: 34 * k }}>✓</span>
          {scene.badge}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
