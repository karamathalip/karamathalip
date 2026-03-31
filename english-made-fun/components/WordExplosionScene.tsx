/**
 * WordExplosionScene.tsx
 * A vocabulary reveal scene: the word explodes to fill the screen,
 * then meaning cards fade in sequentially with neon glow.
 * All glow and color effects are inline style values recalculated each frame —
 * no CSS transitions, no CSS animations.
 */

import React from 'react';
import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Easing,
  AbsoluteFill,
  Sequence,
} from 'remotion';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MeaningItem {
  text: string;
  /** Single emoji or short string used as icon */
  icon: string;
}

export interface WordExplosionSceneProps {
  word: string;
  meanings: MeaningItem[];
  backgroundColor?: string;
  /** Neon accent color for glow effects */
  accentColor?: string;
}

// ─── Neon glow helper ─────────────────────────────────────────────────────────
// Returns a pulsing textShadow string based on the current frame.
// Computed each frame — this is an inline style value, NOT a CSS animation.
function buildNeonShadow(color: string, intensity: number): string {
  return [
    `0 0 ${intensity}px ${color}`,
    `0 0 ${intensity * 2}px ${color}`,
    `0 0 ${intensity * 4}px ${color}`,
  ].join(', ');
}

// ─── Big Word ─────────────────────────────────────────────────────────────────

const BigWord: React.FC<{
  word: string;
  color: string;
  accentColor: string;
  shrinkAfter: number; // frame at which the word compresses to make room for meanings
}> = ({ word, color, accentColor, shrinkAfter }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ── Phase 1 (0→shrinkAfter): word explodes in from nothing ───────────────
  const explosionSpring = spring({
    frame,
    fps,
    config: { damping: 5, stiffness: 120, mass: 1.2 }, // very bouncy explosion
    durationInFrames: 30,
  });
  const phase1Scale = interpolate(explosionSpring, [0, 1], [0, 1]);

  // ── Phase 2 (shrinkAfter→): word compresses upward to header position ─────
  const shrinkSpring = spring({
    frame: frame - shrinkAfter,
    fps,
    config: { damping: 16, stiffness: 200 },
    durationInFrames: 20,
  });
  // Shrink font from 200px → 96px
  const fontSize = interpolate(shrinkSpring, [0, 1], [200, 96], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  // Move upward from vertical center toward the top
  const translateY = interpolate(shrinkSpring, [0, 1], [0, -560], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Neon pulse: glow intensity breathes using sine ────────────────────────
  const glowIntensity = interpolate(
    Math.abs(Math.sin((frame / fps) * Math.PI * 1.4)),
    [0, 1],
    [12, 30]
  );

  const combinedScale = phase1Scale;

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: `translate(-50%, calc(-50% + ${translateY}px)) scale(${combinedScale})`,
        fontSize,
        fontFamily: 'sans-serif',
        fontWeight: 900,
        color,
        letterSpacing: -2,
        textAlign: 'center',
        textShadow: buildNeonShadow(accentColor, glowIntensity),
        whiteSpace: 'nowrap',
        lineHeight: 1,
      }}
    >
      {word.toUpperCase()}
    </div>
  );
};

// ─── Meaning Card ─────────────────────────────────────────────────────────────

const MeaningCard: React.FC<{
  item: MeaningItem;
  index: number;
  accentColor: string;
  totalCount: number;
}> = ({ item, index, accentColor, totalCount }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Each card fades in with a stagger of 0.4s per card
  const delay = Math.round(index * fps * 0.4);
  const entrySpring = spring({
    frame: frame - delay,
    fps,
    config: { damping: 13, stiffness: 220 },
    durationInFrames: 16,
  });

  const opacity = interpolate(entrySpring, [0, 1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const translateX = interpolate(entrySpring, [0, 1], [-50, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Neon left-border glow pulses slightly per card (offset by index)
  const borderGlow = interpolate(
    Math.abs(Math.sin(((frame + index * 20) / fps) * Math.PI * 1.2)),
    [0, 1],
    [6, 18]
  );

  // Vertical layout: distribute cards evenly in the lower 60% of screen
  // Position is set by the parent's flex layout, not here.

  return (
    <div
      style={{
        opacity,
        transform: `translateX(${translateX}px)`,
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        padding: '20px 36px',
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderLeft: `5px solid ${accentColor}`,
        boxShadow: `inset 0 0 ${borderGlow}px ${accentColor}40, 0 4px 16px rgba(0,0,0,0.4)`,
        marginBottom: 16,
        width: '100%',
      }}
    >
      {/* Icon */}
      <span style={{ fontSize: 52, lineHeight: 1, minWidth: 60 }}>
        {item.icon}
      </span>

      {/* Meaning text */}
      <span
        style={{
          color: '#ffffff',
          fontSize: 38,
          fontFamily: 'sans-serif',
          fontWeight: 700,
          lineHeight: 1.3,
        }}
      >
        {item.text}
      </span>
    </div>
  );
};

// ─── Explosion Shockwave ──────────────────────────────────────────────────────
// A ring that expands outward at the moment of word explosion

const Shockwave: React.FC<{ accentColor: string }> = ({ accentColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const waveSpring = spring({
    frame,
    fps,
    config: { damping: 20, stiffness: 60 },
    durationInFrames: 40,
  });
  const radius = interpolate(waveSpring, [0, 1], [0, 700]);
  const opacity = interpolate(waveSpring, [0, 0.2, 1], [0, 0.6, 0], {
    extrapolateRight: 'clamp',
  });

  return (
    <svg
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      viewBox="0 0 1080 1920"
    >
      <circle
        cx={540}
        cy={960}
        r={radius}
        fill="none"
        stroke={accentColor}
        strokeWidth={8}
        opacity={opacity}
      />
    </svg>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const WordExplosionScene: React.FC<WordExplosionSceneProps> = ({
  word,
  meanings,
  backgroundColor = '#0d0d1a',
  accentColor = '#00e5ff',
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // The word shows alone for 1.2s, then meanings start appearing
  const meaningsStartFrame = Math.round(fps * 1.2);
  const shrinkAfterFrame = Math.round(fps * 0.8);

  // Meanings container fades in after the word shrinks
  const meaningsOpacity = interpolate(
    frame,
    [meaningsStartFrame - 6, meaningsStartFrame + 6],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill style={{ backgroundColor }}>

      {/* ── Radial gradient background glow ──────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at 50% 50%, ${accentColor}18 0%, transparent 70%)`,
        }}
      />

      {/* ── Shockwave ring on explosion ───────────────────────────────────── */}
      <Shockwave accentColor={accentColor} />

      {/* ── The big exploding word ───────────────────────────────────────── */}
      <BigWord
        word={word}
        color="#ffffff"
        accentColor={accentColor}
        shrinkAfter={shrinkAfterFrame}
      />

      {/* ── Meanings list (fades in after word shrinks up) ───────────────── */}
      <div
        style={{
          position: 'absolute',
          top: '28%',
          left: 60,
          right: 60,
          opacity: meaningsOpacity,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: 'flex-start',
          paddingTop: 16,
        }}
      >
        {meanings.map((item, i) => (
          // Each card lives in a Sequence so its local frame starts at 0
          // when the parent enters the meanings section
          <Sequence
            key={i}
            from={meaningsStartFrame}
            layout="none"
          >
            <MeaningCard
              item={item}
              index={i}
              accentColor={accentColor}
              totalCount={meanings.length}
            />
          </Sequence>
        ))}
      </div>

      {/* ── Corner accent dots ────────────────────────────────────────────── */}
      {[
        { x: 40, y: 40 }, { x: width - 40, y: 40 },
        { x: 40, y: height - 40 }, { x: width - 40, y: height - 40 },
      ].map((pos, i) => {
        const dotPulse = interpolate(
          Math.abs(Math.sin(((frame + i * 15) / fps) * Math.PI * 1.5)),
          [0, 1],
          [6, 12]
        );
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: pos.x,
              top: pos.y,
              width: dotPulse,
              height: dotPulse,
              borderRadius: '50%',
              backgroundColor: accentColor,
              transform: 'translate(-50%, -50%)',
              boxShadow: `0 0 ${dotPulse * 2}px ${accentColor}`,
            }}
          />
        );
      })}

    </AbsoluteFill>
  );
};

export default WordExplosionScene;
