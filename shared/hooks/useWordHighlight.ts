/**
 * useWordHighlight.ts — Colored word token highlight with detach + replacement
 *
 * Extracted from: HookScene word-highlight logic (lines 114-188)
 * Handles the pattern where colored target words flash, then fly away
 * and get replaced by meaning labels.
 */

import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";

export interface HighlightToken {
  word: string;
  color?: string;
  /** Default text color for non-target words */
  defaultColor?: string;
}

export interface WordHighlightConfig {
  tokens: HighlightToken[];
  /** Color considered "default" text (non-highlighted). Default "#ffffff" */
  defaultTextColor?: string;
  /** Map from token index to replacement text (e.g. {1: "CREATE"}) */
  replacementMap?: Record<number, string>;
  /** Frame at which detach/replacement phase starts */
  detachStartFrame?: number;
  /** Frames after detach before replacements appear (default 20) */
  detachDelay?: number;
  /** Frames for replacement fade-in (default 18) */
  replaceFadeDuration?: number;
}

export interface WordHighlightTokenState {
  /** Whether this is a highlighted (target) word */
  isHighlighted: boolean;
  /** Opacity multiplier for original word (0 when hidden after detach) */
  originalOpacity: number;
  /** Replacement text if any */
  replacement: string | undefined;
  /** Opacity of replacement overlay (0-1) */
  replacementOpacity: number;
}

export function useWordHighlight(config: WordHighlightConfig): WordHighlightTokenState[] {
  const frame = useCurrentFrame();

  const {
    tokens,
    defaultTextColor = "#ffffff",
    replacementMap = {},
    detachStartFrame,
    detachDelay = 20,
    replaceFadeDuration = 18,
  } = config;

  return tokens.map((tok, i) => {
    const isHighlighted = tok.color != null && tok.color !== defaultTextColor;
    const replacement = replacementMap[i];

    let originalOpacity = 1;
    let replacementOpacity = 0;

    if (detachStartFrame != null) {
      // Hide colored words after detach
      if (isHighlighted && frame > detachStartFrame + detachDelay) {
        originalOpacity = 0;
      }

      // Fade in replacement
      if (replacement) {
        const replaceStart = detachStartFrame + detachDelay;
        if (frame > replaceStart) {
          replacementOpacity = interpolate(
            frame - replaceStart,
            [0, replaceFadeDuration],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
        }
      }
    }

    return {
      isHighlighted,
      originalOpacity,
      replacement,
      replacementOpacity,
    };
  });
}
