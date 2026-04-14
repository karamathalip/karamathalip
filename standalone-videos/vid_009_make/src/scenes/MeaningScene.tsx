/**
 * MeaningScene.tsx — v2: Wrong-first contrast + chip stagger reveals
 *
 * Parameterized for all 3 meanings. Beat sheet per scene:
 *   0.0–1.5s  Number badge + "MAKE = [LABEL]" header
 *   1.5–3.5s  ❌ Wrong sentence fades in, gets crossed out
 *   3.5–5.5s  ✅ Correct sentence slides in
 *   5.5–9.0s  Example chips stagger-reveal below
 *   Stickman present throughout, reacts at correct reveal
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
import { Stickman } from "../components/Stickman";
import { COLORS, neonShadow } from "../constants";
import type { MeaningDef } from "../constants";
import { fontBangers, fontInter } from "../fonts";

export interface MeaningSceneProps {
  meaning: MeaningDef;
  stickmanPose: string;
  stickmanEmotion: string;
}

// Wrong examples per meaning number (contrasts with correct meaning)
const WRONG_EXAMPLES: Record<string, { text: string; reason: string }> = {
  "1": { text: '"She made me cry"', reason: "that's FORCE" },
  "2": { text: '"She makes $50k a year"', reason: "that's EARN" },
  "3": { text: '"He made a plan"', reason: "that's CREATE" },
};

export const MeaningScene: React.FC<MeaningSceneProps> = ({
  meaning,
  stickmanPose,
  stickmanEmotion,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const wrong = WRONG_EXAMPLES[meaning.number];

  // ── Beat timing (frames) ────────────────────────────────────────
  const headerStart = 0;
  const wrongStart = Math.round(1.5 * fps);   // 90
  const crossStart = Math.round(3.0 * fps);   // 180
  const correctStart = Math.round(3.5 * fps); // 210
  const chipsStart = Math.round(5.5 * fps);   // 330

  // ── Number badge entrance ───────────────────────────────────────
  const numSpring = spring({
    frame,
    fps,
    config: { damping: 8, stiffness: 160 },
    durationInFrames: 20,
  });
  const numScale = interpolate(numSpring, [0, 1], [0, 1]);

  // ── Header "MAKE = LABEL" ───────────────────────────────────────
  const headerOp = interpolate(frame, [6, 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // ── Wrong sentence ──────────────────────────────────────────────
  const wrongOp = interpolate(frame - wrongStart, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Strikethrough line grows across
  const strikeProgress = interpolate(
    frame - crossStart,
    [0, 18],
    [0, 100],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // ── Correct sentence ────────────────────────────────────────────
  const correctSpring = spring({
    frame: frame - correctStart,
    fps,
    config: { damping: 10, stiffness: 120 },
    durationInFrames: 24,
  });
  const correctY = interpolate(correctSpring, [0, 1], [60, 0]);
  const correctOp = interpolate(correctSpring, [0, 0.3, 1], [0, 0.8, 1]);

  // Stickman reacts early — confused first 1.5s, then scene-specific pose
  const poseSwitch = Math.round(1.5 * fps);
  const reactPose = frame < poseSwitch ? "confused" : stickmanPose;
  const reactEmotion = frame < poseSwitch ? "confused" : stickmanEmotion;

  return (
    <AbsoluteFill>
      <AnimatedBg accentColor={meaning.color} pulseSpeed={0.8} particles />

      {/* Number badge — top center */}
      <div
        style={{
          position: "absolute",
          top: 50,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          transform: `scale(${numScale})`,
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            border: `3px solid ${meaning.color}`,
            backgroundColor: `${meaning.color}18`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 0 20px ${meaning.color}40`,
          }}
        >
          <span
            style={{
              fontSize: 48,
              fontFamily: fontBangers,
              color: meaning.color,
              textShadow: neonShadow(meaning.color, 8),
            }}
          >
            {meaning.number}
          </span>
        </div>
      </div>

      {/* Header: MAKE = LABEL */}
      <div
        style={{
          position: "absolute",
          top: 130,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: headerOp,
        }}
      >
        <span
          style={{
            fontSize: 40,
            fontFamily: fontBangers,
            color: "#FFFFFF",
            letterSpacing: 4,
            WebkitTextStroke: `2px ${COLORS.primary}`,
            paintOrder: 'stroke fill',
            textShadow: `0 0 6px ${COLORS.primary}`,
          }}
        >
          MAKE
        </span>
        <span
          style={{
            fontSize: 40,
            fontFamily: fontBangers,
            color: COLORS.textDim,
            margin: "0 16px",
          }}
        >
          =
        </span>
        <span
          style={{
            fontSize: 44,
            fontFamily: fontBangers,
            color: "#FFFFFF",
            letterSpacing: 4,
            WebkitTextStroke: `2px ${meaning.color}`,
            paintOrder: 'stroke fill',
            textShadow: `0 0 6px ${meaning.color}`,
          }}
        >
          {meaning.label}
        </span>
      </div>

      {/* ❌ Wrong sentence */}
      {frame >= wrongStart && wrong && (
        <div
          style={{
            position: "absolute",
            top: 280,
            left: 60,
            right: 60,
            textAlign: "center",
            opacity: wrongOp,
          }}
        >
          <div style={{ position: "relative", display: "inline-block" }}>
            <span
              style={{
                fontSize: 38,
                fontFamily: fontInter,
                fontWeight: 600,
                color: "#ff4444",
                opacity: frame >= crossStart ? 0.5 : 1,
              }}
            >
              ❌ {wrong.text}
            </span>
            {/* Strikethrough line */}
            {frame >= crossStart && (
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: 0,
                  width: `${strikeProgress}%`,
                  height: 3,
                  backgroundColor: "#ff4444",
                  borderRadius: 2,
                }}
              />
            )}
          </div>
          {frame >= crossStart && (
            <div
              style={{
                marginTop: 8,
                fontSize: 24,
                fontFamily: fontInter,
                fontWeight: 400,
                color: COLORS.textDim,
                opacity: interpolate(frame - crossStart, [0, 12], [0, 0.7], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              ({wrong.reason})
            </div>
          )}
        </div>
      )}

      {/* ✅ Correct sentence */}
      {frame >= correctStart && (
        <div
          style={{
            position: "absolute",
            top: 380,
            left: 60,
            right: 60,
            textAlign: "center",
            transform: `translateY(${correctY}px)`,
            opacity: correctOp,
          }}
        >
          <span
            style={{
              fontSize: 42,
              fontFamily: fontInter,
              fontWeight: 700,
              color: meaning.color,
              textShadow: neonShadow(meaning.color, 8),
            }}
          >
            ✅ {meaning.example}
          </span>
        </div>
      )}

      {/* Example chips — stagger reveal */}
      <div
        style={{
          position: "absolute",
          top: 480,
          left: 40,
          right: 40,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 14,
        }}
      >
        {meaning.examples.map((ex, i) => {
          const chipDelay = chipsStart + i * 12;
          const chipSpring = spring({
            frame: frame - chipDelay,
            fps,
            config: { damping: 10, stiffness: 140 },
            durationInFrames: 18,
          });
          const chipScale = interpolate(chipSpring, [0, 1], [0.5, 1]);
          const chipOp = interpolate(chipSpring, [0, 0.3, 1], [0, 0.8, 1]);
          const chipGlow = interpolate(
            Math.sin(t * Math.PI * 2 + i * 0.8),
            [-1, 1],
            [4, 12]
          );

          return (
            <div
              key={ex}
              style={{
                padding: "10px 24px",
                borderRadius: 10,
                border: `2px solid ${meaning.color}60`,
                backgroundColor: `${meaning.color}12`,
                color: meaning.color,
                fontFamily: fontInter,
                fontWeight: 600,
                fontSize: 28,
                textShadow: neonShadow(meaning.color, chipGlow),
                boxShadow: `0 0 ${chipGlow}px ${meaning.color}30`,
                transform: `scale(${chipScale})`,
                opacity: chipOp,
              }}
            >
              {ex}
            </div>
          );
        })}
      </div>

      {/* Stickman — reacts at correct reveal */}
      <Stickman
        pose={reactPose}
        emotion={reactEmotion}
        x={meaning.number === "2" ? 440 : 460}
        y={1450}
        scale={1.5}
      />
    </AbsoluteFill>
  );
};
