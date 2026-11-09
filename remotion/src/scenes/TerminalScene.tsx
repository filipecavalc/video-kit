import React from "react";
import { Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { Scene, TerminalLine } from "../types";
import { Theme } from "../styles";
import { Window } from "./Window";
import { Odometer } from "./Odometer";
import { easeOut, easeOutExpo, hash01, prog } from "./motion";

const COLORS: Record<string, string> = { green: "#3DDC97", red: "#FF6B6B", yellow: "#F5C451", blue: "#61AFEF", dim: "#7F848E" };

type Row = {
  kind: "cmd" | "out" | "prompt";
  text: string;
  color?: string;
  start: number;
  /** cmd: frame offsets at which each character appears (uneven, human rhythm). */
  chars?: number[];
  /** out with "{n}": rolling number. */
  count?: { from: number; to: number; len: number };
};

/** Typing with bursts: quick letters, short stops after spaces and punctuation; capped so long commands stay brisk. */
const typing = (cmd: string, seed: number, fps: number): number[] => {
  const raw: number[] = [];
  let t = 0;
  for (let c = 0; c < cmd.length; c++) {
    raw.push(t);
    const ch = cmd[c];
    t += fps * 0.04 * (0.6 + 0.8 * hash01(seed * 131 + c));
    if (ch === " " || ch === "." || ch === "(" || ch === ",") t += fps * (0.12 + 0.12 * hash01(seed * 17 + c));
  }
  raw.push(t);
  const scale = Math.min(1, (fps * 2.4) / Math.max(1, t));
  return raw.map((x) => x * scale);
};

/** Lay the lines out on the scene's frames. Lines with `at` wait for it; the others follow each other, and any
 *  spare time is spread as a pause before each command so the window never runs out early and then sits still. */
const schedule = (lines: TerminalLine[], fps: number, duration: number): Row[] => {
  const build = (extra: number): { rows: Row[]; end: number } => {
    const rows: Row[] = [];
    let cursor = fps * 0.3;
    let cmds = 0;
    lines.forEach((l, i) => {
      if (l.at !== undefined) cursor = Math.max(cursor, l.at);
      if (l.cmd) {
        cursor += cmds > 0 ? extra : Math.min(extra, fps * 0.6);
        cmds++;
        const chars = typing(l.cmd, i + 1, fps);
        rows.push({ kind: "cmd", text: l.cmd, start: cursor, chars });
        cursor += chars[chars.length - 1] + fps * 0.35; // enter, then the program answers
      }
      if (l.out !== undefined) {
        const len = fps * 1.1;
        rows.push({ kind: "out", text: l.out, color: l.color, start: cursor, count: l.count !== undefined ? { from: l.from ?? 0, to: l.count, len } : undefined });
        cursor += l.count !== undefined ? len + fps * 0.25 : fps * (0.06 + 0.1 * hash01(i * 7 + 3));
      }
      if (l.stream && l.stream.length) {
        const n = l.stream.length;
        const len = fps * (l.for ?? Math.min(2.2, 0.6 + 0.06 * n));
        // Rows arrive slowly, race, then settle: the inverse of an ease-in-out curve.
        l.stream.forEach((text, j) => {
          const y = j / Math.max(1, n - 1);
          rows.push({ kind: "out", text, color: l.color ?? "dim", start: cursor + (len * Math.acos(1 - 2 * y)) / Math.PI });
        });
        cursor += len + fps * 0.25;
      }
    });
    return { rows, end: cursor };
  };
  const timed = lines.some((l) => l.at !== undefined);
  const first = build(0);
  const cmds = lines.filter((l) => l.cmd).length;
  const slack = duration - fps * 0.8 - first.end;
  const result = !timed && slack > 0 && cmds > 0 ? build(Math.min(fps * 2.5, slack / (cmds + 0.5))) : first;
  const last = lines[lines.length - 1];
  if (last && !last.cmd) result.rows.push({ kind: "prompt", text: "", start: result.end }); // the prompt comes back
  return result.rows;
};

/** Terminal: text starts at the top, commands are typed with a human rhythm, long output streams and scrolls,
 *  "{n}" numbers roll up, and the prompt comes back with a blinking caret at the end. */
export const TerminalScene: React.FC<{ scene: Scene; theme: Theme }> = ({ scene, theme }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const k = Math.min(width, height) / 1080; // scale by the short side, so 16:9 is not oversized
  const t = scene.terminal!;
  const prompt = t.prompt ?? "$";
  const rows = React.useMemo(() => schedule(t.lines, fps, scene.duration), [t.lines, fps, scene.duration]);

  // Same geometry as Window.tsx, to know how many lines fit and when to scroll.
  const tall = height / width > 1.5;
  const fontSize = 30 * k;
  const lineH = fontSize * 1.45;
  const padY = 22 * k;
  const padX = 28 * k;
  const innerW = width * 0.9 - 2 * padX;
  const innerH = height * (1 - (tall ? 0.42 : 0.28)) - 62 * k - 2 * padY;
  const perRow = Math.max(10, Math.floor(innerW / (fontSize * 0.6)));
  const capacity = Math.max(3, Math.floor(innerH / lineH));
  const visualLines = (r: Row) => Math.max(1, Math.ceil(((r.kind === "out" ? 0 : prompt.length + 1) + r.text.length) / perRow));

  // Scroll: every row eases in over a few frames, so the view glides instead of jumping.
  let shown = 0;
  for (const r of rows) shown += visualLines(r) * prog(frame, r.start, 5);
  const offset = Math.max(0, shown - capacity) * lineH;

  const activeCmd = rows.findIndex((r) => r.kind === "cmd" && frame >= r.start && frame < r.start + r.chars![r.chars!.length - 1]);
  const lastVisible = rows.reduce((acc, r, i) => (frame >= r.start ? i : acc), -1);
  const blink = Math.floor(frame / (fps * 0.5)) % 2 === 0;
  const caret = (solid: boolean) => (solid || blink ? <span style={{ color: theme.accent }}>▍</span> : null);

  return (
    <Window title={t.title ?? "terminal"} theme={theme} mono>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, padding: `${padY}px ${padX}px`, fontSize, lineHeight: 1.45, color: theme.text, transform: `translateY(${-offset}px)` }}>
        {rows.map((r, i) => {
          if (frame < r.start) return null;
          if (r.kind === "cmd" || r.kind === "prompt") {
            const n = r.chars ? r.chars.filter((c) => frame - r.start >= c).length - 1 : 0;
            const typed = r.text.slice(0, Math.max(0, n));
            const typing = i === activeCmd;
            return (
              <div key={i} style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                <span style={{ color: theme.accent, fontWeight: 700 }}>{prompt} </span>
                {typed}
                {typing ? caret(true) : i === lastVisible ? caret(false) : null}
              </div>
            );
          }
          const p = prog(frame, r.start, 4);
          const color = COLORS[r.color ?? ""] ?? r.color ?? `${theme.text}CC`;
          let body: React.ReactNode = r.text;
          let glow = 0;
          if (r.count) {
            const q = prog(frame, r.start, r.count.len);
            const value = r.count.from + (r.count.to - r.count.from) * easeOutExpo(q);
            const [before, after] = r.text.split("{n}");
            body = (
              <>
                {before}
                <Odometer value={value} target={r.count.to} style={{ fontWeight: 700 }} />
                {after ?? ""}
              </>
            );
            glow = 1 - prog(frame, r.start + r.count.len, fps * 0.6);
            glow = q >= 1 ? glow : 0;
          }
          return (
            <div
              key={i}
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                color,
                opacity: p,
                transform: `translateY(${(1 - easeOut(p)) * 0.35}em)`,
                textShadow: glow > 0 ? `0 0 ${18 * glow * k}px ${color}` : undefined,
              }}
            >
              {body}
            </div>
          );
        })}
      </div>
      {scene.sfxType
        ? rows.map((r, i) =>
            r.kind === "cmd" ? (
              <Sequence key={`k${i}`} from={Math.round(r.start)} durationInFrames={Math.max(1, Math.round(r.chars![r.chars!.length - 1]))} layout="none">
                <Audio src={staticFile(scene.sfxType!)} volume={0.22} />
              </Sequence>
            ) : null,
          )
        : null}
    </Window>
  );
};
