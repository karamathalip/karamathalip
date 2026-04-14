/**
 * useTypewriter.ts — Word-by-word typewriter reveal with spring pop
 *
 * Extracted from: HookScene, MiniStoryScene, LoopBackScene (3x duplication)
 * Each word appears on a timed interval with a spring scale pop.
 */

import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";

export interface TypewriterToken {
  word: string;
  color?: string;
  [key: string]: unknown;
}

export interface TypewriterConfig {
  tokens: TypewriterToken[];
  /** Words revealed per second (default 3.1) */
  wordsPerSec?: number;
  /** Frame offset before typewriter begins (default 0) */
  startFrame?: number;
  /** Spring damping for pop (default 12) */
  damping?: number;
  /** Spring stiffness for pop (default 180) */
  stiffness?: number;
}

export interface TypewriterTokenState {
  /** Whether this word is visible yet */
  visible: boolean;
  /** Spring-driven scale (0 -> 1 with overshoot) */
  scale: number;
  /** Opacity (0 or 1) */
  opacity: number;
  /** Absolute frame this word appears */
  wordFrame: number;
}

export function useTypewriter(config: TypewriterConfig): TypewriterTokenState[] {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const {
    tokens,
    wordsPerSec = 3.1,
    startFrame = 0,
    damping = 12,
    stiffness = 180,
  } = config;

  const wordInterval = fps / wordsPerSec;

  return tokens.map((_, i) => {
    const wordFrame = startFrame + Math.floor(i * wordInterval);
    const visible = frame >= wordFrame;

    const popSpring = spring({
      frame: frame - wordFrame,
      fps,
      config: { damping, stiffness },
      durationInFrames: 14,
    });
    const scale = interpolate(popSpring, [0, 1], [0.5, 1]);

    return {
      visible,
      scale: visible ? scale : 0,
      opacity: visible ? 1 : 0,
      wordFrame,
    };
  });
}
