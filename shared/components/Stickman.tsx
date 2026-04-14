/**
 * Stickman.tsx — Unified SVG stick-figure character
 *
 * Merged from 3 implementations:
 *   - Root (8 poses)
 *   - english-made-fun (24 poses, sword/thumb extras)
 *   - vid_009_make (21 poses, 9 emotions, glow aura, embellishments)
 *
 * Result: ~30 unique poses, 9 emotions, glow aura, all embellishments.
 * Fully generic — works with any color, scale, position.
 */

import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Pose =
  | "standing" | "pointing" | "hero_pose" | "victory_pose" | "thumbs_up"
  | "shocked" | "epic_win" | "storytelling_pose" | "mind_blown" | "celebrate"
  | "jumping" | "idle" | "confused" | "scratching_head" | "painting"
  | "shoving" | "cash" | "cheering" | "pointing_up" | "nodding" | "tracking"
  // Merged from english-made-fun:
  | "falling" | "flying" | "facepalm" | "winking" | "dancing" | "shrug"
  | "sitting" | "kneeling" | "running" | "waving";

export type Emotion =
  | "happy" | "sad" | "shocked" | "victorious" | "confused"
  | "excited" | "neutral" | "wide_eyes" | "wow";

export interface StickmanProps {
  pose?: Pose | string;
  emotion?: Emotion | string;
  x?: number;
  y?: number;
  color?: string;
  scale?: number;
  flipX?: boolean;
  trackX?: number;
}

// ─── Skeleton Definitions ─────────────────────────────────────────────────────

interface Skeleton {
  headCx: number; headCy: number;
  spineX1: number; spineY1: number;
  spineX2: number; spineY2: number;
  shoulderX: number; shoulderY: number;
  lArmX: number; lArmY: number;
  rArmX: number; rArmY: number;
  lLegX: number; lLegY: number;
  rLegX: number; rLegY: number;
}

const SKELETONS: Record<Pose, Skeleton> = {
  standing: {
    headCx: 0, headCy: -62, spineX1: 0, spineY1: -46, spineX2: 0, spineY2: 0,
    shoulderX: 0, shoulderY: -34, lArmX: -32, lArmY: -14, rArmX: 32, rArmY: -14,
    lLegX: -20, lLegY: 38, rLegX: 20, rLegY: 38,
  },
  pointing: {
    headCx: 0, headCy: -62, spineX1: 0, spineY1: -46, spineX2: 0, spineY2: 0,
    shoulderX: 0, shoulderY: -34, lArmX: -32, lArmY: -14, rArmX: 56, rArmY: -18,
    lLegX: -18, lLegY: 38, rLegX: 18, rLegY: 38,
  },
  hero_pose: {
    headCx: 0, headCy: -62, spineX1: 0, spineY1: -46, spineX2: 0, spineY2: 0,
    shoulderX: 0, shoulderY: -34, lArmX: -42, lArmY: -2, rArmX: 42, rArmY: -2,
    lLegX: -28, lLegY: 38, rLegX: 28, rLegY: 38,
  },
  victory_pose: {
    headCx: 0, headCy: -62, spineX1: 0, spineY1: -46, spineX2: 0, spineY2: 0,
    shoulderX: 0, shoulderY: -34, lArmX: -45, lArmY: -60, rArmX: 45, rArmY: -60,
    lLegX: -24, lLegY: 38, rLegX: 24, rLegY: 38,
  },
  thumbs_up: {
    headCx: 0, headCy: -62, spineX1: 0, spineY1: -46, spineX2: 0, spineY2: 0,
    shoulderX: 0, shoulderY: -34, lArmX: -32, lArmY: -14, rArmX: 38, rArmY: -52,
    lLegX: -18, lLegY: 38, rLegX: 18, rLegY: 38,
  },
  shocked: {
    headCx: 0, headCy: -65, spineX1: 0, spineY1: -49, spineX2: 0, spineY2: 2,
    shoulderX: 0, shoulderY: -37, lArmX: -50, lArmY: -20, rArmX: 50, rArmY: -20,
    lLegX: -26, lLegY: 40, rLegX: 26, rLegY: 40,
  },
  epic_win: {
    headCx: 0, headCy: -76, spineX1: 0, spineY1: -60, spineX2: 0, spineY2: -10,
    shoulderX: 0, shoulderY: -48, lArmX: -56, lArmY: -74, rArmX: 56, rArmY: -74,
    lLegX: -36, lLegY: 28, rLegX: 36, rLegY: 28,
  },
  storytelling_pose: {
    headCx: 0, headCy: -62, spineX1: 0, spineY1: -46, spineX2: 0, spineY2: 0,
    shoulderX: 0, shoulderY: -34, lArmX: -16, lArmY: -2, rArmX: 52, rArmY: -26,
    lLegX: -18, lLegY: 38, rLegX: 18, rLegY: 38,
  },
  mind_blown: {
    headCx: 0, headCy: -68, spineX1: 0, spineY1: -52, spineX2: 0, spineY2: 0,
    shoulderX: 0, shoulderY: -40, lArmX: -54, lArmY: -36, rArmX: 54, rArmY: -36,
    lLegX: -24, lLegY: 40, rLegX: 24, rLegY: 40,
  },
  celebrate: {
    headCx: 0, headCy: -76, spineX1: 0, spineY1: -60, spineX2: 0, spineY2: -14,
    shoulderX: 0, shoulderY: -48, lArmX: -46, lArmY: -68, rArmX: 46, rArmY: -68,
    lLegX: -32, lLegY: 24, rLegX: 32, rLegY: 24,
  },
  jumping: {
    headCx: 0, headCy: -72, spineX1: 0, spineY1: -56, spineX2: 0, spineY2: -14,
    shoulderX: 0, shoulderY: -44, lArmX: -38, lArmY: -30, rArmX: 38, rArmY: -30,
    lLegX: -28, lLegY: 24, rLegX: 28, rLegY: 24,
  },
  idle: {
    headCx: 0, headCy: -60, spineX1: 0, spineY1: -44, spineX2: 2, spineY2: 2,
    shoulderX: 0, shoulderY: -32, lArmX: -28, lArmY: -8, rArmX: 28, rArmY: -8,
    lLegX: -18, lLegY: 40, rLegX: 18, rLegY: 40,
  },
  confused: {
    headCx: 4, headCy: -64, spineX1: 0, spineY1: -48, spineX2: 0, spineY2: 0,
    shoulderX: 0, shoulderY: -36, lArmX: -30, lArmY: -10, rArmX: 36, rArmY: -28,
    lLegX: -18, lLegY: 38, rLegX: 18, rLegY: 38,
  },
  scratching_head: {
    headCx: 0, headCy: -62, spineX1: 0, spineY1: -46, spineX2: 0, spineY2: 0,
    shoulderX: 0, shoulderY: -34, lArmX: -30, lArmY: -12, rArmX: 18, rArmY: -62,
    lLegX: -18, lLegY: 38, rLegX: 18, rLegY: 38,
  },
  painting: {
    headCx: 0, headCy: -62, spineX1: 0, spineY1: -46, spineX2: 0, spineY2: 0,
    shoulderX: 0, shoulderY: -34, lArmX: -40, lArmY: -18, rArmX: 52, rArmY: -30,
    lLegX: -20, lLegY: 38, rLegX: 20, rLegY: 38,
  },
  shoving: {
    headCx: 0, headCy: -62, spineX1: 0, spineY1: -46, spineX2: 4, spineY2: 0,
    shoulderX: 0, shoulderY: -34, lArmX: 44, lArmY: -22, rArmX: 48, rArmY: -16,
    lLegX: -24, lLegY: 38, rLegX: 16, rLegY: 38,
  },
  cash: {
    headCx: 0, headCy: -62, spineX1: 0, spineY1: -46, spineX2: 0, spineY2: 0,
    shoulderX: 0, shoulderY: -34, lArmX: -36, lArmY: -20, rArmX: 44, rArmY: -30,
    lLegX: -18, lLegY: 38, rLegX: 18, rLegY: 38,
  },
  cheering: {
    headCx: 0, headCy: -72, spineX1: 0, spineY1: -56, spineX2: 0, spineY2: -8,
    shoulderX: 0, shoulderY: -44, lArmX: -50, lArmY: -66, rArmX: 50, rArmY: -66,
    lLegX: -30, lLegY: 30, rLegX: 30, rLegY: 30,
  },
  pointing_up: {
    headCx: 0, headCy: -62, spineX1: 0, spineY1: -46, spineX2: 0, spineY2: 0,
    shoulderX: 0, shoulderY: -34, lArmX: -30, lArmY: -12, rArmX: 20, rArmY: -70,
    lLegX: -18, lLegY: 38, rLegX: 18, rLegY: 38,
  },
  nodding: {
    headCx: 2, headCy: -58, spineX1: 0, spineY1: -44, spineX2: 0, spineY2: 0,
    shoulderX: 0, shoulderY: -32, lArmX: -28, lArmY: -10, rArmX: 28, rArmY: -10,
    lLegX: -18, lLegY: 38, rLegX: 18, rLegY: 38,
  },
  tracking: {
    headCx: 0, headCy: -62, spineX1: 0, spineY1: -46, spineX2: 0, spineY2: 0,
    shoulderX: 0, shoulderY: -34, lArmX: -28, lArmY: -10, rArmX: 28, rArmY: -10,
    lLegX: -18, lLegY: 38, rLegX: 18, rLegY: 38,
  },
  // Merged from english-made-fun
  falling: {
    headCx: 8, headCy: -55, spineX1: 4, spineY1: -40, spineX2: 10, spineY2: 5,
    shoulderX: 4, shoulderY: -30, lArmX: -20, lArmY: -45, rArmX: 40, rArmY: -40,
    lLegX: -10, lLegY: 42, rLegX: 30, rLegY: 35,
  },
  flying: {
    headCx: 0, headCy: -70, spineX1: 0, spineY1: -54, spineX2: 0, spineY2: -12,
    shoulderX: 0, shoulderY: -42, lArmX: -55, lArmY: -58, rArmX: 55, rArmY: -58,
    lLegX: -20, lLegY: 24, rLegX: 20, rLegY: 24,
  },
  facepalm: {
    headCx: 0, headCy: -60, spineX1: 0, spineY1: -44, spineX2: 2, spineY2: 2,
    shoulderX: 0, shoulderY: -32, lArmX: -30, lArmY: -10, rArmX: 8, rArmY: -58,
    lLegX: -18, lLegY: 40, rLegX: 18, rLegY: 40,
  },
  winking: {
    headCx: 0, headCy: -62, spineX1: 0, spineY1: -46, spineX2: 0, spineY2: 0,
    shoulderX: 0, shoulderY: -34, lArmX: -32, lArmY: -14, rArmX: 38, rArmY: -52,
    lLegX: -18, lLegY: 38, rLegX: 18, rLegY: 38,
  },
  dancing: {
    headCx: 0, headCy: -70, spineX1: 0, spineY1: -54, spineX2: 4, spineY2: -6,
    shoulderX: 0, shoulderY: -42, lArmX: -48, lArmY: -56, rArmX: 44, rArmY: -20,
    lLegX: -32, lLegY: 30, rLegX: 28, rLegY: 26,
  },
  shrug: {
    headCx: 0, headCy: -62, spineX1: 0, spineY1: -46, spineX2: 0, spineY2: 0,
    shoulderX: 0, shoulderY: -34, lArmX: -44, lArmY: -30, rArmX: 44, rArmY: -30,
    lLegX: -18, lLegY: 38, rLegX: 18, rLegY: 38,
  },
  sitting: {
    headCx: 0, headCy: -62, spineX1: 0, spineY1: -46, spineX2: 0, spineY2: 0,
    shoulderX: 0, shoulderY: -34, lArmX: -28, lArmY: -4, rArmX: 28, rArmY: -4,
    lLegX: -22, lLegY: 20, rLegX: 22, rLegY: 20,
  },
  kneeling: {
    headCx: 0, headCy: -48, spineX1: 0, spineY1: -32, spineX2: 0, spineY2: 8,
    shoulderX: 0, shoulderY: -22, lArmX: -28, lArmY: -2, rArmX: 28, rArmY: -2,
    lLegX: -16, lLegY: 30, rLegX: 16, rLegY: 20,
  },
  running: {
    headCx: 6, headCy: -64, spineX1: 4, spineY1: -48, spineX2: 0, spineY2: 0,
    shoulderX: 4, shoulderY: -36, lArmX: -36, lArmY: -20, rArmX: 44, rArmY: -24,
    lLegX: -28, lLegY: 36, rLegX: 30, rLegY: 32,
  },
  waving: {
    headCx: 0, headCy: -62, spineX1: 0, spineY1: -46, spineX2: 0, spineY2: 0,
    shoulderX: 0, shoulderY: -34, lArmX: -30, lArmY: -12, rArmX: 42, rArmY: -56,
    lLegX: -18, lLegY: 38, rLegX: 18, rLegY: 38,
  },
};

// ─── Pose / Emotion Aliases ───────────────────────────────────────────────────

const POSE_MAP: Record<string, Pose> = {
  juggling_pose: "pointing", baking_gesture: "painting", push_gesture: "shoving",
  money_gesture: "cash", explosion_pose: "epic_win", dramatic_point_at_camera: "pointing",
  side_by_side_compare: "hero_pose", present_gift_pose: "thumbs_up",
  write_on_board: "storytelling_pose", bridge_gesture: "hero_pose",
  bridge_building_gesture: "hero_pose", hero_cape_pose: "hero_pose",
  world_transforms_around_hero: "epic_win", thinking: "scratching_head",
  scratch: "scratching_head", create: "painting", force: "shoving", earn: "cash",
  cheer: "cheering", nod: "nodding", point_up: "pointing_up", track: "tracking",
  trip: "falling", fail: "falling", win: "victory_pose", cape: "hero_pose",
  fly_off: "flying", cameo_wave: "waving", wave: "waving", dance: "dancing",
  sit: "sitting", kneel: "kneeling", run: "running", point: "pointing",
};

const EMOTION_MAP: Record<string, Emotion> = {
  serious: "neutral", confident: "victorious", triumphant: "victorious",
  energetic: "excited", intense: "excited", focused: "neutral",
  heroic: "victorious", powerful: "victorious", surprised: "wow",
  amazed: "wow", curious: "wide_eyes", attentive: "wide_eyes",
};

function resolvePose(raw?: string): Pose {
  if (!raw) return "standing";
  const n = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (n in SKELETONS) return n as Pose;
  return POSE_MAP[n] ?? "standing";
}

function resolveEmotion(raw?: string): Emotion {
  if (!raw) return "neutral";
  const n = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const valid: Emotion[] = ["happy", "sad", "shocked", "victorious", "confused", "excited", "neutral", "wide_eyes", "wow"];
  if ((valid as string[]).includes(n)) return n as Emotion;
  return EMOTION_MAP[n] ?? "neutral";
}

// ─── Face Renderers ───────────────────────────────────────────────────────────

const HEAD_R = 14;

function LeftEye({ emotion, color }: { emotion: Emotion; color: string }) {
  switch (emotion) {
    case "happy": case "victorious":
      return <path d="M -7,-6 Q -5,-4 -3,-6" stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" />;
    case "shocked": case "wide_eyes": case "wow":
      return <circle cx="-5" cy="-5" r="3.5" stroke={color} strokeWidth={1.8} fill="none" />;
    case "excited":
      return <circle cx="-5" cy="-5" r="2.8" stroke={color} strokeWidth={1.8} fill="none" />;
    default:
      return <circle cx="-5" cy="-5" r="1.6" fill={color} />;
  }
}

function RightEye({ emotion, color }: { emotion: Emotion; color: string }) {
  switch (emotion) {
    case "happy": case "victorious":
      return <path d="M 3,-6 Q 5,-4 7,-6" stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" />;
    case "shocked": case "wide_eyes": case "wow":
      return <circle cx="5" cy="-5" r="3.5" stroke={color} strokeWidth={1.8} fill="none" />;
    case "confused":
      return (
        <>
          <circle cx="5" cy="-5" r="1.6" fill={color} />
          <path d="M 3,-9 Q 5,-11 7,-9" stroke={color} strokeWidth={1.2} fill="none" strokeLinecap="round" />
        </>
      );
    case "excited":
      return <circle cx="5" cy="-5" r="2.8" stroke={color} strokeWidth={1.8} fill="none" />;
    default:
      return <circle cx="5" cy="-5" r="1.6" fill={color} />;
  }
}

function Mouth({ emotion, color }: { emotion: Emotion; color: string }) {
  switch (emotion) {
    case "happy":
      return <path d="M -5,3 Q 0,8 5,3" stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" />;
    case "victorious": case "excited":
      return <path d="M -6,2 Q 0,10 6,2" stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" />;
    case "sad":
      return <path d="M -5,7 Q 0,3 5,7" stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" />;
    case "shocked":
      return <ellipse cx="0" cy="5" rx="3.5" ry="4.5" stroke={color} strokeWidth={1.8} fill="none" />;
    case "wow":
      return <ellipse cx="0" cy="4" rx="4" ry="5" stroke={color} strokeWidth={1.8} fill="none" />;
    case "wide_eyes":
      return <line x1="-4" y1="4" x2="4" y2="4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />;
    case "confused":
      return <path d="M -5,5 Q -2,3 1,5 Q 4,7 6,5" stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" />;
    default:
      return <line x1="-4" y1="4" x2="4" y2="4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />;
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export const Stickman: React.FC<StickmanProps> = ({
  pose: rawPose = "standing",
  emotion: rawEmotion = "neutral",
  x = 540,
  y = 960,
  color = "#ffffff",
  scale: baseScale = 1,
  flipX = false,
  trackX,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pose = resolvePose(rawPose as string);
  const emotion = resolveEmotion(rawEmotion as string);
  const sk = SKELETONS[pose] ?? SKELETONS.standing;
  const t = frame / fps;

  // ── Entrance spring ────────────────────────────────────────────────────────
  const entranceSpring = spring({
    frame, fps,
    config: { damping: 12, stiffness: 80, mass: 1.1 },
    durationInFrames: 42,
  });
  const entranceScale = interpolate(entranceSpring, [0, 1], [0, 1]);

  // ── Jump offset ────────────────────────────────────────────────────────────
  const jumpSpring = spring({ frame, fps, config: { damping: 10, stiffness: 90, mass: 1.0 } });
  const jumpY = (pose === "jumping" || pose === "celebrate" || pose === "epic_win")
    ? interpolate(jumpSpring, [0, 1], [0, -32], { extrapolateRight: "clamp" })
    : 0;

  // ── Shock scale ────────────────────────────────────────────────────────────
  const shockSpring = spring({
    frame, fps, config: { damping: 6, stiffness: 200, mass: 0.6 }, durationInFrames: 30,
  });
  const shockScale = (pose === "shocked" || pose === "mind_blown")
    ? interpolate(shockSpring, [0, 0.5, 1], [0.6, 1.25, 1.1], { extrapolateRight: "clamp" })
    : 1;

  // ── Celebrate bounce ───────────────────────────────────────────────────────
  const celebSpring = spring({
    frame, fps, config: { damping: 12, stiffness: 120, mass: 0.9 },
  });
  const celebScale = (pose === "celebrate" || pose === "epic_win")
    ? interpolate(celebSpring, [0, 1], [0.6, 1.05], { extrapolateRight: "clamp" })
    : 1;

  // ── Idle bob ───────────────────────────────────────────────────────────────
  const idleBob = Math.sin(t * Math.PI * 1.8) * 3;

  // ── Storytelling gesture ───────────────────────────────────────────────────
  const storyGestureX = pose === "storytelling_pose" ? Math.sin(t * Math.PI * 1.2) * 8 : 0;

  // ── Nodding bob ────────────────────────────────────────────────────────────
  const nodBob = pose === "nodding" ? Math.sin(t * Math.PI * 3) * 4 : 0;

  // ── Scratching oscillation ─────────────────────────────────────────────────
  const scratchOsc = pose === "scratching_head" ? Math.sin(t * Math.PI * 6) * 3 : 0;

  // ── Glow aura ──────────────────────────────────────────────────────────────
  const auraIntensity = interpolate(Math.sin(t * Math.PI * 1.5), [-1, 1], [6, 18]);

  const combinedScale = entranceScale * shockScale * celebScale * baseScale;
  const combinedY = jumpY + idleBob;

  // ── Pointing arm spring ────────────────────────────────────────────────────
  const pointSpring = spring({
    frame, fps, config: { damping: 14, stiffness: 220, mass: 0.6 }, durationInFrames: 18,
  });
  const rArmXFinal = (pose === "pointing" || pose === "storytelling_pose")
    ? interpolate(pointSpring, [0, 1], [sk.shoulderX, sk.rArmX]) + storyGestureX
    : sk.rArmX;
  const rArmYFinal = (pose === "pointing" || pose === "storytelling_pose")
    ? interpolate(pointSpring, [0, 1], [sk.shoulderY, sk.rArmY])
    : sk.rArmY;

  // ── Arm swing micro-animation ──────────────────────────────────────────────
  const armSwing = (pose === "standing" || pose === "thumbs_up")
    ? Math.sin(t * Math.PI * 2.5) * 2 : 0;

  // ── Tracking head offset ───────────────────────────────────────────────────
  const trackHeadX = pose === "tracking" && trackX != null
    ? interpolate(trackX - x, [-400, 0, 400], [-8, 0, 8], {
        extrapolateLeft: "clamp", extrapolateRight: "clamp",
      })
    : 0;

  const flipScale = flipX ? -1 : 1;

  // ── Right-edge clamp ──────────────────────────────────────────────────────
  const CANVAS_W = 1080;
  const CLAMP_MARGIN = 80;
  const maxSvgX = CANVAS_W - CLAMP_MARGIN;
  const ppu = 4.5 * baseScale;
  const clampRight = (sx: number) => {
    const screenX = x + sx * ppu * combinedScale;
    if (screenX > maxSvgX) return (maxSvgX - x) / (ppu * combinedScale);
    return sx;
  };

  const clampedRArm = { x: clampRight(rArmXFinal), y: rArmYFinal + scratchOsc };
  const clampedRLeg = { x: clampRight(sk.rLegX), y: sk.rLegY };

  const viewW = 120;
  const viewH = 160;
  const svgW = viewW * 4.5 * baseScale;
  const svgH = viewH * 4.5 * baseScale;

  return (
    <svg
      width={svgW}
      height={svgH}
      viewBox={`${-viewW / 2} ${-viewH / 2 - 20} ${viewW} ${viewH}`}
      style={{
        position: "absolute",
        left: x - svgW / 2,
        top: y - svgH / 2,
        transform: `scaleX(${flipScale}) scale(${combinedScale}) translateY(${combinedY}px)`,
        transformOrigin: "center center",
        overflow: "visible",
      }}
    >
      {/* Glow aura */}
      <defs>
        <filter id={`stickman-glow-${x}-${y}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation={auraIntensity * 0.5} />
        </filter>
      </defs>

      <g filter={`url(#stickman-glow-${x}-${y})`} opacity={0.3}>
        <line x1={sk.spineX1} y1={sk.spineY1} x2={sk.spineX2} y2={sk.spineY2}
          stroke={color} strokeWidth={6} strokeLinecap="round" />
        <circle cx={sk.headCx + trackHeadX} cy={sk.headCy} r={HEAD_R + 2}
          stroke={color} strokeWidth={4} fill="none" />
      </g>

      {/* Body */}
      <line x1={sk.spineX1} y1={sk.spineY1} x2={sk.spineX2} y2={sk.spineY2}
        stroke={color} strokeWidth={4} strokeLinecap="round" />
      <line x1={sk.shoulderX} y1={sk.shoulderY} x2={sk.lArmX + armSwing} y2={sk.lArmY}
        stroke={color} strokeWidth={4} strokeLinecap="round" />
      <line x1={sk.shoulderX} y1={sk.shoulderY} x2={clampedRArm.x} y2={clampedRArm.y}
        stroke={color} strokeWidth={4} strokeLinecap="round" />
      <line x1={sk.spineX2} y1={sk.spineY2} x2={sk.lLegX} y2={sk.lLegY}
        stroke={color} strokeWidth={4} strokeLinecap="round" />
      <line x1={sk.spineX2} y1={sk.spineY2} x2={clampedRLeg.x} y2={clampedRLeg.y}
        stroke={color} strokeWidth={4} strokeLinecap="round" />
      {/* Head */}
      <circle cx={sk.headCx + trackHeadX} cy={sk.headCy + nodBob} r={HEAD_R}
        stroke={color} strokeWidth={3} fill="none" />
      {/* Face */}
      <g transform={`translate(${sk.headCx + trackHeadX}, ${sk.headCy + nodBob})`}>
        <LeftEye emotion={emotion} color={color} />
        <RightEye emotion={emotion} color={color} />
        <Mouth emotion={emotion} color={color} />
      </g>

      {/* ── Embellishments ── */}

      {/* Painting: brush + cake */}
      {pose === "painting" && (
        <>
          <rect x={clampedRArm.x - 2} y={sk.rArmY - 12} width={4} height={16} rx={2} fill="#8B4513" />
          <rect x={clampedRArm.x - 4} y={sk.rArmY - 16} width={8} height={6} rx={1} fill="#00d4ff" />
          {[0, 1, 2].map((di) => (
            <circle key={di} cx={clampedRArm.x - 8 - di * 6} cy={sk.rArmY - 10 + di * 4}
              r={2.5 - di * 0.5} fill="#00d4ff" opacity={0.7 - di * 0.2} />
          ))}
          <g transform={`translate(${clampRight(sk.rArmX + 18)}, ${sk.rArmY + 8})`}
             opacity={interpolate(frame, [24, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}>
            <rect x={-10} y={-4} width={20} height={10} rx={2} fill="#f7c948" />
            <rect x={-10} y={-8} width={20} height={5} rx={2} fill="#ff8ec4" />
            <rect x={-1} y={-14} width={2} height={7} rx={1} fill="#ffffff" />
            <ellipse cx={0} cy={-16} rx={2} ry={3} fill="#ff6600" opacity={0.9 + Math.sin(t * 12) * 0.1} />
          </g>
        </>
      )}

      {/* Cash: $$ sign + sparkles */}
      {pose === "cash" && (
        <>
          <text x={clampRight(sk.rArmX + 6)} y={sk.rArmY - 6} fontSize={14}
            fontWeight="bold" fill="#ffe600" textAnchor="middle">$$</text>
          {[0, 1, 2, 3].map((si) => {
            const angle = (si / 4) * Math.PI * 2 + t * 3;
            const sr = 12 + Math.sin(t * 4 + si) * 3;
            return (
              <circle key={si} cx={clampRight(sk.rArmX + 6 + Math.cos(angle) * sr)}
                cy={sk.rArmY - 6 + Math.sin(angle) * sr} r={1.5} fill="#ffe600" opacity={0.8} />
            );
          })}
        </>
      )}

      {/* Pointing up: finger triangle */}
      {pose === "pointing_up" && (
        <polygon
          points={`${clampRight(sk.rArmX)},${sk.rArmY - 8} ${clampRight(sk.rArmX) - 3},${sk.rArmY} ${clampRight(sk.rArmX) + 3},${sk.rArmY}`}
          fill={color} opacity={0.9} />
      )}

      {/* Shoving: pushed stickman */}
      {pose === "shoving" && (
        <g transform={`translate(${clampRight(50)}, -2)`} opacity={0.45}>
          <line x1={0} y1={-44} x2={4} y2={2} stroke={color} strokeWidth={3} strokeLinecap="round" />
          <circle cx={2} cy={-58} r={10} stroke={color} strokeWidth={2} fill="none" />
          <line x1={0} y1={-32} x2={-18} y2={-14} stroke={color} strokeWidth={3} strokeLinecap="round" />
          <line x1={0} y1={-32} x2={clampRight(20)} y2={-10} stroke={color} strokeWidth={3} strokeLinecap="round" />
          <line x1={4} y1={2} x2={-10} y2={36} stroke={color} strokeWidth={3} strokeLinecap="round" />
          <line x1={4} y1={2} x2={clampRight(18)} y2={34} stroke={color} strokeWidth={3} strokeLinecap="round" />
        </g>
      )}

      {/* Thumbs up: thumb indicator */}
      {pose === "thumbs_up" && (
        <g transform={`translate(${clampRight(sk.rArmX)}, ${sk.rArmY - 6})`}>
          <rect x={-2} y={-8} width={4} height={12} rx={2} fill={color} opacity={0.8} />
          <circle cx={0} cy={-10} r={3} fill={color} opacity={0.8} />
        </g>
      )}

      {/* Waving: motion lines */}
      {pose === "waving" && (
        <>
          {[0, 1, 2].map((i) => {
            const waveOff = Math.sin(t * Math.PI * 4 + i * 0.5) * 3;
            return (
              <line key={i} x1={clampRight(sk.rArmX + 6 + i * 4)} y1={sk.rArmY - 10 + waveOff}
                x2={clampRight(sk.rArmX + 6 + i * 4)} y2={sk.rArmY - 2 + waveOff}
                stroke={color} strokeWidth={1.5} opacity={0.5 - i * 0.15} strokeLinecap="round" />
            );
          })}
        </>
      )}
    </svg>
  );
};
