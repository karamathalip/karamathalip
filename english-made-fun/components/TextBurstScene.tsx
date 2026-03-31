/**
 * TextBurstScene.tsx
 * Text explodes onto screen with spring physics.
 * Supports four emphasis modes: zoom | shake | highlight | pop
 * Enhanced with gradient backgrounds, kinetic keyword scaling, and glow effects.
 * No CSS transitions — all animation driven by useCurrentFrame().
 */

import React from 'react';
import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Easing,
  AbsoluteFill,
} from 'remotion';

// ─── Types ───────────────────────────────────────────────────────────────────

export type TextBurstEmphasis = 'zoom' | 'shake' | 'highlight' | 'pop';

export interface TextBurstSceneProps {
  /** The full text string to display */
  text: string;
  /** Scene background color */
  backgroundColor?: string;
  /** Text color */
  textColor?: string;
  /** Animation emphasis mode */
  emphasis?: TextBurstEmphasis;
  /** Words to highlight in yellow (defaults to ALL_CAPS words) */
  keywords?: string[];
  /** Overrides composition durationInFrames for internal timing */
  durationInFrames?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns true if a word should be highlighted yellow */
function isKeyword(word: string, keywords: string[]): boolean {
  const clean = word.replace(/[^a-zA-Z0-9']/g, '');
  if (keywords.length > 0) {
    return keywords.some((kw) => kw.toLowerCase() === clean.toLowerCase());
  }
  // Default: highlight ALL_CAPS words (3+ chars to avoid "I", "A")
  return clean.length >= 3 && clean === clean.toUpperCase();
}

/** Darken a hex color for gradient bottom */
function darkenHex(hex: string, amount: number): string {
  const c = hex.replace('#', '');
  if (c.length !== 6) return hex;
  const r = Math.max(0, parseInt(c.substring(0, 2), 16) - amount);
  const g = Math.max(0, parseInt(c.substring(2, 4), 16) - amount);
  const b = Math.max(0, parseInt(c.substring(4, 6), 16) - amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Single word with keyword highlight + kinetic scale on keywords */
const Word: React.FC<{
  word: string;
  isHighlighted: boolean;
  textColor: string;
  emphasis: TextBurstEmphasis;
  wordIndex: number;
  totalWords: number;
}> = ({ word, isHighlighted, textColor, emphasis, wordIndex, totalWords }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ── Pop emphasis: each word springs in with a staggered delay ────────────
  const popDelay = wordIndex * 5;
  const popSpring = spring({
    frame: frame - popDelay,
    fps,
    config: { damping: 14, stiffness: 100, mass: 0.9 },
    durationInFrames: 30,
  });
  const popScale = emphasis === 'pop'
    ? interpolate(popSpring, [0, 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 1;
  const popOpacity = emphasis === 'pop'
    ? interpolate(frame - popDelay, [0, 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 1;

  // ── Keyword kinetic bounce: keywords scale up with a spring when they appear ──
  const keywordDelay = Math.round(fps * 0.6) + wordIndex * 4;
  const keywordSpring = spring({
    frame: frame - keywordDelay,
    fps,
    config: { damping: 10, stiffness: 140, mass: 0.8 },
    durationInFrames: 36,
  });
  const keywordScale = isHighlighted
    ? interpolate(keywordSpring, [0, 1], [0.7, 1.15], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 1;

  // ── Keyword glow pulse ──────────────────────────────────────────────────
  const glowIntensity = isHighlighted
    ? interpolate(
        Math.sin((frame / fps) * Math.PI * 1.5),
        [-1, 1],
        [4, 14]
      )
    : 0;

  const highlightBg = isHighlighted ? '#FFD700' : 'transparent';
  const highlightTextColor = isHighlighted ? '#1a1a2e' : textColor;

  return (
    <span
      style={{
        display: 'inline-block',
        transform: `scale(${popScale * keywordScale})`,
        opacity: popOpacity,
        backgroundColor: highlightBg,
        color: highlightTextColor,
        borderRadius: isHighlighted ? 10 : 0,
        padding: isHighlighted ? '4px 14px' : '0 4px',
        margin: '0 3px',
        textShadow: isHighlighted
          ? `0 0 ${glowIntensity}px #FFD700, 0 0 ${glowIntensity * 2}px rgba(255,215,0,0.4)`
          : `0 2px 8px rgba(0,0,0,0.5)`,
        // No CSS transition — transform recalculated every frame via spring
      }}
    >
      {word}
    </span>
  );
};

// ─── Background Gradient Layer ───────────────────────────────────────────────

const AnimatedBackground: React.FC<{
  backgroundColor: string;
  frame: number;
  fps: number;
  duration: number;
}> = ({ backgroundColor, frame, fps, duration }) => {
  // Subtle gradient shift: radial gradient center moves slowly
  const cx = interpolate(frame, [0, duration], [40, 60], { extrapolateRight: 'clamp' });
  const cy = interpolate(frame, [0, duration], [45, 55], { extrapolateRight: 'clamp' });

  const darkerBg = darkenHex(backgroundColor, 30);

  // Subtle vignette pulse
  const vignetteOpacity = interpolate(
    Math.sin((frame / fps) * Math.PI * 0.3),
    [-1, 1],
    [0.3, 0.5]
  );

  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at ${cx}% ${cy}%, ${backgroundColor} 0%, ${darkerBg} 100%)`,
        }}
      />
      {/* Vignette overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at 50% 50%, transparent 50%, rgba(0,0,0,${vignetteOpacity}) 100%)`,
        }}
      />
    </>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const TextBurstScene: React.FC<TextBurstSceneProps> = ({
  text,
  backgroundColor = '#1a1a2e',
  textColor = '#ffffff',
  emphasis = 'pop',
  keywords = [],
  durationInFrames: durationProp,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames: compDuration } = useVideoConfig();
  const duration = durationProp ?? compDuration;

  const words = text.split(' ').filter(Boolean);

  // ── Entrance spring: entire block eases in from scale 0 ───────────────────
  const entranceSpring = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 80, mass: 1.1 },
    durationInFrames: 36,
  });
  const entranceScale = interpolate(entranceSpring, [0, 1], [0, 1]);

  // ── Zoom emphasis: slow continuous scale-up over the scene ────────────────
  const zoomScale = emphasis === 'zoom'
    ? interpolate(frame, [0, duration], [1, 1.18], {
        extrapolateRight: 'clamp',
        easing: Easing.out(Easing.quad),
      })
    : 1;

  // ── Shake emphasis: gentle translateX oscillation driven by sine ──────────
  const shakeX = emphasis === 'shake'
    ? Math.sin((frame / fps) * Math.PI * 6) *
      interpolate(frame, [0, fps * 0.5, fps * 2], [5, 5, 0], {
        extrapolateRight: 'clamp',
      })
    : 0;

  // ── Combined transform for the whole block ────────────────────────────────
  const combinedScale = entranceScale * zoomScale;

  // ── Exit fade: smooth fade out in the last 24 frames ──────────────────────
  const exitOpacity = interpolate(
    frame,
    [duration - 24, duration],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // ── Highlight mode: pulsing underline bar ─────────────────────────────────
  const highlightBarOpacity = emphasis === 'highlight'
    ? interpolate(Math.abs(Math.sin((frame / fps) * Math.PI * 1.2)), [0, 1], [0.3, 0.7])
    : 0;

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        padding: '60px 80px',
      }}
    >
      {/* Animated gradient background */}
      <AnimatedBackground
        backgroundColor={backgroundColor}
        frame={frame}
        fps={fps}
        duration={duration}
      />

      {/* Highlight mode: animated background glow bar */}
      {emphasis === 'highlight' && (
        <div
          style={{
            position: 'absolute',
            bottom: '38%',
            left: '10%',
            right: '10%',
            height: 6,
            backgroundColor: '#FFD700',
            borderRadius: 3,
            opacity: highlightBarOpacity,
          }}
        />
      )}

      {/* Main text block */}
      <div
        style={{
          transform: `scale(${combinedScale}) translateX(${shakeX}px)`,
          opacity: exitOpacity,
          textAlign: 'center',
          lineHeight: 1.4,
          zIndex: 10,
        }}
      >
        <div
          style={{
            fontSize: 72,
            fontFamily: 'sans-serif',
            fontWeight: 900,
            color: textColor,
            letterSpacing: -1,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {words.map((word, i) => (
            <Word
              key={`${word}-${i}`}
              word={word}
              isHighlighted={isKeyword(word, keywords)}
              textColor={textColor}
              emphasis={emphasis}
              wordIndex={i}
              totalWords={words.length}
            />
          ))}
        </div>
      </div>

      {/* Pop mode: starburst radial lines behind text */}
      {emphasis === 'pop' && (
        <svg
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.10 }}
          viewBox="0 0 1080 1920"
        >
          {[0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5].map((angle, i) => {
            const rad = (angle * Math.PI) / 180;
            const len = interpolate(entranceSpring, [0, 1], [0, 600]);
            return (
              <line
                key={i}
                x1={540}
                y1={960}
                x2={540 + Math.cos(rad) * len}
                y2={960 + Math.sin(rad) * len}
                stroke={textColor}
                strokeWidth={2.5}
              />
            );
          })}
        </svg>
      )}

      {/* Zoom mode: subtle radial light burst */}
      {emphasis === 'zoom' && (
        <div
          style={{
            position: 'absolute',
            width: '60%',
            height: '30%',
            borderRadius: '50%',
            background: `radial-gradient(ellipse, rgba(255,255,255,0.06) 0%, transparent 70%)`,
            top: '35%',
            left: '20%',
            transform: `scale(${interpolate(frame, [0, duration], [0.8, 1.3], { extrapolateRight: 'clamp' })})`,
          }}
        />
      )}
    </AbsoluteFill>
  );
};

export default TextBurstScene;
