/**
 * SuperpowerScene.tsx
 * A dramatic "grammar rule as superpower" scene:
 *   1. World starts desaturated (grey) → saturates to full color via CSS filter
 *      driven by useCurrentFrame() — recalculated every frame, never via CSS transition.
 *   2. Stickman appears in hero/sword pose with entrance spring.
 *   3. Rule text flies in from the right, glows, and pulses.
 */

import React from 'react';
import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Easing,
  AbsoluteFill,
  Img,
  staticFile,
} from 'remotion';
import { Stickman } from './Stickman';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SuperpowerSceneProps {
  /** The grammar rule displayed as the "weapon" text */
  ruleText: string;
  /**
   * Pose the stickman strikes (defaults to 'hero_pose').
   * Accepts any valid Stickman pose string.
   */
  heroAction?: string;
  /** Target world color shown after the saturation shift */
  worldColor?: string;
  /** Scene background (base color before tint) */
  backgroundColor?: string;
  /** Optional generated background plate */
  backgroundImage?: string;
}

// ─── Glowing Rule Text ────────────────────────────────────────────────────────

const RuleWeapon: React.FC<{
  text: string;
  accentColor: string;
}> = ({ text, accentColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ── Fly in from the right with a spring ───────────────────────────────────
  const flySpring = spring({
    frame,
    fps,
    config: { damping: 11, stiffness: 160, mass: 1 },
    durationInFrames: 22,
  });
  const translateX = interpolate(flySpring, [0, 1], [600, 0]);
  const opacity = interpolate(flySpring, [0, 1], [0, 1]);

  // ── Glow pulse: intensity breathes using sine on frame ────────────────────
  const glowIntensity = interpolate(
    Math.abs(Math.sin((frame / fps) * Math.PI * 1.6)),
    [0, 1],
    [8, 28]
  );

  // ── Slight scale "charge" effect after landing ────────────────────────────
  const chargeSpring = spring({
    frame: frame - 20, // starts after fly-in
    fps,
    config: { damping: 8, stiffness: 300, mass: 0.6 },
    durationInFrames: 14,
  });
  const chargeScale = interpolate(chargeSpring, [0, 1], [1, 1.06], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const buildGlow = (intensity: number) =>
    `0 0 ${intensity}px ${accentColor}, 0 0 ${intensity * 2}px ${accentColor}80`;

  return (
    <div
      style={{
        transform: `translateX(${translateX}px) scale(${chargeScale})`,
        opacity,
        textAlign: 'center',
        padding: '28px 48px',
        borderRadius: 20,
        backgroundColor: `${accentColor}18`,
        border: `3px solid ${accentColor}`,
        boxShadow: buildGlow(glowIntensity),
      }}
    >
      <p
        style={{
          margin: 0,
          color: '#ffffff',
          fontSize: 54,
          fontFamily: 'sans-serif',
          fontWeight: 900,
          lineHeight: 1.3,
          textAlign: 'center',
          textShadow: buildGlow(glowIntensity * 0.6),
          letterSpacing: 1,
        }}
      >
        {text}
      </p>
    </div>
  );
};

// ─── World Color Shift ────────────────────────────────────────────────────────
// Overlay div whose tint color is interpolated from transparent → worldColor.
// Combined with a saturate() filter on the background, this shifts the scene
// from monochrome to vibrant. All values computed each frame — no CSS animation.

const WorldColorShift: React.FC<{
  worldColor: string;
  backgroundColor: string;
  hasBackgroundImage?: boolean;
}> = ({ worldColor, backgroundColor, hasBackgroundImage = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Desaturated → full color over 1.5 seconds
  const saturation = interpolate(frame, [0, fps * 1.5], [0, 1], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.quad),
  });

  // Tint overlay fades in (worldColor at low opacity)
  const tintOpacity = interpolate(frame, [0, fps * 1.5], [0, 0.22], {
    extrapolateRight: 'clamp',
  });

  return (
    <>
      {/* Desaturated base — filter recalculated every frame */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor,
          filter: `saturate(${saturation})`,
          opacity: hasBackgroundImage ? 0.52 : 1,
        }}
      />
      {/* Color tint overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: worldColor,
          opacity: hasBackgroundImage ? tintOpacity * 0.5 : tintOpacity,
        }}
      />
    </>
  );
};

// ─── Power Burst SVG ──────────────────────────────────────────────────────────
// Radial energy lines emanating from the stickman

const PowerBurst: React.FC<{
  cx: number; cy: number;
  accentColor: string;
}> = ({ cx, cy, accentColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Burst appears with the stickman then fades
  const burstOpacity = interpolate(
    frame,
    [0, fps * 0.3, fps * 1.2],
    [0, 0.5, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const burstRadius = interpolate(frame, [0, fps * 1.2], [0, 380], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.quad),
  });

  const rayAngles = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

  return (
    <svg
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      viewBox="0 0 1080 1920"
      opacity={burstOpacity}
    >
      {rayAngles.map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        // Alternate rays: long and short for a star-burst pattern
        const len = i % 2 === 0 ? burstRadius : burstRadius * 0.6;
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={cx + Math.cos(rad) * len}
            y2={cy + Math.sin(rad) * len}
            stroke={accentColor}
            strokeWidth={i % 2 === 0 ? 4 : 2}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const SuperpowerScene: React.FC<SuperpowerSceneProps> = ({
  ruleText,
  heroAction = 'hero_pose',
  worldColor = '#7c3aed',
  backgroundColor = '#1a1a2e',
  backgroundImage,
}) => {
  const { width, height, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();

  // Determine accent color from worldColor (use it directly as accent)
  const accentColor = worldColor;

  // Stickman position: slightly left of center, lower half
  const stickmanX = width * 0.38;
  const stickmanY = height * 0.62;

  // Power burst center = stickman hip position
  const burstCx = stickmanX;
  const burstCy = stickmanY;
  const backgroundSrc = backgroundImage
    ? (/^(https?:|data:|file:)/i.test(backgroundImage) ? backgroundImage : staticFile(backgroundImage))
    : null;

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
            opacity: 0.52,
            filter: 'saturate(1.05) contrast(1.08) brightness(0.98)',
            transform: 'scale(1.08)',
          }}
        />
      )}

      {/* ── World color shift (grey → color) ──────────────────────────────── */}
      <WorldColorShift worldColor={worldColor} backgroundColor={backgroundColor} hasBackgroundImage={Boolean(backgroundSrc)} />

      {/* ── Power burst rays ──────────────────────────────────────────────── */}
      <PowerBurst cx={burstCx} cy={burstCy} accentColor={accentColor} />

      {/* ── Stickman hero ─────────────────────────────────────────────────── */}
      <Stickman
        pose={heroAction}
        emotion="victorious"
        x={stickmanX}
        y={stickmanY}
        color="#ffffff"
      />

      {/* ── Rule text "weapon" in the upper-right area ────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: height * 0.18,
          left: width * 0.38,
          right: 48,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <RuleWeapon text={ruleText} accentColor={accentColor} />
      </div>

      {/* ── "SUPERPOWER UNLOCKED" badge at top ───────────────────────────── */}
      <SuperpowerBadge accentColor={accentColor} />

    </AbsoluteFill>
  );
};

// ─── Superpower Badge ────────────────────────────────────────────────────────

const SuperpowerBadge: React.FC<{ accentColor: string }> = ({ accentColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const badgeSpring = spring({
    frame,
    fps,
    config: { damping: 9, stiffness: 180 },
    durationInFrames: 18,
  });
  const translateY = interpolate(badgeSpring, [0, 1], [-80, 0]);
  const opacity = interpolate(badgeSpring, [0, 1], [0, 1]);

  return (
    <div
      style={{
        position: 'absolute',
        top: 60,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        transform: `translateY(${translateY}px)`,
        opacity,
      }}
    >
      <div
        style={{
          backgroundColor: accentColor,
          color: '#ffffff',
          fontSize: 28,
          fontFamily: 'sans-serif',
          fontWeight: 800,
          letterSpacing: 4,
          textTransform: 'uppercase',
          padding: '12px 36px',
          borderRadius: 999,
          boxShadow: `0 0 24px ${accentColor}`,
        }}
      >
        ⚡ SUPERPOWER UNLOCKED ⚡
      </div>
    </div>
  );
};

export default SuperpowerScene;
