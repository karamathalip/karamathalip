/**
 * ExplosionScene.tsx — v2: Constellation reveal + payoff
 *
 * VO: "create. force. earn. one tiny word doing three completely different jobs."
 *
 * Beat sheet:
 *   0.0–2.0s  Center MAKE, labels appear with constellation lines drawing
 *   2.0–5.0s  Lines animate, confetti burst, shockwave
 *   5.0–7.0s  Payoff text word-by-word
 *   7.0–9.5s  Glory shimmer, stickman cheering
 *
 * ONLY scene with caption ribbon (preserved from v1)
 */

import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  AbsoluteFill,
  Easing,
} from "remotion";
import { AnimatedBg } from "../components/AnimatedBg";
import { NeonText } from "../components/NeonText";
import { ShockwaveMulti } from "../components/Shockwave";
import { Stickman } from "../components/Stickman";
import { COLORS } from "../constants";
import { fontBangers, fontInter } from "../fonts";

// ─── Constellation config ─────────────────────────────────────────────────────

interface ConstellationNode {
  text: string;
  color: string;
  x: number;
  y: number;
}

const NODES: ConstellationNode[] = [
  { text: "CREATE", color: COLORS.create, x: 200, y: 500 },
  { text: "FORCE", color: COLORS.force, x: 880, y: 500 },
  { text: "EARN", color: COLORS.earn, x: 540, y: 300 },
];

const CENTER = { x: 540, y: 680 };

// ─── Confetti particles ──────────────────────────────────────────────────────

function makeConfetti(count: number) {
  const colors = [COLORS.create, COLORS.force, COLORS.earn, COLORS.primary, COLORS.hero];
  return Array.from({ length: count }, (_, i) => {
    const seed = (i * 6761 + 1013) % 10000;
    const angle = ((seed % 360) / 180) * Math.PI;
    const speed = 6 + (seed % 14);
    return {
      x: 540, y: 680,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 8,
      color: colors[i % colors.length],
      size: 6 + (seed % 10),
      rotation: seed % 360,
      rotSpeed: 3 + (seed % 8),
    };
  });
}

const CONFETTI = makeConfetti(36);

export const ExplosionScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  // ── Beat timing ─────────────────────────────────────────────────
  const lineDrawStart = Math.round(0.5 * fps);   // 30
  const burstStart = Math.round(2.5 * fps);      // 150
  const gloryStart = Math.round(7.0 * fps);      // 420

  // ── Flash on burst ──────────────────────────────────────────────
  const flashOp = interpolate(frame, [burstStart, burstStart + 4, burstStart + 16], [0, 0.3, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Confetti ────────────────────────────────────────────────────
  const confettiOp = interpolate(frame, [burstStart, burstStart + 8, burstStart + 180, burstStart + 240], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });


  // ── Glory shimmer bg pulse ──────────────────────────────────────
  const gloryOp = frame >= gloryStart
    ? interpolate(Math.sin((frame - gloryStart) / fps * Math.PI * 2), [-1, 1], [0.02, 0.08])
    : 0;

  return (
    <AbsoluteFill>
      <AnimatedBg accentColor={COLORS.primary} pulseSpeed={2.5} nebula />

      {/* Impact flash */}
      <div
        style={{
          position: "absolute", inset: 0,
          backgroundColor: "#ffffff",
          opacity: flashOp,
          pointerEvents: "none",
        }}
      />

      {/* Shockwave at burst */}
      {frame >= burstStart && (
        <ShockwaveMulti color={COLORS.primary} count={3} stagger={8} maxRadius={900} />
      )}

      {/* Constellation lines — drawing from center to each node */}
      <svg
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        viewBox="0 0 1080 1920"
      >
        {NODES.map((node, i) => {
          const lineDelay = lineDrawStart + i * 18;
          const lineProgress = interpolate(frame - lineDelay, [0, 40], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          });
          const endX = CENTER.x + (node.x - CENTER.x) * lineProgress;
          const endY = CENTER.y + (node.y - CENTER.y) * lineProgress;

          // Dashed animate
          const dashOff = interpolate(frame, [0, 500], [100, 0], { extrapolateRight: "extend" });

          return (
            <React.Fragment key={i}>
              <line
                x1={CENTER.x} y1={CENTER.y}
                x2={endX} y2={endY}
                stroke={node.color} strokeWidth={4}
                opacity={lineProgress * 0.2}
                strokeLinecap="round"
              />
              <line
                x1={CENTER.x} y1={CENTER.y}
                x2={endX} y2={endY}
                stroke={node.color} strokeWidth={1.5}
                opacity={lineProgress * 0.7}
                strokeDasharray="8 4"
                strokeDashoffset={dashOff}
                strokeLinecap="round"
              />
              {/* Node dot */}
              <circle
                cx={node.x} cy={node.y}
                r={lineProgress > 0.8 ? 6 : 0}
                fill={node.color}
                opacity={lineProgress}
              />
            </React.Fragment>
          );
        })}
        {/* Center dot */}
        <circle cx={CENTER.x} cy={CENTER.y} r={8} fill={COLORS.primary} opacity={0.8} />
      </svg>

      {/* Center MAKE word */}
      <div
        style={{
          position: "absolute",
          top: CENTER.y - 50,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <NeonText
          text="MAKE"
          color={COLORS.primary}
          fontSize={140}
          fontFamily={fontBangers}
          emphasis="explosion_burst"
          crisp
          letterAnimation
        />
      </div>

      {/* Node labels */}
      {NODES.map((node, i) => {
        const labelDelay = lineDrawStart + i * 18 + 30;
        const labelSpring = spring({
          frame: frame - labelDelay,
          fps,
          config: { damping: 10, stiffness: 120 },
          durationInFrames: 24,
        });
        const labelScale = interpolate(labelSpring, [0, 0.5, 1], [0.3, 1.1, 1]);
        const labelOp = interpolate(labelSpring, [0, 0.3, 1], [0, 0.8, 1]);
        const glow = interpolate(Math.sin(t * Math.PI * 1.5 + i), [-1, 1], [8, 20]);

        return (
          <div
            key={node.text}
            style={{
              position: "absolute",
              left: node.x,
              top: node.y - 30,
              transform: `translate(-50%, -50%) scale(${labelScale})`,
              opacity: labelOp,
            }}
          >
            <div
              style={{
                padding: "12px 30px",
                borderRadius: 14,
                border: `3px solid ${node.color}`,
                backgroundColor: `${node.color}18`,
                boxShadow: `0 0 ${glow}px ${node.color}`,
              }}
            >
              <span
                style={{
                  fontSize: 46,
                  fontFamily: fontBangers,
                  color: "#FFFFFF",
                  WebkitTextStroke: `2px ${node.color}`,
                  paintOrder: 'stroke fill',
                  letterSpacing: 4,
                  textShadow: `0 0 6px ${node.color}`,
                }}
              >
                {node.text}
              </span>
            </div>
          </div>
        );
      })}

      {/* Confetti burst */}
      <div style={{ position: "absolute", inset: 0, opacity: confettiOp, pointerEvents: "none" }}>
        {CONFETTI.map((p, i) => {
          const elapsed = Math.max(0, frame - burstStart) / fps;
          const drag = 0.97;
          const px = p.x + p.vx * elapsed * 60 * Math.pow(drag, elapsed * 60);
          const py = p.y + (p.vy * elapsed * 60 + 0.5 * 3.5 * elapsed * elapsed * 3600) * Math.pow(drag, elapsed * 30);
          const rot = p.rotation + p.rotSpeed * elapsed * 60;

          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: px, top: py,
                width: p.size, height: p.size * 0.5,
                backgroundColor: p.color,
                borderRadius: 2,
                transform: `rotate(${rot}deg)`,
                opacity: interpolate(py, [0, 1800, 2000], [1, 1, 0], {
                  extrapolateLeft: "clamp", extrapolateRight: "clamp",
                }),
              }}
            />
          );
        })}
      </div>

      {/* Glory shimmer overlay */}
      <div
        style={{
          position: "absolute", inset: 0,
          background: `radial-gradient(circle at 50% 40%, ${COLORS.primary}08, transparent 70%)`,
          opacity: gloryOp,
          pointerEvents: "none",
        }}
      />

      {/* Stickman — cheering */}
      <Stickman
        pose="cheering"
        emotion="victorious"
        x={540}
        y={1550}
        scale={1.4}
      />

    </AbsoluteFill>
  );
};
