import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Theme } from "../styles";
import { Backdrop, Depth } from "./Backdrop";
import { easeOutExpo, prog } from "./motion";

/** Dark app window with traffic lights and a title, centred in the safe area above the captions. */
export const Window: React.FC<{ title: string; theme: Theme; children: React.ReactNode; mono?: boolean }> = ({ title, theme, children, mono }) => {
  const { width, height } = useVideoConfig();
  const k = Math.min(width, useVideoConfig().height) / 1080; // scale by the short side, so 16:9 is not oversized
  const tall = height / width > 1.5;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const depth = React.useContext(Depth);
  // In depth: the window arrives from behind at an angle, then keeps turning slowly the other way, so the
  // picture is never still; the angle stays small enough for the text to read.
  let transform: string | undefined;
  if (depth) {
    const arrive = easeOutExpo(prog(frame, 0, fps * 0.9));
    const ry = -24 * (1 - arrive) - 9 + 14 * Math.min(1, frame / (fps * 12));
    const rx = 7 * (1 - arrive) + 4 - 3 * Math.min(1, frame / (fps * 12));
    transform = `perspective(${2200 * k}px) translateZ(${-320 * k * (1 - arrive)}px) rotateY(${ry}deg) rotateX(${rx}deg)`;
  }
  return (
    <AbsoluteFill>
      <Backdrop theme={theme} focus={[80, 10]} />
      <AbsoluteFill
      style={{
        padding: `${height * (tall ? 0.12 : 0.06)}px ${width * 0.05}px ${height * (tall ? 0.3 : 0.22)}px`,
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          borderRadius: 26 * k,
          background: "rgba(10,12,16,0.85)",
          border: "1.5px solid rgba(255,255,255,0.1)",
          boxShadow: depth ? "0 50px 120px rgba(0,0,0,0.6)" : "0 30px 80px rgba(0,0,0,0.5)",
          transform,
          overflow: "hidden",
          fontFamily: mono ? theme.monoFont : undefined,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 * k, padding: `${16 * k}px ${22 * k}px`, borderBottom: "1px solid rgba(255,255,255,0.08)", fontFamily: theme.font }}>
          {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
            <div key={c} style={{ width: 16 * k, height: 16 * k, borderRadius: 99, background: c }} />
          ))}
          <div style={{ marginLeft: 14 * k, color: `${theme.text}AA`, fontSize: 24 * k, fontWeight: 600 }}>{title}</div>
        </div>
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>{children}</div>
      </div>
    </AbsoluteFill>
    </AbsoluteFill>
  );
};
