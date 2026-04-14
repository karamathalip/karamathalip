/**
 * useStaggerReveal.ts — Staggered spring entrance for lists of items
 *
 * Extracted from: MeaningScene chip stagger, ExplosionScene node labels,
 * MiniStoryScene label tags (3+ duplications)
 */

import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";

export interface StaggerRevealConfig {
  /** Number of items to stagger */
  count: number;
  /** Frame at which first item starts appearing */
  startFrame: number;
  /** Frames between each item's entrance (default 12) */
  staggerFrames?: number;
  /** Spring damping (default 10) */
  damping?: number;
  /** Spring stiffness (default 140) */
  stiffness?: number;
}

export interface StaggerItemState {
  /** Spring-driven scale */
  scale: number;
  /** Opacity (0-1) */
  opacity: number;
  /** Vertical offset (slides up from below) */
  translateY: number;
  /** Breathing glow intensity (for neon effects) */
  glowIntensity: number;
}

export function useStaggerReveal(config: StaggerRevealConfig): StaggerItemState[] {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const {
    count,
    startFrame,
    staggerFrames = 12,
    damping = 10,
    stiffness = 140,
  } = config;

  return Array.from({ length: count }, (_, i) => {
    const itemDelay = startFrame + i * staggerFrames;
    const itemSpring = spring({
      frame: frame - itemDelay,
      fps,
      config: { damping, stiffness },
      durationInFrames: 18,
    });

    const scale = interpolate(itemSpring, [0, 1], [0.5, 1]);
    const opacity = interpolate(itemSpring, [0, 0.3, 1], [0, 0.8, 1]);
    const translateY = interpolate(itemSpring, [0, 1], [20, 0]);
    const glowIntensity = interpolate(
      Math.sin(t * Math.PI * 2 + i * 0.8),
      [-1, 1],
      [4, 12]
    );

    return { scale, opacity, translateY, glowIntensity };
  });
}
