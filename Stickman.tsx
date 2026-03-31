// components/Stickman.tsx
// Animated stickman character driven entirely by useCurrentFrame()
import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";

export type StickmanPose =
  | "idle"
  | "fail"
  | "win"
  | "thinking"
  | "pointing"
  | "waving"
  | "cape"
  | "jumping";

interface StickmanProps {
  pose?: StickmanPose;
  color?: string;
  scale?: number;
  x?: number;
  y?: number;
  startFrame?: number;
}

export const Stickman: React.FC<StickmanProps> = ({
  pose = "idle",
  color = "#1F8EF1",
  scale = 1,
  x = 0,
  y = 0,
  startFrame = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = Math.max(0, frame - startFrame);

  // ── Shared idle bob ──────────────────────────────────────────────────────
  const bob = Math.sin((f / fps) * Math.PI * 2) * 4;

  // ── Pose-specific transforms ─────────────────────────────────────────────
  const poseData = getPoseData(pose, f, fps, bob);

  const containerStyle: React.CSSProperties = {
    position: "absolute",
    left: x,
    top: y + bob,
    transform: `scale(${scale}) ${poseData.containerTransform}`,
    transformOrigin: "center bottom",
    width: 80,
    height: 140,
  };

  return (
    <div style={containerStyle}>
      <svg
        viewBox="0 0 80 140"
        xmlns="http://www.w3.org/2000/svg"
        style={{ overflow: "visible" }}
      >
        {/* Cape (superpower pose only) */}
        {pose === "cape" && (
          <ellipse
            cx="40"
            cy="70"
            rx="28"
            ry="18"
            fill="#FF9F0A"
            opacity={0.9}
            transform={`rotate(${poseData.capeAngle} 40 70)`}
          />
        )}

        {/* Head */}
        <circle
          cx="40"
          cy={22 + poseData.headOffset}
          r="16"
          stroke={color}
          strokeWidth="3.5"
          fill="white"
        />

        {/* Eyes */}
        <circle cx="35" cy={20 + poseData.headOffset} r="2" fill={color} />
        <circle cx="45" cy={20 + poseData.headOffset} r="2" fill={color} />

        {/* Mouth */}
        {poseData.smile ? (
          <path
            d={`M34 ${27 + poseData.headOffset} Q40 ${32 + poseData.headOffset} 46 ${27 + poseData.headOffset}`}
            stroke={color}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
        ) : (
          <path
            d={`M34 ${30 + poseData.headOffset} Q40 ${26 + poseData.headOffset} 46 ${30 + poseData.headOffset}`}
            stroke={color}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
        )}

        {/* Body */}
        <line
          x1="40" y1={38 + poseData.headOffset}
          x2="40" y2="90"
          stroke={color}
          strokeWidth="3.5"
          strokeLinecap="round"
        />

        {/* Left arm */}
        <line
          x1="40" y1="55"
          x2={20 + poseData.leftArmX} y2={70 + poseData.leftArmY}
          stroke={color}
          strokeWidth="3.5"
          strokeLinecap="round"
        />

        {/* Right arm */}
        <line
          x1="40" y1="55"
          x2={60 + poseData.rightArmX} y2={70 + poseData.rightArmY}
          stroke={color}
          strokeWidth="3.5"
          strokeLinecap="round"
        />

        {/* Left leg */}
        <line
          x1="40" y1="90"
          x2={28 + poseData.leftLegX} y2={130 + poseData.leftLegY}
          stroke={color}
          strokeWidth="3.5"
          strokeLinecap="round"
        />

        {/* Right leg */}
        <line
          x1="40" y1="90"
          x2={52 + poseData.rightLegX} y2={130 + poseData.rightLegY}
          stroke={color}
          strokeWidth="3.5"
          strokeLinecap="round"
        />

        {/* Win star effect */}
        {pose === "win" && f > fps * 0.3 && (
          <text
            x="62"
            y="15"
            fontSize="20"
            textAnchor="middle"
            style={{ animation: "none" }}
          >
            ⭐
          </text>
        )}
      </svg>
    </div>
  );
};

// ── Pose data lookup ─────────────────────────────────────────────────────────
function getPoseData(pose: StickmanPose, f: number, fps: number, bob: number) {
  const wave = Math.sin((f / fps) * Math.PI * 4) * 10;

  const defaults = {
    headOffset: 0,
    leftArmX: 0, leftArmY: 0,
    rightArmX: 0, rightArmY: 0,
    leftLegX: 0, leftLegY: 0,
    rightLegX: 0, rightLegY: 0,
    smile: true,
    containerTransform: "",
    capeAngle: 0,
  };

  switch (pose) {
    case "fail":
      return {
        ...defaults,
        containerTransform: `rotate(${interpolate(f, [0, fps * 0.5], [0, -35], { extrapolateRight: "clamp" })}deg)`,
        smile: false,
        leftArmX: -8, leftArmY: -12,
        rightArmX: 8, rightArmY: -12,
        leftLegX: 8, leftLegY: -5,
        rightLegX: -8, rightLegY: -5,
      };

    case "win":
      return {
        ...defaults,
        leftArmX: -10, leftArmY: -18,
        rightArmX: 10, rightArmY: -18,
        leftLegX: -6, leftLegY: 0,
        rightLegX: 6, rightLegY: 0,
        smile: true,
      };

    case "thinking":
      return {
        ...defaults,
        rightArmX: 2, rightArmY: -20,
        headOffset: -3,
        smile: false,
      };

    case "pointing":
      return {
        ...defaults,
        rightArmX: 16, rightArmY: -8,
        smile: true,
      };

    case "waving":
      return {
        ...defaults,
        rightArmX: wave, rightArmY: -15,
        smile: true,
      };

    case "cape":
      return {
        ...defaults,
        leftArmX: -14, leftArmY: -16,
        rightArmX: 14, rightArmY: -16,
        containerTransform: `translateY(${-Math.abs(Math.sin(f / fps) * 10)}px)`,
        capeAngle: wave * 0.5,
        smile: true,
      };

    case "jumping":
      const jumpY = -Math.abs(Math.sin((f / fps) * Math.PI)) * 20;
      return {
        ...defaults,
        containerTransform: `translateY(${jumpY}px)`,
        leftLegX: -6, leftLegY: -8,
        rightLegX: 6, rightLegY: -8,
        smile: true,
      };

    case "idle":
    default:
      return {
        ...defaults,
        rightArmX: wave * 0.3,
      };
  }
}
