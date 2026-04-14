/**
 * MeaningScene.tsx — Data-driven wrong-first contrast + chip stagger reveals
 *
 * Beat sheet:
 *   0.0–1.5s  Number badge + "WORD = LABEL" header
 *   1.5–3.5s  Wrong sentence fades in, gets crossed out
 *   3.5–5.5s  Correct sentence slides in
 *   5.5–9.0s  Example chips stagger-reveal
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
} from "remotion";
import { AnimatedBg } from "../components/AnimatedBg";
import { Stickman } from "../components/Stickman";
import { neonShadow } from "../utils/colors";
import { fontBangers, fontInter } from "../utils/fonts";
import { useStaggerReveal } from "../hooks/useStaggerReveal";
import type { MeaningSceneData } from "../types/video-config";

export interface MeaningSceneProps {
  data: MeaningSceneData;
  /** Primary color for "WORD =" part of header */
  primaryColor?: string;
  textDimColor?: string;
  bgColor?: string;
}

export const MeaningScene: React.FC<MeaningSceneProps> = ({
  data,
  primaryColor = "#00d4ff",
  textDimColor = "#8888aa",
  bgColor,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const { meaning, targetWord, stickmanPose, stickmanEmotion, stickmanX } = data;
  const wrong = meaning.wrongExample;

  // ── Beat timing ────────────────────────────────────────────────────
  const wrongStart = Math.round(1.5 * fps);
  const crossStart = Math.round(3.0 * fps);
  const correctStart = Math.round(3.5 * fps);
  const chipsStart = Math.round(5.5 * fps);

  // ── Number badge entrance ──────────────────────────────────────────
  const numSpring = spring({
    frame, fps, config: { damping: 8, stiffness: 160 }, durationInFrames: 20,
  });
  const numScale = interpolate(numSpring, [0, 1], [0, 1]);

  // ── Header opacity ─────────────────────────────────────────────────
  const headerOp = interpolate(frame, [6, 24], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  // ── Wrong sentence ─────────────────────────────────────────────────
  const wrongOp = interpolate(frame - wrongStart, [0, 12], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const strikeProgress = interpolate(frame - crossStart, [0, 18], [0, 100], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  // ── Correct sentence ───────────────────────────────────────────────
  const correctSpring = spring({
    frame: frame - correctStart, fps,
    config: { damping: 10, stiffness: 120 }, durationInFrames: 24,
  });
  const correctY = interpolate(correctSpring, [0, 1], [60, 0]);
  const correctOp = interpolate(correctSpring, [0, 0.3, 1], [0, 0.8, 1]);

  // ── Example chips stagger ──────────────────────────────────────────
  const chipStates = useStaggerReveal({
    count: meaning.examples.length,
    startFrame: chipsStart,
    staggerFrames: 12,
  });

  // ── Stickman emotion transition ────────────────────────────────────
  const poseSwitch = Math.round(1.5 * fps);
  const reactPose = frame < poseSwitch ? "confused" : stickmanPose;
  const reactEmotion = frame < poseSwitch ? "confused" : stickmanEmotion;

  return (
    <AbsoluteFill>
      <AnimatedBg accentColor={meaning.color} bgColor={bgColor} pulseSpeed={0.8} particles />

      {/* Number badge */}
      <div
        style={{
          position: "absolute", top: 50, left: 0, right: 0,
          display: "flex", justifyContent: "center",
          transform: `scale(${numScale})`,
        }}
      >
        <div
          style={{
            width: 80, height: 80, borderRadius: 40,
            border: `3px solid ${meaning.color}`,
            backgroundColor: `${meaning.color}18`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 0 20px ${meaning.color}40`,
          }}
        >
          <span style={{
            fontSize: 48, fontFamily: fontBangers, color: meaning.color,
            textShadow: neonShadow(meaning.color, 8),
          }}>
            {meaning.number}
          </span>
        </div>
      </div>

      {/* Header: WORD = LABEL */}
      <div style={{
        position: "absolute", top: 130, left: 0, right: 0,
        textAlign: "center", opacity: headerOp,
      }}>
        <span style={{
          fontSize: 40, fontFamily: fontBangers, color: "#FFFFFF", letterSpacing: 4,
          WebkitTextStroke: `2px ${primaryColor}`, paintOrder: "stroke fill",
          textShadow: `0 0 6px ${primaryColor}`,
        }}>
          {targetWord}
        </span>
        <span style={{
          fontSize: 40, fontFamily: fontBangers, color: textDimColor, margin: "0 16px",
        }}>
          =
        </span>
        <span style={{
          fontSize: 44, fontFamily: fontBangers, color: "#FFFFFF", letterSpacing: 4,
          WebkitTextStroke: `2px ${meaning.color}`, paintOrder: "stroke fill",
          textShadow: `0 0 6px ${meaning.color}`,
        }}>
          {meaning.label}
        </span>
      </div>

      {/* Wrong sentence */}
      {frame >= wrongStart && wrong && (
        <div style={{
          position: "absolute", top: 280, left: 60, right: 60, textAlign: "center",
          opacity: wrongOp,
        }}>
          <div style={{ position: "relative", display: "inline-block" }}>
            <span style={{
              fontSize: 38, fontFamily: fontInter, fontWeight: 600, color: "#ff4444",
              opacity: frame >= crossStart ? 0.5 : 1,
            }}>
              {wrong.text}
            </span>
            {frame >= crossStart && (
              <div style={{
                position: "absolute", top: "50%", left: 0,
                width: `${strikeProgress}%`, height: 3,
                backgroundColor: "#ff4444", borderRadius: 2,
              }} />
            )}
          </div>
          {frame >= crossStart && (
            <div style={{
              marginTop: 8, fontSize: 24, fontFamily: fontInter, fontWeight: 400,
              color: textDimColor,
              opacity: interpolate(frame - crossStart, [0, 12], [0, 0.7], {
                extrapolateLeft: "clamp", extrapolateRight: "clamp",
              }),
            }}>
              ({wrong.reason})
            </div>
          )}
        </div>
      )}

      {/* Correct sentence */}
      {frame >= correctStart && (
        <div style={{
          position: "absolute", top: 380, left: 60, right: 60, textAlign: "center",
          transform: `translateY(${correctY}px)`, opacity: correctOp,
        }}>
          <span style={{
            fontSize: 42, fontFamily: fontInter, fontWeight: 700, color: meaning.color,
            textShadow: neonShadow(meaning.color, 8),
          }}>
            {meaning.example}
          </span>
        </div>
      )}

      {/* Example chips */}
      <div style={{
        position: "absolute", top: 480, left: 40, right: 40,
        display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 14,
      }}>
        {meaning.examples.map((ex, i) => {
          const chip = chipStates[i];
          return (
            <div key={ex} style={{
              padding: "10px 24px", borderRadius: 10,
              border: `2px solid ${meaning.color}60`,
              backgroundColor: `${meaning.color}12`,
              color: meaning.color, fontFamily: fontInter, fontWeight: 600, fontSize: 28,
              textShadow: neonShadow(meaning.color, chip.glowIntensity),
              boxShadow: `0 0 ${chip.glowIntensity}px ${meaning.color}30`,
              transform: `scale(${chip.scale})`, opacity: chip.opacity,
            }}>
              {ex}
            </div>
          );
        })}
      </div>

      {/* Stickman */}
      <Stickman
        pose={reactPose}
        emotion={reactEmotion}
        x={stickmanX ?? 460}
        y={1450}
        scale={1.5}
      />
    </AbsoluteFill>
  );
};
