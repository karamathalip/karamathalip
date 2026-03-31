/**
 * pipeline/image_agent.js
 *
 * Generates scene images and video thumbnails for approved scripts using
 * two AI image models selected by visual_priority / scene type:
 *
 *   • DALL·E 3 (OpenAI)         — high_emotion scenes + all thumbnails
 *   • Stable Diffusion XL 1.0   — all other use_image=true scenes
 *     via Together AI inference API
 *
 * ── Prerequisites ─────────────────────────────────────────────────────────────
 *   .env must contain:
 *     OPENAI_API_KEY=<your-openai-key>
 *     TOGETHER_API_KEY=<your-together-ai-key>
 *
 * ── Model selection logic ─────────────────────────────────────────────────────
 *   visual_priority === "high_emotion"  →  DALL·E 3
 *   scene.type      === "thumbnail"     →  DALL·E 3
 *   packaging.thumbnail (always)        →  DALL·E 3
 *   everything else (use_image=true)    →  Stable Diffusion XL via Together AI
 *
 * ── Stable Diffusion (Together AI) ───────────────────────────────────────────
 *   POST https://api.together.xyz/inference
 *   model   : stabilityai/stable-diffusion-xl-base-1.0
 *   size    : 512x512, steps: 25
 *   prompt suffix appended to every SD prompt:
 *     ", colorful semi-cartoon style, high contrast, clean composition,
 *      minimal background, expressive emotion, optimized for short-form video"
 *
 * ── DALL·E 3 (OpenAI) ─────────────────────────────────────────────────────────
 *   POST https://api.openai.com/v1/images/generations
 *   model: dall-e-3, size: 1024x1024, quality: standard
 *   Response: url (CDN link, expires ~60 min) — downloaded immediately
 *
 * ── Caching ───────────────────────────────────────────────────────────────────
 *   Cache key : MD5(full_prompt_string)
 *   Index     : images/cache_index.json
 *     { "<md5>": { prompt, file, model, created_at, hits } }
 *   Hit  → copy canonical cache file to output path, increment hits
 *   Miss → generate, write output + canonical cache copy, upsert index
 *
 * ── Reuse Library ─────────────────────────────────────────────────────────────
 *   Index     : images/reuse_library.json
 *   Keys      : confused_person, celebrating_person, shocked_person,
 *               classroom_scene, victory_moment  (+ any user-added keys)
 *   Checked   : before cache lookup — if scene.reuse_key matches a library
 *               entry whose file exists, copy it directly (zero API calls)
 *
 * ── Output ────────────────────────────────────────────────────────────────────
 *   images/[video_id]_scene[N].png        — scene images
 *   thumbnails/[video_id]_thumb.png       — video thumbnails
 *   images/cache_index.json
 *   images/reuse_library.json
 *
 * ── CLI usage ─────────────────────────────────────────────────────────────────
 *   node pipeline/image_agent.js                          # all approved scripts
 *   node pipeline/image_agent.js scripts/approved/x.json # specific file(s)
 *   node pipeline/image_agent.js --show-cache             # cache stats
 *   node pipeline/image_agent.js --init-reuse-library     # pre-generate 5 common scenes
 */

'use strict';

// ─── Environment ──────────────────────────────────────────────────────────────
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// ─── Imports ──────────────────────────────────────────────────────────────────
const axios  = require('axios');
const crypto = require('crypto');
const fs     = require('fs-extra');

// ─── Constants ────────────────────────────────────────────────────────────────

// ── Together AI ───────────────────────────────────────────────────────────────
const TOGETHER_INFERENCE_URL = 'https://api.together.xyz/inference';
const SD_MODEL               = 'stabilityai/stable-diffusion-xl-base-1.0';
const SD_WIDTH               = 512;
const SD_HEIGHT              = 512;
const SD_STEPS               = 25;
const SD_STYLE_SUFFIX        =
  ', colorful semi-cartoon style, high contrast, clean composition, ' +
  'minimal background, expressive emotion, optimized for short-form video';

// ── OpenAI DALL·E 3 ───────────────────────────────────────────────────────────
const OPENAI_IMAGES_URL = 'https://api.openai.com/v1/images/generations';
const DALLE_MODEL       = 'dall-e-3';
const DALLE_SIZE        = '1024x1024';
const DALLE_QUALITY     = 'standard';

// ── Retry / timing ────────────────────────────────────────────────────────────
const MAX_RETRIES   = 3;
const RETRY_BASE_MS = 1500;    // 1.5s → 3s → 6s

// ── Paths ─────────────────────────────────────────────────────────────────────
const PROJECT_ROOT   = path.join(__dirname, '..');
const IMAGES_DIR     = path.join(PROJECT_ROOT, 'images');
const THUMBS_DIR     = path.join(PROJECT_ROOT, 'thumbnails');
const APPROVED_DIR   = path.join(PROJECT_ROOT, 'scripts', 'approved');
const CACHE_INDEX    = path.join(IMAGES_DIR, 'cache_index.json');
const REUSE_LIBRARY  = path.join(IMAGES_DIR, 'reuse_library.json');

// ── Cost estimates ─────────────────────────────────────────────────────────────
// Together AI SD XL: ~$0.0128 per image (512×512, as of mid-2025)
// OpenAI DALL·E 3 standard 1024×1024: ~$0.040 per image
const COST_SD    = 0.0128;
const COST_DALLE = 0.040;

// ── Reuse library: seed keys and their generation prompts ─────────────────────
// These are pre-generated once and reused across all scripts.
const REUSE_LIBRARY_SEEDS = {
  confused_person: {
    prompt:    'A cartoon stickman character looking confused, head tilted, ' +
               'question marks floating around, bright yellow background',
    model:     'dalle',
  },
  celebrating_person: {
    prompt:    'A cartoon stickman character celebrating with arms raised, ' +
               'confetti and stars exploding around them, vibrant colorful background',
    model:     'dalle',
  },
  shocked_person: {
    prompt:    'A cartoon stickman character with a shocked expression, ' +
               'mouth wide open, eyes huge, electric energy radiating outward, ' +
               'bold colors',
    model:     'dalle',
  },
  classroom_scene: {
    prompt:    'A bright cartoon classroom scene with colorful desks, blackboard ' +
               'with English grammar on it, pencils and books, cheerful atmosphere, ' +
               'semi-cartoon style',
    model:     'sd',
  },
  victory_moment: {
    prompt:    'A cartoon stickman character in a triumphant victory pose, ' +
               'trophy, gold stars, green checkmarks, celebration energy, ' +
               'high contrast bright background',
    model:     'dalle',
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** MD5 hex of a string — used as cache key. */
function md5(str) {
  return crypto.createHash('md5').update(str, 'utf8').digest('hex');
}

/** Absolute → project-root-relative path with forward slashes. */
function toRelative(absPath) {
  return path.relative(PROJECT_ROOT, absPath).replace(/\\/g, '/');
}

/** Returns true for transient HTTP / network errors worth retrying. */
function isRetryable(error) {
  if (!error.response) return true;
  const s = error.response.status;
  return s === 429 || s === 500 || s === 502 || s === 503 || s === 504;
}

/** Validate env keys and return them. Throws a descriptive error if missing. */
function getEnvKeys() {
  const openaiKey   = process.env.OPENAI_API_KEY;
  const togetherKey = process.env.TOGETHER_API_KEY;
  const missing = [];
  if (!openaiKey)   missing.push('OPENAI_API_KEY');
  if (!togetherKey) missing.push('TOGETHER_API_KEY');
  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}\n` +
      'Add them to english-made-fun/.env:\n' +
      '  OPENAI_API_KEY=sk-...\n' +
      '  TOGETHER_API_KEY=<your-together-ai-key>'
    );
  }
  return { openaiKey, togetherKey };
}

/**
 * Determine which model to use for a given scene context.
 *
 * @param {{ visual_priority?: string, type?: string, isThumbnail?: boolean }} ctx
 * @returns {'dalle' | 'sd'}
 */
function selectModel(ctx) {
  if (ctx.isThumbnail)                         return 'dalle';
  if ((ctx.visual_priority ?? '').toLowerCase() === 'high_emotion') return 'dalle';
  if ((ctx.type ?? '').toLowerCase() === 'thumbnail')               return 'dalle';
  return 'sd';
}

// ─── Cache ────────────────────────────────────────────────────────────────────

async function loadCacheIndex() {
  try { return await fs.readJson(CACHE_INDEX); } catch { return {}; }
}
async function saveCacheIndex(index) {
  await fs.writeJson(CACHE_INDEX, index, { spaces: 2 });
}

async function loadReuseLibrary() {
  try { return await fs.readJson(REUSE_LIBRARY); } catch { return {}; }
}
async function saveReuseLibrary(lib) {
  await fs.writeJson(REUSE_LIBRARY, lib, { spaces: 2 });
}

/** Print a human-readable cache summary. */
async function showCache() {
  const index   = await loadCacheIndex();
  const entries = Object.entries(index);
  if (entries.length === 0) { console.log('\nImage cache is empty.\n'); return; }

  const hits = entries.reduce((s, [, v]) => s + (v.hits ?? 0), 0);
  const sep  = '─'.repeat(66);
  console.log(`\n${sep}`);
  console.log(`  Image Cache  |  ${entries.length} entries  |  ${hits} total hits`);
  console.log(sep);
  entries
    .sort((a, b) => (b[1].hits ?? 0) - (a[1].hits ?? 0))
    .forEach(([hash, e]) => {
      console.log(`\n  [${hash}]`);
      console.log(`    model   : ${e.model}`);
      console.log(`    prompt  : "${(e.prompt ?? '').slice(0, 80)}${(e.prompt ?? '').length > 80 ? '…' : ''}"`);
      console.log(`    file    : ${e.file}`);
      console.log(`    hits    : ${e.hits ?? 0}`);
      console.log(`    created : ${e.created_at}`);
    });
  console.log('');
}

// ─── Image Download Utility ───────────────────────────────────────────────────

/**
 * Download a remote image URL and save it to outputPath as a Buffer.
 * Used to retrieve DALL·E CDN images (which expire after ~60 min).
 *
 * @param {string} url
 * @param {string} outputPath
 * @returns {Promise<void>}
 */
async function downloadImage(url, outputPath) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout:      60000,
  });
  await fs.writeFile(outputPath, Buffer.from(response.data));
}

// ─── Together AI: Stable Diffusion XL ────────────────────────────────────────

/**
 * Generate an image using Stable Diffusion XL via the Together AI inference API.
 *
 * Endpoint: POST https://api.together.xyz/inference
 * Auth:     Authorization: Bearer <TOGETHER_API_KEY>
 * Body (JSON):
 * {
 *   "model": "stabilityai/stable-diffusion-xl-base-1.0",
 *   "prompt": "<full prompt with style suffix>",
 *   "width": 512,
 *   "height": 512,
 *   "steps": 25,
 *   "n": 1,
 *   "response_format": "base64"
 * }
 * Response (JSON):
 * {
 *   "output": {
 *     "choices": [{ "image_base64": "<base64 PNG bytes>" }]
 *   },
 *   // alternatively: "choices": [{ "image_base64": "..." }]
 * }
 *
 * Docs: https://docs.together.ai/docs/inference-models#image-models
 *
 * @param {string} prompt     - Full generation prompt (style suffix NOT yet appended)
 * @param {number} [attempt]
 * @returns {Promise<Buffer>} - Raw PNG bytes
 */
async function generateSD(prompt, attempt = 0) {
  const { togetherKey } = getEnvKeys();
  const fullPrompt = prompt + SD_STYLE_SUFFIX;

  const requestBody = {
    model:           SD_MODEL,
    prompt:          fullPrompt,
    width:           SD_WIDTH,
    height:          SD_HEIGHT,
    steps:           SD_STEPS,
    n:               1,
    response_format: 'base64',
  };

  try {
    const response = await axios.post(TOGETHER_INFERENCE_URL, requestBody, {
      headers: {
        Authorization:  `Bearer ${togetherKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 120000,   // SDXL can take up to 90s on Together AI cold starts
    });

    // Together AI response shape may vary by SDK version:
    //   response.data.output.choices[0].image_base64
    //   response.data.choices[0].image_base64
    const data    = response.data;
    const choices = data?.output?.choices ?? data?.choices ?? [];
    const b64     = choices[0]?.image_base64
                 ?? choices[0]?.b64_json
                 ?? data?.output?.image_base64;

    if (!b64) {
      throw new Error(
        'Together AI response missing image_base64. ' +
        `Keys: [${Object.keys(data ?? {}).join(', ')}]`
      );
    }

    return Buffer.from(b64, 'base64');

  } catch (error) {
    const exhausted = attempt >= MAX_RETRIES;
    const retryable = isRetryable(error);

    if (!exhausted && retryable) {
      const backoffMs = Math.pow(2, attempt) * RETRY_BASE_MS;
      const status    = error.response?.status;
      const msg       = error.response?.data?.error ?? error.message;
      console.warn(`      ⚠  Together AI ${status ? `[HTTP ${status}]` : 'network'}: ${String(msg).slice(0, 120)}`);
      console.log(`      ↺  Retrying SD in ${(backoffMs / 1000).toFixed(1)}s...`);
      await sleep(backoffMs);
      return generateSD(prompt, attempt + 1);
    }

    const status = error.response?.status;
    const msg    = error.response?.data?.error ?? error.message;
    throw new Error(
      `Stable Diffusion (Together AI) failed${status ? ` [HTTP ${status}]` : ''}: ${msg}\n` +
      `  prompt: "${fullPrompt.slice(0, 80)}"`
    );
  }
}

// ─── OpenAI: DALL·E 3 ─────────────────────────────────────────────────────────

/**
 * Generate an image using DALL·E 3 via the OpenAI images.generate endpoint.
 *
 * Endpoint: POST https://api.openai.com/v1/images/generations
 * Auth:     Authorization: Bearer <OPENAI_API_KEY>
 * Body (JSON):
 * {
 *   "model": "dall-e-3",
 *   "prompt": "...",
 *   "n": 1,
 *   "size": "1024x1024",
 *   "quality": "standard",
 *   "response_format": "url"
 * }
 * Response (JSON):
 * {
 *   "created": 1234567890,
 *   "data": [{ "url": "https://...", "revised_prompt": "..." }]
 * }
 *
 * The URL is a temporary CDN link valid for ~60 minutes — downloaded immediately.
 *
 * Docs: https://platform.openai.com/docs/api-reference/images/create
 *
 * @param {string} prompt
 * @param {number} [attempt]
 * @returns {Promise<Buffer>} - Raw PNG bytes (downloaded from CDN URL)
 */
async function generateDALLE(prompt, attempt = 0) {
  const { openaiKey } = getEnvKeys();

  const requestBody = {
    model:           DALLE_MODEL,
    prompt,
    n:               1,
    size:            DALLE_SIZE,
    quality:         DALLE_QUALITY,
    response_format: 'url',
  };

  try {
    const response = await axios.post(OPENAI_IMAGES_URL, requestBody, {
      headers: {
        Authorization:  `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 120000,
    });

    const imageUrl = response.data?.data?.[0]?.url;
    if (!imageUrl) {
      throw new Error(
        'OpenAI response missing data[0].url. ' +
        `Keys: [${Object.keys(response.data ?? {}).join(', ')}]`
      );
    }

    // Download immediately before the temporary CDN URL expires
    const imgResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout:      60000,
    });

    return Buffer.from(imgResponse.data);

  } catch (error) {
    const exhausted = attempt >= MAX_RETRIES;
    const retryable = isRetryable(error);

    if (!exhausted && retryable) {
      const backoffMs = Math.pow(2, attempt) * RETRY_BASE_MS;
      const status    = error.response?.status;
      const msg       = error.response?.data?.error?.message ?? error.message;
      console.warn(`      ⚠  OpenAI DALL·E ${status ? `[HTTP ${status}]` : 'network'}: ${String(msg).slice(0, 120)}`);
      console.log(`      ↺  Retrying DALL·E in ${(backoffMs / 1000).toFixed(1)}s...`);
      await sleep(backoffMs);
      return generateDALLE(prompt, attempt + 1);
    }

    const status = error.response?.status;
    const msg    = error.response?.data?.error?.message ?? error.message;
    throw new Error(
      `DALL·E 3 failed${status ? ` [HTTP ${status}]` : ''}: ${msg}\n` +
      `  prompt: "${prompt.slice(0, 80)}"`
    );
  }
}

// ─── Core: Generate or Retrieve One Image ────────────────────────────────────

/**
 * Produce one image at outputPath, checking (in order):
 *   1. Output file already on disk → reuse
 *   2. Reuse library entry matching reuseKey → copy
 *   3. Cache index entry matching MD5(prompt) → copy
 *   4. Generate via SD or DALL·E, write output + canonical cache copy
 *
 * @param {object} opts
 * @param {string}        opts.prompt      - Full generation prompt
 * @param {'sd'|'dalle'}  opts.model       - Which generator to use
 * @param {string}        opts.outputPath  - Absolute path for the output file
 * @param {string|null}   [opts.reuseKey]  - Key to check in reuse library first
 * @param {object}        opts.cacheIndex  - Loaded cache index (mutated in place)
 * @param {object}        opts.reuseLib    - Loaded reuse library (mutated in place)
 * @returns {Promise<{ source: 'disk'|'reuse'|'cache'|'generated', cost: number }>}
 */
async function generateOrReuse(opts) {
  const { prompt, model, outputPath, reuseKey, cacheIndex, reuseLib } = opts;

  // 1. Output file already exists on disk (resume safety)
  if (await fs.pathExists(outputPath)) {
    console.log(`      ✓ Already exists on disk — reusing: ${path.basename(outputPath)}`);
    return { source: 'disk', cost: 0 };
  }

  // 2. Reuse library
  if (reuseKey && reuseLib[reuseKey]) {
    const entry = reuseLib[reuseKey];
    const libFilePath = path.isAbsolute(entry.file)
      ? entry.file
      : path.join(PROJECT_ROOT, entry.file);

    if (await fs.pathExists(libFilePath)) {
      await fs.copy(libFilePath, outputPath);
      entry.hits = (entry.hits ?? 0) + 1;
      console.log(`      ✓ Reuse library HIT  [${reuseKey}] → ${path.basename(outputPath)}`);
      return { source: 'reuse', cost: 0 };
    }
    // File missing — fall through and regenerate
    console.warn(`      ⚠  Reuse library entry "${reuseKey}" exists but file missing — regenerating.`);
  }

  // 3. Prompt cache
  const cacheKey = md5(prompt);
  if (cacheIndex[cacheKey]) {
    const entry = cacheIndex[cacheKey];
    const cachedFilePath = path.isAbsolute(entry.file)
      ? entry.file
      : path.join(PROJECT_ROOT, entry.file);

    if (await fs.pathExists(cachedFilePath)) {
      await fs.copy(cachedFilePath, outputPath);
      entry.hits = (entry.hits ?? 0) + 1;
      console.log(`      ✓ Cache HIT  [${cacheKey.slice(0, 8)}…] → ${path.basename(outputPath)}`);
      return { source: 'cache', cost: 0 };
    }
    // Canonical file deleted — fall through
    console.warn(`      ⚠  Cache entry [${cacheKey.slice(0, 8)}…] exists but file missing — regenerating.`);
    delete cacheIndex[cacheKey];
  }

  // 4. Generate
  const imageBuffer = model === 'dalle'
    ? await generateDALLE(prompt)
    : await generateSD(prompt);

  await fs.writeFile(outputPath, imageBuffer);

  // Write canonical cache copy named after MD5
  const ext           = '.png';
  const canonicalPath = path.join(IMAGES_DIR, `${cacheKey}${ext}`);
  await fs.copy(outputPath, canonicalPath);

  // Upsert cache index
  cacheIndex[cacheKey] = {
    prompt,
    model,
    file:       toRelative(canonicalPath),
    created_at: new Date().toISOString(),
    hits:       0,
  };

  // If this was a reuse-library seed key, register it in the library
  if (reuseKey) {
    reuseLib[reuseKey] = {
      prompt,
      model,
      file:       toRelative(outputPath),
      created_at: new Date().toISOString(),
      hits:       0,
    };
  }

  const cost = model === 'dalle' ? COST_DALLE : COST_SD;
  console.log(
    `      ✓ Generated [${model.toUpperCase()}]: ${path.basename(outputPath)}  ` +
    `(${imageBuffer.length} bytes, est. $${cost.toFixed(4)})`
  );

  return { source: 'generated', cost };
}

// ─── Reuse Library: Pre-generation ───────────────────────────────────────────

/**
 * Pre-generate all 5 canonical reuse library images if they don't yet exist.
 * Idempotent — skips any key that already has a valid file in the library.
 *
 * @param {object} cacheIndex  - Loaded cache index (mutated)
 * @param {object} reuseLib    - Loaded reuse library (mutated)
 */
async function initReuseLibrary(cacheIndex, reuseLib) {
  const keys = Object.keys(REUSE_LIBRARY_SEEDS);
  console.log(`\nInitialising reuse library (${keys.length} seeds)...\n`);

  let generated = 0;
  let skipped   = 0;

  for (const key of keys) {
    const seed = REUSE_LIBRARY_SEEDS[key];

    // Check if already in library and file exists
    if (reuseLib[key]) {
      const existingPath = path.isAbsolute(reuseLib[key].file)
        ? reuseLib[key].file
        : path.join(PROJECT_ROOT, reuseLib[key].file);
      if (await fs.pathExists(existingPath)) {
        console.log(`  ✓ Already exists: ${key}`);
        skipped++;
        continue;
      }
    }

    console.log(`  → Generating: ${key}  [${seed.model.toUpperCase()}]`);
    console.log(`    "${seed.prompt.slice(0, 80)}"`);

    const outputFileName = `reuse_${key}.png`;
    const outputPath     = path.join(IMAGES_DIR, outputFileName);

    try {
      await generateOrReuse({
        prompt:     seed.prompt,
        model:      seed.model,
        outputPath,
        reuseKey:   key,
        cacheIndex,
        reuseLib,
      });
      generated++;
    } catch (err) {
      console.error(`  ✗ Failed to generate "${key}": ${err.message}`);
    }
  }

  console.log(`\n  Done: ${generated} generated, ${skipped} already present.\n`);
}

// ─── Core: Process One Script ─────────────────────────────────────────────────

/**
 * Process all use_image=true scenes and the thumbnail for one script.
 * Updates the script JSON with image file paths.
 *
 * @param {object} scriptData   - Parsed approved script JSON
 * @param {string} scriptPath   - Absolute path to the JSON file
 * @param {object} cacheIndex   - Shared cache index (mutated)
 * @param {object} reuseLib     - Shared reuse library (mutated)
 * @returns {Promise<{
 *   videoId: string,
 *   imagesGenerated: number,
 *   imagesCached: number,
 *   imagesReused: number,
 *   totalCost: number,
 * }>}
 */
async function processScript(scriptData, scriptPath, cacheIndex, reuseLib) {
  const videoId  = scriptData.video_id ?? path.basename(scriptPath, '.json');
  const scenes   = scriptData.scenes   ?? [];
  const pkg      = scriptData.packaging ?? {};

  let imagesGenerated = 0;
  let imagesCached    = 0;
  let imagesReused    = 0;
  let totalCost       = 0;

  const updatedScenes = [];

  // ── Scene images ──────────────────────────────────────────────────────────
  for (let i = 0; i < scenes.length; i++) {
    const scene      = { ...scenes[i] };
    const sceneIndex = i + 1;
    const padded     = String(sceneIndex).padStart(2, '0');

    if (!scene.use_image) {
      updatedScenes.push(scene);
      continue;
    }

    // Build the generation prompt from available scene fields
    const promptParts = [];
    if (scene.text)             promptParts.push(scene.text);
    if (scene.visual_priority)  promptParts.push(`mood: ${scene.visual_priority}`);
    if (scene.stickman_emotion) promptParts.push(`emotion: ${scene.stickman_emotion}`);
    if (scene.stickman_action)  promptParts.push(`action: ${scene.stickman_action}`);

    // Fallback: build from visual object if scene is flat
    const visual = scene.visual ?? {};
    if (promptParts.length === 0) {
      if (visual.text)             promptParts.push(visual.text);
      if (visual.stickman_emotion) promptParts.push(`emotion: ${visual.stickman_emotion}`);
      if (visual.stickman_action)  promptParts.push(`action: ${visual.stickman_action}`);
    }

    if (promptParts.length === 0) {
      console.log(`    [scene ${sceneIndex}] ⚠  use_image=true but no prompt data — skipping.`);
      updatedScenes.push(scene);
      continue;
    }

    const prompt   = promptParts.join(', ');
    const model    = selectModel({
      visual_priority: scene.visual_priority ?? visual.visual_priority,
      type:            scene.type,
    });
    const reuseKey = scene.reuse_key ?? null;
    const fileName = `${videoId}_scene${padded}.png`;
    const outPath  = path.join(IMAGES_DIR, fileName);

    console.log(
      `    [scene ${sceneIndex}/${scenes.length}] use_image=true  ` +
      `model=${model.toUpperCase()}  ` +
      (reuseKey ? `reuse_key="${reuseKey}"` : `prompt="${prompt.slice(0, 50)}…"`)
    );

    try {
      const result = await generateOrReuse({
        prompt,
        model,
        outputPath: outPath,
        reuseKey,
        cacheIndex,
        reuseLib,
      });

      totalCost += result.cost;
      if (result.source === 'generated') imagesGenerated++;
      else if (result.source === 'reuse') imagesReused++;
      else if (result.source === 'cache') imagesCached++;

      // Attach image path back onto the scene
      scene.image_file = toRelative(outPath);

    } catch (err) {
      console.error(`      ✗ Scene ${sceneIndex} image failed: ${err.message}`);
    }

    updatedScenes.push(scene);
  }

  // ── Thumbnail ─────────────────────────────────────────────────────────────
  const thumbPrompt = buildThumbnailPrompt(pkg, scriptData);
  const thumbPath   = path.join(THUMBS_DIR, `${videoId}_thumb.png`);

  if (thumbPrompt) {
    console.log(
      `    [thumbnail] DALL·E 3  ` +
      `"${thumbPrompt.slice(0, 60)}${thumbPrompt.length > 60 ? '…' : ''}"`
    );

    try {
      const result = await generateOrReuse({
        prompt:     thumbPrompt,
        model:      'dalle',
        outputPath: thumbPath,
        reuseKey:   null,
        cacheIndex,
        reuseLib,
      });

      totalCost += result.cost;
      if (result.source === 'generated') imagesGenerated++;
      else if (result.source === 'reuse') imagesReused++;
      else if (result.source === 'cache') imagesCached++;

      // Update script packaging with thumbnail path
      scriptData = {
        ...scriptData,
        packaging: {
          ...pkg,
          thumbnail: {
            ...(typeof pkg.thumbnail === 'object' ? pkg.thumbnail : {}),
            image_file: toRelative(thumbPath),
          },
        },
      };

    } catch (err) {
      console.error(`      ✗ Thumbnail generation failed: ${err.message}`);
    }
  }

  // ── Write updated script JSON ─────────────────────────────────────────────
  const updatedScript = { ...scriptData, scenes: updatedScenes };
  await fs.writeJson(scriptPath, updatedScript, { spaces: 2 });
  console.log(`    ✓ Script JSON updated: ${path.basename(scriptPath)}`);

  return { videoId, imagesGenerated, imagesCached, imagesReused, totalCost };
}

/**
 * Build a DALL·E 3 thumbnail prompt from the script's packaging block.
 * Returns null if no usable text is found.
 *
 * @param {object} pkg          - scriptData.packaging
 * @param {object} scriptData
 * @returns {string|null}
 */
function buildThumbnailPrompt(pkg, scriptData) {
  const parts = [];

  // packaging.thumbnail.text and .visual are set by script_agent
  const thumb = pkg.thumbnail ?? {};
  if (thumb.text)   parts.push(thumb.text);
  if (thumb.visual) parts.push(thumb.visual);

  // Fallback: use the first packaging title
  if (parts.length === 0 && Array.isArray(pkg.titles) && pkg.titles.length > 0) {
    parts.push(pkg.titles[0]);
  }

  // Last fallback: video title
  if (parts.length === 0) {
    const title = scriptData.video_title ?? scriptData.title;
    if (title) parts.push(title);
  }

  if (parts.length === 0) return null;

  return (
    `YouTube Shorts thumbnail for English learning video: ${parts.join(', ')}. ` +
    'Bold text overlay style, vibrant colors, cartoon stickman character, ' +
    'high energy, clear focal point, eye-catching design.'
  );
}

// ─── Batch Runner ─────────────────────────────────────────────────────────────

/**
 * Process all approved scripts.
 * Loads cache + reuse library once; flushes after every script.
 *
 * @param {string[]} [filePaths]  Explicit absolute paths; auto-discovers if omitted.
 * @returns {Promise<object>}     Batch summary JSON
 */
async function runImageBatch(filePaths) {
  getEnvKeys(); // validate early

  await fs.ensureDir(IMAGES_DIR);
  await fs.ensureDir(THUMBS_DIR);
  await fs.ensureDir(APPROVED_DIR);

  let targets = filePaths;
  if (!targets || targets.length === 0) {
    const SKIP = new Set([
      'batch_summary.json', 'voice_summary.json',
      'sfx_summary.json',   'image_summary.json',
    ]);
    const allFiles = await fs.readdir(APPROVED_DIR).catch(() => []);
    targets = allFiles
      .filter(f => f.endsWith('.json') && !SKIP.has(f))
      .map(f => path.join(APPROVED_DIR, f));
  }

  if (targets.length === 0) {
    console.log(
      'No approved scripts found in scripts/approved/.\n' +
      'Run `node pipeline/viral_prediction_agent.js` first.'
    );
    return { total: 0, processed: [], failed: [], total_cost_estimate: 0 };
  }

  const cacheIndex = await loadCacheIndex();
  const reuseLib   = await loadReuseLibrary();

  const divider = '═'.repeat(62);
  console.log(`\n${divider}`);
  console.log(`  english-made-fun / image_agent.js`);
  console.log(`  SD model  : ${SD_MODEL} via Together AI`);
  console.log(`  DL model  : ${DALLE_MODEL} via OpenAI`);
  console.log(`  Batch     : ${targets.length} script${targets.length !== 1 ? 's' : ''}`);
  console.log(`  Cache     : ${Object.keys(cacheIndex).length} entries`);
  console.log(`  Reuse lib : ${Object.keys(reuseLib).length} entries`);
  console.log(`${divider}\n`);

  const summary = {
    run_at:             new Date().toISOString(),
    total:              targets.length,
    processed:          [],
    failed:             [],
    total_generated:    0,
    total_cached:       0,
    total_reused:       0,
    total_cost_estimate: 0,
  };

  for (let i = 0; i < targets.length; i++) {
    const scriptPath = targets[i];
    const fileName   = path.basename(scriptPath);

    console.log(`[${i + 1}/${targets.length}] ${fileName}`);

    let scriptData;
    try {
      scriptData = await fs.readJson(scriptPath);
    } catch (err) {
      console.error(`  ✗ Could not read JSON: ${err.message}\n`);
      summary.failed.push({ fileName, error: `readJson: ${err.message}` });
      continue;
    }

    const useImageCount = (scriptData.scenes ?? []).filter(s => s.use_image).length;
    console.log(
      `         title  : ${scriptData.video_title ?? scriptData.title ?? '(untitled)'}\n` +
      `         scenes : ${(scriptData.scenes ?? []).length}  (${useImageCount} with use_image=true)`
    );

    try {
      const result = await processScript(scriptData, scriptPath, cacheIndex, reuseLib);

      // Flush after every script
      await Promise.all([saveCacheIndex(cacheIndex), saveReuseLibrary(reuseLib)]);

      const costStr = `$${result.totalCost.toFixed(4)}`;
      console.log(
        `  ✓ Done  generated=${result.imagesGenerated}  ` +
        `cached=${result.imagesCached}  reused=${result.imagesReused}  ` +
        `est.cost=${costStr}\n`
      );

      summary.processed.push({
        fileName,
        video_id:        result.videoId,
        images_generated: result.imagesGenerated,
        images_cached:   result.imagesCached,
        images_reused:   result.imagesReused,
        cost_estimate:   result.totalCost,
      });

      summary.total_generated    += result.imagesGenerated;
      summary.total_cached       += result.imagesCached;
      summary.total_reused       += result.imagesReused;
      summary.total_cost_estimate += result.totalCost;

    } catch (err) {
      console.error(`  ✗ FAILED: ${err.message}\n`);
      summary.failed.push({ fileName, error: err.message });
      await Promise.all([
        saveCacheIndex(cacheIndex).catch(() => {}),
        saveReuseLibrary(reuseLib).catch(() => {}),
      ]);
    }
  }

  // Final flush
  await Promise.all([saveCacheIndex(cacheIndex), saveReuseLibrary(reuseLib)]);

  // ── Summary ───────────────────────────────────────────────────────────────
  const sep = '─'.repeat(62);
  console.log(sep);
  console.log(`  Image batch complete:`);
  console.log(`    ✓ Processed   : ${summary.processed.length}`);
  console.log(`    ✗ Failed      : ${summary.failed.length}`);
  console.log(`    API generated : ${summary.total_generated}`);
  console.log(`    Cache hits    : ${summary.total_cached}`);
  console.log(`    Reuse hits    : ${summary.total_reused}`);

  const totalReqs = summary.total_generated + summary.total_cached + summary.total_reused;
  if (totalReqs > 0) {
    const pct = (((summary.total_cached + summary.total_reused) / totalReqs) * 100).toFixed(1);
    console.log(`    Savings       : ${pct}% served without API call`);
  }

  console.log(`    Est. cost     : $${summary.total_cost_estimate.toFixed(4)} USD`);
  console.log(`      (DALL·E 3: $${COST_DALLE}/img  |  SD XL: $${COST_SD}/img)`);
  console.log(`    Cache entries : ${Object.keys(cacheIndex).length}`);
  console.log(`    Reuse entries : ${Object.keys(reuseLib).length}`);

  if (summary.failed.length > 0) {
    console.log('\n  Failed:');
    summary.failed.forEach(({ fileName: fn, error }) => {
      console.log(`    ✗ ${fn}  — ${error}`);
    });
  }

  console.log('');

  const summaryPath = path.join(APPROVED_DIR, 'image_summary.json');
  await fs.writeJson(summaryPath, summary, { spaces: 2 });
  console.log(`  Summary saved → ${summaryPath}\n`);

  return summary;
}

// ─── CLI Entry Point ──────────────────────────────────────────────────────────

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2).filter(s => s.trim().length > 0);

    if (args.includes('--show-cache')) {
      await showCache();
      process.exit(0);
    }

    if (args.includes('--init-reuse-library')) {
      getEnvKeys();
      await fs.ensureDir(IMAGES_DIR);
      const cacheIndex = await loadCacheIndex();
      const reuseLib   = await loadReuseLibrary();
      await initReuseLibrary(cacheIndex, reuseLib);
      await Promise.all([saveCacheIndex(cacheIndex), saveReuseLibrary(reuseLib)]);
      process.exit(0);
    }

    const explicitPaths = args.filter(a => !a.startsWith('--'));
    const targets = explicitPaths.length > 0
      ? explicitPaths.map(p =>
          path.isAbsolute(p) ? p : path.join(PROJECT_ROOT, p)
        )
      : undefined;

    if (targets) {
      console.log(`Running with ${targets.length} explicit file path(s).`);
    } else {
      console.log('No paths provided — processing all scripts/approved/*.json');
    }

    try {
      const summary = await runImageBatch(targets);
      process.exit(summary.failed.length > 0 ? 1 : 0);
    } catch (err) {
      console.error('\nFatal error:', err.message);
      if (err.stack) console.error(err.stack);
      process.exit(1);
    }
  })();
}

// ─── Module Exports ───────────────────────────────────────────────────────────

module.exports = {
  runImageBatch,
  processScript,
  generateOrReuse,
  generateSD,
  generateDALLE,
  initReuseLibrary,
  showCache,
  selectModel,
  loadCacheIndex,
  saveCacheIndex,
  loadReuseLibrary,
  saveReuseLibrary,
  md5,
  IMAGES_DIR,
  THUMBS_DIR,
  APPROVED_DIR,
  CACHE_INDEX,
  REUSE_LIBRARY,
  TOGETHER_INFERENCE_URL,
  OPENAI_IMAGES_URL,
  SD_MODEL,
  DALLE_MODEL,
  SD_STYLE_SUFFIX,
};
