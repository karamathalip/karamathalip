// components/Scene.tsx
// Renders a single storyboard scene with text, stickman, and effects
import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  AbsoluteFill,
  Img,
} from "remotion";
import { Stickman, StickmanPose } from "./Stickman";
import { Background } from "./Background";

interface StoryboardScene {
  time: string;
  scene_description: string;
  on_screen_text: string;
  stickman_pose: string;
  text_color: string;
  background_color: string;
  effects: string[];
  imagePath?: string;
}

interface SceneProps {
  scene: StoryboardScene;
  format: "fail_fix" | "word_explosion" | "superpower";
  phase?: string;
}

export const Scene: React.FC<SceneProps> = ({ scene, format, phase }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // ── Text animation: pop in then settle ───────────────────────────────────
  const textScale = spring({ frame, fps, config: { damping: 12, stiffness: 200 }, from: 0.3, to: 1 });
  const textOpacity = interpolate(frame, [0, fps * 0.15], [0, 1], { extrapolateRight: "clamp" });

  // ── Background image fade ─────────────────────────────────────────────────
  const imgOpacity = interpolate(frame, [0, fps * 0.4], [0, 0.25], { extrapolateRight: "clamp" });

  // ── Determine stickman pose from string ───────────────────────────────────
  const pose = normalise_pose(scene.stickman_pose) as StickmanPose;

  // ── Text color override by effects ───────────────────────────────────────
  const textColor = scene.text_color || (format === "word_explosion" ? "#FFFFFF" : "#1A1A1A");
  const isWrong = scene.effects?.includes("wrong") || textColor === "#FF3B30";
  const isCorrect = scene.effects?.includes("correct") || textColor === "#34C759";

  return (
    <AbsoluteFill>
      {/* Background */}
      <Background
        format={format}
        phase={phase as any}
        backgroundColor={scene.background_color}
      />

      {/* Optional scene image (low opacity, artistic) */}
      {scene.imagePath && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: imgOpacity,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Img
            src={scene.imagePath}
            style={{ width: "70%", height: "70%", objectFit: "contain" }}
          />
        </div>
      )}

      {/* Stickman */}
      <Stickman
        pose={pose}
        color={isCorrect ? "#34C759" : isWrong ? "#FF3B30" : "#1F8EF1"}
        scale={1.3}
        x={width * 0.35}
        y={height * 0.38}
      />

      {/* Main on-screen text */}
      <div
        style={{
          position: "absolute",
          top: height * 0.12,
          left: "5%",
          right: "5%",
          textAlign: "center",
          transform: `scale(${textScale})`,
          opacity: textOpacity,
        }}
      >
        <div
          style={{
            fontFamily: "'Montserrat', 'Poppins', sans-serif",
            fontWeight: 900,
            fontSize: getTextSize(scene.on_screen_text, width),
            color: textColor,
            lineHeight: 1.2,
            textShadow: format === "word_explosion"
              ? `0 0 30px ${textColor}88, 0 0 60px ${textColor}44`
              : "2px 2px 0px rgba(0,0,0,0.15)",
            letterSpacing: "-0.5px",
            padding: "0 8px",
          }}
        >
          {scene.on_screen_text}
        </div>
      </div>

      {/* Wrong/Correct label badge */}
      {(isWrong || isCorrect) && (
        <div
          style={{
            position: "absolute",
            top: height * 0.06,
            left: "50%",
            transform: `translateX(-50%) scale(${textScale})`,
            backgroundColor: isWrong ? "#FF3B30" : "#34C759",
            color: "white",
            fontFamily: "'Montserrat', sans-serif",
            fontWeight: 900,
            fontSize: 22,
            padding: "6px 20px",
            borderRadius: 30,
            letterSpacing: "1px",
            boxShadow: `0 4px 16px ${isWrong ? "#FF3B3066" : "#34C75966"}`,
          }}
        >
          {isWrong ? "✗  WRONG" : "✓  CORRECT"}
        </div>
      )}
    </AbsoluteFill>
  );
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalise_pose(raw?: string): StickmanPose {
  if (!raw) return "idle";
  const lower = raw.toLowerCase();
  if (lower.includes("fail") || lower.includes("trip") || lower.includes("fall")) return "fail";
  if (lower.includes("win") || lower.includes("success") || lower.includes("cel")) return "win";
  if (lower.includes("think") || lower.includes("confus")) return "thinking";
  if (lower.includes("point") || lower.includes("teach")) return "pointing";
  if (lower.includes("wave") || lower.includes("bye")) return "waving";
  if (lower.includes("cape") || lower.includes("super") || lower.includes("hero")) return "cape";
  if (lower.includes("jump") || lower.includes("cheer")) return "jumping";
  return "idle";
}

function getTextSize(text: string, width: number): number {
  if (!text) return 40;
  const len = text.length;
  if (len < 20) return Math.round(width * 0.065);
  if (len < 40) return Math.round(width * 0.05);
  return Math.round(width * 0.038);
}
