import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Video } from "@remotion/media";
import { Scene } from "../types";
import { Theme } from "../styles";
import { Headline } from "./Headline";
import { Chip } from "./Chip";
import { ZoomLayer } from "./ZoomLayer";

const motionTransform = (motion: Scene["motion"], p: number): string => {
  switch (motion) {
    case "zoom-in":
      return `scale(${1 + 0.08 * p})`;
    case "zoom-out":
      return `scale(${1.08 - 0.08 * p})`;
    case "pan-left":
      return `scale(1.1) translateX(${3 - 6 * p}%)`;
    case "pan-right":
      return `scale(1.1) translateX(${-3 + 6 * p}%)`;
    default:
      return "none";
  }
};

const Media: React.FC<{ scene: Scene; fit: "cover" | "contain"; muted?: boolean; style?: React.CSSProperties }> = ({
  scene,
  fit,
  muted,
  style,
}) => {
  const { fps } = useVideoConfig();
  const src = staticFile(scene.media!);
  const base: React.CSSProperties = { width: "100%", height: "100%", objectFit: fit, ...style };
  if (scene.mediaType === "video") {
    return (
      <Video
        src={src}
        objectFit={fit}
        style={{ width: "100%", height: "100%", ...style }}
        trimBefore={scene.trimStart ? Math.round(scene.trimStart * fps) : undefined}
        playbackRate={scene.playbackRate ?? 1}
        volume={muted ? 0 : scene.clipVolume ?? 0}
        muted={muted || !scene.clipVolume}
      />
    );
  }
  return <Img src={src} style={base} />;
};

export const MediaScene: React.FC<{ scene: Scene; theme: Theme; fadeIn: number }> = ({ scene, theme, fadeIn }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const p = Math.min(1, frame / Math.max(1, scene.duration));
  const opacity = fadeIn > 0 ? interpolate(frame, [0, fadeIn], [0, 1], { extrapolateRight: "clamp" }) : 1;
  const fit = scene.fit ?? "contain";
  const motion = scene.motion ?? (scene.mediaType === "image" ? "zoom-in" : "none");
  const pop = spring({ frame, fps: 30, config: { damping: 200 } });

  if (fit === "cover") {
    return (
      <AbsoluteFill style={{ opacity }}>
        <AbsoluteFill style={{ transform: motionTransform(motion, p) }}>
          <Media scene={scene} fit="cover" />
        </AbsoluteFill>
        <Headline scene={scene} theme={theme} />
        <Chip scene={scene} theme={theme} />
      </AbsoluteFill>
    );
  }

  // contain: the whole media in a framed card over a blurred, darkened copy of itself.
  const margin = Math.round(width * 0.05);
  const polish = (scene.zooms?.length ?? 0) > 0 || (scene.clicks?.length ?? 0) > 0;
  if (polish && scene.aspect) {
    // Card sized to the media's own aspect, so zoom/cursor coordinates land on the picture.
    const boxW = width - margin * 2;
    const boxH = height - (scene.headline ? height * 0.2 : margin) - height * 0.2;
    const w = Math.min(boxW, boxH * scene.aspect);
    const h = w / scene.aspect;
    return (
      <AbsoluteFill style={{ opacity }}>
        <AbsoluteFill style={{ transform: "scale(1.2)", filter: "blur(40px) brightness(0.45) saturate(1.2)" }}>
          <Media scene={scene} fit="cover" muted />
        </AbsoluteFill>
        <AbsoluteFill style={{ paddingTop: scene.headline ? height * 0.2 : margin, paddingBottom: height * 0.2, alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: w, height: h, position: "relative", borderRadius: 18, overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,0.55)" }}>
            <ZoomLayer scene={scene} theme={theme}>
              <Media scene={scene} fit="cover" />
            </ZoomLayer>
          </div>
        </AbsoluteFill>
        <Headline scene={scene} theme={theme} />
        <Chip scene={scene} theme={theme} />
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ opacity }}>
      <AbsoluteFill style={{ transform: "scale(1.2)", filter: "blur(40px) brightness(0.45) saturate(1.2)" }}>
        <Media scene={scene} fit="cover" muted />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          padding: margin,
          paddingTop: scene.headline ? height * 0.2 : margin,
          paddingBottom: height * 0.2,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: 24,
            overflow: "hidden",
            boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
            transform: `${motionTransform(motion, p)} translateY(${(1 - pop) * 30}px)`,
          }}
        >
          <Media scene={scene} fit="contain" />
        </div>
      </AbsoluteFill>
      <Headline scene={scene} theme={theme} />
      <Chip scene={scene} theme={theme} />
    </AbsoluteFill>
  );
};
