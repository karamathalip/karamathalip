// components/VideoTemplate.tsx
// Main Remotion composition: sequences all storyboard scenes + audio
import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  useVideoConfig,
  interpolate,
  useCurrentFrame,
  spring,
} from "remotion";
import { Scene } from "./Scene";
import { z } from "zod";

// ── Zod schema for video props ─────────────────────────────────────────────
export const videoSchema = z.object({
  video_id: z.string(),
  format: z.enum(["fail_fix", "word_explosion", "superpower"]),
  video_title: z.string(),
  hook_text: z.string(),
  storyboard: z.array(
    z.object({
      time: z.string(),
      scene_description: z.string(),
      on_screen_text: z.string(),
      stickman_pose: z.string(),
      text_color: z.string().optional(),
      background_color: z.string().optional(),
      effects: z.array(z.string()).optional(),
      imagePath: z.string().optional(),
    })
  ),
  script_lines: z.array(z.string()),
  voiceAudioPath: z.string().optional(),
  sfxPaths: z.record(z.string()).optional(),
  framesPerScene: z.number().optional(),
});

export type VideoProps = z.infer<typeof videoSchema>;

// Scene duration in frames (default: 90 frames = 3s at 30fps)
const DEFAULT_FRAMES_PER_SCENE = 90;

export const VideoTemplate: React.FC<VideoProps> = ({
  video_id,
  format,
  video_title,
  hook_text,
  storyboard,
  voiceAudioPath,
  sfxPaths,
  framesPerScene = DEFAULT_FRAMES_PER_SCENE,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Determine phase per scene
  const getPhase = (sceneIndex: number, totalScenes: number): string => {
    const progress = sceneIndex / totalScenes;
    if (progress < 0.1) return "hook";
    if (format === "fail_fix") {
      if (progress < 0.35) return "fail";
      if (progress < 0.65) return "correct";
      return "remix";
    }
    if (format === "word_explosion") {
      if (progress < 0.3) return "explosion";
      return "explosion";
    }
    if (format === "superpower") {
      if (progress < 0.5) return "powerup";
      return "powerup";
    }
    return "hook";
  };

  return (
    <AbsoluteFill style={{ backgroundColor: "#F0F8FF", fontFamily: "Montserrat, Poppins, sans-serif" }}>

      {/* ── Voice narration (full duration) ─────────────────────────── */}
      {voiceAudioPath && (
        <Audio src={voiceAudioPath} volume={1} />
      )}

      {/* ── Background SFX ──────────────────────────────────────────── */}
      {sfxPaths?.background && (
        <Audio src={sfxPaths.background} volume={0.15} loop />
      )}

      {/* ── Scene sequences ──────────────────────────────────────────── */}
      {storyboard.map((scene, index) => {
        const startFrame = index * framesPerScene;
        const phase = getPhase(index, storyboard.length);

        // SFX for this scene
        const sfxKey = getSFXKeyForPhase(phase, format);
        const sceneSFXPath = sfxKey ? sfxPaths?.[sfxKey] : undefined;

        return (
          <Sequence
            key={`scene-${index}`}
            from={startFrame}
            durationInFrames={framesPerScene}
            name={`Scene ${index + 1}: ${scene.time}`}
          >
            <Scene scene={scene} format={format} phase={phase} />

            {/* Scene SFX */}
            {sceneSFXPath && index > 0 && (
              <Audio src={sceneSFXPath} volume={0.7} />
            )}

            {/* Hook SFX on first frame */}
            {index === 0 && sfxPaths?.hook && (
              <Audio src={sfxPaths.hook} volume={0.9} />
            )}
          </Sequence>
        );
      })}

      {/* ── Persistent title bar (bottom) ────────────────────────────── */}
      <TitleBar title={video_title} frame={frame} fps={fps} totalFrames={storyboard.length * framesPerScene} />
    </AbsoluteFill>
  );
};

// ── Title Bar ─────────────────────────────────────────────────────────────────
const TitleBar: React.FC<{ title: string; frame: number; fps: number; totalFrames: number }> = ({
  title, frame, fps, totalFrames,
}) => {
  const opacity = interpolate(frame, [0, fps * 0.5, totalFrames - fps * 0.5, totalFrames], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        bottom: 28,
        left: "5%",
        right: "5%",
        opacity,
        textAlign: "center",
      }}
    >
      <div
        style={{
          display: "inline-block",
          backgroundColor: "rgba(31, 142, 241, 0.92)",
          color: "white",
          fontFamily: "'Montserrat', sans-serif",
          fontWeight: 800,
          fontSize: 18,
          padding: "8px 24px",
          borderRadius: 30,
          letterSpacing: "0.3px",
          maxWidth: "90%",
          boxShadow: "0 4px 16px rgba(31,142,241,0.4)",
        }}
      >
        {title}
      </div>
    </div>
  );
};

// ── SFX mapping ───────────────────────────────────────────────────────────────
function getSFXKeyForPhase(phase: string, format: string): string | null {
  if (phase === "fail") return "fail";
  if (phase === "correct") return "correct";
  if (phase === "explosion") return "explosion";
  if (phase === "powerup") return "powerup";
  if (phase === "remix") return "transition";
  return null;
}
