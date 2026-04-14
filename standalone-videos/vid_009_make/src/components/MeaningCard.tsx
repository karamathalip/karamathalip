/**
 * MeaningCard.tsx — Cinematic meaning card with typewriter + glow FX
 *
 * Phase 5C (ENHANCED): Production-level card component with:
 *   - Spring entrance with overshoot
 *   - Animated number badge with rotation + scale pop
 *   - Typewriter reveal on example sentence
 *   - Neon border pulse with inner glow breathing
 *   - Stagger-revealed pills with bounce physics
 *   - Animated underline accent
 */

import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Easing,
} from "remotion";
import { neonShadow } from "../constants";
import { fontBangers, fontInter } from "../fonts";

export interface MeaningCardProps {
  number: string;
  label: string;
  color: string;
  example: string;
  examples: string[];
  delay?: number;
}

export const MeaningCard: React.FC<MeaningCardProps> = ({
  number,
  label,
  color,
  example,
  examples,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - delay;
  const t = f / fps;

  // ── Card entrance — bouncy overshoot ────────────────────────────────────
  const cardSpring = spring({
    frame: f,
    fps,
    config: { damping: 10, stiffness: 120, mass: 1.0 },
    durationInFrames: 30,
  });
  const cardScale = interpolate(cardSpring, [0, 1], [0.5, 1]);
  const cardOpacity = interpolate(cardSpring, [0, 1], [0, 1]);
  const translateY = interpolate(cardSpring, [0, 1], [80, 0]);

  // ── Number badge: delayed pop + rotation ───────────────────────────────
  const badgeSpring = spring({
    frame: f - 6,
    fps,
    config: { damping: 6, stiffness: 180, mass: 0.6 },
    durationInFrames: 24,
  });
  const badgeScale = interpolate(badgeSpring, [0, 0.5, 1], [0, 1.25, 1]);
  const badgeRotate = interpolate(badgeSpring, [0, 0.4, 1], [-20, 8, 0]);

  // ── Neon border glow (breathing) ────────────────────────────────────────
  const glowIntensity = interpolate(
    Math.abs(Math.sin(t * Math.PI * 1.0)),
    [0, 1],
    [6, 22]
  );

  // ── Label entrance spring ──────────────────────────────────────────────
  const labelSpring = spring({
    frame: f - 12,
    fps,
    config: { damping: 12, stiffness: 140 },
    durationInFrames: 20,
  });
  const labelScale = interpolate(labelSpring, [0, 1], [0.6, 1]);
  const labelOp = interpolate(f - 12, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Typewriter for example sentence ─────────────────────────────────────
  const typeStart = 20; // frames after delay
  const charsPerFrame = 0.7; // ~42 chars/sec at 60fps
  const visibleChars = Math.floor(Math.max(0, (f - typeStart) * charsPerFrame));
  const displayedExample = example.slice(0, visibleChars);
  const showCursor = f >= typeStart && visibleChars < example.length;
  const cursorBlink = Math.floor(f / 8) % 2 === 0;

  // ── Animated underline accent ──────────────────────────────────────────
  const underlineWidth = interpolate(f - 14, [0, 20], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });

  return (
    <div
      style={{
        transform: `scale(${cardScale}) translateY(${translateY}px)`,
        opacity: f < 0 ? 0 : cardOpacity,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 22,
        width: "100%",
        maxWidth: 900,
      }}
    >
      {/* Meaning number badge */}
      <div
        style={{
          width: 120,
          height: 120,
          borderRadius: "50%",
          border: `4px solid ${color}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 68,
          fontFamily: fontBangers,
          color,
          textShadow: neonShadow(color, glowIntensity),
          boxShadow: `0 0 ${glowIntensity}px ${color}, 0 0 ${glowIntensity * 2}px ${color}40, inset 0 0 ${glowIntensity}px ${color}30`,
          transform: `scale(${badgeScale}) rotate(${badgeRotate}deg)`,
          background: `radial-gradient(circle at 40% 35%, ${color}15 0%, transparent 70%)`,
        }}
      >
        {number}
      </div>

      {/* Label */}
      <div
        style={{
          fontSize: 76,
          fontFamily: fontBangers,
          color,
          textShadow: neonShadow(color, glowIntensity * 1.3),
          letterSpacing: 8,
          textAlign: "center",
          transform: `scale(${labelScale})`,
          opacity: labelOp,
          position: "relative",
        }}
      >
        {label}
        {/* Animated underline */}
        <div
          style={{
            position: "absolute",
            bottom: -4,
            left: `${(100 - underlineWidth) / 2}%`,
            width: `${underlineWidth}%`,
            height: 4,
            borderRadius: 2,
            background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
            boxShadow: `0 0 8px ${color}`,
          }}
        />
      </div>

      {/* Example sentence card with typewriter */}
      <div
        style={{
          backgroundColor: `${color}12`,
          border: `3px solid ${color}50`,
          borderRadius: 22,
          padding: "28px 44px",
          boxShadow: `0 0 ${glowIntensity}px ${color}30, inset 0 0 ${glowIntensity * 0.5}px ${color}10`,
          width: "100%",
          minHeight: 80,
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 44,
            fontFamily: fontInter,
            color: "#ffffff",
            fontWeight: 600,
            textAlign: "center",
            fontStyle: "italic",
            lineHeight: 1.4,
          }}
        >
          "{displayedExample}
          {showCursor && cursorBlink && (
            <span style={{ color, fontStyle: "normal" }}>|</span>
          )}
          "
        </p>
      </div>

      {/* Examples list — stagger reveal with bounce */}
      <div
        style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          justifyContent: "center",
          marginTop: 4,
        }}
      >
        {examples.map((ex, i) => {
          const itemDelay = delay + 30 + i * 16;
          const itemSpring = spring({
            frame: frame - itemDelay,
            fps,
            config: { damping: 8, stiffness: 160, mass: 0.7 },
            durationInFrames: 22,
          });
          const itemScale = interpolate(itemSpring, [0, 0.5, 1], [0, 1.1, 1]);
          const itemOpacity = interpolate(
            frame - itemDelay,
            [0, 6],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          const itemY = interpolate(itemSpring, [0, 1], [20, 0]);

          // Individual pill glow pulse (offset per index)
          const pillGlow = interpolate(
            Math.abs(Math.sin(((frame - itemDelay) / fps) * Math.PI * 1.5 + i)),
            [0, 1],
            [4, 12]
          );

          return (
            <div
              key={ex}
              style={{
                transform: `scale(${itemScale}) translateY(${itemY}px)`,
                opacity: itemOpacity,
                backgroundColor: `${color}18`,
                borderRadius: 14,
                padding: "14px 26px",
                border: `2px solid ${color}45`,
                boxShadow: `0 0 ${pillGlow}px ${color}40`,
              }}
            >
              <span
                style={{
                  fontSize: 34,
                  fontFamily: fontInter,
                  color: "#ffffff",
                  fontWeight: 500,
                }}
              >
                {ex}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
