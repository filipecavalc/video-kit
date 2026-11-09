import React from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Scene } from "../types";
import { Theme } from "../styles";
import { Window } from "./Window";

const ease = Easing.bezier(0.22, 1, 0.36, 1);

/** Highlighted code. Focus ranges dim the rest and scroll into view; diff mode turns -/+ lines over at diffAt. */
export const CodeScene: React.FC<{ scene: Scene; theme: Theme }> = ({ scene, theme }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const k = Math.min(width, useVideoConfig().height) / 1080; // scale by the short side, so 16:9 is not oversized
  const c = scene.code!;
  const fs = (c.lines.length > 26 ? 24 : 28) * k;
  const lh = fs * 1.5;
  const tall = height / width > 1.5;
  const viewH = height * (tall ? 0.58 : 0.62) - 60 * k;

  // Current focus range (with a short eased glide between ranges).
  const focus = (c.focus ?? []).filter((f) => frame >= f.at).pop();
  const prev = (c.focus ?? []).filter((f) => frame >= f.at).slice(-2, -1)[0];
  const glide = focus ? interpolate(frame - focus.at, [0, fps * 0.5], [0, 1], { extrapolateRight: "clamp", easing: ease }) : 1;

  // Diff: removed lines collapse, added ones open, after diffAt.
  const dp = c.diff ? interpolate(frame - (c.diffAt ?? fps), [0, fps * 0.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease }) : 1;
  const heightOf = (kind?: string) => (kind === "-" ? 1 - dp : kind === "+" ? dp : 1);

  const indexOf = (n: number) => Math.max(0, c.lines.findIndex((l) => (l.n ?? -1) >= n));
  const centerOf = (f?: { from: number; to: number }) => (f ? ((indexOf(f.from) + indexOf(f.to)) / 2 + 0.5) * lh : viewH / 2);
  const center = prev && focus ? centerOf(prev) + (centerOf(focus) - centerOf(prev)) * glide : centerOf(focus);
  const total = c.lines.reduce((a, l) => a + lh * heightOf(l.kind), 0);
  const scroll = Math.max(0, Math.min(center - viewH / 2, total - viewH));

  return (
    <Window title={c.title ?? "code"} theme={theme} mono>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, padding: `${16 * k}px 0`, transform: `translateY(${-scroll}px)` }}>
        {c.lines.map((l, i) => {
          const inFocus = !focus || ((l.n ?? -1) >= focus.from && (l.n ?? -1) <= focus.to);
          const dim = focus ? interpolate(glide, [0, 1], [prev ? 0.3 : 1, inFocus ? 1 : 0.3]) : 1;
          const h = heightOf(l.kind);
          const bg = l.kind === "-" ? `rgba(255,90,90,${0.18 * (dp > 0 ? 1 : 0.6)})` : l.kind === "+" ? "rgba(61,220,151,0.16)" : inFocus && focus ? `${theme.accent}14` : "transparent";
          return (
            <div
              key={i}
              style={{
                display: "flex",
                height: lh * h,
                lineHeight: `${lh}px`,
                overflow: "hidden",
                opacity: Math.min(dim, h < 1 ? h + 0.15 : 1),
                background: bg,
                borderLeft: `${4 * k}px solid ${inFocus && focus ? theme.accent : l.kind === "+" ? "#3DDC97" : l.kind === "-" ? "#FF6B6B" : "transparent"}`,
                fontSize: fs,
                whiteSpace: "pre",
              }}
            >
              <span style={{ width: 70 * k, textAlign: "right", paddingRight: 22 * k, color: "#5C6370", flexShrink: 0 }}>
                {l.kind === "-" ? "−" : l.kind === "+" ? "+" : l.n ?? ""}
              </span>
              <span style={{ textDecoration: l.kind === "-" && dp > 0 ? "line-through" : undefined }}>
                {l.tokens.map(([text, color], j) => (
                  <span key={j} style={{ color }}>
                    {text}
                  </span>
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </Window>
  );
};
