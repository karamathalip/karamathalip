/**
 * DialogueScene.tsx
 * Chat-bubble scene with typewriter text animation and a stickman speaker.
 * Enhanced with gradient backgrounds, glowing bubble, and smoother animations.
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
  Img,
  staticFile,
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
  /** Speaker's scripted action / pose */
  stickmanAction?: string;
  /** Background color for the scene */
  backgroundColor?: string;
  /** Optional generated background plate */
  backgroundImage?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function darkenHex(hex: string, amount: number): string {
  const c = hex.replace('#', '');
  if (c.length !== 6) return hex;
  const r = Math.max(0, parseInt(c.substring(0, 2), 16) - amount);
  const g = Math.max(0, parseInt(c.substring(2, 4), 16) - amount);
  const b = Math.max(0, parseInt(c.substring(4, 6), 16) - amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ─── Bubble Tail SVG ─────────────────────────────────────────────────────────

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
        textShadow: `0 0 12px ${color}, 0 2px 6px rgba(0,0,0,0.5)`,
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
  const revealDelay = Math.round(fps * 0.4);
  const charsPerSecond = 28;
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

  const isTyping = charsToShow < text.length;
  const cursorVisible = isTyping && Math.floor(frame / 8) % 2 === 0;

  // ── Bubble glow pulse ─────────────────────────────────────────────────────
  const glowIntensity = interpolate(
    Math.sin((frame / fps) * Math.PI * 1.2),
    [-1, 1],
    [8, 20]
  );

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
        boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 ${glowIntensity}px rgba(255,255,255,0.08)`,
        transformOrigin: 'left center',
      }}
    >
      <BubbleTail color={bubbleColor} />

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
  stickmanAction = 'standing',
  backgroundColor = '#1a1a2e',
  backgroundImage,
}) => {
  const { width, height, fps, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();

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

  // ── Animated gradient background ──────────────────────────────────────────
  const darkerBg = darkenHex(backgroundColor, 30);
  const gradCx = interpolate(frame, [0, durationInFrames], [38, 62], { extrapolateRight: 'clamp' });
  const gradCy = interpolate(frame, [0, durationInFrames], [42, 55], { extrapolateRight: 'clamp' });
  const backgroundSrc = backgroundImage
    ? (/^(https?:|data:|file:)/i.test(backgroundImage) ? backgroundImage : staticFile(backgroundImage))
    : null;

  // ── Stickman entry spring ─────────────────────────────────────────────────
  const stickmanSpring = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 80, mass: 1.0 },
    durationInFrames: 30,
  });
  const stickmanX = interpolate(stickmanSpring, [0, 1], [-30, width * 0.2]);

  // Ken Burns drift: subtle zoom + pan over scene duration
  const kbScale = interpolate(frame, [0, durationInFrames], [1.0, 1.03], { extrapolateRight: 'clamp' });
  const kbTranslateX = interpolate(frame, [0, durationInFrames], [0, -8], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ transform: `scale(${kbScale}) translateX(${kbTranslateX}px)` }}>

      {backgroundSrc && (
        <Img
          src={backgroundSrc}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: 0.5,
            filter: 'saturate(1.04) contrast(1.06) brightness(0.97)',
            transform: 'scale(1.06)',
          }}
        />
      )}

      {/* ── Gradient background ──────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at ${gradCx}% ${gradCy}%, ${backgroundColor} 0%, ${darkerBg} 100%)`,
          opacity: backgroundSrc ? 0.56 : 1,
        }}
      />

      {/* ── Vignette ─────────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(0,0,0,${backgroundSrc ? '0.2' : '0.35'}) 100%)`,
        }}
      />

      {/* ── Stickman: left side of screen ────────────────────────────────── */}
      <Stickman
        pose={stickmanAction}
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
          zIndex: 10,
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
