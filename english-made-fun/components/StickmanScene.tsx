/**
 * StickmanScene.tsx
 * Core scene renderer: stickman + text overlay + optional background + particle effects.
 * Particle effects: green ✓ for 'correct', red ✗ for 'wrong'.
 * Background: solid color or image via <Img> (never native <img>).
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
import { Stickman, type Pose, type Emotion } from './Stickman';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StickmanSceneData {
  /** Subtitle / caption text shown at the bottom */
  text: string;
  /** Maps to Stickman pose prop (e.g. 'hero_pose', 'celebrate') */
  stickman_action?: string;
  /** Maps to Stickman emotion prop (e.g. 'happy', 'shocked') */
  stickman_emotion?: string;
  /** Solid background color (hex/rgb) */
  bg_color?: string;
  /**
   * Background image filename (relative to public/) or full URL.
   * Use <Img> to ensure the frame is held until the image loads.
   */
  bg_image?: string;
  /** Particle overlay: 'correct' = green checks, 'wrong' = red Xs */
  effect?: 'correct' | 'wrong' | null;
}

export interface StickmanSceneProps {
  sceneData: StickmanSceneData;
}

// ─── Deterministic particle positions ────────────────────────────────────────
// Fixed relative positions (0–1) so particles never flicker between frames.
const PARTICLE_SLOTS = [
  { rx: 0.12, ry: 0.18 }, { rx: 0.88, ry: 0.22 }, { rx: 0.22, ry: 0.72 },
  { rx: 0.78, ry: 0.68 }, { rx: 0.50, ry: 0.10 }, { rx: 0.50, ry: 0.82 },
  { rx: 0.08, ry: 0.50 }, { rx: 0.92, ry: 0.50 },
];

// ─── Particle ─────────────────────────────────────────────────────────────────

const Particle: React.FC<{
  rx: number; ry: number;
  effect: 'correct' | 'wrong';
  index: number;
}> = ({ rx, ry, effect, index }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // Stagger entry: each particle pops in at a different frame
  const delay = index * 6;
  const entrySpring = spring({
    frame: frame - delay,
    fps,
    config: { damping: 12, stiffness: 120, mass: 0.8 },
    durationInFrames: 24,
  });

  const scale = interpolate(entrySpring, [0, 1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Slow float upward over the scene duration
  const floatY = interpolate(frame, [0, fps * 3], [0, -30], {
    extrapolateRight: 'clamp',
  });

  // Fade out in the last second
  const opacity = interpolate(
    frame,
    [fps * 2, fps * 3],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const x = rx * width;
  const y = ry * height + floatY;
  const color = effect === 'correct' ? '#22c55e' : '#ef4444';
  const symbol = effect === 'correct' ? '✓' : '✗';

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `translate(-50%, -50%) scale(${scale})`,
        opacity,
        fontSize: 64,
        fontWeight: 900,
        color,
        fontFamily: 'sans-serif',
        textShadow: `0 0 20px ${color}`,
        lineHeight: 1,
        // No CSS transition — all via frame-driven spring above
      }}
    >
      {symbol}
    </div>
  );
};

// ─── Text Overlay ─────────────────────────────────────────────────────────────

const TextOverlay: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Gentle fade-and-scale entry — centered vertically in upper portion
  const entrySpring = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 80, mass: 1.2 },
    durationInFrames: 30,
  });
  const scale = interpolate(entrySpring, [0, 1], [0.85, 1]);
  const opacity = interpolate(entrySpring, [0, 1], [0, 1]);

  return (
    <div
      style={{
        position: 'absolute',
        top: '8%',
        left: 0,
        right: 0,
        padding: '0 48px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        transform: `scale(${scale})`,
        opacity,
      }}
    >
      <div
        style={{
          backgroundColor: 'rgba(0,0,0,0.65)',
          borderRadius: 18,
          padding: '24px 40px',
          maxWidth: '90%',
        }}
      >
        <p
          style={{
            margin: 0,
            color: '#ffffff',
            fontSize: 58,
            fontFamily: 'sans-serif',
            fontWeight: 800,
            textAlign: 'center',
            lineHeight: 1.3,
            textShadow: '0 2px 12px rgba(0,0,0,0.7)',
          }}
        >
          {text}
        </p>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const StickmanScene: React.FC<StickmanSceneProps> = ({ sceneData }) => {
  const { width, height } = useVideoConfig();

  const {
    text,
    stickman_action = 'standing',
    stickman_emotion = 'neutral',
    bg_color = '#1a1a2e',
    bg_image,
    effect,
  } = sceneData;

  // Cast action/emotion to their typed variants (unknown strings fall back gracefully)
  const pose = stickman_action as Pose;
  const emotion = stickman_emotion as Emotion;

  // Stickman sits center-horizontally, in the lower-center area
  const stickmanX = width / 2;
  const stickmanY = height * 0.58;

  return (
    <AbsoluteFill style={{ backgroundColor: bg_color }}>

      {/* ── Background image (uses <Img> to hold render until loaded) ────── */}
      {bg_image && (
        <Img
          src={bg_image.startsWith('http') ? bg_image : staticFile(bg_image)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      )}

      {/* ── Semi-transparent overlay to keep text legible over images ──────  */}
      {bg_image && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.35)',
          }}
        />
      )}

      {/* ── Stickman character ──────────────────────────────────────────── */}
      <Stickman
        pose={pose}
        emotion={emotion}
        x={stickmanX}
        y={stickmanY}
        color="#ffffff"
      />

      {/* ── Particle effect overlay ─────────────────────────────────────── */}
      {effect && PARTICLE_SLOTS.map((slot, i) => (
        <Particle
          key={i}
          rx={slot.rx}
          ry={slot.ry}
          effect={effect}
          index={i}
        />
      ))}

      {/* ── Text overlay at bottom ──────────────────────────────────────── */}
      {text && <TextOverlay text={text} />}

    </AbsoluteFill>
  );
};

export default StickmanScene;
