import React, { useMemo } from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { createTikTokStyleCaptions } from "@remotion/captions";
import { Timeline } from "./types";
import { Theme } from "./styles";

/** Word-by-word captions: groups words into short pages and highlights the word being spoken. */
export const Captions: React.FC<{ timeline: Timeline; theme: Theme }> = ({ timeline, theme }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const k = Math.min(width, useVideoConfig().height) / 1080; // scale by the short side, so 16:9 is not oversized
  const ms = (frame / fps) * 1000;

  const { pages } = useMemo(
    () =>
      createTikTokStyleCaptions({
        captions: timeline.captions ?? [],
        combineTokensWithinMilliseconds: theme.caption.upper ? 700 : 1300,
        breakOnSilenceAfterMilliseconds: 500,
      }),
    [timeline.captions, theme.caption.upper],
  );

  const scene = timeline.scenes.find((s) => frame >= s.from && frame < s.from + s.duration);
  if (scene?.hideCaptions) return null;

  // A page stays up until the next one starts, but not longer than 0.7 s after its last word.
  const page = pages.find((p) => {
    const lastWord = p.tokens.length ? p.tokens[p.tokens.length - 1].toMs : p.startMs + p.durationMs;
    return ms >= p.startMs && ms < Math.min(p.startMs + p.durationMs, lastWord + 700);
  });
  if (!page) return null;

  const pageFrame = Math.round((page.startMs / 1000) * fps);
  const enter = spring({ frame: frame - pageFrame, fps, config: { damping: 200 }, durationInFrames: 6 });
  const c = theme.caption;
  const safe = height * 0.08;
  const top = safe + (height - 2 * safe) * c.position;
  // Per-video caption look on top of the style's defaults.
  const v = timeline.captionStyle;
  const box = v ? v === "box" : c.box;
  const pill = v === "pill";
  const pop = v === "pop";
  const activeBg = v ? undefined : c.activeBg;
  const activeColor = pill ? theme.accent : v && c.activeBg ? theme.accent : c.activeColor;
  const popScale = pop ? 1 + 0.18 * spring({ frame: frame - Math.round((((page.tokens.find((t) => ms >= t.fromMs && ms < t.toMs)?.fromMs) ?? 0) / 1000) * fps), fps, config: { damping: 12, stiffness: 220 } }) : 1;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: width * 0.07,
          right: width * 0.07,
          top,
          transform: `translateY(-50%) scale(${0.96 + 0.04 * enter})`,
          opacity: enter,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontFamily: theme.font,
            fontSize: c.size * k,
            fontWeight: c.weight,
            lineHeight: 1.25,
            textAlign: "center",
            color: pill ? "#14171c" : theme.text,
            textTransform: c.upper ? "uppercase" : "none",
            background: pill ? "rgba(255,255,255,0.94)" : box ? "rgba(0,0,0,0.62)" : "transparent",
            padding: pill ? `${10 * k}px ${30 * k}px` : box ? `${12 * k}px ${24 * k}px` : 0,
            borderRadius: pill ? 999 : 16 * k,
            boxShadow: pill ? "0 10px 30px rgba(0,0,0,0.35)" : undefined,
            whiteSpace: "pre-wrap",
            textShadow: box || pill ? "none" : "0 0 4px #000, 0 4px 18px rgba(0,0,0,0.9)",
            WebkitTextStroke: box || pill ? undefined : `${2 * k}px rgba(0,0,0,0.85)`,
            paintOrder: "stroke fill",
          }}
        >
          {page.tokens.map((tok, i) => {
            const active = ms >= tok.fromMs && ms < tok.toMs;
            // The leading space stays outside the word so highlights never swallow it.
            const lead = tok.text.match(/^\s*/)?.[0] ?? "";
            const word = tok.text.slice(lead.length);
            const scale = active ? (pop ? popScale : c.activeScale) : 1;
            return (
              <React.Fragment key={i}>
                {lead}
                <span
                  style={{
                    color: active ? activeColor : undefined,
                    background: active && activeBg ? activeBg : undefined,
                    WebkitTextStroke: active && activeBg ? "0px transparent" : undefined,
                    textShadow: active && activeBg ? "none" : undefined,
                    borderRadius: 10 * k,
                    padding: activeBg ? `0 ${8 * k}px` : undefined,
                    // a popped word gets room on both sides, so it never covers its neighbours
                    margin: activeBg ? `0 ${-8 * k}px` : pop && active ? `0 ${0.09 * (scale - 1) * 10}em` : undefined,
                    display: "inline-block",
                    whiteSpace: "pre",
                    transform: scale !== 1 ? `scale(${scale})` : undefined,
                  }}
                >
                  {word}
                </span>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
