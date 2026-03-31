/**
 * TextBurstScene.tsx
 * Text explodes onto screen with spring physics.
 * Supports four emphasis modes: zoom | shake | highlight | pop
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

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Single word with optional yellow keyword highlight */
const Word: React.FC<{
  word: string;
  isHighlighted: boolean;
  textColor: string;
  emphasis: TextBurstEmphasis;
  wordIndex: number;
}> = ({ word, isHighlighted, textColor, emphasis, wordIndex }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ── Pop emphasis: each word springs in with a staggered delay ────────────
  const popDelay = wordIndex * 5; // 5 frames between each word
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

  const highlightBg = isHighlighted && emphasis === 'highlight'
    ? '#FFD700'
    : isHighlighted
    ? '#FFD700'
    : 'transparent';

  const highlightTextColor = isHighlighted ? '#1a1a2e' : textColor;

  return (
    <span
      style={{
        display: 'inline-block',
        transform: `scale(${popScale})`,
        opacity: popOpacity,
        backgroundColor: highlightBg,
        color: highlightTextColor,
        borderRadius: isHighlighted ? 8 : 0,
        padding: isHighlighted ? '2px 10px' : '0 4px',
        margin: '0 2px',
        // No CSS transition — transform recalculated every frame via spring
      }}
    >
      {word}
    </span>
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
    ? interpolate(frame, [0, duration], [1, 1.22], {
        extrapolateRight: 'clamp',
        easing: Easing.out(Easing.quad),
      })
    : 1;

  // ── Shake emphasis: gentle translateX oscillation driven by sine ──────────
  // Using Math.sin on frame directly (no CSS animation) — recalculated each frame
  const shakeX = emphasis === 'shake'
    ? Math.sin((frame / fps) * Math.PI * 6) *
      interpolate(frame, [0, fps * 0.5, fps * 2], [5, 5, 0], {
        extrapolateRight: 'clamp',
      })
    : 0;

  // ── Highlight emphasis: pulsing glow behind highlighted words ─────────────
  // (individual word backgrounds — no extra transform needed at container level)

  // ── Combined transform for the whole block ────────────────────────────────
  const combinedScale = entranceScale * zoomScale;

  // ── Exit fade: fade out in the last 20 frames (smoother exit) ──────────────
  const exitOpacity = interpolate(
    frame,
    [duration - 20, duration],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // ── Emphasis-specific background effect ───────────────────────────────────
  // 'highlight' mode: add a glowing underline bar that pulses
  const highlightBarOpacity = emphasis === 'highlight'
    ? interpolate(Math.abs(Math.sin((frame / fps) * Math.PI * 1.2)), [0, 1], [0.3, 0.7])
    : 0;

  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        justifyContent: 'center',
        alignItems: 'center',
        padding: '60px 80px',
      }}
    >
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
          // transformOrigin default 'center' is correct
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
            />
          ))}
        </div>
      </div>

      {/* Pop mode: starburst radial lines behind text */}
      {emphasis === 'pop' && (
        <svg
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.12 }}
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
                strokeWidth={3}
              />
            );
          })}
        </svg>
      )}
    </AbsoluteFill>
  );
};

export default TextBurstScene;
