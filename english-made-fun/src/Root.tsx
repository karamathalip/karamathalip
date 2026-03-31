/**
 * src/Root.tsx
 * Remotion root — registers all compositions.
 *
 * Compositions:
 *   "VideoTemplate"  — main pipeline output, 1080×1920 @ 60fps, dynamic duration
 *   "StickmanDemo"   — character test reel, 1080×1920 @ 30fps, fixed duration
 */

import React from "react";
import { Composition, type CalculateMetadataFunction } from "remotion";
import { z } from "zod";

import { VideoTemplate } from "../components/VideoTemplate";
import { StickmanDemoCompositions } from "../components/Stickman";

// ─── Zod Schema ───────────────────────────────────────────────────────────────
// Mirrors the VideoData / SceneData types in components/.
// Validated at render time by Remotion Studio and the CLI renderer.
// The sidebar in Remotion Studio will render an editable form from this schema.

const SfxCueSchema = z.object({
  file: z.string().describe("Path relative to public/ (e.g. audio/sfx/ding.mp3)"),
  startTime: z.number().nonnegative().describe("Offset in seconds from scene start"),
  volume: z.number().min(0).max(1).default(1),
});

const MeaningItemSchema = z.object({
  text: z.string(),
  icon: z.string().describe("Single emoji or short label"),
});

const SceneVisualSchema = z.object({
  template: z
    .enum(["stickman", "text_burst", "dialogue", "word_explosion", "superpower"])
    .default("stickman"),
  // ── stickman / shared ──────────────────────────────────────────────────────
  text: z.string().optional(),
  stickman_action: z.string().optional().describe("Stickman pose name"),
  stickman_emotion: z.string().optional().describe("Stickman emotion name"),
  bg_color: z.string().optional().describe("Hex or rgb background color"),
  bg_image: z.string().optional().describe("Image path relative to public/"),
  effect: z.enum(["correct", "wrong"]).nullable().optional(),
  // ── text_burst ─────────────────────────────────────────────────────────────
  backgroundColor: z.string().optional(),
  textColor: z.string().optional(),
  emphasis: z.enum(["zoom", "shake", "highlight", "pop"]).optional(),
  keywords: z.array(z.string()).optional(),
  // ── dialogue ───────────────────────────────────────────────────────────────
  speaker: z.string().optional(),
  bubbleColor: z.string().optional(),
  emotion: z.string().optional(),
  // ── word_explosion ─────────────────────────────────────────────────────────
  word: z.string().optional(),
  meanings: z.array(MeaningItemSchema).optional(),
  accentColor: z.string().optional(),
  // ── superpower ─────────────────────────────────────────────────────────────
  ruleText: z.string().optional(),
  heroAction: z.string().optional(),
  worldColor: z.string().optional(),
  // ── quiz countdown ──────────────────────────────────────────────────────────
  quizCountdown: z.number().optional().describe("Seconds into scene when 3-2-1 countdown starts"),
});

const SceneDataSchema = z.object({
  id: z.string(),
  duration: z.number().positive().describe("Scene duration in seconds"),
  visual: SceneVisualSchema,
  sfx: z.array(SfxCueSchema).optional(),
});

const CaptionStyleSchema = z.object({
  fontSize: z.number().default(52),
  color: z.string().default("#ffffff"),
  backgroundColor: z.string().default("rgba(0,0,0,0.65)"),
  position: z.enum(["bottom", "middle", "top"]).default("bottom"),
  fontWeight: z.union([z.number(), z.string()]).default(800),
});

// Top-level schema — passed to <Composition schema={...}>
// The prop name "jsonData" matches VideoTemplateProps.jsonData.
export const VideoTemplateSchema = z.object({
  jsonData: z.object({
    title: z.string().describe("Video title — used as default output filename"),
    voice_file: z.string().describe("Voice audio path relative to public/"),
    scenes: z.array(SceneDataSchema).min(1),
    captions: z
      .object({
        file: z.string().optional().describe("Captions JSON path relative to public/"),
        style: CaptionStyleSchema.optional(),
      })
      .optional(),
  }),
});

export type VideoTemplateInput = z.infer<typeof VideoTemplateSchema>;

// ─── Default Props ────────────────────────────────────────────────────────────
// Shown in Remotion Studio as a live preview.
// Replace voice_file with a real file to hear audio in the Studio.

const defaultProps: VideoTemplateInput = {
  jsonData: {
    title: "English Made Fun - Present Tense",
    voice_file: "audio/voices/ep001_narrator.mp3",
    scenes: [
      {
        id: "intro",
        duration: 3,
        visual: {
          template: "text_burst",
          text: "What is the PRESENT TENSE?",
          emphasis: "pop",
          backgroundColor: "#1a1a2e",
        },
      },
      {
        id: "stickman-demo",
        duration: 4,
        visual: {
          template: "stickman",
          text: "I eat breakfast every day.",
          stickman_action: "pointing",
          stickman_emotion: "happy",
          bg_color: "#1e3a5f",
        },
      },
      {
        id: "word-explode",
        duration: 6,
        visual: {
          template: "word_explosion",
          word: "EAT",
          meanings: [
            { text: "To consume food", icon: "🍽️" },
            { text: "I eat / You eat / They eat", icon: "👥" },
            { text: "She EATS — add the -s!", icon: "⚠️" },
          ],
          accentColor: "#00e5ff",
        },
      },
      {
        id: "dialogue",
        duration: 5,
        visual: {
          template: "dialogue",
          speaker: "Teacher",
          text: "Do you eat lunch at school?",
          bubbleColor: "#2563eb",
          emotion: "excited",
        },
      },
      {
        id: "superpower",
        duration: 5,
        visual: {
          template: "superpower",
          ruleText: "Subject + Verb (+s/es) + Object",
          heroAction: "hero_pose",
          worldColor: "#7c3aed",
        },
      },
      {
        id: "victory",
        duration: 3,
        visual: {
          template: "stickman",
          text: "You've mastered the Present Tense! 🎉",
          stickman_action: "epic_win",
          stickman_emotion: "victorious",
          bg_color: "#14532d",
          effect: "correct",
        },
      },
    ],
    captions: {
      style: {
        fontSize: 52,
        color: "#ffffff",
        backgroundColor: "rgba(0,0,0,0.70)",
        position: "bottom",
        fontWeight: 800,
      },
    },
  },
} satisfies VideoTemplateInput;

// ─── calculateMetadata ────────────────────────────────────────────────────────
// Runs before rendering begins (and on every prop change in Studio).
// Dynamically sets durationInFrames from the sum of all scene durations.
// The FPS here MUST match the fps prop on the Composition element below.

const FPS = 60;

const calculateVideoMetadata: CalculateMetadataFunction<VideoTemplateInput> = async ({
  props,
}) => {
  const totalSeconds = props.jsonData.scenes.reduce(
    (sum, scene) => sum + scene.duration,
    0
  );

  // Derive a clean filename from the video title
  const slug = props.jsonData.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return {
    // Every scene's duration is converted to frames at 60fps and summed
    durationInFrames: Math.max(FPS, Math.ceil(totalSeconds * FPS)),
    defaultOutName: `${slug}.mp4`,
  };
};

// ─── Root ─────────────────────────────────────────────────────────────────────

export const Root: React.FC = () => {
  return (
    <>
      {/* ── PRIMARY: Full video pipeline output ─────────────────────────── */}
      <Composition
        id="VideoTemplate"
        component={VideoTemplate}
        // Placeholder duration — overridden by calculateMetadata at render time
        durationInFrames={FPS * 30}
        fps={FPS}
        width={1080}
        height={1920}
        schema={VideoTemplateSchema}
        defaultProps={defaultProps}
        calculateMetadata={calculateVideoMetadata}
      />

      {/* ── DEV: Stickman pose test reel ─────────────────────────────────── */}
      {/* StickmanDemoCompositions renders its own <Composition id="StickmanDemo"> */}
      {/* at 30fps, 1080×1920, fixed duration (17 poses × 90 frames) */}
      <StickmanDemoCompositions />
    </>
  );
};
