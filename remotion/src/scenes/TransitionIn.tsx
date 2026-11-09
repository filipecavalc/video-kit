import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Transition } from "../types";

const curve = Easing.bezier(0.22, 1, 0.36, 1);
const inOut = Easing.bezier(0.65, 0, 0.35, 1);

/** Transitions that move the outgoing scene too (the camera travels instead of one picture covering another). */
export const CARRY: Transition[] = ["push", "through", "flip"];

/** Entrance of a scene over the previous one, during its first `frames` frames. */
export const TransitionIn: React.FC<{ kind: Transition; frames: number; children: React.ReactNode }> = ({ kind, frames, children }) => {
  const frame = useCurrentFrame();
  if (kind === "cut" || frames <= 0) return <AbsoluteFill>{children}</AbsoluteFill>;
  const opt = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
  const p = interpolate(frame, [0, frames], [0, 1], { ...opt, easing: curve });
  const q = interpolate(frame, [0, frames], [0, 1], { ...opt, easing: inOut });
  const speed = Math.sin(Math.PI * interpolate(frame, [0, frames], [0, 1], opt)); // 0 at rest, 1 mid-move
  let style: React.CSSProperties = {};
  switch (kind) {
    case "slide":
      style = { transform: `translateX(${(1 - p) * 100}%)`, boxShadow: p < 1 ? "-30px 0 60px rgba(0,0,0,0.45)" : undefined };
      break;
    case "wipe":
      style = { clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` };
      break;
    case "zoom":
      style = { transform: `scale(${1.15 - 0.15 * p})`, opacity: p };
      break;
    case "push":
      // Both scenes travel together, like a camera pan; a touch of blur while moving fast.
      style = { transform: `translateX(${(1 - q) * 100}%)`, filter: speed > 0.05 ? `blur(${speed * 5}px)` : undefined };
      break;
    case "through":
      // The camera flies through the old scene into the new one.
      style = { transform: `scale(${0.72 + 0.28 * p})`, opacity: Math.min(1, p * 1.6), filter: speed > 0.05 ? `blur(${speed * 6}px)` : undefined };
      break;
    case "flip": {
      // Second half of a card flip: the new face turns in from the side.
      const h = interpolate(frame, [frames / 2, frames], [0, 1], { ...opt, easing: curve });
      style = { transform: `perspective(2400px) rotateY(${(1 - h) * 90}deg)`, opacity: frame < frames / 2 ? 0 : 1 };
      break;
    }
    default:
      style = { opacity: p };
  }
  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
};

/** The outgoing half of a carry transition, during the last `frames` frames of a scene of `length` frames. */
export const TransitionOut: React.FC<{ kind?: Transition; frames: number; length: number; children: React.ReactNode }> = ({ kind, frames, length, children }) => {
  const frame = useCurrentFrame();
  if (!kind || !CARRY.includes(kind) || frames <= 0) return <>{children}</>;
  const opt = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
  const start = length - frames;
  if (frame < start) return <>{children}</>;
  const q = interpolate(frame, [start, length], [0, 1], { ...opt, easing: inOut });
  const speed = Math.sin(Math.PI * interpolate(frame, [start, length], [0, 1], opt));
  let style: React.CSSProperties = {};
  if (kind === "push") style = { transform: `translateX(${-q * 100}%)`, filter: speed > 0.05 ? `blur(${speed * 5}px)` : undefined };
  if (kind === "through") {
    const e = interpolate(frame, [start, length], [0, 1], { ...opt, easing: Easing.in(Easing.cubic) });
    style = { transform: `scale(${1 + 0.9 * e})`, opacity: 1 - e, filter: speed > 0.05 ? `blur(${speed * 8}px)` : undefined };
  }
  if (kind === "flip") {
    const h = interpolate(frame, [start, start + frames / 2], [0, 1], { ...opt, easing: Easing.in(Easing.cubic) });
    style = { transform: `perspective(2400px) rotateY(${-h * 90}deg)`, opacity: h >= 1 ? 0 : 1 };
  }
  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
};
