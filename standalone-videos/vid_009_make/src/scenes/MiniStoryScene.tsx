/**
 * MiniStoryScene.tsx â€” v2: Word-by-word typewriter with color-flash verbs
 *
 * VO: "watch all three in one sentence. she makes great money
 *      making youtube videos which makes her followers happy."
 *
 * Beat sheet:
 *   0.0â€“1.0s  Title "ALL 3 IN ONE SENTENCE" slides in
 *   1.0â€“6.0s  Word-by-word typewriter, color-flash on each "make" verb
 *   6.0â€“7.5s  Non-overlapping label tags with legend
 *   Stickman nodding throughout
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
import { COLORS } from "../constants";
import { fontBangers, fontInter } from "../fonts";

interface WordToken {
  text: string;
  color?: string;
  label?: string;
}

// Tokenized sentence with colored verbs
const WORDS: WordToken[] = [
  { text: "She" },
  { text: "makes", color: COLORS.earn, label: "EARN" },
  { text: "great" },
  { text: "money" },
  { text: "making", color: COLORS.create, label: "CREATE" },
  { text: "YouTube" },
  { text: "videos" },
  { text: "which" },
  { text: "makes", color: COLORS.force, label: "CAUSE" },
  { text: "her" },
  { text: "followers" },
  { text: "happy." },
];

export const MiniStoryScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  // â”€â”€ Beat timing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const typeStart = Math.round(1.0 * fps);
  const wordInterval = Math.round(0.38 * fps);
  const labelsStart = Math.round(6.0 * fps);

  // â”€â”€ Title entrance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const titleSpring = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 100 },
    durationInFrames: 20,
  });
  const titleOp = interpolate(titleSpring, [0, 1], [0, 1]);
  const titleY = interpolate(titleSpring, [0, 1], [-30, 0]);

  return (
    <AbsoluteFill>
      <AnimatedBg accentColor="#6644aa" pulseSpeed={0.6} particles />

      {/* Title */}
      <div
        style={{
          position: "absolute",
          top: 120,
          left: 0,
          right: 0,
          textAlign: "center",
          transform: `translateY(${titleY}px)`,
          opacity: titleOp,
        }}
      >
        <span
          style={{
            fontSize: 38,
            fontFamily: fontBangers,
            color: COLORS.textDim,
            letterSpacing: 4,
          }}
        >
          ALL 3 IN ONE SENTENCE:
        </span>
      </div>

      {/* Word-by-word typewriter sentence */}
      <div
        style={{
          position: "absolute",
          top: 240,
          left: 50,
          right: 50,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "8px 12px",
          lineHeight: 2.2,
        }}
      >
        {WORDS.map((w, i) => {
          const wordFrame = typeStart + i * wordInterval;
          const visible = frame >= wordFrame;
          const isMake = !!w.color;

          const popSpring = spring({
            frame: frame - wordFrame,
            fps,
            config: { damping: 12, stiffness: 160 },
            durationInFrames: 16,
          });
          const scale = interpolate(popSpring, [0, 1], [0.6, 1]);

          // Color flash â€” brief bright pulse on make words
          const flashAge = (frame - wordFrame) / fps;
          const flashBright =
            isMake && flashAge >= 0 && flashAge < 0.4
              ? interpolate(flashAge, [0, 0.15, 0.4], [1.5, 2.0, 1.0])
              : 1.0;

          // Label tag â€” appears after labelsStart
          const showLabel = isMake && frame >= labelsStart;
          const labelDelay = labelsStart + (i * 10);
          const labelOp = showLabel
            ? interpolate(frame - labelDelay, [0, 12], [0, 0.9], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              })
            : 0;
          const labelYOff = showLabel
            ? interpolate(frame - labelDelay, [0, 12], [10, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              })
            : 10;

          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                position: "relative",
                fontSize: isMake ? 50 : 44,
                fontFamily: isMake ? fontBangers : fontInter,
                fontWeight: isMake ? 900 : 600,
                color: isMake ? "#FFFFFF" : (w.color ?? COLORS.text),
                WebkitTextStroke: isMake ? `2px ${w.color}` : undefined,
                paintOrder: isMake ? 'stroke fill' : undefined,
                opacity: visible ? 1 : 0,
                transform: `scale(${visible ? scale : 0})`,
                textShadow: isMake
                  ? `0 0 6px ${w.color}`
                  : "0 2px 6px rgba(0,0,0,0.3)",
                filter: isMake ? `brightness(${flashBright})` : undefined,
              }}
            >
              {w.text}
              {/* Underline */}
              {isMake && visible && (
                <div
                  style={{
                    position: "absolute",
                    bottom: -2,
                    left: 0,
                    right: 0,
                    height: 3,
                    backgroundColor: w.color,
                    borderRadius: 2,
                    boxShadow: `0 0 6px ${w.color}`,
                    transform: `scaleX(${interpolate(
                      frame - wordFrame,
                      [0, 12],
                      [0, 1],
                      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
                    )})`,
                    transformOrigin: "left",
                  }}
                />
              )}
              {/* Label tag below â€” non-overlapping */}
              {isMake && (
                <span
                  style={{
                    position: "absolute",
                    bottom: -30,
                    left: "50%",
                    transform: `translateX(-50%) translateY(${labelYOff}px)`,
                    fontSize: 20,
                    fontFamily: fontBangers,
                    color: w.color,
                    letterSpacing: 2,
                    whiteSpace: "nowrap",
                    opacity: labelOp,
                    textShadow: `0 0 8px ${w.color}40`,
                  }}
                >
                  ({w.label})
                </span>
              )}
            </span>
          );
        })}
      </div>

      {/* Stickman â€” nodding */}
      <Stickman
        pose="nodding"
        emotion="happy"
        x={540}
        y={1500}
        scale={1.4}
      />
    </AbsoluteFill>
  );
};
