/**
 * Stickman.tsx
 * Production-ready animated stickman component for Remotion.
 * All animation is driven by useCurrentFrame() — no CSS transitions.
 * All geometry is pure SVG lines and circles — no complex rigging.
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
  Composition,
} from 'remotion';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type Pose =
  | 'standing'
  | 'falling'
  | 'jumping'
  | 'flying'
  | 'hero_pose'
  | 'facepalm'
  | 'victory_pose'
  | 'winking'
  | 'thumbs_up'
  | 'pointing'
  | 'celebrate'
  | 'trip'
  | 'sword_glow'
  | 'fly_off'
  | 'cameo_wave'
  | 'shocked'
  | 'epic_win';

export type Emotion =
  | 'happy'
  | 'sad'
  | 'shocked'
  | 'victorious'
  | 'confused'
  | 'excited'
  | 'neutral';

export interface StickmanProps {
  /** Which full-body pose to display */
  pose?: Pose;
  /** Expression on the stickman's face */
  emotion?: Emotion;
  /** Reserved for future action triggers (e.g. 'talk', 'blink') */
  action?: string;
  /** Horizontal center of the stickman's hip in composition pixels */
  x?: number;
  /** Vertical center of the stickman's hip in composition pixels */
  y?: number;
  /** Stroke/fill color for the entire stickman */
  color?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SKELETON DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────
//
// All coordinates use the stickman's LOCAL space:
//   Origin (0, 0) = hip joint
//   Y increases downward (SVG convention)
//   Head sits at roughly (0, −62)
//
// Anatomy key points:
//   headCx/Cy   — center of the head circle
//   spineX1/Y1  — top of spine (base of neck)
//   spineX2/Y2  — bottom of spine (hip joint = origin)
//   shoulderX/Y — point on spine where arms attach (~30% down)
//   lArmX/Y     — left hand endpoint
//   rArmX/Y     — right hand endpoint
//   lLegX/Y     — left foot endpoint
//   rLegX/Y     — right foot endpoint

interface Skeleton {
  headCx: number; headCy: number;
  spineX1: number; spineY1: number;
  spineX2: number; spineY2: number;
  shoulderX: number; shoulderY: number;
  lArmX: number; lArmY: number;
  rArmX: number; rArmY: number;
  lLegX: number; lLegY: number;
  rLegX: number; rLegY: number;
  // Optional extras
  extra?: 'sword' | 'thumb';
  swordX1?: number; swordY1?: number;
  swordX2?: number; swordY2?: number;
  thumbCx?: number; thumbCy?: number;
}

const SKELETONS: Record<Pose, Skeleton> = {
  // ── standing: neutral rest, arms loosely at sides
  standing: {
    headCx: 0,   headCy: -62,
    spineX1: 0,  spineY1: -46,  spineX2: 0,   spineY2: 0,
    shoulderX: 0, shoulderY: -34,
    lArmX: -32,  lArmY: -14,
    rArmX:  32,  rArmY: -14,
    lLegX: -20,  lLegY:  38,
    rLegX:  20,  rLegY:  38,
  },

  // ── falling: body tilted, arms thrown upward in panic
  falling: {
    headCx:  14,  headCy: -52,
    spineX1: 10,  spineY1: -36,  spineX2: -4,  spineY2: 8,
    shoulderX: 3, shoulderY: -20,
    lArmX: -28,  lArmY: -40,
    rArmX:  36,  rArmY: -36,
    lLegX: -14,  lLegY:  42,
    rLegX:  22,  rLegY:  36,
  },

  // ── jumping: airborne, legs spread, arms out for balance
  jumping: {
    headCx: 0,   headCy: -72,
    spineX1: 0,  spineY1: -56,  spineX2: 0,   spineY2: -14,
    shoulderX: 0, shoulderY: -44,
    lArmX: -38,  lArmY: -30,
    rArmX:  38,  rArmY: -30,
    lLegX: -28,  lLegY:  24,
    rLegX:  28,  rLegY:  24,
  },

  // ── flying: body angled forward, arms spread like a cape
  flying: {
    headCx: -10, headCy: -58,
    spineX1: -4, spineY1: -42,  spineX2: 18,  spineY2: -20,
    shoulderX: 6, shoulderY: -32,
    lArmX: -38,  lArmY: -55,
    rArmX:  40,  rArmY: -52,
    lLegX:  10,  lLegY:  22,
    rLegX:  30,  rLegY:   6,
  },

  // ── hero_pose: wide stance, hands on hips, head held high
  hero_pose: {
    headCx: 0,   headCy: -62,
    spineX1: 0,  spineY1: -46,  spineX2: 0,   spineY2: 0,
    shoulderX: 0, shoulderY: -34,
    lArmX: -42,  lArmY:  -2,
    rArmX:  42,  rArmY:  -2,
    lLegX: -28,  lLegY:  38,
    rLegX:  28,  rLegY:  38,
  },

  // ── facepalm: right hand raised to face in despair
  facepalm: {
    headCx: -4,  headCy: -62,
    spineX1: 0,  spineY1: -46,  spineX2: 0,   spineY2: 0,
    shoulderX: 0, shoulderY: -34,
    lArmX: -32,  lArmY: -14,
    rArmX:   8,  rArmY: -58,   // hand pressed to face
    lLegX: -18,  lLegY:  38,
    rLegX:  18,  rLegY:  38,
  },

  // ── victory_pose: both arms raised in a triumphant V
  victory_pose: {
    headCx: 0,   headCy: -62,
    spineX1: 0,  spineY1: -46,  spineX2: 0,   spineY2: 0,
    shoulderX: 0, shoulderY: -34,
    lArmX: -45,  lArmY: -60,
    rArmX:  45,  rArmY: -60,
    lLegX: -24,  lLegY:  38,
    rLegX:  24,  rLegY:  38,
  },

  // ── winking: slight lean, left eye forced closed via face override
  winking: {
    headCx:  4,  headCy: -62,
    spineX1: 2,  spineY1: -46,  spineX2: 0,   spineY2: 0,
    shoulderX: 1, shoulderY: -34,
    lArmX: -30,  lArmY: -10,
    rArmX:  34,  rArmY: -18,
    lLegX: -18,  lLegY:  38,
    rLegX:  20,  rLegY:  38,
  },

  // ── thumbs_up: right arm raised, thumb extended
  thumbs_up: {
    headCx: 0,   headCy: -62,
    spineX1: 0,  spineY1: -46,  spineX2: 0,   spineY2: 0,
    shoulderX: 0, shoulderY: -34,
    lArmX: -32,  lArmY: -14,
    rArmX:  38,  rArmY: -52,   // arm raised for thumbs up
    lLegX: -18,  lLegY:  38,
    rLegX:  18,  rLegY:  38,
    extra: 'thumb',
    thumbCx: 42, thumbCy: -62,
  },

  // ── pointing: right arm fully extended horizontally outward
  pointing: {
    headCx: 0,   headCy: -62,
    spineX1: 0,  spineY1: -46,  spineX2: 0,   spineY2: 0,
    shoulderX: 0, shoulderY: -34,
    lArmX: -32,  lArmY: -14,
    rArmX:  56,  rArmY: -18,   // fully extended point
    lLegX: -18,  lLegY:  38,
    rLegX:  18,  rLegY:  38,
  },

  // ── celebrate: airborne with both arms thrown above head
  celebrate: {
    headCx: 0,   headCy: -76,
    spineX1: 0,  spineY1: -60,  spineX2: 0,   spineY2: -14,
    shoulderX: 0, shoulderY: -48,
    lArmX: -46,  lArmY: -68,
    rArmX:  46,  rArmY: -68,
    lLegX: -32,  lLegY:  24,
    rLegX:  32,  rLegY:  24,
  },

  // ── trip: stumbling forward, catching themselves with outstretched arms
  trip: {
    headCx:  26,  headCy: -44,
    spineX1: 18,  spineY1: -28,  spineX2: -8,  spineY2: 12,
    shoulderX: 5, shoulderY: -12,
    lArmX: -42,  lArmY: -26,
    rArmX:  32,  rArmY: -36,
    lLegX: -26,  lLegY:  42,
    rLegX:  18,  rLegY:  38,
  },

  // ── sword_glow: battle stance, right arm raised holding a glowing sword
  sword_glow: {
    headCx: 0,   headCy: -62,
    spineX1: 0,  spineY1: -46,  spineX2: 0,   spineY2: 0,
    shoulderX: 0, shoulderY: -34,
    lArmX: -28,  lArmY:   2,
    rArmX:  42,  rArmY: -46,   // sword hand
    lLegX: -24,  lLegY:  38,
    rLegX:  14,  rLegY:  38,
    extra: 'sword',
    swordX1: 42, swordY1: -46,
    swordX2: 78, swordY2: -82,
  },

  // ── fly_off: launching diagonally upward at speed
  fly_off: {
    headCx: -16, headCy: -66,
    spineX1: -6, spineY1: -50,  spineX2: 22,  spineY2: -22,
    shoulderX: 8, shoulderY: -37,
    lArmX: -24,  lArmY: -62,
    rArmX:  36,  rArmY: -64,
    lLegX:  18,  lLegY:  28,
    rLegX:  38,  rLegY:  10,
  },

  // ── cameo_wave: relaxed stance, right arm raised and waving at camera
  cameo_wave: {
    headCx: 0,   headCy: -62,
    spineX1: 0,  spineY1: -46,  spineX2: 0,   spineY2: 0,
    shoulderX: 0, shoulderY: -34,
    lArmX: -32,  lArmY: -14,
    rArmX:  44,  rArmY: -56,   // arm up for wave
    lLegX: -18,  lLegY:  38,
    rLegX:  18,  rLegY:  38,
  },

  // ── shocked: arms flung wide, body slightly recoiling backward
  shocked: {
    headCx: 0,   headCy: -65,
    spineX1: 0,  spineY1: -49,  spineX2: 0,   spineY2: 2,
    shoulderX: 0, shoulderY: -37,
    lArmX: -50,  lArmY: -20,
    rArmX:  50,  rArmY: -20,
    lLegX: -26,  lLegY:  40,
    rLegX:  26,  rLegY:  40,
  },

  // ── epic_win: maximum celebration — everything pushed to extremes
  epic_win: {
    headCx: 0,   headCy: -76,
    spineX1: 0,  spineY1: -60,  spineX2: 0,   spineY2: -10,
    shoulderX: 0, shoulderY: -48,
    lArmX: -56,  lArmY: -74,
    rArmX:  56,  rArmY: -74,
    lLegX: -36,  lLegY:  28,
    rLegX:  36,  rLegY:  28,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// FACE / EMOTION RENDERERS
// ─────────────────────────────────────────────────────────────────────────────
//
// All face paths are drawn in head-local space: (0,0) = head center.
// Eyes sit at approximately (±5, −5). Mouth sits at approximately (0, 4).
// Head radius = HEAD_R = 14 units.

const HEAD_R = 14;

function LeftEye({ emotion, color, sw }: { emotion: Emotion; color: string; sw: number }) {
  switch (emotion) {
    case 'happy':
    case 'victorious':
      // Upward arc = squinting happy eye
      return <path d="M -7,-6 Q -5,-4 -3,-6" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" />;
    case 'shocked':
      // Wide-open circle
      return <circle cx="-5" cy="-5" r="3.5" stroke={color} strokeWidth={sw} fill="none" />;
    case 'excited':
      // Open circle, slightly larger than neutral
      return <circle cx="-5" cy="-5" r="2.8" stroke={color} strokeWidth={sw} fill="none" />;
    case 'sad':
    case 'confused':
    case 'neutral':
    default:
      return <circle cx="-5" cy="-5" r="1.6" fill={color} />;
  }
}

function RightEye({ emotion, color, sw }: { emotion: Emotion; color: string; sw: number }) {
  switch (emotion) {
    case 'happy':
    case 'victorious':
      return <path d="M 3,-6 Q 5,-4 7,-6" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" />;
    case 'shocked':
      return <circle cx="5" cy="-5" r="3.5" stroke={color} strokeWidth={sw} fill="none" />;
    case 'confused':
      // Raised eyebrow on this side signals confusion
      return (
        <>
          <circle cx="5" cy="-5" r="1.6" fill={color} />
          <path d="M 3,-9 Q 5,-11 7,-9" stroke={color} strokeWidth={1.2} fill="none" strokeLinecap="round" />
        </>
      );
    case 'excited':
      return <circle cx="5" cy="-5" r="2.8" stroke={color} strokeWidth={sw} fill="none" />;
    case 'sad':
    case 'neutral':
    default:
      return <circle cx="5" cy="-5" r="1.6" fill={color} />;
  }
}

function Mouth({ emotion, color, sw }: { emotion: Emotion; color: string; sw: number }) {
  switch (emotion) {
    case 'happy':
      // Gentle smile
      return <path d="M -5,3 Q 0,8 5,3" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" />;
    case 'victorious':
    case 'excited':
      // Wide grin
      return <path d="M -6,2 Q 0,10 6,2" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" />;
    case 'sad':
      // Frown — same arc but flipped (control point is above the endpoints)
      return <path d="M -5,7 Q 0,3 5,7" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" />;
    case 'shocked':
      // Open O mouth
      return <ellipse cx="0" cy="5" rx="3.5" ry="4.5" stroke={color} strokeWidth={sw} fill="none" />;
    case 'confused':
      // Squiggly uncertain mouth
      return <path d="M -5,5 Q -2,3 1,5 Q 4,7 6,5" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" />;
    case 'neutral':
    default:
      return <line x1="-4" y1="4" x2="4" y2="4" stroke={color} strokeWidth={sw} strokeLinecap="round" />;
  }
}

/** Render the complete face for a given emotion. Winking forces left eye closed. */
function Face({
  emotion,
  color,
  isWinking,
}: {
  emotion: Emotion;
  color: string;
  isWinking: boolean;
}) {
  const sw = 1.8;
  return (
    <>
      {/* Left eye — overridden to a closed dash when winking */}
      {isWinking ? (
        <line x1="-7" y1="-5" x2="-3" y2="-5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      ) : (
        <LeftEye emotion={emotion} color={color} sw={sw} />
      )}
      <RightEye emotion={emotion} color={color} sw={sw} />
      <Mouth emotion={emotion} color={color} sw={sw} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN STICKMAN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const Stickman: React.FC<StickmanProps> = ({
  pose = 'standing',
  emotion = 'neutral',
  action,
  x = 540,
  y = 960,
  color = '#ffffff',
}) => {
  // All animation is derived from frame — never from CSS transitions.
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sk = SKELETONS[pose] ?? SKELETONS.standing;
  const limbSW = 4;   // limb stroke width
  const headSW = 3;   // head circle stroke width

  // ── ENTRANCE SPRING ───────────────────────────────────────────────────────
  // All poses bounce in from scale 0 at the start of their sequence frame.
  // durationInFrames keeps the spring from computing past the useful range.
  const entranceSpring = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 80, mass: 1.0 },
    durationInFrames: 36,
  });
  // Maps [0→1] spring to [0→1] scale — smooth ease-in
  const entranceScale = interpolate(entranceSpring, [0, 1], [0, 1]);

  // ── JUMP / CELEBRATE / EPIC_WIN — bouncy upward displacement ─────────────
  // A low-damping spring creates the classic "pop up and overshoot" jump feel.
  const jumpSpring = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 100, mass: 1.0 },
  });
  const jumpOffsetY =
    pose === 'jumping' || pose === 'celebrate' || pose === 'epic_win'
      ? interpolate(jumpSpring, [0, 1], [0, -28], { extrapolateRight: 'clamp' })
      : 0;

  // ── FALLING — heavy drop-in from above, bounces on landing ───────────────
  // High mass + low damping = slow heavy object that wobbles when it stops.
  const fallSpring = spring({
    frame,
    fps,
    config: { damping: 6, stiffness: 90, mass: 1.8 },
  });
  const fallOffsetY =
    pose === 'falling'
      ? interpolate(fallSpring, [0, 1], [-55, 0], { extrapolateRight: 'clamp' })
      : 0;

  // ── TRIP — forward tumble rotation, then catches balance ─────────────────
  // Starts tilted back (−25°) and spring-snaps to a slight forward lean (+12°).
  const tripSpring = spring({
    frame,
    fps,
    config: { damping: 8, stiffness: 80, mass: 2 },
    durationInFrames: 30,
  });
  const tripRotate =
    pose === 'trip'
      ? interpolate(tripSpring, [0, 1], [-25, 12], { extrapolateRight: 'clamp' })
      : 0;

  // ── SHOCKED — quick explosive scale pop ──────────────────────────────────
  // Very stiff + low damping = rapid snap-to-big then slight jiggle.
  const shockSpring = spring({
    frame,
    fps,
    config: { damping: 10, stiffness: 180, mass: 0.8 },
    durationInFrames: 24,
  });
  const shockScale =
    pose === 'shocked'
      ? interpolate(shockSpring, [0, 1], [0.8, 1.15], { extrapolateRight: 'clamp' })
      : 1;

  // ── CELEBRATE / EPIC_WIN — secondary scale bounce on top of entrance ──────
  const celebSpring = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 120, mass: 0.9 },
  });
  const celebScale =
    pose === 'celebrate' || pose === 'epic_win'
      ? interpolate(celebSpring, [0, 1], [0.6, 1.08], { extrapolateRight: 'clamp' })
      : 1;

  // ── POINTING — arm springs out from the shoulder ──────────────────────────
  // On frame 0 the arm is at the shoulder; it snaps to full extension.
  const pointSpring = spring({
    frame,
    fps,
    config: { damping: 18, stiffness: 280 },
    durationInFrames: 14,
  });
  const pointedArmX =
    pose === 'pointing'
      ? interpolate(pointSpring, [0, 1], [sk.shoulderX, sk.rArmX])
      : sk.rArmX;
  const pointedArmY =
    pose === 'pointing'
      ? interpolate(pointSpring, [0, 1], [sk.shoulderY, sk.rArmY])
      : sk.rArmY;

  // ── FLY / FLY_OFF — eased upward drift over time ─────────────────────────
  // Uses interpolate directly against frame so the body keeps drifting.
  const flyOffsetY =
    pose === 'flying' || pose === 'fly_off'
      ? interpolate(frame, [0, fps * 2], [0, -55], {
          extrapolateRight: 'clamp',
          easing: Easing.out(Easing.quad),
        })
      : 0;
  // fly_off tilts the body progressively as it launches
  const flyRotate =
    pose === 'fly_off'
      ? interpolate(frame, [0, fps * 1.5], [0, -18], {
          extrapolateRight: 'clamp',
          easing: Easing.in(Easing.quad),
        })
      : 0;

  // ── HERO_POSE — subtle idle sway (sine oscillation, no spring needed) ─────
  const heroSway =
    pose === 'hero_pose'
      ? Math.sin((frame / fps) * Math.PI * 0.7) * 2.5
      : 0;

  // ── CAMEO_WAVE — right arm oscillates side-to-side to wave hello ──────────
  // Sine at 3.5 cycles/sec gives a natural, cheerful wave cadence.
  const waveOscX =
    pose === 'cameo_wave'
      ? Math.sin((frame / fps) * Math.PI * 3.5) * 14
      : 0;

  // ── SWORD_GLOW — pulsing glow radius (breathing effect) ──────────────────
  // Absolute-sine so the glow never goes negative.
  const swordGlow =
    pose === 'sword_glow'
      ? Math.abs(Math.sin((frame / fps) * Math.PI * 1.8)) * 8 + 4
      : 4;

  // ── FACEPALM — micro-tremor on the hand (rapid vibration) ────────────────
  const facepalmTremor =
    pose === 'facepalm'
      ? Math.sin((frame / fps) * Math.PI * 8) * 1.8
      : 0;

  // ── PARTICLE ANIMATION (celebrate / epic_win) ────────────────────────────
  // Progress for particles radiating out from the head (0 = center, 1 = far)
  const particleProgress = interpolate(frame, [0, fps * 1.8], [0, 1], {
    extrapolateRight: 'clamp',
  });
  // Particles fade in quickly then fade out slowly
  const particleOpacity = interpolate(
    frame,
    [0, fps * 0.3, fps * 1.8],
    [0, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // ── SHOCKED EXCLAMATION fade-in ───────────────────────────────────────────
  const exclamOpacity =
    pose === 'shocked' || emotion === 'shocked'
      ? interpolate(shockSpring, [0, 1], [0, 1], { extrapolateRight: 'clamp' })
      : 0;

  // ── SPEED LINES fade-in (fly / fly_off) ──────────────────────────────────
  const speedLineOpacity =
    pose === 'flying' || pose === 'fly_off'
      ? interpolate(frame, [0, 8], [0, 0.55], { extrapolateRight: 'clamp' })
      : 0;

  // ── COMPOSE FINAL TRANSFORMS ──────────────────────────────────────────────
  // totalOffsetY shifts the entire SVG element on-screen (body moves in space)
  const totalOffsetY = jumpOffsetY + fallOffsetY + flyOffsetY;
  // totalScale multiplied springs stay at or above 0
  const totalScale   = entranceScale * celebScale * shockScale;
  // totalRotate applied as SVG rotate transform around the hip pivot
  const totalRotate  = tripRotate + flyRotate + heroSway;

  // ── SVG VIEWPORT ──────────────────────────────────────────────────────────
  // viewBox maps stickman local space to the SVG element.
  // Hip (0,0) in local space lands at page position (x, y + totalOffsetY).
  //   left = x − 120  →  viewBox left edge is 120px left of hip
  //   top  = y − 140  →  viewBox top edge is 140px above hip
  // overflow:visible catches any limbs that spill outside (sword, epic arms).

  return (
    <svg
      style={{
        position: 'absolute',
        left: x - 240,
        top: y - 280 + totalOffsetY,
        width: 480,
        height: 440,
        overflow: 'visible',
        // Explicitly no CSS filter or transition — all animation via frame
      }}
      viewBox="-120 -140 240 220"
    >
      {/*
       * Master group receives:
       *   scale()  — entrance pop + celebrate bounce + shock burst
       *   rotate() — trip tumble, fly_off tilt, hero sway; pivots at hip (0,0)
       */}
      <g
        transform={`
          scale(${totalScale})
          rotate(${totalRotate}, ${sk.spineX2}, ${sk.spineY2})
        `}
      >

        {/* ── SWORD (drawn first so body renders on top) ────────────── */}
        {sk.extra === 'sword' && sk.swordX1 !== undefined && (
          <>
            {/* Outer glow halo — radius pulses with swordGlow */}
            <line
              x1={sk.swordX1} y1={sk.swordY1}
              x2={sk.swordX2} y2={sk.swordY2}
              stroke="#4499ff"
              strokeWidth={swordGlow * 2.8}
              strokeLinecap="round"
              opacity={0.32}
            />
            {/* Bright inner blade */}
            <line
              x1={sk.swordX1} y1={sk.swordY1}
              x2={sk.swordX2} y2={sk.swordY2}
              stroke="#aaddff"
              strokeWidth={3.5}
              strokeLinecap="round"
            />
          </>
        )}

        {/* ── LEFT LEG ──────────────────────────────────────────────── */}
        <line
          x1={sk.spineX2} y1={sk.spineY2}
          x2={sk.lLegX}   y2={sk.lLegY}
          stroke={color} strokeWidth={limbSW} strokeLinecap="round"
        />

        {/* ── RIGHT LEG ─────────────────────────────────────────────── */}
        <line
          x1={sk.spineX2} y1={sk.spineY2}
          x2={sk.rLegX}   y2={sk.rLegY}
          stroke={color} strokeWidth={limbSW} strokeLinecap="round"
        />

        {/* ── SPINE (torso) ──────────────────────────────────────────── */}
        <line
          x1={sk.spineX1} y1={sk.spineY1}
          x2={sk.spineX2} y2={sk.spineY2}
          stroke={color} strokeWidth={limbSW} strokeLinecap="round"
        />

        {/* ── LEFT ARM ──────────────────────────────────────────────── */}
        <line
          x1={sk.shoulderX} y1={sk.shoulderY}
          x2={sk.lArmX}     y2={sk.lArmY}
          stroke={color} strokeWidth={limbSW} strokeLinecap="round"
        />

        {/* ── RIGHT ARM ────────────────────────────────────────────────
         *  • pointedArmX/Y: arm springs out from shoulder (pointing pose)
         *  • waveOscX: side-to-side oscillation (cameo_wave pose)
         */}
        <line
          x1={sk.shoulderX}        y1={sk.shoulderY}
          x2={pointedArmX + waveOscX} y2={pointedArmY}
          stroke={color} strokeWidth={limbSW} strokeLinecap="round"
        />

        {/* ── FACEPALM HAND CIRCLE (overlays the face) ──────────────── */}
        {pose === 'facepalm' && (
          <circle
            cx={sk.rArmX + facepalmTremor}
            cy={sk.rArmY}
            r={11}
            stroke={color} strokeWidth={3} fill="none" opacity={0.82}
          />
        )}

        {/* ── THUMBS UP — small thumb nub above fist ────────────────── */}
        {sk.extra === 'thumb' && sk.thumbCx !== undefined && (
          <>
            {/* Fist bump */}
            <circle cx={sk.thumbCx} cy={sk.thumbCy} r={4} fill={color} />
            {/* Thumb pointing upward */}
            <line
              x1={sk.thumbCx} y1={sk.thumbCy}
              x2={sk.thumbCx} y2={sk.thumbCy - 9}
              stroke={color} strokeWidth={3} strokeLinecap="round"
            />
          </>
        )}

        {/* ── HEAD ──────────────────────────────────────────────────── */}
        <circle
          cx={sk.headCx} cy={sk.headCy}
          r={HEAD_R}
          stroke={color} strokeWidth={headSW} fill="none"
        />

        {/* ── FACE (positioned relative to head center) ─────────────── */}
        <g transform={`translate(${sk.headCx}, ${sk.headCy})`}>
          <Face emotion={emotion} color={color} isWinking={pose === 'winking'} />

          {/* Shocked exclamation mark — springs in with the shock pop */}
          {exclamOpacity > 0 && (
            <text
              x={HEAD_R + 2} y={-HEAD_R + 5}
              fontSize={16} fill={color}
              fontFamily="sans-serif" fontWeight="bold"
              opacity={exclamOpacity}
            >
              !
            </text>
          )}
        </g>

        {/* ── HERO POSE — pulsing aura ring ─────────────────────────── */}
        {pose === 'hero_pose' && (
          <circle
            cx={sk.headCx} cy={sk.headCy}
            r={interpolate(
              Math.abs(Math.sin((frame / fps) * Math.PI * 0.7)),
              [0, 1],
              [19, 26]
            )}
            stroke="#FFD700" strokeWidth={2} fill="none" opacity={0.38}
          />
        )}

        {/* ── CELEBRATE / EPIC_WIN — particle burst ─────────────────── */}
        {(pose === 'celebrate' || pose === 'epic_win') && (
          <g opacity={particleOpacity}>
            {[0, 45, 90, 135, 180, 225, 270, 315].map((angleDeg, i) => {
              const rad = (angleDeg * Math.PI) / 180;
              // Particles radiate outward from head center
              const dist = interpolate(particleProgress, [0, 1], [18, 64]);
              const px = sk.headCx + Math.cos(rad) * dist;
              const py = sk.headCy + Math.sin(rad) * dist;
              const colors = ['#FFD700', '#FF6B6B', '#66ffcc', '#ff99ff', '#88ccff'];
              return (
                <circle key={i} cx={px} cy={py} r={2.8} fill={colors[i % colors.length]} />
              );
            })}
          </g>
        )}

        {/* ── FLYING / FLY_OFF — horizontal speed lines ─────────────── */}
        {(pose === 'flying' || pose === 'fly_off') && (
          <>
            {[0, 9, 18, 27].map((yOff, i) => (
              <line
                key={i}
                x1={sk.headCx + 18 + i * 3} y1={sk.headCy - 2 + yOff}
                x2={sk.headCx + 48 + i * 5} y2={sk.headCy - 2 + yOff}
                stroke={color}
                strokeWidth={1.6}
                strokeLinecap="round"
                opacity={speedLineOpacity * (1 - i * 0.18)}
              />
            ))}
          </>
        )}

      </g>
    </svg>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// STICKMAN DEMO — sequenced showcase of all poses
// ─────────────────────────────────────────────────────────────────────────────

const ALL_POSES: Pose[] = [
  'standing', 'falling', 'jumping', 'flying', 'hero_pose',
  'facepalm', 'victory_pose', 'winking', 'thumbs_up', 'pointing',
  'celebrate', 'trip', 'sword_glow', 'fly_off', 'cameo_wave',
  'shocked', 'epic_win',
];

const ALL_EMOTIONS: Emotion[] = [
  'happy', 'sad', 'shocked', 'victorious', 'confused', 'excited', 'neutral',
];

// Each pose is held for 3 seconds (90 frames @ 30 fps)
const FRAMES_PER_POSE = 90;

// Rotating palette so adjacent poses look visually distinct
const PALETTE = ['#ffffff', '#FFD700', '#FF6B6B', '#66ccff', '#aaffaa', '#ff99cc', '#cc99ff'];

// ── PoseCard: renders one pose + labels inside a Sequence ─────────────────
//
// Because this component lives inside a <Sequence>, useCurrentFrame() here
// returns the frame RELATIVE to the sequence start (always begins at 0).
// This means the Stickman's entrance spring restarts cleanly for every pose.
const PoseCard: React.FC<{ pose: Pose; emotion: Emotion; color: string }> = ({
  pose,
  emotion,
  color,
}) => {
  const frame = useCurrentFrame(); // local to this Sequence
  const { width, height } = useVideoConfig();

  // Label cross-fade: fade in over first 12 frames, hold, fade out over last 12
  const labelOpacity = interpolate(
    frame,
    [0, 12, FRAMES_PER_POSE - 12, FRAMES_PER_POSE],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill style={{ backgroundColor: '#1a1a2e' }}>

      {/* ── Stickman centered in composition ────────────────────────── */}
      <Stickman
        pose={pose}
        emotion={emotion}
        x={width / 2}
        y={height / 2 + 80}
        color={color}
      />

      {/* ── Pose name ───────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: height / 2 - 165,
          width: '100%',
          textAlign: 'center',
          color: '#FFD700',
          fontSize: 54,
          fontFamily: 'sans-serif',
          fontWeight: 'bold',
          letterSpacing: 3,
          opacity: labelOpacity,
          textTransform: 'uppercase',
        }}
      >
        {pose.replace(/_/g, ' ')}
      </div>

      {/* ── Emotion badge ───────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: height / 2 - 100,
          width: '100%',
          textAlign: 'center',
          color: '#aaddff',
          fontSize: 30,
          fontFamily: 'sans-serif',
          opacity: labelOpacity,
        }}
      >
        emotion: {emotion}
      </div>

      {/* ── Progress dots at the bottom ─────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 56,
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        {ALL_POSES.map((p) => (
          <div
            key={p}
            style={{
              width: p === pose ? 22 : 8,
              height: 8,
              borderRadius: 4,
              backgroundColor:
                p === pose ? '#FFD700' : 'rgba(255,255,255,0.25)',
            }}
          />
        ))}
      </div>

    </AbsoluteFill>
  );
};

// ── StickmanDemoScene: sequences all poses back-to-back ───────────────────
//
// <Sequence from={N} durationInFrames={D}> resets useCurrentFrame() to 0
// for its children, so each PoseCard's Stickman starts its entrance spring
// fresh. This is the correct Remotion pattern for sequenced animations.
const StickmanDemoScene: React.FC = () => (
  <AbsoluteFill>
    {ALL_POSES.map((pose, i) => (
      <Sequence
        key={pose}
        from={i * FRAMES_PER_POSE}
        durationInFrames={FRAMES_PER_POSE}
      >
        <PoseCard
          pose={pose}
          emotion={ALL_EMOTIONS[i % ALL_EMOTIONS.length]}
          color={PALETTE[i % PALETTE.length]}
        />
      </Sequence>
    ))}
  </AbsoluteFill>
);

// ── StickmanDemoCompositions: drop this into Root.tsx ─────────────────────
//
// Usage in Root.tsx:
//   import { StickmanDemoCompositions } from './components/Stickman';
//   export const Root = () => <><StickmanDemoCompositions /></>;
export const StickmanDemoCompositions: React.FC = () => (
  <Composition
    id="StickmanDemo"
    component={StickmanDemoScene}
    durationInFrames={ALL_POSES.length * FRAMES_PER_POSE}
    fps={30}
    width={1080}
    height={1920}
    defaultProps={{}}
  />
);

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export { StickmanDemoScene };
export default Stickman;
