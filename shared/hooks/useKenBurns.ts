/**
 * useKenBurns.ts — Subtle zoom + pan drift effect
 *
 * Extracted from AnimatedBg Ken Burns logic.
 * Provides ready-to-use CSS transform string.
 */

import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";

export interface KenBurnsConfig {
  /** Zoom range [start, end] (default [1.0, 1.04]) */
  zoomRange?: [number, number];
  /** Horizontal drift in pixels (default -6) */
  driftX?: number;
  /** Vertical drift in pixels (default -3) */
  driftY?: number;
}

export interface KenBurnsResult {
  scale: number;
  translateX: number;
  translateY: number;
  /** Ready-to-use CSS transform string */
  transform: string;
}

export function useKenBurns(config?: KenBurnsConfig): KenBurnsResult {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const {
    zoomRange = [1.0, 1.04],
    driftX = -6,
    driftY = -3,
  } = config ?? {};

  const scale = interpolate(frame, [0, durationInFrames], zoomRange, {
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });

  const translateX = interpolate(frame, [0, durationInFrames], [0, driftX], {
    extrapolateRight: "clamp",
  });

  const translateY = interpolate(frame, [0, durationInFrames], [0, driftY], {
    extrapolateRight: "clamp",
  });

  return {
    scale,
    translateX,
    translateY,
    transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
  };
}
