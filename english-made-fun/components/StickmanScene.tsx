/**
 * StickmanScene.tsx
 * Core scene renderer: stickman + text overlay + optional background + particle effects.
 * Enhanced with gradient backgrounds, centered text with keyword highlighting,
 * and smoother particle animations.
 * Background: gradient color or image via <Img> (never native <img>).
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
  /** Subtitle / caption text shown in the upper area */
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
  /** Previous scene's stickman pose — used for entrance transitions */
  previousPose?: string;
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

/** Detect ALL-CAPS words (3+ chars) for keyword highlighting */
function isKeywordWord(word: string): boolean {
  const clean = word.replace(/[^a-zA-Z0-9']/g, '');
  return clean.length >= 3 && clean === clean.toUpperCase();
}

// ─── Deterministic particle positions ────────────────────────────────────────
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

  const floatY = interpolate(frame, [0, fps * 3], [0, -30], {
    extrapolateRight: 'clamp',
  });

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
      }}
    >
      {symbol}
    </div>
  );
};

// ─── Text Overlay (Centered Upper Area with Keyword Highlighting) ────────────

const TextOverlay: React.FC<{ text: string; effect?: 'correct' | 'wrong' | null }> = ({ text, effect }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrySpring = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 80, mass: 1.2 },
    durationInFrames: 30,
  });
  const scale = interpolate(entrySpring, [0, 1], [0.85, 1]);
  const opacity = interpolate(entrySpring, [0, 1], [0, 1]);

  // Determine accent color based on effect
  const accentColor = effect === 'correct' ? '#22c55e' : effect === 'wrong' ? '#ef4444' : '#FFD700';

  // Split text into words for keyword highlighting
  const words = text.split(/(\s+)/);

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
        zIndex: 10,
      }}
    >
      <div
        style={{
          backgroundColor: 'rgba(0,0,0,0.65)',
          borderRadius: 18,
          padding: '24px 40px',
          maxWidth: '90%',
          borderLeft: `4px solid ${accentColor}`,
          borderRight: `4px solid ${accentColor}`,
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 56,
            fontFamily: 'sans-serif',
            fontWeight: 800,
            textAlign: 'center',
            lineHeight: 1.3,
          }}
        >
          {words.map((word, i) => {
            const isKw = isKeywordWord(word);
            return (
              <span
                key={i}
                style={{
                  color: isKw ? accentColor : '#ffffff',
                  textShadow: isKw
                    ? `0 0 8px ${accentColor}, 0 2px 12px rgba(0,0,0,0.7)`
                    : '0 2px 12px rgba(0,0,0,0.7)',
                  fontWeight: isKw ? 900 : 800,
                }}
              >
                {word}
              </span>
            );
          })}
        </p>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const StickmanScene: React.FC<StickmanSceneProps> = ({ sceneData, previousPose }) => {
  const { width, height, fps, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();

  const {
    text,
    stickman_action = 'standing',
    stickman_emotion = 'neutral',
    bg_color = '#1a1a2e',
    bg_image,
    effect,
  } = sceneData;

  const pose = stickman_action as Pose;
  const emotion = stickman_emotion as Emotion;

  const stickmanX = width / 2;
  const stickmanY = height * 0.58;

  // ── Animated gradient background ──────────────────────────────────────────
  const darkerBg = darkenHex(bg_color, 35);
  const gradCx = interpolate(frame, [0, durationInFrames], [42, 58], { extrapolateRight: 'clamp' });
  const gradCy = interpolate(frame, [0, durationInFrames], [40, 55], { extrapolateRight: 'clamp' });

  const showLocalBg = bg_color !== 'transparent' && bg_color !== '';

  // Ken Burns drift: subtle zoom + pan over scene duration
  const kbScale = interpolate(frame, [0, durationInFrames], [1.0, 1.03], { extrapolateRight: 'clamp' });
  const kbTranslateX = interpolate(frame, [0, durationInFrames], [0, -8], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ transform: `scale(${kbScale}) translateX(${kbTranslateX}px)` }}>

      {/* ── Gradient background (skipped when transparent to reveal global bg) */}
      {showLocalBg && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(ellipse at ${gradCx}% ${gradCy}%, ${bg_color} 0%, ${darkerBg} 100%)`,
          }}
        />
      )}

      {/* ── Subtle vignette ──────────────────────────────────────────────── */}
      {showLocalBg && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(0,0,0,0.4) 100%)',
          }}
        />
      )}

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

      {/* ── Text overlay at upper area ──────────────────────────────────── */}
      {text && <TextOverlay text={text} effect={effect} />}

    </AbsoluteFill>
  );
};

export default StickmanScene;
