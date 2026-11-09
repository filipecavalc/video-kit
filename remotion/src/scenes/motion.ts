/** Shared motion helpers: every value is a pure function of the frame (no state), so renders are deterministic. */

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Landing moves decelerate; leaving moves accelerate. */
export const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeOutExpo = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp01(x)));
export const easeIn = (x: number) => Math.pow(clamp01(x), 3);
export const easeInOut = (x: number) => {
  const t = clamp01(x);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

/** Progress 0..1 of a move that starts at `start` and lasts `len` frames. */
export const prog = (frame: number, start: number, len: number) => clamp01((frame - start) / Math.max(1, len));

/** Stable pseudo-random 0..1 from a number (uneven staggers and typing rhythm without Math.random). */
export const hash01 = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Uneven stagger offsets in frames (0, 4, 9, 15, 22, 30, ...): reads as reaction, not as a metronome. */
export const STAGGER = [0, 4, 9, 15, 22, 30, 39, 49, 60, 72];
export const stagger = (i: number) => STAGGER[i] ?? STAGGER[STAGGER.length - 1] + (i - STAGGER.length + 1) * 12;
