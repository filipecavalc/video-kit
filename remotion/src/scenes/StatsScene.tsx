import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Scene } from "../types";
import { Theme } from "../styles";
import { Odometer } from "./Odometer";
import { easeOut, easeOutExpo, prog, stagger } from "./motion";
import { Backdrop } from "./Backdrop";

/** Numbers that matter, big: each one slides in, rolls up like an odometer, lands with a small pop and an
 *  accent underline; an optional bar fills to `bar` (0..1) as it counts. */
export const StatsScene: React.FC<{ scene: Scene; theme: Theme }> = ({ scene, theme }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const k = Math.min(width, height) / 1080;
  const d = scene.stats!;
  const n = d.items.length;
  const landscape = width > height;
  const tall = height / width > 1.5;
  const size = (landscape ? [200, 170, 140, 120][Math.min(3, n - 1)] : [210, 170, 140, 118][Math.min(3, n - 1)]) * k;
  const countLen = fps * 1.2;

  return (
    <AbsoluteFill>
      <Backdrop theme={theme} focus={[50, 30]} />
      <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        padding: `${height * (tall ? 0.1 : 0.06)}px ${width * 0.07}px ${height * (tall ? 0.28 : 0.2)}px`,
        fontFamily: theme.headlineFont,
        color: theme.text,
      }}
    >
      {d.title ? (
        <div style={{ fontFamily: theme.font, fontSize: 34 * k, fontWeight: 600, letterSpacing: 2 * k, textTransform: "uppercase", color: `${theme.text}99`, marginBottom: 46 * k, opacity: prog(frame, 0, 10) }}>
          {d.title}
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: landscape ? "row" : "column", gap: (landscape ? 90 : 56) * k, alignItems: "center", justifyContent: "center", width: "100%" }}>
        {d.items.map((it, i) => {
          const at = (it.at ?? fps * 0.3) + (it.at === undefined ? stagger(i) : 0);
          const enter = easeOut(prog(frame, at, 12));
          const q = prog(frame, at + 6, countLen);
          const value = (it.from ?? 0) + (it.value - (it.from ?? 0)) * easeOutExpo(q);
          const land = at + 6 + countLen * 0.55; // easeOutExpo is visually settled about halfway through
          const pop = 1 + 0.05 * Math.sin(Math.PI * prog(frame, land, 10));
          const underline = easeOutExpo(prog(frame, land - 4, 14));
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", opacity: enter, transform: `translateY(${(1 - enter) * 40 * k}px)` }}>
              <div style={{ display: "flex", alignItems: "baseline", fontSize: size, fontWeight: 900, letterSpacing: -2 * k, transform: `scale(${pop})` }}>
                {it.prefix ? <span style={{ fontSize: "0.5em", color: theme.accent, marginRight: 8 * k }}>{it.prefix}</span> : null}
                <Odometer value={value} target={it.value} decimals={it.decimals} />
                {it.suffix ? <span style={{ fontSize: "0.5em", color: theme.accent, marginLeft: 8 * k }}>{it.suffix}</span> : null}
              </div>
              <div style={{ height: 8 * k, width: `${underline * 70}%`, background: theme.accent, borderRadius: 99, marginTop: 14 * k }} />
              {it.label ? (
                <div style={{ fontFamily: theme.font, fontSize: 36 * k, fontWeight: 600, color: `${theme.text}CC`, marginTop: 20 * k, textAlign: "center", maxWidth: 820 * k }}>
                  {it.label}
                </div>
              ) : null}
              {it.bar !== undefined ? (
                <div style={{ width: Math.min(640 * k, width * 0.7), height: 14 * k, borderRadius: 99, background: "rgba(255,255,255,0.1)", marginTop: 22 * k, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${100 * it.bar * easeOutExpo(q)}%`, background: theme.accent, borderRadius: 99 }} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
    </AbsoluteFill>
  );
};
