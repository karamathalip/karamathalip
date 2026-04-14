/**
 * video-config.ts — Central data contract for all video compositions
 *
 * The pipeline generates a WordVideoConfig JSON; the template consumes it.
 * All word-specific data lives HERE, never in scene files.
 */

// ─── Atomic Building Blocks ──────────────────────────────────────────────────

/** A single token in a sentence, with optional color coding */
export interface SentenceToken {
  word: string;
  /** Highlight color for this word (defaults to standard text color if unset) */
  color?: string;
  /** Label mapping e.g. "CREATE", "FORCE" */
  meaningLabel?: string;
  /** Index into the meanings array this word represents */
  meaningIndex?: number;
}

/** One meaning of the vocabulary word */
export interface MeaningDef {
  number: string;
  label: string;
  color: string;
  example: string;
  examples: string[];
  wrongExample?: {
    text: string;
    reason: string;
  };
  stickmanPose?: string;
  stickmanEmotion?: string;
  sfxCue?: string;
}

/** Named timing mark within a scene (seconds relative to scene start) */
export interface BeatMark {
  id: string;
  timeSec: number;
}

// ─── Scene Data Types (discriminated union by `type`) ────────────────────────

export type SceneType =
  | "hook"
  | "meaning"
  | "explosion_reveal"
  | "mini_story"
  | "loop_back"
  | "text_burst"
  | "dialogue"
  | "word_explosion"
  | "superpower"
  | "stickman";

/** Hook scene: sentence with colored target words, then slam text */
export interface HookSceneData {
  type: "hook";
  sentenceTokens: SentenceToken[];
  replacementMap: Record<number, string>;
  slamText: string;
  slamColor: string;
  accentColor: string;
  stickmanTransitions: {
    timeSec: number;
    pose: string;
    emotion: string;
  }[];
}

/** Meaning scene: wrong-first contrast pattern */
export interface MeaningSceneData {
  type: "meaning";
  meaning: MeaningDef;
  targetWord: string;
  stickmanPose: string;
  stickmanEmotion: string;
  stickmanX?: number;
}

/** Explosion/reveal scene: constellation of meanings */
export interface ExplosionSceneData {
  type: "explosion_reveal";
  targetWord: string;
  accentColor: string;
  meanings: {
    text: string;
    color: string;
    x: number;
    y: number;
  }[];
  centerPosition: { x: number; y: number };
  confettiColors?: string[];
  stickmanPose?: string;
  stickmanEmotion?: string;
}

/** Mini-story scene: sentence using all meanings with labels */
export interface MiniStorySceneData {
  type: "mini_story";
  title: string;
  bgAccent: string;
  wordTokens: (SentenceToken & { label?: string })[];
  stickmanPose?: string;
  stickmanEmotion?: string;
}

/** Loop-back scene: trick sentence + challenge */
export interface LoopBackSceneData {
  type: "loop_back";
  title: string;
  titleColor: string;
  accentColor: string;
  sentenceTokens: SentenceToken[];
  questionText: string;
  challengeText: string;
  challengeColor: string;
  stickmanPose?: string;
  stickmanEmotionBefore?: string;
  stickmanEmotionAfter?: string;
}

/** Generic fallback for simple scene types */
export interface GenericSceneData {
  type: "text_burst" | "dialogue" | "word_explosion" | "superpower" | "stickman";
  [key: string]: unknown;
}

export type SceneData =
  | HookSceneData
  | MeaningSceneData
  | ExplosionSceneData
  | MiniStorySceneData
  | LoopBackSceneData
  | GenericSceneData;

// ─── Scene Config ────────────────────────────────────────────────────────────

/** One scene in the video sequence */
export interface SceneConfig {
  id: string;
  type: SceneType;
  durationFrames: number;

  /** Voice line for this scene */
  voiceLine?: {
    text: string;
    audioFile: string;
    durationSec: number;
  };

  /** SFX cues */
  sfxCues?: { cue: string; offsetSec: number }[];

  /** Beat timing marks for animation choreography */
  beats?: BeatMark[];

  /** Scene-specific data (discriminated by type) */
  data: SceneData;
}

// ─── Color Palette ───────────────────────────────────────────────────────────

export interface ColorPalette {
  bg: string;
  bgLight: string;
  primary: string;
  text: string;
  textDim: string;
  hero: string;
  stickman: string;
  /** Per-meaning accent colors */
  meanings: string[];
}

// ─── TOP-LEVEL VIDEO CONFIG ──────────────────────────────────────────────────

/** Drives the entire render — one config per video */
export interface WordVideoConfig {
  videoId: string;
  format: "word_explosion" | "fail_fix" | "superpower";
  targetWord: string;
  topic: string;
  level: string;

  /** Visual identity */
  colors: ColorPalette;

  /** Timing */
  fps: number;
  width: number;
  height: number;
  voiceDelayFrames: number;

  /** Content */
  meanings: MeaningDef[];
  scenes: SceneConfig[];

  /** YouTube metadata */
  youtube: {
    title: string;
    description: string;
    tags: string[];
  };
}
