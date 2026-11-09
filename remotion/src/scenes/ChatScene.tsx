import React from "react";
import { AbsoluteFill, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { ChatMessage, Scene } from "../types";
import { Theme } from "../styles";
import { Backdrop } from "./Backdrop";

/** Time (in frames from scene start) at which each message appears, plus how long user text types. */
const schedule = (messages: ChatMessage[], duration: number, fps: number) => {
  const lead = Math.round(fps * 0.3);
  const usable = Math.max(1, duration - lead - Math.round(fps * 0.8));
  // Longer messages get proportionally more time on screen.
  const weights = messages.map((m) => 12 + m.text.length * 0.35 + (m.images?.length ?? 0) * 10);
  const total = weights.reduce((a, b) => a + b, 0);
  let t = lead;
  return messages.map((m, i) => {
    const start = t;
    const slot = (weights[i] / total) * usable;
    t += slot;
    const typing = m.role === "user" ? Math.min(slot * 0.55, Math.max(fps * 0.5, m.text.length * 0.9)) : 0;
    return { start, typing };
  });
};

const Bubble: React.FC<{ m: ChatMessage; start: number; typing: number; theme: Theme; k: number }> = ({ m, start, typing, theme, k }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame - start;
  if (local < 0) return null;
  const pop = spring({ frame: local, fps, config: { damping: 18, stiffness: 160 } });
  const user = m.role === "user";
  const shown = user && typing > 0 ? m.text.slice(0, Math.round(interpolate(local, [0, typing], [0, m.text.length], { extrapolateRight: "clamp" }))) : m.text;
  const caret = user && local < typing && Math.floor(local / 8) % 2 === 0;

  return (
    <div style={{ display: "flex", justifyContent: user ? "flex-end" : "flex-start", marginTop: 18 * k, opacity: pop, transform: `translateY(${(1 - pop) * 24}px)` }}>
      {!user ? (
        <div style={{ width: 44 * k, height: 44 * k, borderRadius: 12 * k, background: theme.accent, marginRight: 14 * k, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 24 * k, color: "#111" }}>
          ✻
        </div>
      ) : null}
      <div
        style={{
          maxWidth: "80%",
          background: user ? `${theme.accent}26` : "rgba(255,255,255,0.07)",
          border: `1.5px solid ${user ? `${theme.accent}88` : "rgba(255,255,255,0.12)"}`,
          borderRadius: 20 * k,
          borderTopRightRadius: user ? 6 * k : 20 * k,
          borderTopLeftRadius: user ? 20 * k : 6 * k,
          padding: `${16 * k}px ${22 * k}px`,
          color: theme.text,
          fontSize: 31 * k,
          lineHeight: 1.38,
          fontWeight: user ? 600 : 400,
          whiteSpace: "pre-wrap",
        }}
      >
        {shown}
        {caret ? <span style={{ color: theme.accent }}>▍</span> : null}
        {m.images && m.images.length ? (
          <div style={{ display: "flex", gap: 10 * k, marginTop: 14 * k, flexWrap: "wrap" }}>
            {m.images.map((src, i) => {
              const ip = spring({ frame: local - typing - i * 3, fps, config: { damping: 200 } });
              return (
                <Img
                  key={src}
                  src={staticFile(src)}
                  style={{ width: 120 * k, height: 120 * k, objectFit: "cover", borderRadius: 12 * k, opacity: ip, transform: `scale(${0.8 + 0.2 * ip})` }}
                />
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
};

/** A chat window where the user's requests type in and replies pop up, newest at the bottom. */
export const ChatScene: React.FC<{ scene: Scene; theme: Theme; fadeIn: number }> = ({ scene, theme, fadeIn }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const k = Math.min(width, useVideoConfig().height) / 1080; // scale by the short side, so 16:9 is not oversized
  const messages = scene.messages ?? [];
  const times = schedule(messages, scene.duration, fps);
  const opacity = fadeIn > 0 ? interpolate(frame, [0, fadeIn], [0, 1], { extrapolateRight: "clamp" }) : 1;
  const visible = messages.filter((_, i) => frame >= times[i].start).length;
  const tall = height / width > 1.5;

  return (
    <AbsoluteFill>
      <Backdrop theme={theme} focus={[80, 10]} />
      <AbsoluteFill
      style={{
        opacity,
        padding: `${height * (tall ? 0.12 : 0.06)}px ${width * 0.05}px ${height * (tall ? 0.3 : 0.22)}px`,
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          borderRadius: 26 * k,
          background: "rgba(10,12,16,0.75)",
          border: "1.5px solid rgba(255,255,255,0.1)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 * k, padding: `${16 * k}px ${22 * k}px`, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
            <div key={c} style={{ width: 16 * k, height: 16 * k, borderRadius: 99, background: c }} />
          ))}
          <div style={{ marginLeft: 14 * k, color: `${theme.text}AA`, fontSize: 24 * k, fontWeight: 600 }}>{scene.chatTitle ?? "Claude Code"}</div>
        </div>
        {/* Messages stack from the bottom; older ones scroll off the top. */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: `${10 * k}px ${24 * k}px ${24 * k}px`, overflow: "hidden" }}>
          {messages.slice(0, Math.max(visible, 0)).map((m, i) => (
            <Bubble key={i} m={m} start={times[i].start} typing={times[i].typing} theme={theme} k={k} />
          ))}
        </div>
      </div>
      {messages.map((m, i) => {
        const src = m.role === "user" ? scene.sfxType : scene.sfxReply;
        if (!src) return null;
        const len = m.role === "user" ? Math.max(1, Math.round(times[i].typing)) : Math.round(fps * 0.6);
        return (
          <Sequence key={`fx${i}`} from={Math.round(times[i].start)} durationInFrames={len} layout="none">
            <Audio src={staticFile(src)} volume={m.role === "user" ? 0.25 : 0.4} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
    </AbsoluteFill>
  );
};
