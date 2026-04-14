/**
 * Shockwave.tsx — Expanding ring explosion with particle debris
 *
 * Phase 5D (ENHANCED): Production-level impact FX:
 *   - Expanding ring with gradient stroke
 *   - Inner flash burst on impact
 *   - Particle debris flying outward (16 particles)
 *   - Energy trail lines radiating from center
 *   - Multi-ring staggered system
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";

interface ShockwaveProps {
  color?: string;
  delay?: number;
  maxRadius?: number;
  duration?: number;
}

// ─── Debris particle positions (deterministic) ───────────────────────────────
interface Debris {
  angle: number;
  speed: number;
  size: number;
  rotSpeed: number;
}

function makeDebris(count: number): Debris[] {
  const out: Debris[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      angle: (i / count) * Math.PI * 2 + ((i * 37) % 7) * 0.15,
      speed: 200 + ((i * 53) % 300),
      size: 2 + ((i * 19) % 4),
      rotSpeed: 2 + ((i * 13) % 5),
    });
  }
  return out;
}

const DEBRIS = makeDebris(16);

export const Shockwave: React.FC<ShockwaveProps> = ({
  color = "#00d4ff",
  delay = 0,
  maxRadius = 800,
  duration = 36,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - delay;

  if (f < 0 || f > duration + 20) return null;

  const progress = Math.min(f / duration, 1);
  const radius = interpolate(progress, [0, 1], [0, maxRadius]);
  const opacity = interpolate(progress, [0, 0.15, 0.5, 1], [0.9, 0.7, 0.3, 0]);
  const strokeWidth = interpolate(progress, [0, 0.3, 1], [10, 6, 1]);

  // Inner flash (bright burst at start, fades quickly)
  const flashOpacity = interpolate(f, [0, 4, 12], [0.8, 0.5, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const flashRadius = interpolate(f, [0, 10], [0, 250], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        viewBox="0 0 1080 1920"
      >
        {/* Inner flash */}
        <circle
          cx={540}
          cy={820}
          r={flashRadius}
          fill={`${color}30`}
          opacity={flashOpacity}
        />

        {/* Main ring */}
        <circle
          cx={540}
          cy={820}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          opacity={opacity}
        />

        {/* Secondary thinner ring (slightly behind) */}
        {f > 3 && (
          <circle
            cx={540}
            cy={820}
            r={Math.max(0, radius - 30)}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            opacity={opacity * 0.4}
          />
        )}

        {/* Energy ray lines from center (12 lines) */}
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i / 12) * Math.PI * 2;
          const rayLen = interpolate(progress, [0, 0.6], [0, 300], {
            extrapolateRight: "clamp",
          });
          const rayOp = interpolate(progress, [0, 0.2, 0.8], [0, 0.4, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <line
              key={i}
              x1={540}
              y1={820}
              x2={540 + Math.cos(angle) * rayLen}
              y2={820 + Math.sin(angle) * rayLen}
              stroke={color}
              strokeWidth={1.5}
              opacity={rayOp}
            />
          );
        })}

        {/* Debris particles flying outward */}
        {DEBRIS.map((d, i) => {
          const debrisProgress = interpolate(f, [2, duration + 10], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const dist = d.speed * debrisProgress;
          const dx = 540 + Math.cos(d.angle) * dist;
          const dy = 820 + Math.sin(d.angle) * dist;
          const debrisOp = interpolate(debrisProgress, [0, 0.3, 1], [0, 0.8, 0]);
          return (
            <circle
              key={i}
              cx={dx}
              cy={dy}
              r={d.size * (1 - debrisProgress * 0.5)}
              fill={color}
              opacity={debrisOp}
            />
          );
        })}
      </svg>
    </div>
  );
};

/**
 * Multiple shockwave rings with staggered delays and confetti.
 */
export const ShockwaveMulti: React.FC<{
  color?: string;
  count?: number;
  stagger?: number;
  maxRadius?: number;
}> = ({ color = "#00d4ff", count = 3, stagger = 8, maxRadius = 900 }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <Shockwave
          key={i}
          color={color}
          delay={i * stagger}
          maxRadius={maxRadius - i * 50}
          duration={36 + i * 4}
        />
      ))}
    </>
  );
};
