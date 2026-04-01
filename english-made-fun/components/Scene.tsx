/**
 * Scene.tsx — Scene Router
 * Reads scene.visual.template and renders the correct scene component.
 * All shared scene types are defined and exported here.
 *
 * Supported templates:
 *   "stickman"       → StickmanScene
 *   "text_burst"     → TextBurstScene
 *   "dialogue"       → DialogueScene
 *   "word_explosion" → WordExplosionScene
 *   "superpower"     → SuperpowerScene
 *   (unknown)        → falls back to StickmanScene
 */

import React from 'react';
import { AbsoluteFill } from 'remotion';

import { StickmanScene } from './StickmanScene';
import { TextBurstScene, type TextBurstEmphasis } from './TextBurstScene';
import { DialogueScene } from './DialogueScene';
import { WordExplosionScene, type MeaningItem } from './WordExplosionScene';
import { SuperpowerScene } from './SuperpowerScene';

// ─── Shared Types ─────────────────────────────────────────────────────────────
// Exported so VideoTemplate.tsx and agent scripts can import the full type tree.

export type SceneTemplate =
  | 'stickman'
  | 'text_burst'
  | 'dialogue'
  | 'word_explosion'
  | 'superpower';

/** All possible visual fields across every template, flattened into one interface */
export interface SceneVisual {
  template: SceneTemplate | string; // string allows unknown templates to fall back gracefully

  // ── stickman ────────────────────────────────────────────────────────────
  text?: string;
  stickman_action?: string;
  stickman_emotion?: string;
  bg_color?: string;
  bg_image?: string;
  /** 'correct' = green ✓ particles, 'wrong' = red ✗ particles */
  effect?: 'correct' | 'wrong' | null;

  // ── text_burst ──────────────────────────────────────────────────────────
  backgroundColor?: string;
  textColor?: string;
  emphasis?: TextBurstEmphasis;
  keywords?: string[];

  // ── dialogue ────────────────────────────────────────────────────────────
  speaker?: string;
  bubbleColor?: string;
  emotion?: string;

  // ── word_explosion ──────────────────────────────────────────────────────
  word?: string;
  meanings?: MeaningItem[];
  accentColor?: string;

  // ── superpower ──────────────────────────────────────────────────────────
  ruleText?: string;
  heroAction?: string;
  worldColor?: string;

  // ── quiz countdown ──────────────────────────────────────────────────────
  /** Seconds into the scene when the 3-2-1 countdown overlay begins */
  quizCountdown?: number;
}

/** One SFX cue attached to a scene */
export interface SfxCue {
  /** Filename relative to public/ (e.g. "audio/sfx/ding.mp3") */
  file: string;
  /** Offset in seconds from the start of THIS scene */
  startTime: number;
  /** Volume 0–1 (defaults to 1) */
  volume?: number;
}

/** Full scene data as produced by the script agent */
export interface SceneData {
  id: string;
  /** Scene duration in seconds */
  duration: number;
  visual: SceneVisual;
  /** Optional SFX cues attached to this scene */
  sfx?: SfxCue[];
}

// ─── Scene Router ─────────────────────────────────────────────────────────────

export interface SceneProps {
  scene: SceneData;
  /** Previous scene's stickman pose for entrance transitions */
  previousPose?: string;
}

export const Scene: React.FC<SceneProps> = ({ scene, previousPose }) => {
  const { visual } = scene;

  switch (visual.template) {

    // ── text_burst ──────────────────────────────────────────────────────────
    case 'text_burst':
      return (
        <TextBurstScene
          text={visual.text ?? ''}
          backgroundColor={visual.backgroundColor ?? visual.bg_color ?? '#1a1a2e'}
          backgroundImage={visual.bg_image}
          textColor={visual.textColor ?? '#ffffff'}
          emphasis={visual.emphasis ?? 'pop'}
          keywords={visual.keywords ?? []}
        />
      );

    // ── dialogue ────────────────────────────────────────────────────────────
    case 'dialogue':
      return (
        <DialogueScene
          speaker={visual.speaker ?? 'Character'}
          text={visual.text ?? ''}
          bubbleColor={visual.bubbleColor ?? '#2563eb'}
          emotion={visual.emotion ?? visual.stickman_emotion ?? 'happy'}
          stickmanAction={visual.stickman_action ?? 'standing'}
          backgroundColor={visual.backgroundColor ?? visual.bg_color ?? '#1a1a2e'}
          backgroundImage={visual.bg_image}
        />
      );

    // ── word_explosion ──────────────────────────────────────────────────────
    case 'word_explosion':
      return (
        <WordExplosionScene
          word={visual.word ?? visual.text ?? 'WORD'}
          meanings={visual.meanings ?? []}
          backgroundColor={visual.backgroundColor ?? visual.bg_color ?? '#0d0d1a'}
          backgroundImage={visual.bg_image}
          accentColor={visual.accentColor ?? '#00e5ff'}
        />
      );

    // ── superpower ──────────────────────────────────────────────────────────
    case 'superpower':
      return (
        <SuperpowerScene
          ruleText={visual.ruleText ?? visual.text ?? ''}
          heroAction={visual.heroAction ?? visual.stickman_action ?? 'hero_pose'}
          worldColor={visual.worldColor ?? '#7c3aed'}
          backgroundColor={visual.backgroundColor ?? visual.bg_color ?? '#1a1a2e'}
          backgroundImage={visual.bg_image}
        />
      );

    // ── stickman (default + fallback) ───────────────────────────────────────
    case 'stickman':
    default:
      return (
        <StickmanScene
          sceneData={{
            text: visual.text ?? '',
            stickman_action: visual.stickman_action ?? 'standing',
            stickman_emotion: visual.stickman_emotion ?? 'neutral',
            bg_color: visual.bg_color ?? visual.backgroundColor ?? '#1a1a2e',
            bg_image: visual.bg_image,
            effect: visual.effect,
          }}
          previousPose={previousPose}
        />
      );
  }
};

export default Scene;
