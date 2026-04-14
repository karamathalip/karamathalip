/**
 * LoopBackScene.tsx — v2: Loop bait — trick sentence + count challenge
 *
 * VO: "okay one more. he made it after she made him make her a cake.
 *      how many makes is that? count again."
 *
 * Beat sheet:
 *   0.0–1.0s  "One more." title
 *   1.0–4.5s  Trick sentence typewriter, colored MAKEs
 *   4.5–6.0s  "How many MAKEs?" question with pointing-up arrow
 *   6.0–8.0s  Count challenge, loop energy zoom
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
import { Stickman } from "../components/Stickman";
import { COLORS, neonShadow } from "../constants";
import { fontBangers, fontInter } from "../fonts";

// Trick sentence tokens with colored "make" words
const SENTENCE_TOKENS = [
  { word: "He", color: COLORS.text },
  { word: "made", color: COLORS.earn },      // earned/achieved
  { word: "it", color: COLORS.text },
  { word: "after", color: COLORS.text },
  { word: "she", color: COLORS.text },
  { word: "made", color: COLORS.force },      // forced
  { word: "him", color: COLORS.text },
  { word: "make", color: COLORS.create },     // create
  { word: "her", color: COLORS.text },
  { word: "a", color: COLORS.text },
  { word: "cake.", color: COLORS.text },
];

export const LoopBackScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = frame / fps;

  // ── Beat timing ─────────────────────────────────────────────
  const titleStart = 0;
  const typeStart = Math.round(1.0 * fps);      // 60
  const wordInterval = Math.round(0.28 * fps);  // ~17 frames
  const questionStart = Math.round(4.5 * fps);  // 270
  const countStart = Math.round(6.0 * fps);     // 360

  // ── Title "ONE MORE." ───────────────────────────────────────
  const titleSpring = spring({
    frame,
    fps,
    config: { damping: 10, stiffness: 140 },
    durationInFrames: 20,
  });
  const titleScale = interpolate(titleSpring, [0, 1], [0.6, 1]);
  const titleOp = interpolate(titleSpring, [0, 0.3, 1], [0, 0.8, 1]);

  // ── Question slam ──────────────────────────────────────────
  const qSpring = spring({
    frame: frame - questionStart,
    fps,
    config: { damping: 6, stiffness: 180, mass: 0.8 },
    durationInFrames: 24,
  });
  const qScale = interpolate(qSpring, [0, 1], [2.5, 1]);
  const qOp = interpolate(frame - questionStart, [0, 4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Count again slam ───────────────────────────────────────
  const cSpring = spring({
    frame: frame - countStart,
    fps,
    config: { damping: 8, stiffness: 160 },
    durationInFrames: 20,
  });
  const cScale = interpolate(cSpring, [0, 0.5, 1], [0.5, 1.15, 1]);
  const cOp = interpolate(frame - countStart, [0, 6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Final loop energy zoom ─────────────────────────────────
  const finalZoom = interpolate(
    frame,
    [durationInFrames - 12, durationInFrames],
    [1, 1.06],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.quad) }
  );

  // ── Pointing arrow bounce ──────────────────────────────────
  const arrowBounce = frame >= questionStart
    ? Math.sin((frame - questionStart) / fps * Math.PI * 3) * 8
    : 0;

  // Stickman: pointing_up for entire scene
  const stickPose = "pointing_up";
  const stickEmotion: string = frame < questionStart ? "wide_eyes" : "excited";

  return (
    <AbsoluteFill style={{ transform: `scale(${finalZoom})` }}>
      <AnimatedBg accentColor={COLORS.primary} pulseSpeed={3} nebula />

      {/* "ONE MORE." title */}
      <div
        style={{
          position: "absolute",
          top: 100,
          left: 0,
          right: 0,
          textAlign: "center",
          transform: `scale(${titleScale})`,
          opacity: titleOp,
        }}
      >
        <span
          style={{
            fontSize: 56,
            fontFamily: fontBangers,
            color: COLORS.hero,
            textShadow: neonShadow(COLORS.hero, 14),
            letterSpacing: 6,
          }}
        >
          ONE MORE.
        </span>
      </div>

      {/* Trick sentence — typewriter */}
      <div
        style={{
          position: "absolute",
          top: 220,
          left: 50,
          right: 50,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "8px 12px",
          lineHeight: 1.8,
        }}
      >
        {SENTENCE_TOKENS.map((tok, i) => {
          const wordFrame = typeStart + i * wordInterval;
          const visible = frame >= wordFrame;
          const isMake = tok.color !== COLORS.text;

          const popSpring = spring({
            frame: frame - wordFrame,
            fps,
            config: { damping: 12, stiffness: 160 },
            durationInFrames: 14,
          });
          const scale = interpolate(popSpring, [0, 1], [0.5, 1]);

          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                fontSize: isMake ? 52 : 44,
                fontFamily: isMake ? fontBangers : fontInter,
                fontWeight: isMake ? 900 : 600,
                color: isMake ? "#FFFFFF" : tok.color,
                WebkitTextStroke: isMake ? `2px ${tok.color}` : undefined,
                paintOrder: isMake ? 'stroke fill' : undefined,
                opacity: visible ? 1 : 0,
                transform: `scale(${visible ? scale : 0})`,
                textShadow: isMake
                  ? `0 0 6px ${tok.color}`
                  : "0 2px 6px rgba(0,0,0,0.3)",
              }}
            >
              {tok.word}
            </span>
          );
        })}
      </div>

      {/* "HOW MANY MAKEs?" question slam */}
      {frame >= questionStart && (
        <div
          style={{
            position: "absolute",
            top: "48%",
            left: 0,
            right: 0,
            textAlign: "center",
            transform: `scale(${qScale})`,
            opacity: qOp,
          }}
        >
          <span
            style={{
              fontSize: 64,
              fontFamily: fontBangers,
              color: COLORS.primary,
              textShadow: neonShadow(COLORS.primary, 16),
              letterSpacing: 4,
            }}
          >
            HOW MANY MAKEs? 🤔
          </span>
        </div>
      )}

      {/* Pointing-up arrow */}
      {frame >= questionStart && (
        <div
          style={{
            position: "absolute",
            top: "40%",
            left: "50%",
            transform: `translate(-50%, ${-40 + arrowBounce}px)`,
            opacity: interpolate(frame - questionStart, [0, 10], [0, 0.7], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <span style={{ fontSize: 48, color: COLORS.hero }}>☝️</span>
        </div>
      )}

      {/* "COUNT AGAIN." slam */}
      {frame >= countStart && (
        <div
          style={{
            position: "absolute",
            top: "62%",
            left: 0,
            right: 0,
            textAlign: "center",
            transform: `scale(${cScale})`,
            opacity: cOp,
          }}
        >
          <span
            style={{
              fontSize: 72,
              fontFamily: fontBangers,
              color: COLORS.hero,
              textShadow: neonShadow(COLORS.hero, 20),
              letterSpacing: 6,
            }}
          >
            COUNT AGAIN.
          </span>
        </div>
      )}

      {/* 🔄 Loop indicator */}
      {frame >= countStart + 20 && (
        <div
          style={{
            position: "absolute",
            bottom: 460,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            opacity: interpolate(frame - countStart - 20, [0, 10], [0, 0.7], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div
            style={{
              width: 70,
              height: 70,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: `2px solid ${COLORS.primary}40`,
              boxShadow: `0 0 ${interpolate(Math.sin(t * Math.PI * 2), [-1, 1], [4, 16])}px ${COLORS.primary}50`,
              transform: `rotate(${interpolate(frame, [0, 240], [0, 360])}deg)`,
            }}
          >
            <span
              style={{
                fontSize: 40,
                transform: `rotate(${interpolate(frame, [0, 240], [0, -360])}deg)`,
              }}
            >
              🔄
            </span>
          </div>
        </div>
      )}

      {/* Stickman — confused → pointing_up */}
      <Stickman
        pose={stickPose}
        emotion={stickEmotion}
        x={460}
        y={1450}
        scale={1.5}
      />
    </AbsoluteFill>
  );
};
