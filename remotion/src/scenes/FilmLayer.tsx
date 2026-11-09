import React from "react";
import { AbsoluteFill, interpolate, Sequence, Solid, useCurrentFrame, useVideoConfig } from "remotion";
import { lightLeak } from "@remotion/effects/light-leak";
import { Timeline } from "../types";

/** Animated film grain (SVG turbulence, new seed every frame) and a soft vignette, over the whole video. */
export const Film: React.FC<{ grain: number; vignette: number }> = ({ grain, vignette }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {vignette > 0 ? <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,${vignette}) 100%)` }} /> : null}
      {grain > 0 ? (
        <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: grain, mixBlendMode: "overlay" }}>
          <filter id="grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={frame % 97} stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#grain)" />
        </svg>
      ) : null}
    </AbsoluteFill>
  );
};

const LeakFlash: React.FC<{ seed: number; hue: number }> = ({ seed, hue }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill style={{ mixBlendMode: "screen", opacity: 0.5, pointerEvents: "none" }}>
      <Solid
        width={width}
        height={height}
        color="transparent"
        effects={[lightLeak({ seed, hueShift: hue, progress: interpolate(frame, [0, durationInFrames - 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) })]}
      />
    </AbsoluteFill>
  );
};

/** Light leaks centred on the cuts into scenes marked `leak`. */
export const LightLeaks: React.FC<{ t: Timeline }> = ({ t }) => {
  const { fps } = useVideoConfig();
  const len = Math.round(fps * 1.1);
  return (
    <>
      {t.scenes.map((s, i) =>
        s.leak ? (
          <Sequence key={`leak${i}`} from={Math.max(0, s.from - Math.round(len / 2))} durationInFrames={len} name={`leak ${s.id}`}>
            <LeakFlash seed={i * 7 + 3} hue={s.leak.hue ?? 0} />
          </Sequence>
        ) : null,
      )}
    </>
  );
};
