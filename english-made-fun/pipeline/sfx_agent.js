/**
 * pipeline/sfx_agent.js
 *
 * Generates sound effects for approved scripts using the ElevenLabs
 * Sound Generation API, with a prompt-level MD5 cache to avoid
 * re-generating identical SFX and to show cost savings.
 *
 * ── Prerequisites ─────────────────────────────────────────────────────────────
 *   .env must contain:
 *     ELEVEN_API_KEY=<your-elevenlabs-api-key>
 *
 * ── ElevenLabs Sound Generation API ──────────────────────────────────────────
 *   Endpoint : POST https://api.elevenlabs.io/v1/sound-generation
 *   Headers  : { xi-api-key: <key>, Content-Type: application/json }
 *   Body     : { text, duration_seconds, prompt_influence }
 *   Response : audio/mpeg binary (raw MP3 bytes — NOT base64)
 *   Docs     : https://elevenlabs.io/docs/api-reference/sound-generation
 *
 * ── Caching ───────────────────────────────────────────────────────────────────
 *   Cache key    : MD5(prompt_string)
 *   Cache index  : audio/sfx/cache_index.json
 *     {
 *       "<md5>": {
 *         prompt: string,
 *         file: "audio/sfx/<md5>.mp3",   ← canonical cached file (relative to project root)
 *         duration_seconds: number,
 *         created_at: ISO string,
 *         hits: number
 *       }
 *     }
 *   Cache hit  → copy canonical cached file to output path, increment hits, no API call
 *   Cache miss → call API, write output file, write canonical cache copy, upsert index entry
 *
 * ── Output naming ─────────────────────────────────────────────────────────────
 *   audio/sfx/[video_id]_scene[N]_sfx[M].mp3
 *     N = 1-padded scene index (02, 03, ...)
 *     M = 1-padded sfx index within scene (1, 2, ...)
 *   audio/sfx/cache_index.json    — cache index (updated after every run)
 *
 * ── CLI usage ─────────────────────────────────────────────────────────────────
 *   node pipeline/sfx_agent.js                         # all approved scripts
 *   node pipeline/sfx_agent.js scripts/approved/x.json # specific file(s)
 *   node pipeline/sfx_agent.js --show-cache            # print cache stats + entries
 */

'use strict';

// ─── Environment ──────────────────────────────────────────────────────────────
const path   = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// ─── Imports ──────────────────────────────────────────────────────────────────
const axios   = require('axios');
const crypto  = require('crypto');
const fs      = require('fs-extra');

// ─── Constants ────────────────────────────────────────────────────────────────

const ELEVENLABS_SFX_URL = 'https://api.elevenlabs.io/v1/sound-generation';

/**
 * prompt_influence: 0.0–1.0
 * Lower = more random/creative; 0.3 gives a good balance between prompt
 * fidelity and natural-sounding SFX variation.
 */
const PROMPT_INFLUENCE   = 0.3;

/**
 * Default duration when a scene's sfx entry has no explicit duration.
 * ElevenLabs accepts 0.5–22.0 seconds.
 */
const DEFAULT_SFX_DURATION_SECONDS = 2.0;

const MAX_RETRIES   = 3;
const RETRY_BASE_MS = 1500;   // 1.5s → 3s → 6s

const PROJECT_ROOT  = path.join(__dirname, '..');
const SFX_DIR       = path.join(PROJECT_ROOT, 'audio', 'sfx');
const APPROVED_DIR  = path.join(PROJECT_ROOT, 'scripts', 'approved');
const CACHE_INDEX   = path.join(SFX_DIR, 'cache_index.json');

// ElevenLabs Sound Generation pricing (as of mid-2025):
// Each generation costs characters — the text length is billed.
// Approximate: ~$0.30 per 1K characters on the Starter plan.
// Adjust COST_PER_1K_CHARS to your plan for accurate estimates.
const COST_PER_1K_CHARS = 0.30;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Compute the MD5 hash of a string, returned as a 32-char hex string.
 * Used as the cache key for each unique SFX prompt.
 *
 * @param {string} str
 * @returns {string}
 */
function md5(str) {
  return crypto.createHash('md5').update(str, 'utf8').digest('hex');
}

/**
 * Validate ELEVEN_API_KEY is set and return it.
 * @returns {string}
 */
function getApiKey() {
  const key = process.env.ELEVEN_API_KEY || process.env.ELEVENLABS_API_KEY;
  if (!key) {
    throw new Error(
      'ELEVENLABS_API_KEY is not set.\n' +
      'Add it to english-made-fun/.env:\n' +
      '  ELEVENLABS_API_KEY=<your-elevenlabs-api-key>'
    );
  }
  return key;
}

/**
 * Returns true for HTTP status codes / network conditions that are safe to retry.
 * @param {Error} error  axios error
 * @returns {boolean}
 */
function isRetryable(error) {
  if (!error.response) return true;   // network error / timeout
  const s = error.response.status;
  return s === 429 || s === 500 || s === 502 || s === 503 || s === 504;
}

/**
 * Return a path relative to the project root, using forward slashes.
 * Used for storing portable paths in JSON files.
 * @param {string} absolutePath
 * @returns {string}
 */
function toRelative(absolutePath) {
  return path.relative(PROJECT_ROOT, absolutePath).replace(/\\/g, '/');
}

// ─── Cache ────────────────────────────────────────────────────────────────────

/**
 * Load the cache index from disk.
 * Returns an empty object if the file doesn't exist yet.
 * @returns {Promise<object>}
 */
async function loadCacheIndex() {
  try {
    return await fs.readJson(CACHE_INDEX);
  } catch {
    return {};
  }
}

/**
 * Persist the cache index to disk (pretty-printed, 2-space indent).
 * @param {object} index
 */
async function saveCacheIndex(index) {
  await fs.writeJson(CACHE_INDEX, index, { spaces: 2 });
}

/**
 * Print a human-readable summary of the cache index to stdout.
 */
async function showCache() {
  const index = await loadCacheIndex();
  const entries = Object.entries(index);

  if (entries.length === 0) {
    console.log('\nCache is empty. Run the sfx_agent to populate it.\n');
    return;
  }

  const totalHits = entries.reduce((sum, [, v]) => sum + (v.hits ?? 0), 0);

  console.log(`\n${'─'.repeat(64)}`);
  console.log(`  SFX Cache  |  ${entries.length} entries  |  ${totalHits} total hits`);
  console.log(`  Index: ${CACHE_INDEX}`);
  console.log(`${'─'.repeat(64)}`);

  entries
    .sort((a, b) => (b[1].hits ?? 0) - (a[1].hits ?? 0))
    .forEach(([hash, entry]) => {
      console.log(`\n  [${hash}]`);
      console.log(`    prompt   : "${entry.prompt}"`);
      console.log(`    duration : ${entry.duration_seconds}s`);
      console.log(`    file     : ${entry.file}`);
      console.log(`    hits     : ${entry.hits ?? 0}`);
      console.log(`    created  : ${entry.created_at}`);
    });

  console.log('');
}

// ─── ElevenLabs API: Generate SFX ────────────────────────────────────────────

/**
 * Call the ElevenLabs sound-generation endpoint.
 * Returns raw MP3 bytes as a Buffer.
 *
 * Endpoint: POST https://api.elevenlabs.io/v1/sound-generation
 * Headers:
 *   xi-api-key: <ELEVEN_API_KEY>
 *   Content-Type: application/json
 * Body (JSON):
 *   {
 *     "text": "<sfx prompt>",
 *     "duration_seconds": 2.0,
 *     "prompt_influence": 0.3
 *   }
 * Response: audio/mpeg binary (NOT base64 — raw bytes streamed directly)
 *
 * @param {string} prompt            - Natural language SFX description
 * @param {number} durationSeconds   - 0.5–22.0 seconds
 * @param {number} [attempt=0]       - Internal retry counter
 * @returns {Promise<Buffer>}        - Raw MP3 bytes
 */
async function callElevenLabsSfx(prompt, durationSeconds, attempt = 0) {
  const apiKey = getApiKey();

  const clampedDuration = Math.min(22.0, Math.max(0.5, durationSeconds));

  const requestBody = {
    text:             prompt,
    duration_seconds: clampedDuration,
    prompt_influence: PROMPT_INFLUENCE,
  };

  try {
    const response = await axios.post(ELEVENLABS_SFX_URL, requestBody, {
      headers: {
        'xi-api-key':   apiKey,
        'Content-Type': 'application/json',
        'Accept':       'audio/mpeg',
      },
      responseType: 'arraybuffer',   // get raw bytes, not JSON
      timeout:      60000,           // SFX generation can take up to ~30s
    });

    const buffer = Buffer.from(response.data);

    if (buffer.length === 0) {
      throw new Error('ElevenLabs returned an empty audio buffer.');
    }

    return buffer;

  } catch (error) {
    const exhausted = attempt >= MAX_RETRIES;
    const retryable = isRetryable(error);

    if (!exhausted && retryable) {
      const backoffMs = Math.pow(2, attempt) * RETRY_BASE_MS;
      const status    = error.response?.status;
      const label     = status ? `HTTP ${status}` : 'network error';

      // Try to decode the error body (arraybuffer) as text for logging
      let errMsg = error.message;
      if (error.response?.data) {
        try {
          const decoded = Buffer.from(error.response.data).toString('utf8');
          const parsed  = JSON.parse(decoded);
          errMsg = parsed?.detail?.message ?? parsed?.message ?? decoded;
        } catch { /* leave errMsg as-is */ }
      }

      console.warn(`      ⚠  ElevenLabs ${label}: ${errMsg.slice(0, 120)}`);
      console.log(`      ↺  Retrying in ${(backoffMs / 1000).toFixed(1)}s...`);
      await sleep(backoffMs);
      return callElevenLabsSfx(prompt, durationSeconds, attempt + 1);
    }

    // Surface a clean error with HTTP status if available
    const status = error.response?.status;
    let finalMsg = error.message;
    if (error.response?.data) {
      try {
        const decoded = Buffer.from(error.response.data).toString('utf8');
        const parsed  = JSON.parse(decoded);
        finalMsg = parsed?.detail?.message ?? parsed?.message ?? decoded;
      } catch { /* leave finalMsg as-is */ }
    }

    throw new Error(
      `ElevenLabs SFX failed${status ? ` [HTTP ${status}]` : ''}: ${finalMsg}\n` +
      `  prompt: "${prompt.slice(0, 80)}"`
    );
  }
}

// ─── Core: Generate or Retrieve One SFX ──────────────────────────────────────

/**
 * Generate a single SFX file, using the cache if available.
 *
 * Cache behaviour:
 *   HIT  → copy canonical cache file to outputPath, increment hits counter
 *   MISS → call ElevenLabs API, write outputPath, write canonical cache copy,
 *           insert entry into cache index
 *
 * @param {string}  prompt           - SFX prompt text
 * @param {number}  durationSeconds  - Desired duration in seconds
 * @param {string}  outputPath       - Absolute path for the output MP3
 * @param {object}  cacheIndex       - The loaded cache index object (mutated in place)
 * @returns {Promise<{ hit: boolean, charCount: number }>}
 */
async function generateOrCacheSfx(prompt, durationSeconds, outputPath, cacheIndex) {
  const key = md5(prompt);

  // ── Cache HIT ────────────────────────────────────────────────────────────
  if (cacheIndex[key]) {
    const entry = cacheIndex[key];
    const cachedFilePath = path.isAbsolute(entry.file)
      ? entry.file
      : path.join(PROJECT_ROOT, entry.file);

    if (await fs.pathExists(cachedFilePath)) {
      await fs.copy(cachedFilePath, outputPath);
      entry.hits = (entry.hits ?? 0) + 1;
      console.log(`      ✓ Cache HIT  [${key.slice(0, 8)}…] → ${path.basename(outputPath)}`);
      return { hit: true, charCount: prompt.length };
    }

    // Canonical cache file was deleted externally — fall through to regenerate
    console.warn(`      ⚠  Cache entry exists but file missing — regenerating.`);
    delete cacheIndex[key];
  }

  // ── Cache MISS — call API ─────────────────────────────────────────────────
  const mp3Buffer = await callElevenLabsSfx(prompt, durationSeconds);
  await fs.writeFile(outputPath, mp3Buffer);

  // Write canonical cache copy named after the MD5 hash
  const canonicalPath = path.join(SFX_DIR, `${key}.mp3`);
  await fs.copy(outputPath, canonicalPath);

  // Upsert cache index entry
  cacheIndex[key] = {
    prompt,
    file:             toRelative(canonicalPath),
    duration_seconds: durationSeconds,
    created_at:       new Date().toISOString(),
    hits:             0,
  };

  console.log(
    `      ✓ Cache MISS → generated: ${path.basename(outputPath)}  ` +
    `(${mp3Buffer.length} bytes, ${durationSeconds}s)`
  );

  return { hit: false, charCount: prompt.length };
}

// ─── Core: Process One Script ─────────────────────────────────────────────────

/**
 * Generate SFX for every sfx_prompts array found across all scenes of a script.
 * Updates the script's scene SFX entries with actual file paths, then
 * writes the updated JSON back to disk.
 *
 * Each scene's sfx entry in the script_agent schema looks like:
 *   sfx_prompts: ["whoosh sound", "coin ding"]
 *
 * We convert these to the VideoTemplate's SfxCue schema:
 *   sfx: [{ file: "audio/sfx/...", startTime: 0, volume: 1 }]
 *
 * @param {object} scriptData   - Parsed approved script JSON
 * @param {string} scriptPath   - Absolute path to the approved script JSON
 * @param {object} cacheIndex   - Shared cache index (mutated in place across the batch)
 * @returns {Promise<{
 *   videoId: string,
 *   sfxGenerated: number,
 *   sfxCached: number,
 *   charCount: number,
 *   costEstimate: number,
 * }>}
 */
async function processScript(scriptData, scriptPath, cacheIndex) {
  const videoId = scriptData.video_id ?? path.basename(scriptPath, '.json');
  const scenes  = scriptData.scenes  ?? [];

  let sfxGenerated = 0;   // API calls made
  let sfxCached    = 0;   // cache hits (no API call)
  let totalChars   = 0;

  const updatedScenes = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene      = { ...scenes[i] };
    const sceneIndex = i + 1;
    const paddedIdx  = String(sceneIndex).padStart(2, '0');

    // sfx_prompts: array of strings from script_agent output
    const sfxPrompts = scene.sfx_prompts;
    if (!Array.isArray(sfxPrompts) || sfxPrompts.length === 0) {
      updatedScenes.push(scene);
      continue;
    }

    console.log(
      `    [scene ${sceneIndex}/${scenes.length}] ` +
      `${sfxPrompts.length} SFX prompt${sfxPrompts.length !== 1 ? 's' : ''}`
    );

    // Derive scene duration for SFX length cap
    // script_agent stores duration in seconds (number)
    const sceneDuration = typeof scene.duration === 'number'
      ? scene.duration
      : DEFAULT_SFX_DURATION_SECONDS;

    // Build the SfxCue array (VideoTemplate schema)
    const sfxCues = [];

    for (let j = 0; j < sfxPrompts.length; j++) {
      const prompt      = (sfxPrompts[j] ?? '').trim();
      const sfxNumLabel = String(j + 1).padStart(1, '0');  // 1, 2, 3 ...

      if (!prompt) {
        console.log(`      [sfx ${j + 1}] ⚠  Empty prompt — skipping.`);
        continue;
      }

      console.log(`      [sfx ${j + 1}] "${prompt.slice(0, 70)}${prompt.length > 70 ? '…' : ''}"`);

      // Output filename: [video_id]_scene[N]_sfx[M].mp3
      const fileName   = `${videoId}_scene${paddedIdx}_sfx${sfxNumLabel}.mp3`;
      const outputPath = path.join(SFX_DIR, fileName);

      // Duration: cap at scene duration, min 0.5s
      const sfxDuration = Math.min(
        sceneDuration,
        Math.max(0.5, DEFAULT_SFX_DURATION_SECONDS)
      );

      // Skip if output file already exists (resume safety — only if cache entry also valid)
      if (await fs.pathExists(outputPath)) {
        console.log(`      ✓ Already exists — reusing: ${fileName}`);
        sfxCached++;
        totalChars += prompt.length;

        // Ensure cache index is populated even if we skip generation
        const key = md5(prompt);
        if (!cacheIndex[key]) {
          cacheIndex[key] = {
            prompt,
            file:             toRelative(outputPath),
            duration_seconds: sfxDuration,
            created_at:       new Date().toISOString(),
            hits:             0,
          };
        }

        // Preserve existing startTime/volume from prior manual edits in the script.
        // Look up the matching SFX entry that already exists on the scene.
        const existingCue = Array.isArray(scene.sfx)
          ? scene.sfx.find(c => c.file && path.basename(c.file) === fileName)
          : null;

        sfxCues.push({
          file:      toRelative(outputPath),
          startTime: existingCue?.startTime ?? 0,
          volume:    existingCue?.volume ?? 1,
        });
        continue;
      }

      const { hit, charCount } = await generateOrCacheSfx(
        prompt,
        sfxDuration,
        outputPath,
        cacheIndex
      );

      totalChars += charCount;
      if (hit) { sfxCached++; } else { sfxGenerated++; }

      // Preserve manually-set startTime/volume from existing scene.sfx entries.
      // sfx_prompts[j] may correspond to scene.sfx[j] if both arrays align.
      const existingCue = Array.isArray(scene.sfx) && scene.sfx[j]
        ? scene.sfx[j]
        : null;

      sfxCues.push({
        file:      toRelative(outputPath),
        startTime: existingCue?.startTime ?? 0,
        volume:    existingCue?.volume ?? 1,
      });
    }

    // Merge generated SfxCues back onto the scene
    // Preserve any existing manually-set sfx cues (from prior runs / manual edits)
    const existingCues = Array.isArray(scene.sfx)
      ? scene.sfx.filter(c => c.file && !sfxCues.find(n => n.file === c.file))
      : [];

    scene.sfx = [...existingCues, ...sfxCues];
    updatedScenes.push(scene);
  }

  // ── Write updated script JSON ─────────────────────────────────────────────
  const updatedScript = { ...scriptData, scenes: updatedScenes };
  await fs.writeJson(scriptPath, updatedScript, { spaces: 2 });
  console.log(`    ✓ Script JSON updated with SFX paths: ${path.basename(scriptPath)}`);

  const costEstimate = (totalChars / 1000) * COST_PER_1K_CHARS;

  return { videoId, sfxGenerated, sfxCached, charCount: totalChars, costEstimate };
}

// ─── Batch Runner ─────────────────────────────────────────────────────────────

/**
 * Process all approved scripts, generating SFX for every sfx_prompts array.
 * Saves and reloads the cache index once at the start, then flushes to disk
 * after every script so progress is never lost on interruption.
 *
 * @param {string[]} [filePaths]  Optional explicit list of absolute paths.
 *                                If omitted, discovers all *.json in APPROVED_DIR
 *                                (excluding batch_summary.json and voice_summary.json).
 * @returns {Promise<object>}     Batch summary JSON
 */
async function runSfxBatch(filePaths) {
  // Validate API key early
  getApiKey();

  await fs.ensureDir(SFX_DIR);
  await fs.ensureDir(APPROVED_DIR);

  // Discover targets
  let targets = filePaths;
  if (!targets || targets.length === 0) {
    const allFiles = await fs.readdir(APPROVED_DIR).catch(() => []);
    const SKIP = new Set(['batch_summary.json', 'voice_summary.json', 'sfx_summary.json']);
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

  // Load shared cache index once
  const cacheIndex = await loadCacheIndex();

  const divider = '═'.repeat(62);
  console.log(`\n${divider}`);
  console.log(`  english-made-fun / sfx_agent.js`);
  console.log(`  Endpoint  : ${ELEVENLABS_SFX_URL}`);
  console.log(`  Batch     : ${targets.length} script${targets.length !== 1 ? 's' : ''}`);
  console.log(`  Cache     : ${Object.keys(cacheIndex).length} existing entries`);
  console.log(`  SFX dir   : ${SFX_DIR}`);
  console.log(`${divider}\n`);

  const summary = {
    run_at:             new Date().toISOString(),
    total:              targets.length,
    processed:          [],
    failed:             [],
    total_api_calls:    0,
    total_cache_hits:   0,
    total_char_count:   0,
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

    console.log(
      `         title  : ${scriptData.video_title ?? scriptData.title ?? '(untitled)'}\n` +
      `         scenes : ${(scriptData.scenes ?? []).length}`
    );

    try {
      const result = await processScript(scriptData, scriptPath, cacheIndex);

      // Flush cache to disk after every script so interruptions don't lose work
      await saveCacheIndex(cacheIndex);

      const costStr = `$${result.costEstimate.toFixed(4)}`;
      console.log(
        `  ✓ Done  api_calls=${result.sfxGenerated}  ` +
        `cached=${result.sfxCached}  chars=${result.charCount}  est.cost=${costStr}\n`
      );

      summary.processed.push({
        fileName,
        video_id:      result.videoId,
        sfx_generated: result.sfxGenerated,
        sfx_cached:    result.sfxCached,
        char_count:    result.charCount,
        cost_estimate: result.costEstimate,
      });

      summary.total_api_calls    += result.sfxGenerated;
      summary.total_cache_hits   += result.sfxCached;
      summary.total_char_count   += result.charCount;
      summary.total_cost_estimate += result.costEstimate;

    } catch (err) {
      console.error(`  ✗ FAILED: ${err.message}\n`);
      summary.failed.push({ fileName, error: err.message });
      // Still flush the cache — any successful SFX before the failure shouldn't be lost
      await saveCacheIndex(cacheIndex).catch(() => {});
    }
  }

  // Final cache flush
  await saveCacheIndex(cacheIndex);

  // ── Summary ───────────────────────────────────────────────────────────────
  const sep = '─'.repeat(62);
  console.log(sep);
  console.log(`  SFX batch complete:`);
  console.log(`    ✓ Processed   : ${summary.processed.length}`);
  console.log(`    ✗ Failed      : ${summary.failed.length}`);
  console.log(`    API calls     : ${summary.total_api_calls}`);
  console.log(`    Cache hits    : ${summary.total_cache_hits}  (no API call made)`);

  const total = summary.total_api_calls + summary.total_cache_hits;
  if (total > 0) {
    const savePct = ((summary.total_cache_hits / total) * 100).toFixed(1);
    console.log(`    Cache saving  : ${savePct}% of requests served from cache`);
  }

  console.log(`    Characters    : ${summary.total_char_count.toLocaleString()}`);
  console.log(`    Est. cost     : $${summary.total_cost_estimate.toFixed(4)} USD`);
  console.log(`      (at $${COST_PER_1K_CHARS}/1K chars — check your ElevenLabs plan)`);
  console.log(`    Cache entries : ${Object.keys(cacheIndex).length} total`);
  console.log(`    Cache index   : ${CACHE_INDEX}`);

  if (summary.failed.length > 0) {
    console.log('\n  Failed:');
    summary.failed.forEach(({ fileName: fn, error }) => {
      console.log(`    ✗ ${fn}  — ${error}`);
    });
  }

  console.log('');

  const summaryPath = path.join(APPROVED_DIR, 'sfx_summary.json');
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
      const summary = await runSfxBatch(targets);
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
  runSfxBatch,
  processScript,
  generateOrCacheSfx,
  callElevenLabsSfx,
  showCache,
  loadCacheIndex,
  saveCacheIndex,
  md5,
  SFX_DIR,
  APPROVED_DIR,
  CACHE_INDEX,
  ELEVENLABS_SFX_URL,
};
