import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Scene } from "../types";
import { Theme } from "../styles";
import { Backdrop } from "./Backdrop";

/** Full-frame text card: opening title, chapter break or end card with a link. */
export const CardScene: React.FC<{ scene: Scene; theme: Theme; fadeIn: number; handle?: string; logo?: string }> = ({
  scene,
  theme,
  fadeIn,
  handle,
  logo,
}) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const k = Math.min(width, useVideoConfig().height) / 1080; // scale by the short side, so 16:9 is not oversized
  const opacity = fadeIn > 0 ? interpolate(frame, [0, fadeIn], [0, 1], { extrapolateRight: "clamp" }) : 1;
  const a = spring({ frame: frame - 3, fps, config: { damping: 16 } });
  const b = spring({ frame: frame - 12, fps, config: { damping: 200 } });
  const c = spring({ frame: frame - 22, fps, config: { damping: 200 } });

  return (
    <AbsoluteFill>
      <Backdrop theme={theme} focus={[30, 20]} />
      <AbsoluteFill
      style={{
        opacity,
        justifyContent: "center",
        alignItems: "center",
        padding: 90 * k,
        textAlign: "center",
      }}
    >
      {logo ? (
        <Img src={staticFile(logo)} style={{ height: 120 * k, marginBottom: 44 * k, opacity: a, transform: `scale(${0.85 + 0.15 * a})` }} />
      ) : (
        <div style={{ width: 120 * k * a, height: 8 * k, background: theme.accent, borderRadius: 4, marginBottom: 40 * k }} />
      )}
      {scene.title ? (
        <div
          style={{
            fontFamily: theme.headlineFont,
            fontSize: 92 * k,
            fontWeight: 900,
            color: theme.text,
            lineHeight: 1.05,
            letterSpacing: -1,
            whiteSpace: "pre-line",
            transform: `translateY(${(1 - a) * 40}px)`,
            opacity: a,
          }}
        >
          {scene.title}
        </div>
      ) : null}
      {scene.subtitle ? (
        <div style={{ marginTop: 32 * k, fontSize: 44 * k, fontWeight: 600, color: `${theme.text}CC`, lineHeight: 1.25, opacity: b, whiteSpace: "pre-line" }}>
          {scene.subtitle}
        </div>
      ) : null}
      {scene.footer ? (
        <div
          style={{
            marginTop: 64 * k,
            fontFamily: theme.monoFont,
            whiteSpace: "pre-line",
            fontSize: 36 * k,
            color: theme.accent,
            padding: `${14 * k}px ${28 * k}px`,
            border: `2px solid ${theme.accent}`,
            borderRadius: 14 * k,
            opacity: c,
          }}
        >
          {scene.footer}
        </div>
      ) : null}
      {handle && handle !== scene.title ? (
        <div style={{ position: "absolute", bottom: 60 * k, fontSize: 30 * k, color: `${theme.text}99`, opacity: c }}>{handle}</div>
      ) : null}
    </AbsoluteFill>
    </AbsoluteFill>
  );
};
