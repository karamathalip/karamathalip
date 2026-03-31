/**
 * pipeline/voice_agent.js
 *
 * Generates MP3 voice files for each approved script using the Inworld Studio
 * TTS API, then stitches all scene lines into one combined voice track per video.
 *
 * ── Prerequisites ─────────────────────────────────────────────────────────────
 *   .env must contain:
 *     INWORLD_API_KEY=<your-inworld-service-account-key-or-bearer-token>
 *     INWORLD_WORKSPACE_ID=<workspaces/{name}>   e.g. workspaces/my-channel-abc123
 *     INWORLD_CHARACTER_ID=<characters/{name}>   e.g. characters/energetic-english-coach
 *
 *   The workspace and character IDs are shown in Inworld Studio under
 *   Studio → Settings → API Access and the character's detail page.
 *   Format: "workspaces/abc123def456" (the full resource path segment).
 *
 * ── Inworld TTS API ───────────────────────────────────────────────────────────
 *   Endpoint : POST https://studio.inworld.ai/v1/{workspace}/{character}:synthesize
 *   Auth     : Authorization: Basic <base64("key:")>  ← key only, no secret
 *   Voices   : GET  https://studio.inworld.ai/v1/{workspace}/characters/{id}/voices
 *
 * ── CLI usage ─────────────────────────────────────────────────────────────────
 *   node pipeline/voice_agent.js                  # processes all approved scripts
 *   node pipeline/voice_agent.js --list-voices    # prints available Inworld voices
 *   node pipeline/voice_agent.js scripts/approved/my_script.json   # single file
 *
 * ── Output ────────────────────────────────────────────────────────────────────
 *   audio/voices/[video_id]_scene[N]_voice.mp3    — per-scene audio
 *   audio/voices/[video_id]_voice_full.mp3        — stitched full track
 *   scripts/approved/[original_filename]          — script updated with file paths
 */

'use strict';

// ─── Environment ──────────────────────────────────────────────────────────────
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// ─── Imports ──────────────────────────────────────────────────────────────────
const axios        = require('axios');
const fs           = require('fs-extra');
const ffmpeg       = require('fluent-ffmpeg');
const os           = require('os');

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Inworld Studio REST API base URL.
 * Docs: https://docs.inworld.ai/docs/tutorial-integrations/studio-api/
 */
const INWORLD_BASE_URL = 'https://studio.inworld.ai/v1';

/**
 * Character display name used in prompts and logs.
 * The actual character used for synthesis is controlled by INWORLD_CHARACTER_ID.
 */
const CHARACTER_DISPLAY_NAME = 'Energetic English Coach';

const MAX_RETRIES    = 3;
const RETRY_BASE_MS  = 1500;   // exponential backoff: 1.5s → 3s → 6s
const MAX_CONCURRENT = 2;      // Inworld free tier is rate-limited; keep low

const APPROVED_DIR  = path.join(__dirname, '../scripts/approved');
const VOICES_DIR    = path.join(__dirname, '../audio/voices');

// Inworld TTS supports MP3 at these sample rates. 24000 is their default.
const AUDIO_ENCODING  = 'MP3';
const SAMPLE_RATE_HZ  = 24000;

// Cost estimate (Inworld as of 2025): ~$0.006 per 1K characters synthesised.
// Adjust if your plan differs.
const COST_PER_1K_CHARS = 0.006;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Build the Authorization header value for Inworld Studio API.
 *
 * Inworld uses HTTP Basic auth where the API key is the username and the
 * password is empty:  base64("sk-ant-...:") → "Basic <token>"
 *
 * @param {string} apiKey
 * @returns {string}
 */
function buildAuthHeader(apiKey) {
  const encoded = Buffer.from(`${apiKey}:`).toString('base64');
  return `Basic ${encoded}`;
}

/**
 * Validate required environment variables and return them.
 * Throws a descriptive error if any are missing.
 *
 * @returns {{ apiKey: string, workspaceId: string, characterId: string }}
 */
function getEnvConfig() {
  const apiKey      = process.env.INWORLD_API_KEY;
  const workspaceId = process.env.INWORLD_WORKSPACE_ID;
  const characterId = process.env.INWORLD_CHARACTER_ID;

  const missing = [];
  if (!apiKey)      missing.push('INWORLD_API_KEY');
  if (!workspaceId) missing.push('INWORLD_WORKSPACE_ID');
  if (!characterId) missing.push('INWORLD_CHARACTER_ID');

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}\n` +
      'Add them to english-made-fun/.env:\n' +
      '  INWORLD_API_KEY=<your-key>\n' +
      '  INWORLD_WORKSPACE_ID=workspaces/<id>   # from Studio → Settings → API Access\n' +
      '  INWORLD_CHARACTER_ID=characters/<id>   # from your character\'s detail page'
    );
  }

  // Normalise: strip trailing slashes
  return {
    apiKey,
    workspaceId: workspaceId.replace(/\/$/, ''),
    characterId: characterId.replace(/\/$/, ''),
  };
}

/**
 * Returns true for HTTP status codes and network conditions that are safe to retry.
 *
 * @param {Error} error  axios error
 * @returns {boolean}
 */
function isRetryable(error) {
  if (!error.response) return true;  // network error / timeout — always retry
  const status = error.response.status;
  return status === 429 || status === 500 || status === 502 ||
         status === 503 || status === 504;
}

/**
 * Convert a speed value (from script's audio.speed, e.g. 1.2) to Inworld's
 * speakingRate range. Inworld accepts 0.25–4.0 (same as Google Cloud TTS).
 * Scripts may store speed as 0.5–2.0; we clamp to be safe.
 *
 * @param {number|undefined} speed
 * @returns {number}
 */
function normaliseSpeakingRate(speed) {
  const s = typeof speed === 'number' ? speed : 1.0;
  return Math.min(4.0, Math.max(0.25, s));
}

/**
 * Map a tone string (from script's audio.tone) to an Inworld pitch value.
 * Inworld pitch: -20.0 to +20.0 semitones (0 = neutral).
 *
 * Common tone values the script_agent produces:
 *   "energetic", "excited", "enthusiastic" → slightly higher pitch
 *   "calm", "neutral"                      → 0
 *   "serious", "dramatic"                  → slightly lower pitch
 *
 * @param {string|undefined} tone
 * @returns {number}
 */
function toneToSemitones(tone) {
  const t = (tone ?? '').toLowerCase();
  if (/energetic|excited|enthusiastic|upbeat|fun/.test(t))  return 2.0;
  if (/warm|friendly|encouraging/.test(t))                   return 1.0;
  if (/calm|neutral|clear/.test(t))                          return 0.0;
  if (/serious|formal|authoritative/.test(t))                return -1.5;
  if (/dramatic|intense/.test(t))                            return -3.0;
  return 0.0;
}

// ─── Inworld API: List Voices ─────────────────────────────────────────────────

/**
 * Fetches all available voices for the configured character from Inworld Studio.
 *
 * Endpoint: GET /v1/{workspace}/characters/{id}/voices
 * Docs: https://docs.inworld.ai/docs/tutorial-integrations/studio-api/#voices
 *
 * @returns {Promise<Array<{ name: string, gender: string, languageCodes: string[] }>>}
 */
async function listVoices() {
  const { apiKey, workspaceId, characterId } = getEnvConfig();

  // Build the full resource path: workspaces/{ws}/characters/{ch}/voices
  const characterResource = `${workspaceId}/${characterId}`;
  const url = `${INWORLD_BASE_URL}/${characterResource}/voices`;

  console.log(`\nFetching available voices for character: ${characterResource}`);
  console.log(`GET ${url}\n`);

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: buildAuthHeader(apiKey),
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    const voices = response.data?.voices ?? response.data ?? [];

    if (!Array.isArray(voices) || voices.length === 0) {
      console.log('No voices returned. Check your workspace/character IDs.');
      return [];
    }

    console.log(`Available voices for "${CHARACTER_DISPLAY_NAME}":\n`);
    voices.forEach((v, i) => {
      const langs = Array.isArray(v.languageCodes) ? v.languageCodes.join(', ') : '—';
      console.log(`  [${String(i + 1).padStart(2)}] ${v.name ?? v.voiceName ?? '(unnamed)'}`);
      console.log(`       Gender: ${v.gender ?? v.ssmlGender ?? '—'}  |  Languages: ${langs}`);
    });
    console.log('');

    return voices;
  } catch (error) {
    const status = error.response?.status;
    const msg    = error.response?.data?.message ?? error.message;
    throw new Error(
      `listVoices failed${status ? ` [HTTP ${status}]` : ''}: ${msg}`
    );
  }
}

// ─── Inworld API: Synthesize One Voice Line ───────────────────────────────────

/**
 * Call the Inworld TTS synthesize endpoint for a single text string.
 * Returns the raw MP3 bytes as a Buffer.
 *
 * Endpoint: POST /v1/{workspace}/{character}:synthesize
 * Request body (JSON):
 * {
 *   "text": "...",
 *   "audioConfig": {
 *     "audioEncoding": "MP3",
 *     "sampleRateHertz": 24000,
 *     "speakingRate": 1.0,
 *     "pitch": 0.0
 *   }
 * }
 *
 * Response body (JSON):
 * {
 *   "audioContent": "<base64-encoded-mp3>",
 *   "timepoints": [ ... ],    // word-level timing (optional, may be absent)
 *   "audioConfig": { ... }
 * }
 *
 * Docs: https://docs.inworld.ai/docs/tutorial-integrations/studio-api/#text-to-speech
 *
 * @param {string}  text          - The voice line to synthesise
 * @param {number}  speakingRate  - 0.25–4.0 (1.0 = normal)
 * @param {number}  pitch         - -20.0 to +20.0 semitones
 * @param {number}  attempt       - Internal retry counter
 * @returns {Promise<Buffer>}     - Raw MP3 bytes
 */
async function synthesizeVoiceLine(text, speakingRate, pitch, attempt = 0) {
  const { apiKey, workspaceId, characterId } = getEnvConfig();

  // Full resource path: workspaces/{ws}/characters/{ch}
  const characterResource = `${workspaceId}/${characterId}`;
  const url = `${INWORLD_BASE_URL}/${characterResource}:synthesize`;

  const requestBody = {
    text,
    audioConfig: {
      audioEncoding:   AUDIO_ENCODING,
      sampleRateHertz: SAMPLE_RATE_HZ,
      speakingRate,
      pitch,
    },
  };

  try {
    const response = await axios.post(url, requestBody, {
      headers: {
        Authorization:  buildAuthHeader(apiKey),
        'Content-Type': 'application/json',
        Accept:         'application/json',
      },
      timeout: 30000,
    });

    const audioContent = response.data?.audioContent;
    if (!audioContent) {
      throw new Error(
        'Inworld response missing "audioContent" field. ' +
        `Response keys: [${Object.keys(response.data ?? {}).join(', ')}]`
      );
    }

    // audioContent is base64-encoded MP3 data
    return Buffer.from(audioContent, 'base64');

  } catch (error) {
    const exhausted = attempt >= MAX_RETRIES;
    const retryable = isRetryable(error);

    if (!exhausted && retryable) {
      const backoffMs = Math.pow(2, attempt) * RETRY_BASE_MS;
      const status    = error.response?.status;
      const label     = status ? `HTTP ${status}` : 'network error';
      console.warn(`      ⚠  synthesize ${label}: ${(error.response?.data?.message ?? error.message).slice(0, 100)}`);
      console.log(`      ↺  Retrying in ${(backoffMs / 1000).toFixed(1)}s...`);
      await sleep(backoffMs);
      return synthesizeVoiceLine(text, speakingRate, pitch, attempt + 1);
    }

    // Surface with context
    const status = error.response?.status;
    const msg    = error.response?.data?.message ?? error.message;
    throw new Error(
      `synthesizeVoiceLine failed${status ? ` [HTTP ${status}]` : ''}: ${msg}\n` +
      `  text: "${text.slice(0, 80)}..."`
    );
  }
}

// ─── Audio: Concatenate MP3 Files ────────────────────────────────────────────

/**
 * Concatenate multiple MP3 files into one output file using FFmpeg's
 * concat demuxer. Writes a temporary file list, runs ffmpeg, then cleans up.
 *
 * @param {string[]} inputPaths   - Absolute paths to input MP3 files (in order)
 * @param {string}   outputPath   - Absolute path for the combined output MP3
 * @returns {Promise<void>}
 */
function concatenateAudioFiles(inputPaths, outputPath) {
  return new Promise((resolve, reject) => {
    if (inputPaths.length === 0) {
      return reject(new Error('concatenateAudioFiles: no input files provided'));
    }

    if (inputPaths.length === 1) {
      // Single file — just copy it
      return fs.copy(inputPaths[0], outputPath).then(resolve).catch(reject);
    }

    // Write a temporary concat list file
    const tmpList = path.join(os.tmpdir(), `inworld_concat_${Date.now()}.txt`);
    const listContent = inputPaths
      .map(p => `file '${p.replace(/'/g, "'\\''")}'`)
      .join('\n');

    fs.writeFile(tmpList, listContent, 'utf8')
      .then(() => {
        ffmpeg()
          .input(tmpList)
          .inputOptions(['-f', 'concat', '-safe', '0'])
          .audioCodec('libmp3lame')
          .audioBitrate('128k')
          .output(outputPath)
          .on('end', () => {
            fs.remove(tmpList).catch(() => {});
            resolve();
          })
          .on('error', (err) => {
            fs.remove(tmpList).catch(() => {});
            reject(new Error(`FFmpeg concat error: ${err.message}`));
          })
          .run();
      })
      .catch(reject);
  });
}

// ─── Core: Process One Script ─────────────────────────────────────────────────

/**
 * Generate per-scene MP3 files and a combined full-track MP3 for one script.
 * Updates the script's audio.file_url and per-scene audio fields, then
 * writes the updated JSON back to the approved scripts folder.
 *
 * @param {object} scriptData    - Parsed approved script JSON
 * @param {string} scriptPath    - Absolute path to the approved script JSON file
 * @returns {Promise<{
 *   videoId: string,
 *   scenesGenerated: number,
 *   fullTrackPath: string,
 *   charCount: number,
 *   costEstimate: number,
 *   skippedScenes: number[]
 * }>}
 */
async function processScript(scriptData, scriptPath) {
  const videoId     = scriptData.video_id ?? path.basename(scriptPath, '.json');
  const scenes      = scriptData.scenes ?? [];
  const audioConfig = scriptData.audio   ?? {};

  const speakingRate = normaliseSpeakingRate(audioConfig.speed);
  const pitch        = toneToSemitones(audioConfig.tone);

  console.log(`\n  Character : ${CHARACTER_DISPLAY_NAME}`);
  console.log(`  Speed     : ${speakingRate.toFixed(2)}  (from audio.speed=${audioConfig.speed ?? 'default'})`);
  console.log(`  Tone      : "${audioConfig.tone ?? 'neutral'}"  → pitch=${pitch} semitones`);
  console.log(`  Scenes    : ${scenes.length}`);

  await fs.ensureDir(VOICES_DIR);

  const sceneFilePaths = [];   // absolute paths, in scene order
  let totalChars       = 0;
  let skippedScenes    = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene      = scenes[i];
    const sceneIndex = i + 1;
    const voiceLine  = (scene.voice_line ?? scene.text ?? '').trim();

    if (!voiceLine) {
      console.log(`    [scene ${sceneIndex}/${scenes.length}] ⚠  No voice_line — skipping.`);
      skippedScenes.push(sceneIndex);
      continue;
    }

    // Filename: [video_id]_scene[N]_voice.mp3  (N is 1-padded to 2 digits)
    const paddedIndex = String(sceneIndex).padStart(2, '0');
    const fileName    = `${videoId}_scene${paddedIndex}_voice.mp3`;
    const filePath    = path.join(VOICES_DIR, fileName);

    console.log(
      `    [scene ${sceneIndex}/${scenes.length}] ` +
      `"${voiceLine.slice(0, 60)}${voiceLine.length > 60 ? '…' : ''}"`
    );

    // Skip if file already exists (allows re-runs to resume without re-billing)
    if (await fs.pathExists(filePath)) {
      console.log(`      ✓ Already exists — reusing: ${fileName}`);
    } else {
      const mp3Buffer = await synthesizeVoiceLine(voiceLine, speakingRate, pitch);
      await fs.writeFile(filePath, mp3Buffer);
      console.log(`      ✓ Saved: ${fileName}  (${mp3Buffer.length} bytes)`);
    }

    totalChars += voiceLine.length;
    sceneFilePaths.push(filePath);

    // Attach voice file path back onto the scene object
    scenes[i] = {
      ...scene,
      voice_file: path.relative(path.join(__dirname, '..'), filePath).replace(/\\/g, '/'),
    };
  }

  // ── Generate combined full track ─────────────────────────────────────────
  const fullTrackName = `${videoId}_voice_full.mp3`;
  const fullTrackPath = path.join(VOICES_DIR, fullTrackName);
  const relFullTrack  = path.relative(path.join(__dirname, '..'), fullTrackPath).replace(/\\/g, '/');

  if (sceneFilePaths.length === 0) {
    console.log(`    ⚠  No voice lines found — full track not generated.`);
  } else if (await fs.pathExists(fullTrackPath)) {
    console.log(`    ✓ Full track already exists — reusing: ${fullTrackName}`);
  } else {
    console.log(`    ↳ Stitching ${sceneFilePaths.length} files into full track...`);
    await concatenateAudioFiles(sceneFilePaths, fullTrackPath);
    console.log(`    ✓ Full track: ${fullTrackName}`);
  }

  // ── Update script JSON with audio paths ──────────────────────────────────
  const updatedScript = {
    ...scriptData,
    scenes,
    audio: {
      ...audioConfig,
      file_url:          relFullTrack,
      voice_agent_meta: {
        character:     CHARACTER_DISPLAY_NAME,
        speaking_rate: speakingRate,
        pitch_semitones: pitch,
        encoding:      AUDIO_ENCODING,
        sample_rate:   SAMPLE_RATE_HZ,
        generated_at:  new Date().toISOString(),
      },
    },
    // Update the top-level voice_file field used by VideoTemplate
    voice_file: relFullTrack,
  };

  await fs.writeJson(scriptPath, updatedScript, { spaces: 2 });
  console.log(`    ✓ Script JSON updated: ${path.basename(scriptPath)}`);

  const costEstimate = (totalChars / 1000) * COST_PER_1K_CHARS;

  return {
    videoId,
    scenesGenerated: sceneFilePaths.length,
    fullTrackPath,
    charCount:       totalChars,
    costEstimate,
    skippedScenes,
  };
}

// ─── Batch Runner ─────────────────────────────────────────────────────────────

/**
 * Process all approved script JSONs in scripts/approved/.
 * Skips batch_summary.json and any non-script files.
 *
 * @param {string[]} [filePaths]  Optional explicit list of absolute file paths.
 *                                If omitted, discovers all *.json in APPROVED_DIR.
 * @returns {Promise<object>}     Batch summary JSON
 */
async function runVoiceBatch(filePaths) {
  // Validate env early
  getEnvConfig();

  await fs.ensureDir(VOICES_DIR);
  await fs.ensureDir(APPROVED_DIR);

  // Discover approved scripts if no explicit paths given
  let targets = filePaths;
  if (!targets || targets.length === 0) {
    const allFiles = await fs.readdir(APPROVED_DIR).catch(() => []);
    targets = allFiles
      .filter(f => f.endsWith('.json') && f !== 'batch_summary.json')
      .map(f => path.join(APPROVED_DIR, f));
  }

  if (targets.length === 0) {
    console.log(
      'No approved scripts found in scripts/approved/.\n' +
      'Run `node pipeline/viral_prediction_agent.js` first.'
    );
    return { total: 0, processed: [], failed: [], total_cost_estimate: 0 };
  }

  const divider = '═'.repeat(62);
  console.log(`\n${divider}`);
  console.log(`  english-made-fun / voice_agent.js`);
  console.log(`  Character : ${CHARACTER_DISPLAY_NAME}`);
  console.log(`  Batch     : ${targets.length} script${targets.length !== 1 ? 's' : ''}`);
  console.log(`  Output    : ${VOICES_DIR}`);
  console.log(`${divider}\n`);

  const summary = {
    run_at:             new Date().toISOString(),
    total:              targets.length,
    processed:          [],
    failed:             [],
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

    try {
      const result = await processScript(scriptData, scriptPath);

      const costStr = `$${result.costEstimate.toFixed(4)}`;
      console.log(
        `  ✓ Done  scenes=${result.scenesGenerated}` +
        (result.skippedScenes.length > 0
          ? `  skipped=[${result.skippedScenes.join(',')}]`
          : '') +
        `  chars=${result.charCount}  est.cost=${costStr}\n`
      );

      summary.processed.push({
        fileName,
        video_id:        result.videoId,
        scenes_generated: result.scenesGenerated,
        full_track:      path.relative(path.join(__dirname, '..'), result.fullTrackPath).replace(/\\/g, '/'),
        char_count:      result.charCount,
        cost_estimate:   result.costEstimate,
        skipped_scenes:  result.skippedScenes,
      });

      summary.total_char_count    += result.charCount;
      summary.total_cost_estimate += result.costEstimate;

    } catch (err) {
      console.error(`  ✗ FAILED: ${err.message}\n`);
      summary.failed.push({ fileName, error: err.message });
    }
  }

  // ── Final summary ──────────────────────────────────────────────────────────
  const sep = '─'.repeat(62);
  console.log(sep);
  console.log(`  Voice batch complete:`);
  console.log(`    ✓ Processed : ${summary.processed.length}`);
  console.log(`    ✗ Failed    : ${summary.failed.length}`);
  console.log(`    Characters  : ${summary.total_char_count.toLocaleString()}`);
  console.log(`    Est. cost   : $${summary.total_cost_estimate.toFixed(4)} USD`);
  console.log(`      (at $${COST_PER_1K_CHARS}/1K chars — check your Inworld plan)`);

  if (summary.processed.length > 0) {
    console.log('\n  Generated full tracks:');
    summary.processed.forEach(({ fileName: fn, full_track, scenes_generated }) => {
      console.log(`    ✓ ${fn}  (${scenes_generated} scenes)  → ${full_track}`);
    });
  }

  if (summary.failed.length > 0) {
    console.log('\n  Failed:');
    summary.failed.forEach(({ fileName: fn, error }) => {
      console.log(`    ✗ ${fn}  — ${error}`);
    });
  }

  console.log('');

  // Persist summary alongside approved scripts
  const summaryPath = path.join(APPROVED_DIR, 'voice_summary.json');
  await fs.writeJson(summaryPath, summary, { spaces: 2 });
  console.log(`  Summary saved → ${summaryPath}\n`);

  return summary;
}

// ─── CLI Entry Point ──────────────────────────────────────────────────────────

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2).filter(s => s.trim().length > 0);

    // --list-voices flag
    if (args.includes('--list-voices')) {
      try {
        await listVoices();
        process.exit(0);
      } catch (err) {
        console.error(`\nFatal: ${err.message}`);
        process.exit(1);
      }
    }

    // Explicit file paths
    const explicitPaths = args.filter(a => !a.startsWith('--'));
    const targets = explicitPaths.length > 0
      ? explicitPaths.map(p => path.isAbsolute(p) ? p : path.join(__dirname, '..', p))
      : undefined;

    if (targets) {
      console.log(`Running with ${targets.length} explicit file path(s).`);
    } else {
      console.log(`No paths provided — processing all scripts/approved/*.json`);
    }

    try {
      const summary = await runVoiceBatch(targets);
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
  runVoiceBatch,
  processScript,
  synthesizeVoiceLine,
  listVoices,
  concatenateAudioFiles,
  normaliseSpeakingRate,
  toneToSemitones,
  INWORLD_BASE_URL,
  VOICES_DIR,
  APPROVED_DIR,
};
