/**
 * MiniStoryScene.tsx — Data-driven word-by-word typewriter with color-flash verbs
 *
 * Beat sheet:
 *   0.0–1.0s  Title slides in
 *   1.0–6.0s  Word-by-word typewriter, color-flash on target verbs
 *   6.0–end   Non-overlapping label tags with legend
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
import { fontBangers, fontInter } from "../utils/fonts";
import type { MiniStorySceneData, SentenceToken } from "../types/video-config";

export interface MiniStorySceneProps {
  data: MiniStorySceneData;
  defaultTextColor?: string;
  bgColor?: string;
}

interface WordToken extends SentenceToken {
  label?: string;
}

export const MiniStoryScene: React.FC<MiniStorySceneProps> = ({
  data,
  defaultTextColor = "#ffffff",
  bgColor,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const { title, bgAccent, wordTokens, stickmanPose, stickmanEmotion } = data;

  // ── Beat timing ────────────────────────────────────────────────────
  const typeStart = Math.round(1.0 * fps);
  const wordInterval = Math.round(0.38 * fps);
  const labelsStart = Math.round(6.0 * fps);

  // ── Title entrance ─────────────────────────────────────────────────
  const titleSpring = spring({
    frame, fps, config: { damping: 14, stiffness: 100 }, durationInFrames: 20,
  });
  const titleOp = interpolate(titleSpring, [0, 1], [0, 1]);
  const titleY = interpolate(titleSpring, [0, 1], [-30, 0]);

  return (
    <AbsoluteFill>
      <AnimatedBg accentColor={bgAccent} bgColor={bgColor} pulseSpeed={0.6} particles />

      {/* Title */}
      <div style={{
        position: "absolute", top: 120, left: 0, right: 0, textAlign: "center",
        transform: `translateY(${titleY}px)`, opacity: titleOp,
      }}>
        <span style={{
          fontSize: 38, fontFamily: fontBangers, color: "#8888aa", letterSpacing: 4,
        }}>
          {title}
        </span>
      </div>

      {/* Word-by-word typewriter */}
      <div style={{
        position: "absolute", top: 240, left: 50, right: 50,
        display: "flex", flexWrap: "wrap", justifyContent: "center",
        gap: "8px 12px", lineHeight: 2.2,
      }}>
        {(wordTokens as WordToken[]).map((w, i) => {
          const wordFrame = typeStart + i * wordInterval;
          const visible = frame >= wordFrame;
          const isMake = !!w.color && w.color !== defaultTextColor;

          const popSpring = spring({
            frame: frame - wordFrame, fps,
            config: { damping: 12, stiffness: 160 }, durationInFrames: 16,
          });
          const scale = interpolate(popSpring, [0, 1], [0.6, 1]);

          // Color flash on target words
          const flashAge = (frame - wordFrame) / fps;
          const flashBright =
            isMake && flashAge >= 0 && flashAge < 0.4
              ? interpolate(flashAge, [0, 0.15, 0.4], [1.5, 2.0, 1.0])
              : 1.0;

          // Label tag
          const showLabel = isMake && frame >= labelsStart;
          const labelDelay = labelsStart + i * 10;
          const labelOp = showLabel
            ? interpolate(frame - labelDelay, [0, 12], [0, 0.9], {
                extrapolateLeft: "clamp", extrapolateRight: "clamp",
              })
            : 0;
          const labelYOff = showLabel
            ? interpolate(frame - labelDelay, [0, 12], [10, 0], {
                extrapolateLeft: "clamp", extrapolateRight: "clamp",
              })
            : 10;

          const tokColor = w.color ?? defaultTextColor;

          return (
            <span key={i} style={{
              display: "inline-block", position: "relative",
              fontSize: isMake ? 50 : 44,
              fontFamily: isMake ? fontBangers : fontInter,
              fontWeight: isMake ? 900 : 600,
              color: isMake ? "#FFFFFF" : tokColor,
              WebkitTextStroke: isMake ? `2px ${tokColor}` : undefined,
              paintOrder: isMake ? "stroke fill" : undefined,
              opacity: visible ? 1 : 0,
              transform: `scale(${visible ? scale : 0})`,
              textShadow: isMake ? `0 0 6px ${tokColor}` : "0 2px 6px rgba(0,0,0,0.3)",
              filter: isMake ? `brightness(${flashBright})` : undefined,
            }}>
              {w.word}
              {/* Underline */}
              {isMake && visible && (
                <div style={{
                  position: "absolute", bottom: -2, left: 0, right: 0, height: 3,
                  backgroundColor: tokColor, borderRadius: 2, boxShadow: `0 0 6px ${tokColor}`,
                  transform: `scaleX(${interpolate(frame - wordFrame, [0, 12], [0, 1], {
                    extrapolateLeft: "clamp", extrapolateRight: "clamp",
                  })})`,
                  transformOrigin: "left",
                }} />
              )}
              {/* Label tag */}
              {isMake && w.label && (
                <span style={{
                  position: "absolute", bottom: -30, left: "50%",
                  transform: `translateX(-50%) translateY(${labelYOff}px)`,
                  fontSize: 20, fontFamily: fontBangers, color: tokColor,
                  letterSpacing: 2, whiteSpace: "nowrap", opacity: labelOp,
                  textShadow: `0 0 8px ${tokColor}40`,
                }}>
                  ({w.label})
                </span>
              )}
            </span>
          );
        })}
      </div>

      {/* Stickman */}
      <Stickman pose={stickmanPose ?? "nodding"} emotion={stickmanEmotion ?? "happy"}
        x={540} y={1500} scale={1.4} />
    </AbsoluteFill>
  );
};
