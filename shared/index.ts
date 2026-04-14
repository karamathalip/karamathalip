/**
 * @english-made-fun/shared — Barrel export
 *
 * Reusable components, scenes, hooks, and types for all video projects.
 */

// ─── Types ───────────────────────────────────────────────────────────────────
export type {
  SentenceToken,
  MeaningDef,
  BeatMark,
  SceneType,
  HookSceneData,
  MeaningSceneData,
  ExplosionSceneData,
  MiniStorySceneData,
  LoopBackSceneData,
  GenericSceneData,
  SceneData,
  SceneConfig,
  ColorPalette,
  WordVideoConfig,
} from "./types/video-config";

// ─── Components ──────────────────────────────────────────────────────────────
export { AnimatedBg } from "./components/AnimatedBg";
export type { AnimatedBgProps } from "./components/AnimatedBg";

export { NeonText } from "./components/NeonText";
export type { NeonTextProps, NeonEmphasis } from "./components/NeonText";

export { MeaningCard } from "./components/MeaningCard";
export type { MeaningCardProps } from "./components/MeaningCard";

export { Shockwave, ShockwaveMulti } from "./components/Shockwave";

export { Stickman } from "./components/Stickman";
export type { StickmanProps, Pose, Emotion } from "./components/Stickman";

export { ProgressDots } from "./components/ProgressDots";
export type { ProgressDotsProps } from "./components/ProgressDots";

// ─── Scenes ──────────────────────────────────────────────────────────────────
export { HookScene } from "./scenes/HookScene";
export type { HookSceneProps } from "./scenes/HookScene";

export { MeaningScene } from "./scenes/MeaningScene";
export type { MeaningSceneProps } from "./scenes/MeaningScene";

export { ExplosionRevealScene } from "./scenes/ExplosionRevealScene";
export type { ExplosionRevealSceneProps } from "./scenes/ExplosionRevealScene";

export { MiniStoryScene } from "./scenes/MiniStoryScene";
export type { MiniStorySceneProps } from "./scenes/MiniStoryScene";

export { LoopBackScene } from "./scenes/LoopBackScene";
export type { LoopBackSceneProps } from "./scenes/LoopBackScene";

// ─── Templates ───────────────────────────────────────────────────────────────
export { WordExplosionTemplate } from "./templates/WordExplosionTemplate";
export type { WordExplosionTemplateProps } from "./templates/WordExplosionTemplate";

// ─── Hooks ───────────────────────────────────────────────────────────────────
export { useTypewriter } from "./hooks/useTypewriter";
export { useWordHighlight } from "./hooks/useWordHighlight";
export { useStaggerReveal } from "./hooks/useStaggerReveal";
export { useSlamText } from "./hooks/useSlamText";
export { useBeatTiming } from "./hooks/useBeatTiming";
export { useKenBurns } from "./hooks/useKenBurns";

// ─── Utils ───────────────────────────────────────────────────────────────────
export { neonShadow, buildGlow, darkenHex, alphaHex } from "./utils/colors";
export { fontBangers, fontInter, fontSpaceGrotesk } from "./utils/fonts";
export {
  secToFrames,
  framesToSec,
  computeSceneDuration,
  computeSceneOffsets,
} from "./utils/timing";
