// pipeline/sfx_agent.js
// Agent 4: Generates SFX via ElevenLabs Sound Generation API
import path from "path";
import fetch from "node-fetch";
import { logger, PATHS, withRetry, saveBinaryFile, ensureDir } from "./utils.js";

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

// Predefined SFX mapped to format + scene type
// ElevenLabs generates audio from text descriptions
const SFX_LIBRARY = {
  fail:         "cartoon slip and fall with comedic boing, stickman tumbling",
  success:      "triumphant fanfare ding, short celebration sound effect",
  explosion:    "word explosion pop with confetti burst and sparkle shimmer",
  wrong:        "buzzer wrong answer sound, game show fail tone",
  correct:      "correct ding chime, upbeat positive reward sound",
  powerup:      "superhero power up whoosh, energy charging cosmic surge",
  transition:   "quick swoosh screen wipe, smooth slide transition sound",
  hook:         "dramatic attention grab, tension build one second stab",
  cta:          "subscribe bell notification ding, cheerful upbeat two notes",
  background:   "upbeat playful background music loop, educational fun vibe, 30 seconds",
};

/**
 * Generate a single SFX file.
 * @param {string} sfxKey - key from SFX_LIBRARY
 * @param {string} outputPath
 */
async function generateSFX(sfxKey, outputPath) {
  const prompt = SFX_LIBRARY[sfxKey];
  if (!prompt) throw new Error(`Unknown SFX key: ${sfxKey}`);

  logger.info(`[SFXAgent] Generating SFX: "${sfxKey}"`);

  const response = await withRetry(
    async () => {
      const res = await fetch(`${ELEVENLABS_BASE}/sound-generation`, {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: prompt,
          duration_seconds: sfxKey === "background" ? 30 : 3,
          prompt_influence: 0.3,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`ElevenLabs API error ${res.status}: ${err}`);
      }

      return res;
    },
    3,
    2000,
    `SFXAgent:${sfxKey}`
  );

  const buffer = Buffer.from(await response.arrayBuffer());
  saveBinaryFile(buffer, outputPath);
  logger.info(`[SFXAgent] ✓ Saved SFX: ${path.basename(outputPath)}`);
  return outputPath;
}

/**
 * Check if an SFX file already exists in cache (avoid regenerating).
 */
function getCachedSFX(sfxKey) {
  const cachedPath = path.join(PATHS.sfx, `${sfxKey}.mp3`);
  const fs = require("fs");
  return fs.existsSync(cachedPath) ? cachedPath : null;
}

/**
 * Generate all SFX needed for a video based on its format.
 * Returns a map of { sfxKey: filePath }
 */
export async function generateVideoSFX(script) {
  const { format, video_id } = script;

  // Determine which SFX this format needs
  const sfxNeeded = {
    fail_fix:       ["hook", "fail", "wrong", "transition", "correct", "success", "cta", "background"],
    word_explosion: ["hook", "explosion", "transition", "cta", "background"],
    superpower:     ["hook", "powerup", "wrong", "transition", "success", "cta", "background"],
  };

  const needed = sfxNeeded[format] || sfxNeeded.fail_fix;
  const result = {};

  for (const sfxKey of needed) {
    // Use cached SFX if available — SFX are reusable across videos
    const cached = path.join(PATHS.sfx, `${sfxKey}.mp3`);
    const { existsSync } = await import("fs");

    if (existsSync(cached)) {
      logger.info(`[SFXAgent] Using cached SFX: ${sfxKey}`);
      result[sfxKey] = cached;
    } else {
      try {
        result[sfxKey] = await generateSFX(sfxKey, cached);
      } catch (err) {
        logger.error(`[SFXAgent] Failed to generate ${sfxKey}: ${err.message}`);
      }
    }
  }

  logger.info(`[SFXAgent] ✓ SFX ready for video: ${video_id}`);
  return result;
}
