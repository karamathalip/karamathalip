// pipeline/image_agent.js
// Agent 5: Generates scene images (Stable Diffusion) and thumbnails (DALL·E)
import path from "path";
import fetch from "node-fetch";
import OpenAI from "openai";
import { logger, PATHS, withRetry, saveBinaryFile, ensureDir, writeJSON } from "./utils.js";
import { existsSync } from "fs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const STYLE_SUFFIX =
  "colorful semi-cartoon style, high contrast, clean composition, minimal background, expressive emotion, optimised for short-form video, flat vector art";

// ── Stable Diffusion via Together AI ─────────────────────────────────────────
async function generateWithSD(prompt, outputPath) {
  const fullPrompt = `${prompt}, ${STYLE_SUFFIX}`;
  logger.info(`[ImageAgent:SD] Generating: "${prompt.slice(0, 60)}..."`);

  const response = await withRetry(
    async () => {
      const res = await fetch("https://api.together.xyz/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "stabilityai/stable-diffusion-xl-base-1.0",
          prompt: fullPrompt,
          negative_prompt: "blurry, text, watermark, ugly, distorted, realistic photo",
          width: 512,
          height: 512,
          steps: 20,
          n: 1,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Together AI error ${res.status}: ${err}`);
      }
      return res.json();
    },
    3,
    3000,
    "ImageAgent:SD"
  );

  const imageData = response.data?.[0]?.b64_json || response.data?.[0]?.url;
  if (!imageData) throw new Error("No image data returned from Together AI");

  if (imageData.startsWith("http")) {
    // URL — download it
    const imgRes = await fetch(imageData);
    saveBinaryFile(Buffer.from(await imgRes.arrayBuffer()), outputPath);
  } else {
    // base64
    saveBinaryFile(Buffer.from(imageData, "base64"), outputPath);
  }

  logger.info(`[ImageAgent:SD] ✓ Saved: ${path.basename(outputPath)}`);
  return outputPath;
}

// ── DALL·E (thumbnails only) ──────────────────────────────────────────────────
async function generateWithDALLE(prompt, outputPath) {
  const fullPrompt = `YouTube thumbnail. ${prompt}. Bold text, high impact, vibrant colors, 16:9 aspect. ${STYLE_SUFFIX}`;
  logger.info(`[ImageAgent:DALL-E] Generating thumbnail...`);

  const response = await withRetry(
    async () =>
      openai.images.generate({
        model: "dall-e-3",
        prompt: fullPrompt,
        n: 1,
        size: "1024x1024",
        response_format: "b64_json",
      }),
    3,
    3000,
    "ImageAgent:DALLE"
  );

  const b64 = response.data[0].b64_json;
  saveBinaryFile(Buffer.from(b64, "base64"), outputPath);
  logger.info(`[ImageAgent:DALL-E] ✓ Saved thumbnail: ${path.basename(outputPath)}`);
  return outputPath;
}

// ── Visual placement logic (max 2 images per video) ─────────────────────────
function selectScenesForImages(storyboard, format) {
  // Priority: pattern interrupt (hook area) + payoff moment (end area)
  const selected = [];

  for (let i = 0; i < storyboard.length; i++) {
    const scene = storyboard[i];
    const time = scene.time || "";

    const isHookArea = time.startsWith("0") || time.startsWith("3");
    const isPayoff = i >= storyboard.length - 2;

    if (isHookArea && selected.length < 1) selected.push({ index: i, scene });
    else if (isPayoff && selected.length < 2) selected.push({ index: i, scene });
    if (selected.length >= 2) break;
  }

  return selected;
}

/**
 * Generate all images for a video.
 * @param {Object} script - Script JSON
 * @param {Object} blueprint - Visual blueprint from VisualAgent
 * @returns {Object} { sceneImages: [...], thumbnailPath }
 */
export async function generateVideoImages(script, blueprint) {
  const { video_id, storyboard, format } = script;
  const videoImgDir = path.join(PATHS.images, video_id);
  ensureDir(videoImgDir);

  // Select which scenes get real images
  const scenesToImage = selectScenesForImages(storyboard, format);
  const sceneImages = [];

  for (const { index, scene } of scenesToImage) {
    const prompt =
      blueprint?.image_prompts?.[sceneImages.length] ||
      scene.scene_description ||
      "English learning educational scene";

    const filename = `scene_${index}.png`;
    const outputPath = path.join(videoImgDir, filename);

    // Check reuse cache: [emotion]_[scene_type]_[category]
    const cacheKey = `${format}_scene_${index}`;

    try {
      await generateWithSD(prompt, outputPath);
      sceneImages.push({ sceneIndex: index, imagePath: outputPath, cacheKey });
    } catch (err) {
      logger.error(`[ImageAgent] Failed scene ${index}: ${err.message}`);
    }
  }

  // Generate thumbnail with DALL·E
  const thumbPrompt =
    blueprint?.thumbnail_prompt ||
    `${script.hook_text} — English learning animated stickman YouTube Short`;
  const thumbnailPath = path.join(PATHS.thumbnails, `${video_id}_thumb.png`);

  try {
    await generateWithDALLE(thumbPrompt, thumbnailPath);
  } catch (err) {
    logger.error(`[ImageAgent] Thumbnail generation failed: ${err.message}`);
  }

  logger.info(`[ImageAgent] ✓ Generated ${sceneImages.length} scene images + thumbnail for ${video_id}`);
  return { sceneImages, thumbnailPath };
}
