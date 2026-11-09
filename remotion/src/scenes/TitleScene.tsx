import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Video } from "@remotion/media";
import { Scene } from "../types";
import { Theme } from "../styles";
import { Backdrop } from "./Backdrop";
import { clamp01, easeIn, easeOutExpo, hash01, prog } from "./motion";

const ease = Easing.bezier(0.22, 1, 0.36, 1);
const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const VIDEO = /\.(mp4|mov|webm|m4v)$/i;

/** Kinetic title. Words rise out of their own line (masked), on an uneven rhythm, with a slight tilt that
 *  straightens as they land; `mark` words get a marker sweep. Once landed the block keeps a slow push-in, and
 *  just before the cut the words leave upward, faster than they came. `motion: "blur"` keeps the older
 *  blur-in. `media` puts the title over a darkened, slowly zooming picture or clip. */
export const TitleScene: React.FC<{ scene: Scene; theme: Theme }> = ({ scene, theme }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const k = Math.min(width, height) / 1080; // scale by the short side, so 16:9 is not oversized
  const t = scene.kinetic!;
  const lines = t.text.split("\n").map((l) => l.split(" ").filter(Boolean));
  const marks = new Set((t.mark ?? []).map(norm));
  const words = lines.flat().length;
  const per = Math.min(fps * 0.17, (scene.duration * 0.45) / Math.max(1, words));
  const size = (words > 8 ? 76 : 96) * k;
  const blur = t.motion === "blur";

  // Uneven word starts: some words follow quickly, some wait a beat (reads as speech, not a metronome).
  const starts: number[] = [];
  let acc = fps * 0.15;
  for (let i = 0; i < words; i++) {
    starts.push(acc);
    acc += per * (0.65 + 0.7 * hash01(i * 3 + words));
  }
  const landed = acc + fps * 0.45;
  const exitAt = t.exit === false ? Infinity : scene.duration - fps * 0.32;
  const push = 1 + 0.045 * clamp01((frame - landed) / Math.max(1, scene.duration - landed));

  const logoIn = spring({ frame, fps, config: { damping: 200 } });
  const subIn = interpolate(frame - landed + fps * 0.25, [0, fps * 0.4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const out = (i: number) => easeIn(prog(frame, exitAt + i * 1.5, fps * 0.25));
  let idx = 0;

  return (
    <AbsoluteFill>
      {t.media ? (
        <AbsoluteFill style={{ background: theme.bg[0] }}>
          <AbsoluteFill style={{ transform: `scale(${1.04 + 0.08 * (frame / Math.max(1, scene.duration))})` }}>
            {VIDEO.test(t.media) ? (
              <Video src={staticFile(t.media)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <Img src={staticFile(t.media)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            )}
          </AbsoluteFill>
          <AbsoluteFill style={{ background: `linear-gradient(180deg, ${theme.bg[0]}D9 0%, ${theme.bg[0]}B8 45%, ${theme.bg[1]}EB 100%)` }} />
        </AbsoluteFill>
      ) : (
        <Backdrop theme={theme} focus={[25, 20]} />
      )}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: t.align === "left" ? "flex-start" : "center",
          padding: `0 ${width * 0.08}px ${height * 0.12}px`,
          transform: `scale(${push})`,
        }}
      >
        {t.logo ? <Img src={staticFile(t.logo)} style={{ height: 110 * k, marginBottom: 40 * k, opacity: logoIn * (1 - out(0)), transform: `translateY(${(1 - logoIn) * 20}px)` }} /> : null}
        {lines.map((line, li) => (
          <div key={li} style={{ display: "flex", flexWrap: "wrap", justifyContent: t.align === "left" ? "flex-start" : "center", gap: `0 ${size * 0.28}px` }}>
            {line.map((w, wi) => {
              const i = idx++;
              const start = starts[i];
              const marked = marks.has(norm(w));
              const sweep = interpolate(frame - start - fps * 0.3, [0, fps * 0.45], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
              const leave = out(i);
              const wordStyle: React.CSSProperties = { position: "relative", display: "inline-block", fontFamily: theme.headlineFont, fontWeight: 900, fontSize: size, lineHeight: 1.12, letterSpacing: -1, color: marked && sweep > 0.4 ? "#111" : theme.text };
              let inner: React.CSSProperties;
              if (blur) {
                const p = interpolate(frame - start, [0, fps * 0.45], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
                inner = { opacity: p * (1 - leave), filter: `blur(${(1 - p) * 12}px)`, transform: `translateY(${(1 - p) * 30 - leave * 40 * k}px)` };
              } else {
                const p = easeOutExpo(prog(frame, start, fps * 0.5));
                inner = { opacity: Math.min(1, p * 3) * (1 - leave), transform: `translateY(${(1 - p) * 105 - leave * 60}%) rotate(${(1 - p) * 4}deg)`, transformOrigin: "0% 100%" };
              }
              return (
                // The word sits in its own clipped box, so it rises out of the line instead of fading in.
                <span key={wi} style={{ display: "inline-block", overflow: blur ? "visible" : "hidden", padding: `0 ${0.06 * size}px`, margin: `0 ${-0.06 * size}px`, verticalAlign: "top" }}>
                  <span style={{ ...wordStyle, ...inner }}>
                    {marked ? (
                      <svg style={{ position: "absolute", left: -0.04 * size, top: 0.12 * size, width: `calc(100% + ${0.08 * size}px)`, height: size * 0.98, zIndex: -1, overflow: "visible" }} viewBox="0 0 100 40" preserveAspectRatio="none">
                        <path d="M2 8 C 30 2, 70 4, 98 6 L 97 34 C 70 38, 30 36, 3 37 Z" fill={theme.accent} style={{ clipPath: `inset(0 ${(1 - sweep) * 100}% 0 0)` }} />
                      </svg>
                    ) : null}
                    {w}
                  </span>
                </span>
              );
            })}
          </div>
        ))}
        {t.sub ? (
          <div style={{ marginTop: 34 * k, fontSize: 40 * k, color: `${theme.text}CC`, fontWeight: 600, opacity: subIn * (1 - out(words)), transform: `translateY(${(1 - subIn) * 14}px)`, textAlign: t.align === "left" ? "left" : "center" }}>{t.sub}</div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
