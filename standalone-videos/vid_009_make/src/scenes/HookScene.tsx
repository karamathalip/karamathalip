/**
 * HookScene.tsx — v2: Typewriter hook + "WAIT" slam + MAKE preview
 *
 * VO: "she made me a cake to make me cry so she could make money.
 *      wait. that sentence uses make three completely different ways."
 *
 * Beat sheet:
 *   0.0–4.5s  Typewriter sentence with colored MAKEs
 *   4.5–5.5s  "WAIT." slam text
 *   5.5–8.5s  Three MAKE words fly apart, stickman reacts
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
import { COLORS, neonShadow } from "../constants";
import { fontBangers, fontInter } from "../fonts";

// Sentence tokens with colored "made/make" words
const SENTENCE_TOKENS = [
  { word: "she", color: COLORS.text },
  { word: "made", color: COLORS.create },
  { word: "me", color: COLORS.text },
  { word: "a", color: COLORS.text },
  { word: "cake", color: COLORS.text },
  { word: "to", color: COLORS.text },
  { word: "make", color: COLORS.force },
  { word: "me", color: COLORS.text },
  { word: "cry", color: COLORS.text },
  { word: "so", color: COLORS.text },
  { word: "she", color: COLORS.text },
  { word: "could", color: COLORS.text },
  { word: "make", color: COLORS.earn },
  { word: "money.", color: COLORS.text },
];

// Replacement words that fade in when colored makes fly away
const REPLACEMENT_MAP: Record<number, string> = {
  1: "CREATE",   // "made" → CREATE
  6: "FORCE",    // "make" → FORCE
  12: "EARN",    // "make" → EARN
};

export const HookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  // ── Beat timing ──────────────────────────────────────────────────────
  const typewriterEnd = 4.5 * fps;   // 270
  const waitSlam = 4.5 * fps;        // 270
  const waitEnd = 5.5 * fps;         // 330
  const detachStart = 5.5 * fps;     // 330

  // ── Typewriter — one word every ~18 frames ──────────────────────────
  const wordsPerSec = 3.1;
  const wordInterval = fps / wordsPerSec;

  // ── WAIT slam spring ────────────────────────────────────────────────
  const waitSpring = spring({
    frame: frame - waitSlam,
    fps,
    config: { damping: 6, stiffness: 200, mass: 0.8 },
    durationInFrames: 30,
  });
  const waitScale = interpolate(waitSpring, [0, 1], [3, 1]);
  const waitOp = interpolate(frame - waitSlam, [0, 4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Fade out WAIT after a beat
  const waitFade = interpolate(frame, [waitEnd - 10, waitEnd], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Stickman transitions: idle → confused → shocked → tracking
  const stickPose =
    t < 1.5 ? "idle" :
    t < 3.0 ? "confused" :
    t < 5.0 ? "shocked" :
    "tracking";
  const stickEmotion =
    t < 1.5 ? "neutral" :
    t < 3.0 ? "confused" :
    t < 5.0 ? "wow" :
    "wide_eyes";

  return (
    <AbsoluteFill>
      <AnimatedBg accentColor={COLORS.primary} pulseSpeed={2.5} />

      {/* Typewriter sentence — center screen */}
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
        {SENTENCE_TOKENS.map((tok, i) => {
          const wordFrame = Math.floor(i * wordInterval);
          const visible = frame >= wordFrame;
          const isMake = tok.color !== COLORS.text;
          const popSpring = spring({
            frame: frame - wordFrame,
            fps,
            config: { damping: 12, stiffness: 180 },
            durationInFrames: 14,
          });
          const scale = interpolate(popSpring, [0, 1], [0.5, 1]);

          // After detach phase, hide the colored makes
          const hideAfterDetach =
            isMake && frame > detachStart + 20 ? 0 : 1;

          // Replacement word fades in when original hides
          const replacement = REPLACEMENT_MAP[i];
          const replaceStart = detachStart + 20;
          const replaceOp = replacement && frame > replaceStart
            ? interpolate(frame - replaceStart, [0, 18], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              })
            : 0;

          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                position: "relative",
                fontSize: isMake ? 54 : 46,
                fontFamily: isMake ? fontBangers : fontInter,
                fontWeight: isMake ? 900 : 600,
                color: isMake ? "#FFFFFF" : tok.color,
                WebkitTextStroke: isMake ? `2px ${tok.color}` : undefined,
                paintOrder: isMake ? 'stroke fill' : undefined,
                textShadow: isMake
                  ? `0 0 6px ${tok.color}`
                  : "0 2px 8px rgba(0,0,0,0.5)",
                opacity: visible ? (replacement ? 1 : hideAfterDetach) : 0,
                transform: `scale(${visible ? scale : 0})`,
              }}
            >
              {replacement ? (
                <span style={{ opacity: hideAfterDetach }}>{tok.word}</span>
              ) : (
                tok.word
              )}
              {/* Replacement word overlay */}
              {replacement && replaceOp > 0 && (
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
                    WebkitTextStroke: `2px ${tok.color}`,
                    paintOrder: 'stroke fill',
                    textShadow: `0 0 6px ${tok.color}`,
                    opacity: replaceOp,
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                  }}
                >
                  {replacement}
                </span>
              )}
            </span>
          );
        })}
      </div>

      {/* WAIT. slam */}
      {frame >= waitSlam && (
        <div
          style={{
            position: "absolute",
            top: "48%",
            left: 0,
            right: 0,
            textAlign: "center",
            transform: `scale(${waitScale})`,
            opacity: waitOp * waitFade,
          }}
        >
          <span
            style={{
              fontSize: 120,
              fontFamily: fontBangers,
              color: COLORS.hero,
              textShadow: neonShadow(COLORS.hero, 20),
              letterSpacing: 10,
            }}
          >
            WAIT.
          </span>
        </div>
      )}

      {/* Stickman — idle → confused → shocked → tracking */}
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
