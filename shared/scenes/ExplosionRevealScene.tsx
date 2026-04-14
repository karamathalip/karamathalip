/**
 * ExplosionRevealScene.tsx — Data-driven constellation reveal + payoff
 *
 * Beat sheet:
 *   0.0–2.0s  Center word, labels appear with constellation lines drawing
 *   2.0–5.0s  Lines animate, confetti burst, shockwave
 *   5.0–7.0s  Payoff
 *   7.0–end   Glory shimmer, stickman cheering
 *
 * ALL content comes via props — zero hardcoded word data.
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
import { fontBangers } from "../utils/fonts";
import type { ExplosionSceneData } from "../types/video-config";

export interface ExplosionRevealSceneProps {
  data: ExplosionSceneData;
  bgColor?: string;
}

// ─── Confetti ────────────────────────────────────────────────────────────────

function makeConfetti(count: number, colors: string[]) {
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

export const ExplosionRevealScene: React.FC<ExplosionRevealSceneProps> = ({
  data,
  bgColor,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const { targetWord, accentColor, meanings, centerPosition, confettiColors, stickmanPose, stickmanEmotion } = data;
  const center = centerPosition;

  const confetti = React.useMemo(
    () => makeConfetti(36, confettiColors ?? meanings.map((m) => m.color).concat([accentColor, "#f7c948"])),
    [confettiColors, meanings, accentColor]
  );

  // ── Beat timing ─────────────────────────────────────────────────────
  const lineDrawStart = Math.round(0.5 * fps);
  const burstStart = Math.round(2.5 * fps);
  const gloryStart = Math.round(7.0 * fps);

  // ── Flash ───────────────────────────────────────────────────────────
  const flashOp = interpolate(frame, [burstStart, burstStart + 4, burstStart + 16], [0, 0.3, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  // ── Confetti opacity ────────────────────────────────────────────────
  const confettiOp = interpolate(frame, [burstStart, burstStart + 8, burstStart + 180, burstStart + 240], [0, 1, 1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  // ── Glory shimmer ───────────────────────────────────────────────────
  const gloryOp = frame >= gloryStart
    ? interpolate(Math.sin((frame - gloryStart) / fps * Math.PI * 2), [-1, 1], [0.02, 0.08])
    : 0;

  return (
    <AbsoluteFill>
      <AnimatedBg accentColor={accentColor} bgColor={bgColor} pulseSpeed={2.5} nebula />

      {/* Flash */}
      <div style={{
        position: "absolute", inset: 0, backgroundColor: "#ffffff",
        opacity: flashOp, pointerEvents: "none",
      }} />

      {/* Shockwave */}
      {frame >= burstStart && (
        <ShockwaveMulti color={accentColor} count={3} stagger={8} maxRadius={900}
          centerX={center.x} centerY={center.y} />
      )}

      {/* Constellation lines */}
      <svg style={{ position: "absolute", inset: 0, pointerEvents: "none" }} viewBox="0 0 1080 1920">
        {meanings.map((node, i) => {
          const lineDelay = lineDrawStart + i * 18;
          const lineProgress = interpolate(frame - lineDelay, [0, 40], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          });
          const endX = center.x + (node.x - center.x) * lineProgress;
          const endY = center.y + (node.y - center.y) * lineProgress;
          const dashOff = interpolate(frame, [0, 500], [100, 0], { extrapolateRight: "extend" });

          return (
            <React.Fragment key={i}>
              <line x1={center.x} y1={center.y} x2={endX} y2={endY}
                stroke={node.color} strokeWidth={4} opacity={lineProgress * 0.2} strokeLinecap="round" />
              <line x1={center.x} y1={center.y} x2={endX} y2={endY}
                stroke={node.color} strokeWidth={1.5} opacity={lineProgress * 0.7}
                strokeDasharray="8 4" strokeDashoffset={dashOff} strokeLinecap="round" />
              <circle cx={node.x} cy={node.y} r={lineProgress > 0.8 ? 6 : 0}
                fill={node.color} opacity={lineProgress} />
            </React.Fragment>
          );
        })}
        <circle cx={center.x} cy={center.y} r={8} fill={accentColor} opacity={0.8} />
      </svg>

      {/* Center word */}
      <div style={{
        position: "absolute", top: center.y - 50, left: 0, right: 0,
        display: "flex", justifyContent: "center",
      }}>
        <NeonText text={targetWord} color={accentColor} fontSize={140}
          fontFamily={fontBangers} emphasis="explosion_burst" crisp letterAnimation />
      </div>

      {/* Node labels */}
      {meanings.map((node, i) => {
        const labelDelay = lineDrawStart + i * 18 + 30;
        const labelSpring = spring({
          frame: frame - labelDelay, fps,
          config: { damping: 10, stiffness: 120 }, durationInFrames: 24,
        });
        const labelScale = interpolate(labelSpring, [0, 0.5, 1], [0.3, 1.1, 1]);
        const labelOp = interpolate(labelSpring, [0, 0.3, 1], [0, 0.8, 1]);
        const glow = interpolate(Math.sin(t * Math.PI * 1.5 + i), [-1, 1], [8, 20]);

        return (
          <div key={node.text} style={{
            position: "absolute", left: node.x, top: node.y - 30,
            transform: `translate(-50%, -50%) scale(${labelScale})`, opacity: labelOp,
          }}>
            <div style={{
              padding: "12px 30px", borderRadius: 14,
              border: `3px solid ${node.color}`, backgroundColor: `${node.color}18`,
              boxShadow: `0 0 ${glow}px ${node.color}`,
            }}>
              <span style={{
                fontSize: 46, fontFamily: fontBangers, color: "#FFFFFF",
                WebkitTextStroke: `2px ${node.color}`, paintOrder: "stroke fill",
                letterSpacing: 4, textShadow: `0 0 6px ${node.color}`,
              }}>
                {node.text}
              </span>
            </div>
          </div>
        );
      })}

      {/* Confetti */}
      <div style={{ position: "absolute", inset: 0, opacity: confettiOp, pointerEvents: "none" }}>
        {confetti.map((p, i) => {
          const elapsed = Math.max(0, frame - burstStart) / fps;
          const drag = 0.97;
          const px = p.x + p.vx * elapsed * 60 * Math.pow(drag, elapsed * 60);
          const py = p.y + (p.vy * elapsed * 60 + 0.5 * 3.5 * elapsed * elapsed * 3600) * Math.pow(drag, elapsed * 30);
          const rot = p.rotation + p.rotSpeed * elapsed * 60;
          return (
            <div key={i} style={{
              position: "absolute", left: px, top: py,
              width: p.size, height: p.size * 0.5, backgroundColor: p.color, borderRadius: 2,
              transform: `rotate(${rot}deg)`,
              opacity: interpolate(py, [0, 1800, 2000], [1, 1, 0], {
                extrapolateLeft: "clamp", extrapolateRight: "clamp",
              }),
            }} />
          );
        })}
      </div>

      {/* Glory shimmer */}
      <div style={{
        position: "absolute", inset: 0,
        background: `radial-gradient(circle at 50% 40%, ${accentColor}08, transparent 70%)`,
        opacity: gloryOp, pointerEvents: "none",
      }} />

      {/* Stickman */}
      <Stickman pose={stickmanPose ?? "cheering"} emotion={stickmanEmotion ?? "victorious"}
        x={540} y={1550} scale={1.4} />
    </AbsoluteFill>
  );
};
