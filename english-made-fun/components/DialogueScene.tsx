/**
 * DialogueScene.tsx
 * Chat-bubble scene with typewriter text animation and a stickman speaker.
 * Text reveals character-by-character using string slicing (never per-char opacity).
 * Bubble tail points toward the stickman on the left.
 */

import React from 'react';
import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  AbsoluteFill,
} from 'remotion';
import { Stickman, type Emotion } from './Stickman';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DialogueSceneProps {
  /** Name label shown above the bubble */
  speaker: string;
  /** Text revealed via typewriter animation */
  text: string;
  /** Bubble background color */
  bubbleColor?: string;
  /** Speaker's stickman emotion */
  emotion?: string;
  /** Background color for the scene */
  backgroundColor?: string;
}

// ─── Bubble Tail SVG ─────────────────────────────────────────────────────────
// Points left toward the stickman

const BubbleTail: React.FC<{ color: string }> = ({ color }) => (
  <svg
    width={36}
    height={28}
    style={{
      position: 'absolute',
      left: -34,
      bottom: 40,
    }}
    viewBox="0 0 36 28"
  >
    {/* Triangle pointing left */}
    <polygon points="36,0 36,28 0,14" fill={color} />
  </svg>
);

// ─── Speaker Label ────────────────────────────────────────────────────────────

const SpeakerLabel: React.FC<{ name: string; color: string }> = ({ name, color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const labelSpring = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 90, mass: 1.0 },
    durationInFrames: 24,
  });
  const translateY = interpolate(labelSpring, [0, 1], [15, 0]);
  const opacity = interpolate(labelSpring, [0, 1], [0, 1]);

  return (
    <div
      style={{
        transform: `translateY(${translateY}px)`,
        opacity,
        marginBottom: 10,
        color,
        fontSize: 32,
        fontFamily: 'sans-serif',
        fontWeight: 800,
        letterSpacing: 1,
        textTransform: 'uppercase',
      }}
    >
      {name}
    </div>
  );
};

// ─── Chat Bubble ─────────────────────────────────────────────────────────────

const ChatBubble: React.FC<{
  text: string;
  bubbleColor: string;
  textColor: string;
}> = ({ text, bubbleColor, textColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ── Bubble entrance: eases in from right ──────────────────────────────────
  const bubbleSpring = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 80, mass: 1.1 },
    durationInFrames: 30,
  });
  const bubbleScale = interpolate(bubbleSpring, [0, 1], [0.85, 1]);
  const bubbleOpacity = interpolate(bubbleSpring, [0, 1], [0, 1]);
  const translateX = interpolate(bubbleSpring, [0, 1], [40, 0]);

  // ── Typewriter: reveal text character by character ────────────────────────
  // Per Remotion best practices: always use string slicing, never per-char opacity.
  // Text reveal starts at 0.4s to let the bubble finish entering first.
  const revealDelay = Math.round(fps * 0.4);
  const charsPerSecond = 28; // natural reading pace
  const charsToShow = Math.max(
    0,
    Math.floor(
      interpolate(
        frame - revealDelay,
        [0, (text.length / charsPerSecond) * fps],
        [0, text.length],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
      )
    )
  );
  const displayText = text.slice(0, charsToShow);

  // ── Blinking cursor: visible while text is being typed ────────────────────
  const isTyping = charsToShow < text.length;
  const cursorVisible = isTyping && Math.floor(frame / 8) % 2 === 0;

  return (
    <div
      style={{
        position: 'relative',
        backgroundColor: bubbleColor,
        borderRadius: 24,
        padding: '32px 40px',
        minWidth: 400,
        maxWidth: 680,
        transform: `scale(${bubbleScale}) translateX(${translateX}px)`,
        opacity: bubbleOpacity,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        // transformOrigin: 'left center' so it scales from the tail side
        transformOrigin: 'left center',
      }}
    >
      {/* Bubble tail pointing toward the stickman on the left */}
      <BubbleTail color={bubbleColor} />

      {/* Text content — whiteSpace:pre preserves intentional line breaks */}
      <p
        style={{
          margin: 0,
          color: textColor,
          fontSize: 44,
          fontFamily: 'sans-serif',
          fontWeight: 700,
          lineHeight: 1.45,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {displayText}
        {/* Blinking cursor while typing */}
        {cursorVisible && (
          <span style={{ opacity: 1, color: textColor }}>|</span>
        )}
      </p>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const DialogueScene: React.FC<DialogueSceneProps> = ({
  speaker,
  text,
  bubbleColor = '#2563eb',
  emotion = 'happy',
  backgroundColor = '#1a1a2e',
}) => {
  const { width, height } = useVideoConfig();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Decide text color based on bubble brightness (simple heuristic: dark bubbles → white text)
  // Parse hex to determine lightness; fallback to white
  const isDarkBubble = (() => {
    const hex = bubbleColor.replace('#', '');
    if (hex.length === 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return (r * 299 + g * 587 + b * 114) / 1000 < 128;
    }
    return true;
  })();
  const textColor = isDarkBubble ? '#ffffff' : '#1a1a2e';
  const labelColor = '#FFD700';

  // ── Stickman entry spring ─────────────────────────────────────────────────
  const stickmanSpring = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 80, mass: 1.0 },
    durationInFrames: 30,
  });
  const stickmanX = interpolate(stickmanSpring, [0, 1], [-30, width * 0.2]);

  return (
    <AbsoluteFill style={{ backgroundColor }}>

      {/* ── Stickman: left side of screen ────────────────────────────────── */}
      <Stickman
        pose="standing"
        emotion={emotion as Emotion}
        x={stickmanX}
        y={height * 0.58}
        color="#ffffff"
      />

      {/* ── Bubble + speaker label: right of center ───────────────────────── */}
      <div
        style={{
          position: 'absolute',
          left: width * 0.32,
          top: height * 0.26,
          right: 60,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
        }}
      >
        <SpeakerLabel name={speaker} color={labelColor} />
        <ChatBubble
          text={text}
          bubbleColor={bubbleColor}
          textColor={textColor}
        />
      </div>

    </AbsoluteFill>
  );
};

export default DialogueScene;
