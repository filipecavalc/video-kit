import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Scene } from "../types";
import { Theme } from "../styles";

export const Headline: React.FC<{ scene: Scene; theme: Theme }> = ({ scene, theme }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  if (!scene.headline) return null;
  const k = Math.min(width, height) / 1080; // scale by the short side, so 16:9 is not oversized
  const enter = spring({ frame: frame - 4, fps, config: { damping: 14, stiffness: 120 } });
  const subEnter = spring({ frame: frame - 12, fps, config: { damping: 200 } });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-start",
        alignItems: "center",
        paddingTop: height * 0.05,
        paddingLeft: width * 0.06,
        paddingRight: width * 0.06,
        background: "linear-gradient(180deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0) 26%)",
      }}
    >
      <div
        style={{
          fontFamily: theme.headlineFont,
          fontSize: theme.headline.size * k,
          fontWeight: theme.headline.weight,
          color: theme.headline.pill ? "#111" : theme.text,
          background: theme.headline.pill ? theme.accent : "transparent",
          padding: theme.headline.pill ? `${10 * k}px ${28 * k}px` : 0,
          borderRadius: 18 * k,
          lineHeight: 1.1,
          textAlign: "center",
          letterSpacing: -0.5,
          textShadow: theme.headline.pill ? "none" : "0 4px 24px rgba(0,0,0,0.6)",
          transform: `translateY(${(1 - enter) * -40}px) scale(${0.9 + 0.1 * enter})`,
          opacity: interpolate(enter, [0, 1], [0, 1]),
        }}
      >
        {scene.headline}
      </div>
      {scene.sub ? (
        <div
          style={{
            marginTop: 14 * k,
            fontSize: 34 * k,
            fontWeight: 600,
            color: theme.accent,
            textAlign: "center",
            opacity: subEnter,
            textShadow: "0 2px 16px rgba(0,0,0,0.7)",
          }}
        >
          {scene.sub}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
