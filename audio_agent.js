// pipeline/audio_agent.js
// Agent 3: Generates voice audio for each script line via Inworld API
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { logger, PATHS, withRetry, ensureDir, saveBinaryFile } from "./utils.js";

const INWORLD_BASE = "https://studio.inworld.ai/v1";

/**
 * Generate TTS audio for a single line using Inworld API.
 * Returns the file path of the saved MP3.
 */
async function generateVoiceLine(text, outputPath, sessionId) {
  const response = await withRetry(
    async () => {
      const res = await fetch(`${INWORLD_BASE}/workspaces/${process.env.INWORLD_WORKSPACE}/characters/${process.env.INWORLD_CHARACTER_ID}:simpleSendText`, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${Buffer.from(process.env.INWORLD_API_KEY + ":").toString("base64")}`,
          "Content-Type": "application/json",
          "Grpc-Metadata-session-id": sessionId,
        },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Inworld API error ${res.status}: ${err}`);
      }

      return res;
    },
    3,
    2000,
    "AudioAgent"
  );

  // Inworld streams back audio — collect buffer
  const buffer = Buffer.from(await response.arrayBuffer());
  saveBinaryFile(buffer, outputPath);
  logger.info(`[AudioAgent] ✓ Saved voice: ${path.basename(outputPath)}`);
  return outputPath;
}

/**
 * Generate all voice lines for a script.
 * Returns array of { line, audioPath }
 */
export async function generateScriptAudio(script) {
  const videoDir = path.join(PATHS.voices, script.video_id);
  ensureDir(videoDir);

  const sessionId = `session_${script.video_id}_${Date.now()}`;
  const audioFiles = [];

  // Combine storyboard voice cues + script lines
  const lines = script.script_lines || [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.trim() === "") continue;

    const outputPath = path.join(videoDir, `line_${String(i).padStart(3, "0")}.mp3`);

    try {
      await generateVoiceLine(line, outputPath, sessionId);
      audioFiles.push({ index: i, line, audioPath: outputPath });
    } catch (err) {
      logger.error(`[AudioAgent] Failed for line ${i}: "${line}" — ${err.message}`);
    }
  }

  // Concatenate all lines into one voice track using ffmpeg
  const concatListPath = path.join(videoDir, "concat.txt");
  const concatContent = audioFiles
    .map((f) => `file '${f.audioPath}'`)
    .join("\n");
  fs.writeFileSync(concatListPath, concatContent);

  const mergedPath = path.join(PATHS.voices, `${script.video_id}_voice.mp3`);
  await mergeAudioFiles(concatListPath, mergedPath);

  logger.info(`[AudioAgent] ✓ Merged voice track → ${mergedPath}`);
  return { audioFiles, mergedPath };
}

async function mergeAudioFiles(concatListPath, outputPath) {
  const { execSync } = await import("child_process");
  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${outputPath}"`,
    { stdio: "pipe" }
  );
}
