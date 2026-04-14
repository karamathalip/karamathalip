/**
 * AnimatedBg.tsx — Cinematic animated background with particles, nebula, Ken Burns
 *
 * Phase 5D (ENHANCED): Production-level background with:
 *   - Dual-layer radial gradient with breathing glow
 *   - Floating particles system (40 particles)
 *   - Nebula / aurora sweep  
 *   - Animated grid with perspective drift
 *   - Ken Burns subtle zoom + pan
 *   - Multi-layer vignette for depth
 */

import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  AbsoluteFill,
  Easing,
} from "remotion";
import { COLORS, darkenHex } from "../constants";

interface AnimatedBgProps {
  accentColor?: string;
  pulseSpeed?: number;
  /** Enable floating particle layer */
  particles?: boolean;
  /** Enable aurora / nebula sweep */
  nebula?: boolean;
}

// ─── Deterministic Particle Field ─────────────────────────────────────────────
// 40 particles with pseudo-random positions seeded by index for reproducibility

interface Particle {
  x: number;    // 0–100% start  
  y: number;    // 0–100% start
  size: number;  // px
  speed: number; // pixels per frame
  opacity: number;
  drift: number; // horizontal sine amplitude
  phase: number; // sine offset
}

function makeParticles(count: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    // Simple deterministic hash per index
    const h1 = ((i * 7919 + 3) % 100);
    const h2 = ((i * 6271 + 17) % 100);
    const h3 = ((i * 4993 + 31) % 100);
    particles.push({
      x: h1,
      y: h2,
      size: 1.5 + (h3 % 4),
      speed: 0.15 + (h1 % 30) * 0.01,
      opacity: 0.15 + (h2 % 50) * 0.01,
      drift: 10 + (h3 % 30),
      phase: (i * 1.7) % (Math.PI * 2),
    });
  }
  return particles;
}

const PARTICLES = makeParticles(40);

export const AnimatedBg: React.FC<AnimatedBgProps> = ({
  accentColor = COLORS.primary,
  pulseSpeed = 1,
  particles = true,
  nebula = true,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = frame / fps; // time in seconds

  // ── Breathing pulse ─────────────────────────────────────────────────────
  const pulse = interpolate(
    Math.sin(t * Math.PI * pulseSpeed),
    [-1, 1],
    [0.06, 0.22]
  );

  // ── Secondary accent pulse (offset phase) ──────────────────────────────
  const pulse2 = interpolate(
    Math.sin(t * Math.PI * pulseSpeed * 0.6 + 1.2),
    [-1, 1],
    [0.03, 0.12]
  );

  // ── Ken Burns: subtle zoom + drift ──────────────────────────────────────
  const kbScale = interpolate(frame, [0, durationInFrames], [1.0, 1.04], {
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });
  const kbX = interpolate(frame, [0, durationInFrames], [0, -6], {
    extrapolateRight: "clamp",
  });
  const kbY = interpolate(frame, [0, durationInFrames], [0, -3], {
    extrapolateRight: "clamp",
  });

  // ── Grid drift angle ───────────────────────────────────────────────────
  const gridAngle = interpolate(frame, [0, durationInFrames], [0, 2], {
    extrapolateRight: "clamp",
  });

  // ── Nebula sweep position ──────────────────────────────────────────────
  const nebulaX = interpolate(
    Math.sin(t * 0.3),
    [-1, 1],
    [20, 80]
  );
  const nebulaY = interpolate(
    Math.cos(t * 0.25 + 0.5),
    [-1, 1],
    [25, 65]
  );

  const accentHex = accentColor.replace("#", "");
  const pulseAlpha = Math.round(pulse * 255)
    .toString(16)
    .padStart(2, "0");
  const pulse2Alpha = Math.round(pulse2 * 255)
    .toString(16)
    .padStart(2, "0");

  return (
    <AbsoluteFill
      style={{
        transform: `scale(${kbScale}) translate(${kbX}px, ${kbY}px)`,
      }}
    >
      {/* Layer 1: Deep gradient base */}
      <div
        style={{
          position: "absolute",
          inset: -20,
          background: `linear-gradient(160deg, ${COLORS.bg} 0%, ${darkenHex(COLORS.bg, 10)} 30%, ${COLORS.bgLight} 60%, ${COLORS.bg} 100%)`,
        }}
      />

      {/* Layer 2: Primary radial accent glow (breathing) */}
      <div
        style={{
          position: "absolute",
          inset: -20,
          background: `radial-gradient(ellipse 65% 45% at 50% 42%, ${accentColor}${pulseAlpha} 0%, transparent 70%)`,
        }}
      />

      {/* Layer 3: Secondary shifted glow (creates depth) */}
      <div
        style={{
          position: "absolute",
          inset: -20,
          background: `radial-gradient(ellipse 40% 35% at 35% 55%, ${accentColor}${pulse2Alpha} 0%, transparent 60%)`,
        }}
      />

      {/* Layer 4: Nebula / aurora sweep */}
      {nebula && (
        <div
          style={{
            position: "absolute",
            inset: -40,
            background: `radial-gradient(ellipse 50% 30% at ${nebulaX}% ${nebulaY}%, ${accentColor}12 0%, transparent 65%)`,
            filter: "blur(60px)",
          }}
        />
      )}

      {/* Layer 5: Floating particles */}
      {particles && (
        <svg
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            overflow: "hidden",
          }}
          viewBox="0 0 1080 1920"
        >
          {PARTICLES.map((p, i) => {
            // Vertical float (upward drift, wrapping)
            const rawY = p.y * 19.2 - frame * p.speed;
            const y = ((rawY % 1920) + 1920) % 1920;
            // Horizontal sine drift
            const x = p.x * 10.8 + Math.sin(t * 0.8 + p.phase) * p.drift;
            // Twinkle: opacity oscillates  
            const twinkle = interpolate(
              Math.sin(t * 2.5 + p.phase),
              [-1, 1],
              [p.opacity * 0.4, p.opacity]
            );
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={p.size}
                fill={accentColor}
                opacity={twinkle}
              />
            );
          })}
        </svg>
      )}

      {/* Layer 6: Animated grid with perspective */}
      <div
        style={{
          position: "absolute",
          inset: -40,
          opacity: 0.035,
          transform: `rotate(${gridAngle}deg)`,
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)
          `,
          backgroundSize: "80px 80px",
        }}
      />

      {/* Layer 7: Multi-layer vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 85% 75% at 50% 50%, transparent 35%, rgba(0,0,0,0.5) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, transparent 15%, transparent 85%, rgba(0,0,0,0.35) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};
