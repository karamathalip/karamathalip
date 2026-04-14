/**
 * constants.ts — Shared colors, timing, scene data
 *
 * Phase 2: Art Direction (colors, motion principles)
 * Phase 3: Story & Timeline (scene durations, data)
 */

// ─── Color Palette ────────────────────────────────────────────────────────────
export const COLORS = {
  bg: "#0d0d1a",
  bgLight: "#141428",
  primary: "#00d4ff", // electric blue — center word, hook text
  create: "#ff2d78", // hot pink — meaning 1
  force: "#ffe600", // yellow — meaning 2
  earn: "#39ff14", // neon green — meaning 3
  text: "#ffffff",
  textDim: "#8888aa",
  hero: "#f7c948", // gold
  stickman: "#ffffff",
} as const;

// ─── Timeline (voice-driven — each scene fits its voice clip + visual buffer) ─
export const FPS = 60;
export const WIDTH = 1080;
export const HEIGHT = 1920;

/** Frames of silence before voice starts in each scene (visual lead-in) */
export const VOICE_DELAY_FRAMES = 12; // 0.2s

/** Frame-exact scene lengths: ceil(clipDuration * 60) + 12 (0.2s tail) */
export const SCENE_FRAMES = {
  hook: 421,              // ceil(6.81*60)+12
  meaning_1: 473,         // ceil(7.67*60)+12
  meaning_2: 526,         // ceil(8.56*60)+12
  meaning_3: 440,         // ceil(7.13*60)+12
  explosion_reveal: 422,  // ceil(6.83*60)+12
  mini_story: 439,        // ceil(7.11*60)+12
  loop_back: 354,         // ceil(5.69*60)+12
} as const;

export const TOTAL_FRAMES = Object.values(SCENE_FRAMES).reduce((a, b) => a + b, 0); // 3075

/** Backward-compat seconds (derived from frames) */
export const SCENE_DURATIONS = Object.fromEntries(
  Object.entries(SCENE_FRAMES).map(([k, v]) => [k, v / FPS])
) as { [K in keyof typeof SCENE_FRAMES]: number };

export const TOTAL_DURATION = TOTAL_FRAMES / FPS; // ~59.18s

// ─── Meaning Data ─────────────────────────────────────────────────────────────
export interface MeaningDef {
  number: string;
  label: string;
  color: string;
  example: string;
  examples: string[];
}

export const MEANINGS: MeaningDef[] = [
  {
    number: "1",
    label: "CREATE",
    color: COLORS.create,
    example: "She made a plan.",
    examples: ["make a cake", "make a plan", "make a mistake"],
  },
  {
    number: "2",
    label: "FORCE / CAUSE",
    color: COLORS.force,
    example: "The movie made me cry.",
    examples: ["make me cry", "make me work late", "make him apologize"],
  },
  {
    number: "3",
    label: "EARN",
    color: COLORS.earn,
    example: "She makes good money.",
    examples: ["make a living", "make good money", "make a profit"],
  },
];

// ─── Voice lines for ElevenLabs generation ────────────────────────────────────
// Voice lines with startSec derived from cumulative SCENE_FRAMES / FPS
export const VOICE_LINES = [
  {
    id: "hook",
    text: "she made me a cake to make me cry so she could make money. wait. that sentence uses make three completely different ways.",
    startSec: 0,
  },
  {
    id: "meaning_1",
    text: "make number one. to create. you make a cake. you make a plan. you make a mistake. you're building something that didn't exist.",
    startSec: 7.02,
  },
  {
    id: "meaning_2",
    text: "make number two. to force. the movie made me cry. my boss makes me work late. nobody built anything. somebody got forced.",
    startSec: 14.9,
  },
  {
    id: "meaning_3",
    text: "make number three. to earn. she makes fifty thousand a year. he makes good money. this is the one about getting paid.",
    startSec: 23.67,
  },
  {
    id: "explosion_reveal",
    text: "create. force. earn. one tiny word doing three completely different jobs.",
    startSec: 31.0,
  },
  {
    id: "mini_story",
    text: "watch all three in one sentence. she makes great money making youtube videos which makes her followers happy.",
    startSec: 38.03,
  },
  {
    id: "loop_back",
    text: "okay one more. he made it after she made him make her a cake. how many makes is that? count again.",
    startSec: 45.35,
  },
];

// ─── SFX cue keys per scene (expanded v2 — 19 effects across 7 scenes) ──────
export const SFX_CUES: Record<string, { cue: string; offsetSec: number }[]> = {
  hook: [
    { cue: "typewriter_click", offsetSec: 0.3 },
    { cue: "record_scratch", offsetSec: 4.5 },
    { cue: "whoosh_slide", offsetSec: 6.0 },
  ],
  meaning_1: [
    { cue: "sparkle_pop", offsetSec: 0.3 },
    { cue: "wrong_buzz", offsetSec: 2.0 },
    { cue: "correct_ding", offsetSec: 4.0 },
    { cue: "chip_reveal", offsetSec: 5.5 },
  ],
  meaning_2: [
    { cue: "thud_impact", offsetSec: 0.3 },
    { cue: "wrong_buzz", offsetSec: 2.0 },
    { cue: "correct_ding", offsetSec: 4.0 },
    { cue: "chip_reveal", offsetSec: 5.5 },
  ],
  meaning_3: [
    { cue: "cash_register", offsetSec: 0.3 },
    { cue: "wrong_buzz", offsetSec: 2.0 },
    { cue: "correct_ding", offsetSec: 4.0 },
    { cue: "chip_reveal", offsetSec: 5.5 },
  ],
  explosion_reveal: [
    { cue: "explode_pop", offsetSec: 0.1 },
    { cue: "constellation_draw", offsetSec: 2.0 },
    { cue: "glory_shimmer", offsetSec: 5.0 },
  ],
  mini_story: [
    { cue: "color_flash", offsetSec: 1.0 },
    { cue: "color_flash", offsetSec: 3.0 },
    { cue: "color_flash", offsetSec: 5.0 },
  ],
  loop_back: [
    { cue: "typewriter_click", offsetSec: 0.3 },
    { cue: "question_ping", offsetSec: 4.0 },
    { cue: "bass_drop", offsetSec: 5.4 },
  ],
};

// ─── Helper: neon text shadow ─────────────────────────────────────────────────
export function neonShadow(color: string, intensity: number): string {
  return [
    `0 0 ${intensity}px ${color}`,
    `0 0 ${intensity * 2}px ${color}`,
    `0 0 ${intensity * 4}px ${color}`,
  ].join(", ");
}

export function darkenHex(hex: string, amount: number): string {
  const c = hex.replace("#", "");
  if (c.length !== 6) return hex;
  const r = Math.max(0, parseInt(c.substring(0, 2), 16) - amount);
  const g = Math.max(0, parseInt(c.substring(2, 4), 16) - amount);
  const b = Math.max(0, parseInt(c.substring(4, 6), 16) - amount);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}
