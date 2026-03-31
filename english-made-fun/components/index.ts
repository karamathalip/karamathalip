/**
 * components/index.ts
 * Central re-export for all scene components, types, and the video template.
 *
 * Usage:
 *   import { VideoTemplate, Scene, Stickman, TextBurstScene, ... } from './components';
 *   import type { VideoData, SceneData, SceneVisual, Pose, Emotion } from './components';
 */

// ── Core character ────────────────────────────────────────────────────────────
export { Stickman, StickmanDemoCompositions, StickmanDemoScene } from './Stickman';
export type { StickmanProps, Pose, Emotion } from './Stickman';

// ── Scene components ──────────────────────────────────────────────────────────
export { TextBurstScene } from './TextBurstScene';
export type { TextBurstSceneProps, TextBurstEmphasis } from './TextBurstScene';

export { StickmanScene } from './StickmanScene';
export type { StickmanSceneProps, StickmanSceneData } from './StickmanScene';

export { DialogueScene } from './DialogueScene';
export type { DialogueSceneProps } from './DialogueScene';

export { WordExplosionScene } from './WordExplosionScene';
export type { WordExplosionSceneProps, MeaningItem } from './WordExplosionScene';

export { SuperpowerScene } from './SuperpowerScene';
export type { SuperpowerSceneProps } from './SuperpowerScene';

// ── Scene router + shared data types ─────────────────────────────────────────
export { Scene } from './Scene';
export type {
  SceneProps,
  SceneData,
  SceneVisual,
  SceneTemplate,
  SfxCue,
} from './Scene';

// ── Top-level composition ─────────────────────────────────────────────────────
export { VideoTemplate } from './VideoTemplate';
export type { VideoTemplateProps, VideoData, CaptionStyle } from './VideoTemplate';
