/**
 * HookScene.tsx — Data-driven typewriter hook + slam text + word preview
 *
 * Beat sheet:
 *   0.0–4.5s  Typewriter sentence with colored target words
 *   4.5–5.5s  Slam text (e.g. "WAIT.")
 *   5.5–end   Target words fly apart, replacements appear
 *
 * ALL content comes via props — zero hardcoded word data.
 */

import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  AbsoluteFill,
} from "remotion";
import { AnimatedBg } from "../components/AnimatedBg";
import { Stickman } from "../components/Stickman";
import { neonShadow } from "../utils/colors";
import { fontBangers, fontInter } from "../utils/fonts";
import { useTypewriter } from "../hooks/useTypewriter";
import { useWordHighlight } from "../hooks/useWordHighlight";
import { useSlamText } from "../hooks/useSlamText";
import { useBeatTiming } from "../hooks/useBeatTiming";
import type { HookSceneData, SentenceToken } from "../types/video-config";

export interface HookSceneProps {
  data: HookSceneData;
  /** Default text color for non-target words */
  defaultTextColor?: string;
  /** Background colors */
  bgColor?: string;
}

export const HookScene: React.FC<HookSceneProps> = ({
  data,
  defaultTextColor = "#ffffff",
  bgColor,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const {
    sentenceTokens,
    replacementMap,
    slamText,
    slamColor,
    accentColor,
    stickmanTransitions,
  } = data;

  // ── Beat timing ──────────────────────────────────────────────────────
  const beatTiming = useBeatTiming(undefined, {
    typewriter_end: 4.5,
    slam_start: 4.5,
    slam_end: 5.5,
    detach_start: 5.5,
  });

  const slamStartFrame = beatTiming.getFrame("slam_start");
  const slamEndFrame = beatTiming.getFrame("slam_end");
  const detachStartFrame = beatTiming.getFrame("detach_start");

  // ── Typewriter ───────────────────────────────────────────────────────
  const typewriterStates = useTypewriter({
    tokens: sentenceTokens,
    wordsPerSec: 3.1,
  });

  // ── Word highlight / detach ──────────────────────────────────────────
  const highlightStates = useWordHighlight({
    tokens: sentenceTokens,
    defaultTextColor,
    replacementMap,
    detachStartFrame,
  });

  // ── Slam text ────────────────────────────────────────────────────────
  const slam = useSlamText({
    startFrame: slamStartFrame,
    endFrame: slamEndFrame,
  });

  // ── Stickman transitions ─────────────────────────────────────────────
  let stickPose = "idle";
  let stickEmotion = "neutral";
  for (const trans of stickmanTransitions) {
    if (t >= trans.timeSec) {
      stickPose = trans.pose;
      stickEmotion = trans.emotion;
    }
  }

  return (
    <AbsoluteFill>
      <AnimatedBg accentColor={accentColor} bgColor={bgColor} pulseSpeed={2.5} />

      {/* Typewriter sentence */}
      <div
        style={{
          position: "absolute",
          top: "18%",
          left: 60,
          right: 60,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "8px 12px",
          lineHeight: 1.6,
        }}
      >
        {sentenceTokens.map((tok: SentenceToken, i: number) => {
          const tw = typewriterStates[i];
          const hl = highlightStates[i];
          const isMake = hl.isHighlighted;
          const tokColor = tok.color ?? defaultTextColor;

          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                position: "relative",
                fontSize: isMake ? 54 : 46,
                fontFamily: isMake ? fontBangers : fontInter,
                fontWeight: isMake ? 900 : 600,
                color: isMake ? "#FFFFFF" : tokColor,
                WebkitTextStroke: isMake ? `2px ${tokColor}` : undefined,
                paintOrder: isMake ? "stroke fill" : undefined,
                textShadow: isMake
                  ? `0 0 6px ${tokColor}`
                  : "0 2px 8px rgba(0,0,0,0.5)",
                opacity: tw.visible
                  ? hl.replacement ? 1 : hl.originalOpacity
                  : 0,
                transform: `scale(${tw.scale})`,
              }}
            >
              {hl.replacement ? (
                <span style={{ opacity: hl.originalOpacity }}>{tok.word}</span>
              ) : (
                tok.word
              )}
              {/* Replacement overlay */}
              {hl.replacement && hl.replacementOpacity > 0 && (
                <span
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    transform: "translate(-50%, -50%)",
                    fontSize: 48,
                    fontFamily: fontBangers,
                    fontWeight: 900,
                    color: "#FFFFFF",
                    WebkitTextStroke: `2px ${tokColor}`,
                    paintOrder: "stroke fill",
                    textShadow: `0 0 6px ${tokColor}`,
                    opacity: hl.replacementOpacity,
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                  }}
                >
                  {hl.replacement}
                </span>
              )}
            </span>
          );
        })}
      </div>

      {/* Slam text */}
      {slam.visible && (
        <div
          style={{
            position: "absolute",
            top: "48%",
            left: 0,
            right: 0,
            textAlign: "center",
            transform: `scale(${slam.scale})`,
            opacity: slam.opacity,
          }}
        >
          <span
            style={{
              fontSize: 120,
              fontFamily: fontBangers,
              color: slamColor,
              textShadow: neonShadow(slamColor, 20),
              letterSpacing: 10,
            }}
          >
            {slamText}
          </span>
        </div>
      )}

      {/* Stickman */}
      <Stickman
        pose={stickPose}
        emotion={stickEmotion}
        x={540}
        y={1500}
        scale={1.3}
        trackX={540}
      />
    </AbsoluteFill>
  );
};
