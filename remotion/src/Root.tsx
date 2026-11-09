import React from "react";
import { CalculateMetadataFunction, Composition } from "remotion";
import { Main } from "./Main";
import { SIZES, Timeline } from "./types";

// Placeholder shown in the Studio when no timeline.json is passed with --props.
const sample: Timeline = {
  fps: 30,
  format: "4x5",
  style: "clean",
  durationInFrames: 150,
  fade: 10,
  scenes: [
    {
      id: "card",
      kind: "card",
      from: 0,
      duration: 150,
      title: "video-kit",
      subtitle: "Render props come from timeline.json",
      footer: "python build.py <project>",
    },
  ],
};

const metadata: CalculateMetadataFunction<Timeline> = ({ props }) => {
  const size = SIZES[props.format] ?? SIZES["4x5"];
  return { durationInFrames: Math.max(1, props.durationInFrames), fps: props.fps, ...size };
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Main"
      component={Main}
      defaultProps={sample}
      calculateMetadata={metadata}
      durationInFrames={150}
      fps={30}
      width={1080}
      height={1350}
    />
  );
};
