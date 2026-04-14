/**
 * NeonText.tsx — Cinematic neon text with letter-by-letter animation
 *
 * Phase 5E / Phase 7 (ENHANCED): Production-level neon typography with:
 *   - Letter-by-letter spring entrance
 *   - Multi-layer glow (inner + outer + bloom)
 *   - 5 emphasis modes: static, flicker, pulse, explosion_burst, rainbow_sweep
 *   - Chromatic aberration effect on burst
 *   - Breathing scale micro-animation
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { neonShadow } from "../constants";

export type NeonEmphasis = "static" | "flicker" | "pulse" | "explosion_burst" | "rainbow_sweep";

export interface NeonTextProps {
  text: string;
  color: string;
  fontSize?: number;
  fontFamily?: string;
  emphasis?: NeonEmphasis;
  delay?: number;
  /** Enable per-letter stagger animation */
  letterAnimation?: boolean;
  /** White-fill + colored-stroke for mobile legibility */
  crisp?: boolean;
}

// ─── Enhanced multi-layer glow ────────────────────────────────────────────────
function buildGlow(color: string, intensity: number): string {
  return [
    `0 0 ${intensity * 0.5}px ${color}`,
    `0 0 ${intensity}px ${color}`,
    `0 0 ${intensity * 2}px ${color}`,
    `0 0 ${intensity * 3.5}px ${color}80`,
    `0 0 ${intensity * 6}px ${color}40`,
  ].join(", ");
}

export const NeonText: React.FC<NeonTextProps> = ({
  text,
  color,
  fontSize = 140,
  fontFamily = "sans-serif",
  emphasis = "pulse",
  delay = 0,
  letterAnimation = true,
  crisp = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - delay;
  const t = f / fps;

  // ── Entrance spring (whole word) ────────────────────────────────────────
  const entrySpring = spring({
    frame: f,
    fps,
    config: { damping: 6, stiffness: 100, mass: 1.2 },
    durationInFrames: 36,
  });
  const baseScale = interpolate(entrySpring, [0, 1], [0, 1]);

  // ── Micro-breathing: subtle scale oscillation for "alive" feel ──────────
  const breathe = interpolate(
    Math.sin(t * Math.PI * 0.8),
    [-1, 1],
    [0.98, 1.02]
  );

  // ── Glow intensity based on emphasis ────────────────────────────────────
  let glowIntensity: number;
  let opacity = 1;
  let extraScale = 1;
  let hueRotate = 0;

  switch (emphasis) {
    case "flicker": {
      // Staccato flicker: rapid random-ish on/off first 24 frames, then solid with pulse
      if (f < 24) {
        const flickerVal = Math.sin(f * 2.8) * Math.cos(f * 1.7);
        const isOn = flickerVal > -0.1;
        glowIntensity = isOn ? 30 : 2;
        opacity = isOn ? 1 : 0.15;
      } else {
        // Settled: gentle pulse
        glowIntensity = interpolate(
          Math.sin(t * Math.PI * 2),
          [-1, 1],
          [18, 35]
        );
        opacity = 1;
      }
      break;
    }
    case "explosion_burst": {
      // Dramatic overshoot spring (mass 0.5 = snappy)
      const burstSpring = spring({
        frame: f,
        fps,
        config: { damping: 3, stiffness: 220, mass: 0.5 },
        durationInFrames: 24,
      });
      extraScale = interpolate(burstSpring, [0, 0.5, 1], [0.3, 1.35, 1]);
      glowIntensity = interpolate(burstSpring, [0, 0.3, 1], [80, 50, 18]);
      break;
    }
    case "rainbow_sweep": {
      // Hue rotation sweeps through spectrum
      hueRotate = interpolate(f, [0, fps * 3], [0, 360], {
        extrapolateRight: "clamp",
      });
      glowIntensity = interpolate(
        Math.sin(t * Math.PI * 1.2),
        [-1, 1],
        [14, 28]
      );
      break;
    }
    case "static":
      glowIntensity = 20;
      break;
    case "pulse":
    default:
      glowIntensity = interpolate(
        Math.abs(Math.sin(t * Math.PI * 1.4)),
        [0, 1],
        [12, 32]
      );
  }

  const letters = text.split("");
  const combinedScale = baseScale * breathe * extraScale;

  // ── Letter-by-letter mode ───────────────────────────────────────────────
  if (letterAnimation && letters.length <= 12) {
    return (
      <div
        style={{
          transform: `scale(${combinedScale})`,
          opacity: f < 0 ? 0 : opacity,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: fontSize * 0.02,
          filter: hueRotate ? `hue-rotate(${hueRotate}deg)` : undefined,
        }}
      >
        {letters.map((letter, i) => {
          const letterDelay = i * 3; // 3 frames between each letter
          const letterSpring = spring({
            frame: f - letterDelay,
            fps,
            config: { damping: 8, stiffness: 160, mass: 0.7 },
            durationInFrames: 20,
          });
          const letterScale = interpolate(letterSpring, [0, 1], [0, 1]);
          const letterY = interpolate(letterSpring, [0, 0.5, 1], [-40, 5, 0]);
          const letterRotate = interpolate(letterSpring, [0, 0.3, 1], [-15, 3, 0]);
          const letterOpacity = interpolate(f - letterDelay, [0, 4], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                transform: `scale(${letterScale}) translateY(${letterY}px) rotate(${letterRotate}deg)`,
                opacity: f - letterDelay < 0 ? 0 : letterOpacity,
                fontSize,
                fontFamily,
                fontWeight: 900,
                color: crisp ? '#FFFFFF' : color,
                WebkitTextStrokeWidth: crisp ? '2px' : undefined,
                WebkitTextStrokeColor: crisp ? color : undefined,
                paintOrder: crisp ? 'stroke fill' as any : undefined,
                textShadow: crisp ? `0 0 6px ${color}` : buildGlow(color, glowIntensity),
                letterSpacing: 4,
                textTransform: "uppercase",
                lineHeight: 1.1,
              }}
            >
              {letter}
            </span>
          );
        })}
      </div>
    );
  }

  // ── Whole-word mode (fallback for long strings) ─────────────────────────
  return (
    <div
      style={{
        transform: `scale(${combinedScale})`,
        opacity: f < 0 ? 0 : opacity,
        fontSize,
        fontFamily,
        fontWeight: 900,
        color: crisp ? '#FFFFFF' : color,
        textAlign: "center",
        WebkitTextStrokeWidth: crisp ? '2px' : undefined,
        WebkitTextStrokeColor: crisp ? color : undefined,
        paintOrder: crisp ? 'stroke fill' as any : undefined,
        textShadow: crisp ? `0 0 6px ${color}` : buildGlow(color, glowIntensity),
        letterSpacing: 4,
        textTransform: "uppercase",
        lineHeight: 1.1,
        filter: hueRotate ? `hue-rotate(${hueRotate}deg)` : undefined,
      }}
    >
      {text}
    </div>
  );
};
