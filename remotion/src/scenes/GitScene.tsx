import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Scene } from "../types";
import { Theme } from "../styles";
import { Backdrop } from "./Backdrop";

const ease = Easing.bezier(0.22, 1, 0.36, 1);
const fmt = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(0)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`);

/** A repository's history: counters roll up, daily commits grow as a sweep crosses the timeline,
 *  highlighted commits pop up as the sweep reaches them. */
export const GitScene: React.FC<{ scene: Scene; theme: Theme }> = ({ scene, theme }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const k = Math.min(width, useVideoConfig().height) / 1080; // scale by the short side, so 16:9 is not oversized
  const g = scene.git!;
  const tall = height / width > 1.5;
  const sweepEnd = Math.max(fps, scene.duration - fps * 1.2);
  const sweep = interpolate(frame, [fps * 0.4, sweepEnd], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
  const counters = ease(Math.min(1, frame / (fps * 1.5)));

  const chartTop = height * (tall ? 0.3 : 0.3);
  const chartH = height * (tall ? 0.16 : 0.2);
  const left = width * 0.07;
  const chartW = width * 0.86;
  const max = Math.max(1, ...g.series);
  const n = g.series.length;
  const barW = chartW / n;

  // Commit -> day index along the series.
  const first = new Date(g.totals.first + "T00:00:00").getTime();
  const dayOf = (d: string) => Math.round((new Date(d + "T00:00:00").getTime() - first) / 86400000);
  const shown = g.highlights.filter((i) => (dayOf(g.commits[i].date) + 0.5) / n <= sweep);
  const latest = shown.slice(-3);

  const stat = (label: string, value: string) => (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 64 * k, fontWeight: 900, color: theme.text, fontFamily: theme.headlineFont }}>{value}</div>
      <div style={{ fontSize: 24 * k, color: `${theme.text}99`, textTransform: "uppercase", letterSpacing: 2 }}>{label}</div>
    </div>
  );

  return (
    <AbsoluteFill>
      <Backdrop theme={theme} focus={[50, 25]} />
      <AbsoluteFill style={{ fontFamily: theme.font }}>
      <div style={{ position: "absolute", top: height * 0.06, width: "100%", textAlign: "center" }}>
        <div style={{ fontFamily: theme.monoFont, fontSize: 30 * k, color: theme.accent }}>git log · {g.repo}</div>
        <div style={{ fontSize: 26 * k, color: `${theme.text}88`, marginTop: 6 * k }}>
          {g.totals.first} → {g.totals.last}
        </div>
      </div>
      <div style={{ position: "absolute", top: height * 0.15, left: 0, right: 0, display: "flex", justifyContent: "space-evenly" }}>
        {stat("commits", fmt(g.totals.commits * counters))}
        {stat("lines added", `+${fmt(g.totals.add * counters)}`)}
        {stat("days", fmt(g.totals.days * counters))}
      </div>
      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        <line x1={left} x2={left + chartW} y1={chartTop + chartH} y2={chartTop + chartH} stroke={`${theme.text}33`} strokeWidth={2 * k} />
        {g.series.map((v, i) => {
          const grow = interpolate(sweep * n - i, [0, 1.5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const h = (v / max) * chartH * grow;
          return v > 0 ? <rect key={i} x={left + i * barW + barW * 0.15} y={chartTop + chartH - h} width={Math.max(2, barW * 0.7)} height={h} rx={3 * k} fill={theme.accent} opacity={0.85} /> : null;
        })}
        <line x1={left + chartW * sweep} x2={left + chartW * sweep} y1={chartTop - 10 * k} y2={chartTop + chartH + 10 * k} stroke={theme.text} strokeWidth={2 * k} opacity={sweep < 1 ? 0.6 : 0} />
      </svg>
      <div style={{ position: "absolute", top: chartTop + chartH + 40 * k, left: width * 0.07, right: width * 0.07, display: "flex", flexDirection: "column", gap: 14 * k }}>
        {latest.map((ci) => {
          const c = g.commits[ci];
          const at = fps * 0.4 + ((dayOf(c.date) + 0.5) / n) * (sweepEnd - fps * 0.4);
          const s = spring({ frame: frame - at, fps, config: { damping: 16 } });
          return (
            <div key={ci} style={{ display: "flex", gap: 18 * k, alignItems: "baseline", background: "rgba(255,255,255,0.06)", borderLeft: `${5 * k}px solid ${theme.accent}`, borderRadius: 12 * k, padding: `${12 * k}px ${18 * k}px`, opacity: s, transform: `translateY(${(1 - s) * 20}px)` }}>
              <span style={{ fontFamily: theme.monoFont, fontSize: 22 * k, color: `${theme.text}88`, flexShrink: 0 }}>{c.date}</span>
              <span style={{ fontSize: 28 * k, color: theme.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.msg}</span>
              <span style={{ fontFamily: theme.monoFont, fontSize: 22 * k, color: "#3DDC97", marginLeft: "auto", flexShrink: 0 }}>+{fmt(c.add)}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
    </AbsoluteFill>
  );
};
