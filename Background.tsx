// components/Background.tsx
// Animated background with particle effects, confetti, and format-specific themes
import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";

interface BackgroundProps {
  format: "fail_fix" | "word_explosion" | "superpower";
  phase?: "hook" | "fail" | "correct" | "remix" | "explosion" | "powerup";
  primaryColor?: string;
  backgroundColor?: string;
}

const CONFETTI_COLORS = ["#FF3B30", "#34C759", "#1F8EF1", "#FF9F0A", "#AF52DE", "#FF2D55"];

export const Background: React.FC<BackgroundProps> = ({
  format,
  phase = "hook",
  primaryColor = "#1F8EF1",
  backgroundColor,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const bgColor = backgroundColor || getDefaultBg(format, phase);
  const showParticles = phase === "correct" || phase === "explosion" || phase === "powerup";
  const showConfetti = phase === "correct" || phase === "explosion";
  const showSpeeds = format === "superpower";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: bgColor,
        overflow: "hidden",
        transition: "none",
      }}
    >
      {/* Gradient overlay for word_explosion dark mode */}
      {format === "word_explosion" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(ellipse at center, #1a1a2e 0%, #0D0D0D 70%)",
          }}
        />
      )}

      {/* Speed lines (superpower) */}
      {showSpeeds && <SpeedLines frame={frame} fps={fps} width={width} height={height} />}

      {/* Confetti particles */}
      {showConfetti && (
        <ConfettiParticles frame={frame} fps={fps} width={width} height={height} />
      )}

      {/* Glow rings (powerup) */}
      {phase === "powerup" && (
        <GlowRings frame={frame} fps={fps} width={width} height={height} color={primaryColor} />
      )}

      {/* Red X (fail phase) */}
      {phase === "fail" && <FailX frame={frame} fps={fps} />}

      {/* Green checkmark (correct phase) */}
      {phase === "correct" && <CorrectCheck frame={frame} fps={fps} />}
    </div>
  );
};

// ── Speed Lines ───────────────────────────────────────────────────────────────
const SpeedLines: React.FC<{ frame: number; fps: number; width: number; height: number }> = ({
  frame, fps, width, height,
}) => {
  const lines = Array.from({ length: 12 }, (_, i) => i);
  const opacity = interpolate(frame, [0, fps * 0.3], [0, 0.3], { extrapolateRight: "clamp" });

  return (
    <svg
      style={{ position: "absolute", inset: 0, opacity }}
      viewBox={`0 0 ${width} ${height}`}
    >
      {lines.map((i) => {
        const angle = (i / 12) * 360;
        const len = 200 + Math.random() * 150;
        return (
          <line
            key={i}
            x1={width / 2}
            y1={height / 2}
            x2={width / 2 + Math.cos((angle * Math.PI) / 180) * len}
            y2={height / 2 + Math.sin((angle * Math.PI) / 180) * len}
            stroke="#FF9F0A"
            strokeWidth="2"
            strokeOpacity="0.6"
          />
        );
      })}
    </svg>
  );
};

// ── Confetti Particles ────────────────────────────────────────────────────────
const ConfettiParticles: React.FC<{ frame: number; fps: number; width: number; height: number }> = ({
  frame, fps, width, height,
}) => {
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    x: (i * 53) % width,
    speed: 3 + (i % 4),
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    size: 6 + (i % 6),
    rotation: (frame * (i % 5 === 0 ? 3 : -3)) % 360,
  }));

  return (
    <svg style={{ position: "absolute", inset: 0, pointerEvents: "none" }} viewBox={`0 0 ${width} ${height}`}>
      {particles.map((p) => {
        const y = (frame * p.speed) % (height + 40) - 20;
        return (
          <rect
            key={p.id}
            x={p.x}
            y={y}
            width={p.size}
            height={p.size * 0.5}
            fill={p.color}
            transform={`rotate(${p.rotation} ${p.x + p.size / 2} ${y + p.size / 4})`}
            opacity={0.85}
          />
        );
      })}
    </svg>
  );
};

// ── Glow Rings ────────────────────────────────────────────────────────────────
const GlowRings: React.FC<{ frame: number; fps: number; width: number; height: number; color: string }> = ({
  frame, fps, width, height, color,
}) => {
  const scale = interpolate(frame % (fps * 1.5), [0, fps * 1.5], [0.5, 2.5], { extrapolateRight: "clamp" });
  const opacity = interpolate(frame % (fps * 1.5), [0, fps * 1.5], [0.6, 0], { extrapolateRight: "clamp" });

  return (
    <svg style={{ position: "absolute", inset: 0, pointerEvents: "none" }} viewBox={`0 0 ${width} ${height}`}>
      {[1, 1.4, 1.8].map((factor, i) => (
        <circle
          key={i}
          cx={width / 2}
          cy={height / 2}
          r={80 * scale * factor}
          fill="none"
          stroke={color}
          strokeWidth="3"
          opacity={opacity / (i + 1)}
        />
      ))}
    </svg>
  );
};

// ── Fail X ────────────────────────────────────────────────────────────────────
const FailX: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const scale = interpolate(frame, [0, fps * 0.2], [3, 1], {
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });

  return (
    <div
      style={{
        position: "absolute",
        top: 20,
        left: "50%",
        transform: `translateX(-50%) scale(${scale})`,
        fontSize: 80,
        lineHeight: 1,
        color: "#FF3B30",
        fontWeight: 900,
        textShadow: "0 4px 20px rgba(255,59,48,0.5)",
      }}
    >
      ✗
    </div>
  );
};

// ── Correct Check ─────────────────────────────────────────────────────────────
const CorrectCheck: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const scale = interpolate(frame, [0, fps * 0.25], [0, 1.2], {
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });

  return (
    <div
      style={{
        position: "absolute",
        top: 20,
        left: "50%",
        transform: `translateX(-50%) scale(${scale})`,
        fontSize: 80,
        lineHeight: 1,
        color: "#34C759",
        fontWeight: 900,
        textShadow: "0 4px 20px rgba(52,199,89,0.4)",
      }}
    >
      ✓
    </div>
  );
};

function getDefaultBg(format: string, phase: string): string {
  if (format === "word_explosion") return "#0D0D0D";
  if (phase === "fail") return "#FFF0EF";
  if (phase === "correct") return "#F0FFF4";
  if (phase === "powerup") return "#FFF9F0";
  return "#F0F8FF";
}
