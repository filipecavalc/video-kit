import React from "react";
import { AbsoluteFill, Sequence, staticFile, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { Timeline } from "./types";
import { getTheme } from "./styles";
import { MediaScene } from "./scenes/MediaScene";
import { CardScene } from "./scenes/CardScene";
import { ChatScene } from "./scenes/ChatScene";
import { TerminalScene } from "./scenes/TerminalScene";
import { CodeScene } from "./scenes/CodeScene";
import { DiagramScene } from "./scenes/DiagramScene";
import { GitScene } from "./scenes/GitScene";
import { StatsScene } from "./scenes/StatsScene";
import { ModelScene } from "./scenes/ModelScene";
import { TitleScene } from "./scenes/TitleScene";
import { Captions } from "./Captions";
import { CARRY, TransitionIn, TransitionOut } from "./scenes/TransitionIn";
import { Chip } from "./scenes/Chip";
import { Film, LightLeaks } from "./scenes/FilmLayer";
import { Camera } from "./scenes/Camera";
import { Annotations } from "./scenes/Annotations";
import { BackdropChoice, Depth, SceneStart } from "./scenes/Backdrop";

/** Music volume for a frame: ducked while someone is speaking, faded in and out. */
const musicVolume = (t: Timeline, fps: number) => (frame: number) => {
  if (!t.music) return 0;
  const ms = (frame / fps) * 1000;
  const ramp = 250;
  let duck = 0;
  for (const [a, b] of t.speech ?? []) {
    if (ms >= a - ramp && ms <= b + ramp) {
      const into = Math.min(ms - (a - ramp), b + ramp - ms);
      duck = Math.max(duck, Math.min(1, into / ramp));
    }
  }
  const level = t.music.volume + (t.music.duck - t.music.volume) * duck;
  const total = t.durationInFrames;
  const fadeIn = Math.min(1, frame / (fps * 0.6));
  const fadeOut = Math.min(1, (total - frame) / (fps * 1.5));
  return Math.max(0, level * Math.min(fadeIn, fadeOut));
};

export const Main: React.FC<Timeline> = (t) => {
  const { fps } = useVideoConfig();
  const theme = getTheme(t.style, t.brand?.accent);

  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, ${theme.bg[0]}, ${theme.bg[1]})`, fontFamily: theme.font }}>
      {t.scenes.map((s, i) => {
        const next = t.scenes[i + 1];
        // Each scene runs `fade` frames longer, under the next scene's entrance (unless the next one cuts).
        // Transitions that move both scenes (push, through, flip) take a little longer than a fade.
        const trFrames = (tr?: string) => (tr && (CARRY as string[]).includes(tr) ? Math.round(t.fade * 1.6) : t.fade);
        const overlap = !next || next.transition === "cut" ? 0 : trFrames(next.transition);
        const length = s.duration + overlap;
        const kind = i === 0 ? "cut" : s.transition ?? "fade";
        return (
          <Sequence key={s.id} name={s.id} from={s.from} durationInFrames={length} premountFor={fps}>
            <SceneStart.Provider value={s.from}>
            <BackdropChoice.Provider value={s.background ?? t.background}>
            <Depth.Provider value={s.perspective ?? t.perspective ?? false}>
            <TransitionOut kind={next?.transition} frames={overlap} length={length}>
            <TransitionIn kind={kind} frames={trFrames(kind)}>
              <Camera keys={s.camera}>
              {s.kind === "card" ? (
                <CardScene scene={s} theme={theme} fadeIn={0} handle={t.brand?.handle} logo={t.logo} />
              ) : s.kind === "chat" ? (
                <ChatScene scene={s} theme={theme} fadeIn={0} />
              ) : s.kind === "terminal" ? (
                <TerminalScene scene={s} theme={theme} />
              ) : s.kind === "code" ? (
                <CodeScene scene={s} theme={theme} />
              ) : s.kind === "diagram" ? (
                <DiagramScene scene={s} theme={theme} />
              ) : s.kind === "git" ? (
                <GitScene scene={s} theme={theme} />
              ) : s.kind === "model" ? (
                <ModelScene scene={s} theme={theme} />
              ) : s.kind === "stats" ? (
                <StatsScene scene={s} theme={theme} />
              ) : s.kind === "title" ? (
                <TitleScene scene={s} theme={theme} />
              ) : (
                <MediaScene scene={s} theme={theme} fadeIn={0} />
              )}
              <Annotations items={s.annotate} theme={theme} />
              </Camera>
              {s.kind !== "media" && s.kind !== "card" ? (
                <Chip scene={s} theme={theme} placement="bottom" delay={s.code?.diffAt ?? 0} />
              ) : null}
            </TransitionIn>
            </TransitionOut>
            </Depth.Provider>
            </BackdropChoice.Provider>
            </SceneStart.Provider>
          </Sequence>
        );
      })}

      {(t.sfx ?? []).map((fx, i) => (
        <Sequence key={`sfx-${i}`} from={fx.frame} name={`sfx ${fx.src.split("/").pop()}`}>
          <Audio src={staticFile(fx.src)} volume={fx.volume} />
        </Sequence>
      ))}

      <LightLeaks t={t} />
      {t.film ? <Film grain={t.film.grain ?? 0} vignette={t.film.vignette ?? 0} /> : null}

      {!t.noCaptions && t.captions && t.captions.length > 0 ? <Captions timeline={t} theme={theme} /> : null}

      {t.voice ? <Audio src={staticFile(t.voice)} /> : null}
      {t.music ? <Audio src={staticFile(t.music.src)} volume={musicVolume(t, fps)} loop /> : null}
    </AbsoluteFill>
  );
};
