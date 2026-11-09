import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadGrotesk } from "@remotion/google-fonts/SpaceGrotesk";

const inter = loadInter("normal", { weights: ["400", "600", "800", "900"], subsets: ["latin", "latin-ext"] });
const montserrat = loadMontserrat("normal", { weights: ["700", "900"], subsets: ["latin", "latin-ext"] });
const mono = loadMono("normal", { weights: ["400", "700"], subsets: ["latin", "latin-ext"] });
const playfair = loadPlayfair("normal", { weights: ["700", "900"], subsets: ["latin", "latin-ext"] });
const grotesk = loadGrotesk("normal", { weights: ["500", "700"], subsets: ["latin", "latin-ext"] });

export type Theme = {
  font: string;
  headlineFont: string;
  monoFont: string;
  accent: string;
  text: string;
  bg: [string, string];
  /** Caption look. */
  caption: {
    size: number; // px at 1080 wide
    weight: number;
    upper: boolean;
    box: boolean; // dark rounded box behind the line
    activeColor: string;
    /** Highlight block behind the word being spoken (social style). */
    activeBg?: string;
    activeScale: number;
    /** 0 = top, 1 = bottom of the safe area. */
    position: number;
  };
  headline: {
    size: number;
    weight: number;
    pill: boolean;
  };
  /** Living background behind titles, cards, windows, stats and diagrams. */
  backdrop?: "plain" | "glow" | "grid" | "dots";
};

export const THEMES: Record<string, Theme> = {
  /** Calm product demo: Inter, captions in a box, accent highlight. */
  clean: {
    backdrop: "glow",
    font: inter.fontFamily,
    headlineFont: inter.fontFamily,
    monoFont: mono.fontFamily,
    accent: "#F5A524",
    text: "#FFFFFF",
    bg: ["#0E1116", "#1B2230"],
    caption: { size: 46, weight: 600, upper: false, box: true, activeColor: "#F5A524", activeScale: 1, position: 0.86 },
    headline: { size: 64, weight: 800, pill: false },
  },
  /** Social short: big uppercase words, pop on the active word. */
  bold: {
    backdrop: "glow",
    font: montserrat.fontFamily,
    headlineFont: montserrat.fontFamily,
    monoFont: mono.fontFamily,
    accent: "#FFD400",
    text: "#FFFFFF",
    bg: ["#111111", "#2A2A2A"],
    caption: { size: 72, weight: 900, upper: true, box: false, activeColor: "#111111", activeBg: "#FFD400", activeScale: 1, position: 0.72 },
    headline: { size: 70, weight: 900, pill: true },
  },
  /** Technical / developer: monospace, terminal green accent. */
  tech: {
    backdrop: "grid",
    font: mono.fontFamily,
    headlineFont: inter.fontFamily,
    monoFont: mono.fontFamily,
    accent: "#3DDC97",
    text: "#E8EDF2",
    bg: ["#0A0F14", "#13202B"],
    caption: { size: 42, weight: 700, upper: false, box: true, activeColor: "#3DDC97", activeScale: 1, position: 0.86 },
    headline: { size: 60, weight: 800, pill: false },
  },
  /** Midnight: deep navy, violet accent, geometric sans (product launches, AI/dev tools). */
  midnight: {
    backdrop: "dots",
    font: grotesk.fontFamily,
    headlineFont: grotesk.fontFamily,
    monoFont: mono.fontFamily,
    accent: "#8B5CF6",
    text: "#EEF0FF",
    bg: ["#0B0D1F", "#1A1640"],
    caption: { size: 46, weight: 700, upper: false, box: true, activeColor: "#C4B5FD", activeScale: 1, position: 0.86 },
    headline: { size: 64, weight: 700, pill: true },
  },
  /** Editorial: serif headlines, warm dark paper, gold accent (stories, case studies, essays). */
  editorial: {
    backdrop: "glow",
    font: inter.fontFamily,
    headlineFont: playfair.fontFamily,
    monoFont: mono.fontFamily,
    accent: "#E8B04A",
    text: "#F4EDE4",
    bg: ["#16120F", "#2A231C"],
    caption: { size: 46, weight: 600, upper: false, box: true, activeColor: "#E8B04A", activeScale: 1, position: 0.86 },
    headline: { size: 68, weight: 900, pill: false },
  },
};

export const getTheme = (name: string, accent?: string): Theme => {
  const base = THEMES[name] ?? THEMES.clean;
  if (!accent) return base;
  const caption = base.caption.activeBg ? { ...base.caption, activeBg: accent } : { ...base.caption, activeColor: accent };
  return { ...base, accent, caption };
};
