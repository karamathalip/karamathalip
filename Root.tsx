// src/Root.tsx — Register all Remotion compositions
import React from "react";
import { Composition } from "remotion";
import { VideoTemplate, videoSchema } from "../components/VideoTemplate";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// Default props for Remotion Studio preview
const defaultStoryboard = [
  { time: "0-3s", scene_description: "Hook scene", on_screen_text: "You've been saying this WRONG! 😱", stickman_pose: "fail", text_color: "#FF3B30", background_color: "#FFF0EF", effects: ["wrong"] },
  { time: "3-12s", scene_description: "Wrong version", on_screen_text: "I have went to the store.", stickman_pose: "fail", text_color: "#FF3B30", background_color: "#FFF0EF", effects: ["wrong"] },
  { time: "12-25s", scene_description: "Correct version", on_screen_text: "I have GONE to the store. ✓", stickman_pose: "win", text_color: "#34C759", background_color: "#F0FFF4", effects: ["correct"] },
  { time: "25-40s", scene_description: "Comparison", on_screen_text: "went ❌ → gone ✓", stickman_pose: "pointing", text_color: "#1A1A1A", background_color: "#F0F8FF", effects: [] },
  { time: "40-55s", scene_description: "Remixes", on_screen_text: "I have gone, seen, done!", stickman_pose: "jumping", text_color: "#1F8EF1", background_color: "#F0F8FF", effects: [] },
  { time: "55-60s", scene_description: "CTA", on_screen_text: "Tag someone who says this wrong! 👇", stickman_pose: "waving", text_color: "#1F8EF1", background_color: "#F0F8FF", effects: [] },
];

export const Root: React.FC = () => {
  const FPS = 30;
  const FRAMES_PER_SCENE = 90; // 3s per scene

  // Load a specific video props file if REMOTION_PROPS env is set (used by render_agent)
  let dynamicProps: any = null;
  const propsFile = process.env.REMOTION_PROPS;
  if (propsFile && existsSync(propsFile)) {
    try {
      dynamicProps = JSON.parse(readFileSync(propsFile, "utf8"));
    } catch (e) {
      console.warn("Could not load REMOTION_PROPS:", e);
    }
  }

  const defaultProps = dynamicProps || {
    video_id: "preview",
    format: "fail_fix" as const,
    video_title: "Have GONE vs Have WENT — Stop This Mistake!",
    hook_text: "You've been saying this WRONG! 😱",
    storyboard: defaultStoryboard,
    script_lines: ["You've been saying this wrong!", "The correct form is 'gone', not 'went'."],
    framesPerScene: FRAMES_PER_SCENE,
  };

  const totalScenes = defaultProps.storyboard?.length || 6;
  const totalFrames = totalScenes * FRAMES_PER_SCENE;

  return (
    <>
      <Composition
        id="EnglishShort"
        component={VideoTemplate}
        durationInFrames={totalFrames}
        fps={FPS}
        width={1080}
        height={1920}
        schema={videoSchema}
        defaultProps={defaultProps}
        calculateMetadata={async ({ props }) => ({
          durationInFrames: (props.storyboard?.length || 6) * (props.framesPerScene || FRAMES_PER_SCENE),
        })}
      />
    </>
  );
};
