/**
 * LoopBackScene.tsx — Data-driven loop bait with trick sentence + challenge
 *
 * Beat sheet:
 *   0.0–1.0s  Title
 *   1.0–4.5s  Trick sentence typewriter, colored target words
 *   4.5–6.0s  Question text with pointing arrow
 *   6.0–end   Challenge text, loop energy zoom
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
import { Stickman } from "../components/Stickman";
import { neonShadow } from "../utils/colors";
import { fontBangers, fontInter } from "../utils/fonts";
import { useTypewriter } from "../hooks/useTypewriter";
import { useSlamText } from "../hooks/useSlamText";
import type { LoopBackSceneData, SentenceToken } from "../types/video-config";

export interface LoopBackSceneProps {
  data: LoopBackSceneData;
  defaultTextColor?: string;
  bgColor?: string;
}

export const LoopBackScene: React.FC<LoopBackSceneProps> = ({
  data,
  defaultTextColor = "#ffffff",
  bgColor,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = frame / fps;

  const {
    title, titleColor, accentColor, sentenceTokens,
    questionText, challengeText, challengeColor,
    stickmanPose, stickmanEmotionBefore, stickmanEmotionAfter,
  } = data;

  // ── Beat timing ─────────────────────────────────────────────────────
  const typeStart = Math.round(1.0 * fps);
  const questionStart = Math.round(4.5 * fps);
  const countStart = Math.round(6.0 * fps);

  // ── Title entrance ──────────────────────────────────────────────────
  const titleSpring = spring({
    frame, fps, config: { damping: 10, stiffness: 140 }, durationInFrames: 20,
  });
  const titleScale = interpolate(titleSpring, [0, 1], [0.6, 1]);
  const titleOp = interpolate(titleSpring, [0, 0.3, 1], [0, 0.8, 1]);

  // ── Typewriter ──────────────────────────────────────────────────────
  const typewriterStates = useTypewriter({
    tokens: sentenceTokens,
    wordsPerSec: 3.57, // ~0.28s per word = 1/0.28
    startFrame: typeStart,
  });

  // ── Question slam ───────────────────────────────────────────────────
  const question = useSlamText({
    startFrame: questionStart, initialScale: 2.5,
    damping: 6, stiffness: 180, mass: 0.8,
  });

  // ── Challenge slam ──────────────────────────────────────────────────
  const challenge = useSlamText({
    startFrame: countStart, initialScale: 0.5,
    damping: 8, stiffness: 160,
  });

  // ── Final loop energy zoom ──────────────────────────────────────────
  const finalZoom = interpolate(
    frame, [durationInFrames - 12, durationInFrames], [1, 1.06],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.quad) }
  );

  // ── Arrow bounce ────────────────────────────────────────────────────
  const arrowBounce = frame >= questionStart
    ? Math.sin((frame - questionStart) / fps * Math.PI * 3) * 8 : 0;

  // ── Stickman ────────────────────────────────────────────────────────
  const stickEmotion = frame < questionStart
    ? (stickmanEmotionBefore ?? "wide_eyes")
    : (stickmanEmotionAfter ?? "excited");

  return (
    <AbsoluteFill style={{ transform: `scale(${finalZoom})` }}>
      <AnimatedBg accentColor={accentColor} bgColor={bgColor} pulseSpeed={3} nebula />

      {/* Title */}
      <div style={{
        position: "absolute", top: 100, left: 0, right: 0, textAlign: "center",
        transform: `scale(${titleScale})`, opacity: titleOp,
      }}>
        <span style={{
          fontSize: 56, fontFamily: fontBangers, color: titleColor,
          textShadow: neonShadow(titleColor, 14), letterSpacing: 6,
        }}>
          {title}
        </span>
      </div>

      {/* Trick sentence typewriter */}
      <div style={{
        position: "absolute", top: 220, left: 50, right: 50,
        display: "flex", flexWrap: "wrap", justifyContent: "center",
        gap: "8px 12px", lineHeight: 1.8,
      }}>
        {sentenceTokens.map((tok: SentenceToken, i: number) => {
          const tw = typewriterStates[i];
          const isMake = tok.color != null && tok.color !== defaultTextColor;
          const tokColor = tok.color ?? defaultTextColor;

          return (
            <span key={i} style={{
              display: "inline-block",
              fontSize: isMake ? 52 : 44,
              fontFamily: isMake ? fontBangers : fontInter,
              fontWeight: isMake ? 900 : 600,
              color: isMake ? "#FFFFFF" : tokColor,
              WebkitTextStroke: isMake ? `2px ${tokColor}` : undefined,
              paintOrder: isMake ? "stroke fill" : undefined,
              opacity: tw.opacity,
              transform: `scale(${tw.scale})`,
              textShadow: isMake ? `0 0 6px ${tokColor}` : "0 2px 6px rgba(0,0,0,0.3)",
            }}>
              {tok.word}
            </span>
          );
        })}
      </div>

      {/* Question */}
      {question.visible && (
        <div style={{
          position: "absolute", top: "48%", left: 0, right: 0, textAlign: "center",
          transform: `scale(${question.scale})`, opacity: question.opacity,
        }}>
          <span style={{
            fontSize: 64, fontFamily: fontBangers, color: accentColor,
            textShadow: neonShadow(accentColor, 16), letterSpacing: 4,
          }}>
            {questionText}
          </span>
        </div>
      )}

      {/* Pointing arrow */}
      {frame >= questionStart && (
        <div style={{
          position: "absolute", top: "40%", left: "50%",
          transform: `translate(-50%, ${-40 + arrowBounce}px)`,
          opacity: interpolate(frame - questionStart, [0, 10], [0, 0.7], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          }),
        }}>
          <span style={{ fontSize: 48, color: titleColor }}>&#9757;&#65039;</span>
        </div>
      )}

      {/* Challenge */}
      {challenge.visible && (
        <div style={{
          position: "absolute", top: "62%", left: 0, right: 0, textAlign: "center",
          transform: `scale(${challenge.scale})`, opacity: challenge.opacity,
        }}>
          <span style={{
            fontSize: 72, fontFamily: fontBangers, color: challengeColor,
            textShadow: neonShadow(challengeColor, 20), letterSpacing: 6,
          }}>
            {challengeText}
          </span>
        </div>
      )}

      {/* Loop indicator */}
      {frame >= countStart + 20 && (
        <div style={{
          position: "absolute", bottom: 460, left: 0, right: 0,
          display: "flex", justifyContent: "center",
          opacity: interpolate(frame - countStart - 20, [0, 10], [0, 0.7], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          }),
        }}>
          <div style={{
            width: 70, height: 70, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            border: `2px solid ${accentColor}40`,
            boxShadow: `0 0 ${interpolate(Math.sin(t * Math.PI * 2), [-1, 1], [4, 16])}px ${accentColor}50`,
            transform: `rotate(${interpolate(frame, [0, 240], [0, 360])}deg)`,
          }}>
            <span style={{
              fontSize: 40,
              transform: `rotate(${interpolate(frame, [0, 240], [0, -360])}deg)`,
            }}>
              &#128260;
            </span>
          </div>
        </div>
      )}

      {/* Stickman */}
      <Stickman pose={stickmanPose ?? "pointing_up"} emotion={stickEmotion}
        x={460} y={1450} scale={1.5} />
    </AbsoluteFill>
  );
};
