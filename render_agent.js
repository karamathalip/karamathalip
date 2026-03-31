// pipeline/render_agent.js
// Agent 6: Renders each approved script into an MP4 using Remotion CLI
import { execSync, spawnSync } from "child_process";
import path from "path";
import fs from "fs";
import { logger, PATHS, writeJSON, withRetry } from "./utils.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

/**
 * Build the full props object for Remotion and write it to a temp file.
 */
function buildRemotonProps(script, audioResult, sfxPaths, imageResult) {
  const FRAMES_PER_SCENE = 90; // 3s @ 30fps

  // Inject image paths into storyboard scenes that have them
  const storyboard = script.storyboard.map((scene, index) => {
    const sceneImage = imageResult?.sceneImages?.find((img) => img.sceneIndex === index);
    return {
      ...scene,
      text_color: scene.text_color || "#1A1A1A",
      background_color: scene.background_color || "#F0F8FF",
      effects: scene.effects || [],
      imagePath: sceneImage?.imagePath || undefined,
    };
  });

  return {
    video_id: script.video_id,
    format: script.format,
    video_title: script.video_title,
    hook_text: script.hook_text,
    storyboard,
    script_lines: script.script_lines,
    voiceAudioPath: audioResult?.mergedPath || undefined,
    sfxPaths: sfxPaths || {},
    framesPerScene: FRAMES_PER_SCENE,
  };
}

/**
 * Render a single video using Remotion CLI.
 * Returns the output MP4 path.
 */
export async function renderVideo(script, audioResult, sfxPaths, imageResult) {
  const { video_id } = script;
  logger.info(`[RenderAgent] Starting render: ${video_id}`);

  // Write props to a temp JSON file for Remotion to read
  const propsPath = path.join(PATHS.videos, `${video_id}_props.json`);
  const props = buildRemotonProps(script, audioResult, sfxPaths, imageResult);
  writeJSON(propsPath, props);

  const outputPath = path.join(PATHS.videos, `${video_id}.mp4`);

  // Remotion render command
  const cmd = [
    "npx remotion render",
    "src/index.tsx",           // entry point
    "EnglishShort",            // composition ID
    `"${outputPath}"`,         // output path
    `--props="${propsPath}"`,   // input props
    "--codec=h264",
    "--image-format=jpeg",
    "--jpeg-quality=85",
    "--concurrency=4",
    "--log=verbose",
  ].join(" ");

  logger.info(`[RenderAgent] Running: ${cmd}`);

  await withRetry(
    () => {
      const result = spawnSync(cmd, {
        shell: true,
        cwd: ROOT,
        env: { ...process.env, REMOTION_PROPS: propsPath },
        stdio: "pipe",
        encoding: "utf8",
      });

      if (result.status !== 0) {
        const errMsg = result.stderr || result.stdout || "Unknown render error";
        throw new Error(`Remotion render failed:\n${errMsg}`);
      }

      logger.info(`[RenderAgent] Remotion stdout:\n${result.stdout?.slice(-500)}`);
      return result;
    },
    2,
    5000,
    `RenderAgent:${video_id}`
  );

  if (!fs.existsSync(outputPath)) {
    throw new Error(`[RenderAgent] Expected output not found: ${outputPath}`);
  }

  logger.info(`[RenderAgent] ✓ Rendered: ${outputPath}`);
  return outputPath;
}

/**
 * Merge voice + SFX background into the rendered video using FFmpeg.
 * This is a safety net in case Remotion audio embedding fails.
 * Returns the final merged video path.
 */
export async function mergeAudioVideo(videoPath, voicePath, bgMusicPath, video_id) {
  const outputPath = path.join(PATHS.final, `${video_id}_final.mp4`);

  let filterComplex = "";
  let inputFlags = `"${videoPath}"`;
  let audioMap = "";

  if (voicePath && fs.existsSync(voicePath) && bgMusicPath && fs.existsSync(bgMusicPath)) {
    inputFlags += ` -i "${voicePath}" -i "${bgMusicPath}"`;
    filterComplex = `-filter_complex "[1:a]volume=1.0[voice];[2:a]volume=0.12,aloop=loop=-1:size=2e+09[bg];[voice][bg]amix=inputs=2:duration=shortest[aout]" -map 0:v -map "[aout]"`;
    audioMap = "";
  } else if (voicePath && fs.existsSync(voicePath)) {
    inputFlags += ` -i "${voicePath}"`;
    filterComplex = `-map 0:v -map 1:a`;
  } else {
    // No external audio, just copy video
    const cmd = `ffmpeg -y -i "${videoPath}" -c copy "${outputPath}"`;
    execSync(cmd, { stdio: "pipe" });
    logger.info(`[RenderAgent] ✓ Final video (no audio merge): ${outputPath}`);
    return outputPath;
  }

  const cmd = `ffmpeg -y -i ${inputFlags} ${filterComplex} -c:v copy -c:a aac -b:a 192k "${outputPath}"`;
  logger.info(`[RenderAgent] FFmpeg merge: ${cmd.slice(0, 120)}...`);
  execSync(cmd, { stdio: "pipe" });

  if (!fs.existsSync(outputPath)) {
    throw new Error(`[RenderAgent] FFmpeg merge failed — output not found: ${outputPath}`);
  }

  logger.info(`[RenderAgent] ✓ Final merged video: ${outputPath}`);
  return outputPath;
}
