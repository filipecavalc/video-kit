import type { Caption } from "@remotion/captions";

export type Format = "1x1" | "4x5" | "9x16" | "16x9";

export const SIZES: Record<Format, { width: number; height: number }> = {
  "1x1": { width: 1080, height: 1080 },
  "4x5": { width: 1080, height: 1350 },
  "9x16": { width: 1080, height: 1920 },
  "16x9": { width: 1920, height: 1080 },
};

export type Motion = "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "none";

export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  /** Thumbnails attached to the message (paths relative to the project folder). */
  images?: string[];
};

export type Transition = "fade" | "slide" | "wipe" | "zoom" | "cut" | "push" | "through" | "flip";

export type Token = [string, string]; // text, colour
export type CodeLine = { n?: number; kind?: " " | "-" | "+"; tokens: Token[] };

export type TerminalLine = {
  cmd?: string;
  out?: string;
  color?: string;
  /** Scene frame the line starts at (from "cue"/"at"); otherwise it follows the previous line. */
  at?: number;
  /** Many output lines printed fast: slow, then racing, then settling (a test run, a build log). */
  stream?: string[];
  /** Seconds the stream takes. */
  for?: number;
  /** "out" has "{n}", which rolls up like an odometer from `from` (default 0) to `count`. */
  count?: number;
  from?: number;
};

/** Camera move on a whole scene (scene frames; x, y = point to zoom on, as fractions of the frame). */
export type CameraKey = { at: number; x: number; y: number; scale: number; hold?: number };

/** Hand-drawn mark over a scene (scene frames; position and size as fractions of the frame). */
export type Annotation = {
  at: number;
  type: "circle" | "underline" | "box" | "strike" | "arrow" | "highlight";
  x: number;
  y: number;
  w?: number;
  h?: number;
  color?: string;
  hold?: number;
};

export type StatItem = { value: number; label?: string; prefix?: string; suffix?: string; decimals?: number; bar?: number; from?: number; at?: number };

export type DiagramNode = { id: string; label: string; sub?: string; icon?: string; x: number; y: number; level: number; accent?: boolean };
export type DiagramEdge = { from: string; to: string; label?: string };
export type DiagramFlow = { path: string[]; at: number; color?: string };

export type GitCommit = { date: string; author: string; msg: string; add: number; del: number };
export type GitData = {
  repo: string;
  commits: GitCommit[];
  totals: { commits: number; add: number; del: number; authors: number; days: number; first: string; last: string };
  series: number[];
  highlights: number[]; // indexes into commits to call out
};

export type Scene = {
  id: string;
  kind: "media" | "card" | "chat" | "terminal" | "code" | "diagram" | "git" | "title" | "stats" | "model";
  /** 3D model (.glb): turntable, exploded view, labels on parts, parts tinted on a cue (scene frames). */
  model?: {
    src: string;
    az?: number;
    el?: number;
    spin?: number;
    zoom?: number;
    edges?: boolean;
    colors?: Record<string, string>;
    explode?: { at: number; amount?: number; hold?: number };
    labels?: { part: string; text: string; at: number; hold?: number }[];
    highlight?: { part: string; at: number; hold?: number; color?: string }[];
  };
  /** Numbers scene: big rolling counters with a label (and an optional progress bar). */
  stats?: { title?: string; items: StatItem[] };
  /** Terminal scene: window title, lines typed (cmd) or printed (out). */
  terminal?: { title?: string; prompt?: string; lines: TerminalLine[] };
  /** Code scene: highlighted lines; focus ranges stepping at given frames (scene-relative); diff mode. */
  code?: { title?: string; lines: CodeLine[]; focus?: { from: number; to: number; at: number }[]; diff?: boolean; diffAt?: number };
  /** Architecture diagram: laid-out nodes, edges, packets travelling along paths at given frames. */
  diagram?: { title?: string; nodes: DiagramNode[]; edges: DiagramEdge[]; flows?: DiagramFlow[]; vertical?: boolean; ambient?: boolean };
  /** Git history timeline. */
  git?: GitData;
  /** Kinetic title scene: big words revealed one by one; `mark` words get a hand-drawn highlight. */
  kinetic?: { text: string; sub?: string; mark?: string[]; logo?: string; align?: "center" | "left"; motion?: "rise" | "blur"; exit?: boolean; media?: string };
  /** How this scene enters over the previous one. */
  transition?: Transition;
  /** Chat scene: window title and the messages, shown one after another. */
  chatTitle?: string;
  messages?: ChatMessage[];
  /** Chat sounds: typing under each user message, a pop on each reply. */
  sfxType?: string;
  sfxReply?: string;
  /** Light leak over the cut into this scene. */
  leak?: { hue?: number };
  /** Media width / height (set by the pipeline), so overlays can line up with the picture. */
  aspect?: number;
  /** Screen-recording polish: eased zooms on a point and a cursor with click ripples (scene frames, 0..1 coords). */
  zooms?: { at: number; dur: number; x: number; y: number; scale: number }[];
  clicks?: { at: number; x: number; y: number }[];
  /** Living background for this scene: plain | glow | grid | dots (default: the video's, else the style's). */
  background?: "plain" | "glow" | "grid" | "dots";
  /** Windows (terminal, code, chat) float in 3D for this scene. */
  perspective?: boolean;
  /** Camera moves over the whole scene (any kind): snap in, settle, optionally ease back out. */
  camera?: CameraKey[];
  /** Hand-drawn marks over the scene, drawn at a spoken word. */
  annotate?: Annotation[];
  /** Small chip near the top: names what is on screen (e.g. "Cutting plan"). */
  label?: string;
  /** Green check chip (e.g. "No overlapping parts"). */
  badge?: string;
  /** First frame of the scene on the timeline. */
  from: number;
  /** Length in frames (without the fade overlap into the next scene). */
  duration: number;
  /** Media path relative to the project folder (the Remotion public dir). */
  media?: string;
  mediaType?: "image" | "video";
  /** cover = fill the frame; contain = whole media over a blurred copy. */
  fit?: "cover" | "contain";
  motion?: Motion;
  /** Seconds to skip at the start of a video clip. */
  trimStart?: number;
  playbackRate?: number;
  /** Keep the clip's own audio (default muted). */
  clipVolume?: number;
  /** Headline shown on top of the media. */
  headline?: string;
  sub?: string;
  /** Card scene texts. */
  title?: string;
  subtitle?: string;
  footer?: string;
  /** Hide burned-in captions during this scene. */
  hideCaptions?: boolean;
};

export type Timeline = {
  fps: number;
  format: Format;
  style: string;
  durationInFrames: number;
  /** Frames of cross-fade between scenes. */
  fade: number;
  scenes: Scene[];
  /** Narration audio, relative to the project folder. */
  voice?: string;
  music?: { src: string; volume: number; duck: number };
  captions?: Caption[];
  /** Speech intervals in ms, used to duck the music. */
  speech?: [number, number][];
  brand?: { accent?: string; handle?: string };
  /** Living background behind titles, cards, windows, stats and diagrams (default: the style's). */
  background?: "plain" | "glow" | "grid" | "dots";
  /** Windows (terminal, code, chat) float in 3D. */
  perspective?: boolean;
  /** Film look over the whole video: grain opacity (0–0.2) and vignette darkness (0–0.6). */
  film?: { grain?: number; vignette?: number };
  /** Caption look override: box | plain | pill | pop (default comes from the style). */
  captionStyle?: "box" | "plain" | "pill" | "pop";
  /** Brand logo (path relative to the project), shown on cards. */
  logo?: string;
  /** Sound effects placed on the timeline (paths relative to the project folder). */
  sfx?: { src: string; frame: number; volume: number }[];
  /** Set for cover stills: no burned-in captions. */
  noCaptions?: boolean;
};
