/**
 * useSlamText.ts — Spring-scale slam entrance with fade-out
 *
 * Extracted from: HookScene "WAIT." slam, LoopBackScene question/challenge slams
 * Pattern: text scales from large -> 1 with spring, then fades out.
 */

import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";

export interface SlamTextConfig {
  /** Frame at which slam begins */
  startFrame: number;
  /** Frame at which slam fades out (optional — stays if omitted) */
  endFrame?: number;
  /** Initial scale before slam (default 3) */
  initialScale?: number;
  /** Spring damping (default 6) */
  damping?: number;
  /** Spring stiffness (default 200) */
  stiffness?: number;
  /** Spring mass (default 0.8) */
  mass?: number;
  /** Frames to fade in opacity (default 4) */
  fadeInFrames?: number;
  /** Frames before endFrame to start fading out (default 10) */
  fadeOutFrames?: number;
}

export interface SlamTextState {
  /** Current scale value */
  scale: number;
  /** Current opacity (0-1) */
  opacity: number;
  /** Whether the slam is currently visible */
  visible: boolean;
}

export function useSlamText(config: SlamTextConfig): SlamTextState {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const {
    startFrame,
    endFrame,
    initialScale = 3,
    damping = 6,
    stiffness = 200,
    mass = 0.8,
    fadeInFrames = 4,
    fadeOutFrames = 10,
  } = config;

  const visible = frame >= startFrame;

  if (!visible) {
    return { scale: initialScale, opacity: 0, visible: false };
  }

  const slamSpring = spring({
    frame: frame - startFrame,
    fps,
    config: { damping, stiffness, mass },
    durationInFrames: 30,
  });

  const scale = interpolate(slamSpring, [0, 1], [initialScale, 1]);

  const fadeIn = interpolate(frame - startFrame, [0, fadeInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  let fadeOut = 1;
  if (endFrame != null) {
    fadeOut = interpolate(
      frame,
      [endFrame - fadeOutFrames, endFrame],
      [1, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    );
  }

  return {
    scale,
    opacity: fadeIn * fadeOut,
    visible: true,
  };
}
