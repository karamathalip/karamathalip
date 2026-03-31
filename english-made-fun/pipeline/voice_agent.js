/**
 * pipeline/voice_agent.js
 *
 * Generates WAV voice files for each approved script using the Inworld
 * TTS API (api.inworld.ai/tts/v1/voice), then stitches all scene lines
 * into one combined voice track per video.
 *
 * ── Prerequisites ─────────────────────────────────────────────────────────────
 *   .env must contain:
 *     INWORLD_API_KEY=<your-inworld-api-key>
 *
 * ── Inworld TTS API ───────────────────────────────────────────────────────────
 *   Endpoint : POST https://api.inworld.ai/tts/v1/voice
 *   Auth     : Authorization: Basic <api-key>  (key is already base64)
 *   Body     : { text, voiceId, modelId, timestampType, speakingRate, temperature, audioConfig }
 *   Response : { audioContent: "<base64 WAV>", timepoints: [...] }
 *
 * ── CLI usage ─────────────────────────────────────────────────────────────────
 *   node pipeline/voice_agent.js                  # processes all approved scripts
 *   node pipeline/voice_agent.js scripts/approved/my_script.json   # single file
 *
 * ── Output ────────────────────────────────────────────────────────────────────
 *   audio/voices/[video_id]_scene[N]_voice.wav    — per-scene audio
 *   audio/voices/[video_id]_voice_full.mp3        — stitched full track (MP3)
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
 * Inworld TTS v1 API endpoint.
 * Docs: https://docs.inworld.ai/docs/tutorial-integrations/tts-api/
 */
const INWORLD_TTS_URL = 'https://api.inworld.ai/tts/v1/voice';

/** Default voice and model used for synthesis. */
const DEFAULT_VOICE_ID = 'Trevor';
const DEFAULT_MODEL_ID = 'inworld-tts-1.5-max';

/**
 * Character display name used in prompts and logs.
 */
const CHARACTER_DISPLAY_NAME = 'Energetic English Coach';

const MAX_RETRIES    = 3;
const RETRY_BASE_MS  = 1500;   // exponential backoff: 1.5s → 3s → 6s
const MAX_CONCURRENT = 2;      // rate-limit guard; keep low

const APPROVED_DIR  = path.join(__dirname, '../scripts/approved');
const VOICES_DIR    = path.join(__dirname, '../audio/voices');

// WAV at 48 kHz — matches YouTube's native sample rate, avoids MP3 padding drift.
const AUDIO_ENCODING  = 'WAV';
const SAMPLE_RATE_HZ  = 48000;

// Cost estimate (Inworld as of 2025): ~$0.006 per 1K characters synthesised.
// Adjust if your plan differs.
const COST_PER_1K_CHARS = 0.006;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Build the Authorization header for Inworld TTS v1 API.
 *
 * The Inworld API key is already a base64-encoded string.
 * Pass it directly as: Authorization: Basic <api-key>
 *
 * @param {string} apiKey
 * @returns {string}
 */
function buildAuthHeader(apiKey) {
  return `Basic ${apiKey}`;
}

/**
 * Validate required environment variables and return the API key.
 * Only INWORLD_API_KEY is needed for the TTS v1 endpoint.
 *
 * @returns {{ apiKey: string }}
 */
function getEnvConfig() {
  const apiKey = process.env.INWORLD_API_KEY;

  if (!apiKey) {
    throw new Error(
      'Missing required environment variable: INWORLD_API_KEY\n' +
      'Add it to english-made-fun/.env:\n' +
      '  INWORLD_API_KEY=<your-inworld-api-key>'
    );
  }

  return { apiKey };
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

// ─── Inworld API: List Voices (stub) ──────────────────────────────────────────

/**
 * Stub — the TTS v1 API uses voiceId directly; no listing endpoint needed.
 * Kept for CLI --list-voices backward compat.
 */
async function listVoices() {
  console.log(`\n  Using TTS v1 API — voiceId is specified directly (default: "${DEFAULT_VOICE_ID}").\n`);
  console.log('  No list endpoint available for the v1 API.');
  console.log('  See https://docs.inworld.ai/docs/tutorial-integrations/tts-api/ for voice options.\n');
  return [];
}

// ─── Inworld API: Synthesize One Voice Line ───────────────────────────────────

/**
 * Call the Inworld TTS v1 endpoint for a single text string.
 * Returns an object with the raw WAV buffer and word-level timestamps.
 *
 * Endpoint: POST https://api.inworld.ai/tts/v1/voice
 * Request body (JSON):
 * {
 *   "text": "...",
 *   "voiceId": "Hades",
 *   "modelId": "inworld-tts-1.5-max",
 *   "timestampType": "WORD",
 *   "speakingRate": 1.0,
 *   "audioConfig": {
 *     "audioEncoding": "WAV",
 *     "sampleRateHertz": 48000
 *   }
 * }
 *
 * Response body (JSON):
 * {
 *   "audioContent": "<base64-encoded-wav>",
 *   "wordTimestamps": [ { "word": "...", "startTime": "0.1s", "endTime": "0.3s" }, ... ]
 * }
 *
 * @param {string}  text          - The voice line to synthesise
 * @param {number}  speakingRate  - 0.25–4.0 (1.0 = normal)
 * @param {number}  pitch         - semitones (used for logging only — v1 API doesn't support pitch)
 * @param {number}  attempt       - Internal retry counter
 * @returns {Promise<{ audio: Buffer, wordTimestamps: Array }>}
 */
async function synthesizeVoiceLine(text, speakingRate, pitch, attempt = 0) {
  const { apiKey } = getEnvConfig();

  const requestBody = {
    text,
    voiceId:       DEFAULT_VOICE_ID,
    modelId:       DEFAULT_MODEL_ID,
    timestampType: 'WORD',
    speakingRate,
    audioConfig: {
      audioEncoding:   AUDIO_ENCODING,
      sampleRateHertz: SAMPLE_RATE_HZ,
    },
  };

  try {
    const response = await axios.post(INWORLD_TTS_URL, requestBody, {
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

    const audioBuffer = Buffer.from(audioContent, 'base64');

    // Validate RIFF/WAV header — first 4 bytes should be "RIFF"
    if (audioBuffer.length >= 4 && audioBuffer.toString('ascii', 0, 4) !== 'RIFF') {
      console.warn('      ⚠  Audio does not have a RIFF header — may not be valid WAV');
    }

    const wordTimestamps = response.data?.wordTimestamps ?? response.data?.timepoints ?? [];

    return { audio: audioBuffer, wordTimestamps };

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

// ─── Audio: Concatenate WAV/MP3 Files ────────────────────────────────────────

/**
 * Default silence gap (in seconds) inserted between scene voice lines.
 * Creates natural breathing room between scenes. Controlled per-scene
 * via scene.silence_after (seconds) in the script JSON; this is the fallback.
 */
const DEFAULT_SCENE_GAP_SECONDS = 0.25;

/**
 * Concatenate multiple audio files into one output file using FFmpeg's
 * concat demuxer. Inserts configurable silence gaps between clips for
 * natural breathing room. Input files can be WAV or MP3; output is always MP3
 * for the stitched full-track (downstream render_agent expects MP3).
 *
 * @param {string[]} inputPaths      - Absolute paths to input audio files (in order)
 * @param {string}   outputPath      - Absolute path for the combined output MP3
 * @param {number[]} [gapSeconds]    - Silence duration after each clip (length = inputPaths.length).
 *                                     Last element is ignored (no gap after final clip).
 *                                     If omitted, uses DEFAULT_SCENE_GAP_SECONDS for all gaps.
 * @returns {Promise<void>}
 */
function concatenateAudioFiles(inputPaths, outputPath, gapSeconds) {
  return new Promise((resolve, reject) => {
    if (inputPaths.length === 0) {
      return reject(new Error('concatenateAudioFiles: no input files provided'));
    }

    if (inputPaths.length === 1) {
      // Single file — just copy it
      return fs.copy(inputPaths[0], outputPath).then(resolve).catch(reject);
    }

    // Build a concat list with silence gaps between clips.
    // FFmpeg concat demuxer doesn't natively support gaps, so we generate
    // short silence WAV files and interleave them.
    const tmpDir  = path.join(os.tmpdir(), `inworld_concat_${Date.now()}`);
    const tmpList = path.join(tmpDir, 'list.txt');

    const gaps = gapSeconds ?? inputPaths.map(() => DEFAULT_SCENE_GAP_SECONDS);

    fs.ensureDir(tmpDir)
      .then(async () => {
        const listLines = [];

        for (let i = 0; i < inputPaths.length; i++) {
          // Add the audio clip
          listLines.push(`file '${inputPaths[i].replace(/'/g, "'\\''")}'`);

          // Insert silence gap after each clip except the last
          if (i < inputPaths.length - 1) {
            const gap = typeof gaps[i] === 'number' ? Math.max(0, gaps[i]) : DEFAULT_SCENE_GAP_SECONDS;
            if (gap > 0) {
              const silencePath = path.join(tmpDir, `silence_${i}.wav`);
              await generateSilence(silencePath, gap);
              listLines.push(`file '${silencePath.replace(/'/g, "'\\''")}'`);
            }
          }
        }

        await fs.writeFile(tmpList, listLines.join('\n'), 'utf8');

        ffmpeg()
          .input(tmpList)
          .inputOptions(['-f', 'concat', '-safe', '0'])
          .audioCodec('libmp3lame')
          .audioBitrate('128k')
          .output(outputPath)
          .on('end', () => {
            fs.remove(tmpDir).catch(() => {});
            resolve();
          })
          .on('error', (err) => {
            fs.remove(tmpDir).catch(() => {});
            reject(new Error(`FFmpeg concat error: ${err.message}`));
          })
          .run();
      })
      .catch(reject);
  });
}

/**
 * Generate a silent WAV file of the specified duration using a raw PCM buffer.
 * Avoids FFmpeg's lavfi filter (not available in all builds).
 *
 * @param {string} outputPath      - Absolute path for the silence file
 * @param {number} durationSeconds - Duration in seconds
 * @returns {Promise<void>}
 */
async function generateSilence(outputPath, durationSeconds) {
  const numChannels  = 1;
  const bitsPerSample = 16;
  const byteRate     = SAMPLE_RATE_HZ * numChannels * (bitsPerSample / 8);
  const numSamples   = Math.round(SAMPLE_RATE_HZ * durationSeconds);
  const dataSize     = numSamples * numChannels * (bitsPerSample / 8);

  // 44-byte WAV header + silent PCM data (all zeros = silence)
  const buffer = Buffer.alloc(44 + dataSize, 0);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt sub-chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);                               // sub-chunk size
  buffer.writeUInt16LE(1, 20);                                // PCM format
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(SAMPLE_RATE_HZ, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), 32); // block align
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data sub-chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  // PCM data is already all zeros (silence)

  await fs.writeFile(outputPath, buffer);
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

  // Global defaults — used as fallback when a scene has no per-scene tone/speed
  const globalSpeakingRate = normaliseSpeakingRate(audioConfig.speed);
  const globalPitch        = toneToSemitones(audioConfig.tone);

  console.log(`\n  Character : ${CHARACTER_DISPLAY_NAME}`);
  console.log(`  Speed     : ${globalSpeakingRate.toFixed(2)}  (global default from audio.speed=${audioConfig.speed ?? 'default'})`);
  console.log(`  Tone      : "${audioConfig.tone ?? 'neutral'}"  → global pitch=${globalPitch} semitones`);
  console.log(`  Scenes    : ${scenes.length}`);
  console.log(`  Per-scene : tone/speed overrides enabled`);

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

    // ── Per-scene voice parameters ──────────────────────────────────────────
    // Use scene-level tone/speed if provided; fall back to global audio config.
    const sceneSpeakingRate = scene.speed != null
      ? normaliseSpeakingRate(scene.speed)
      : globalSpeakingRate;
    const scenePitch = scene.tone
      ? toneToSemitones(scene.tone)
      : globalPitch;

    // Filename: [video_id]_scene[N]_voice.wav  (N is 1-padded to 2 digits)
    const paddedIndex = String(sceneIndex).padStart(2, '0');
    const fileName    = `${videoId}_scene${paddedIndex}_voice.wav`;
    const filePath    = path.join(VOICES_DIR, fileName);

    console.log(
      `    [scene ${sceneIndex}/${scenes.length}] ` +
      `"${voiceLine.slice(0, 60)}${voiceLine.length > 60 ? '…' : ''}"` +
      (scene.tone ? `  tone="${scene.tone}" pitch=${scenePitch}` : '')
    );

    // Skip if file already exists (allows re-runs to resume without re-billing)
    if (await fs.pathExists(filePath)) {
      console.log(`      ✓ Already exists — reusing: ${fileName}`);
    } else {
      const result = await synthesizeVoiceLine(voiceLine, sceneSpeakingRate, scenePitch);
      await fs.writeFile(filePath, result.audio);
      console.log(`      ✓ Saved: ${fileName}  (${result.audio.length} bytes)`);

      // Save word timestamps alongside the WAV for future caption/kinetic text use
      if (result.wordTimestamps && result.wordTimestamps.length > 0) {
        const tsPath = path.join(VOICES_DIR, `${videoId}_scene${paddedIndex}_timestamps.json`);
        await fs.writeJson(tsPath, result.wordTimestamps, { spaces: 2 });
      }
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
    // Collect per-scene silence gaps from scene.silence_after (seconds),
    // falling back to DEFAULT_SCENE_GAP_SECONDS if not specified.
    const gapSeconds = scenes
      .filter(s => (s.voice_line ?? s.text ?? '').trim())
      .map(s => typeof s.silence_after === 'number' ? s.silence_after : DEFAULT_SCENE_GAP_SECONDS);
    await concatenateAudioFiles(sceneFilePaths, fullTrackPath, gapSeconds);
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
        character:       CHARACTER_DISPLAY_NAME,
        speaking_rate:   globalSpeakingRate,
        pitch_semitones: globalPitch,
        per_scene_tone:  true,
        scene_gap_seconds: DEFAULT_SCENE_GAP_SECONDS,
        encoding:        AUDIO_ENCODING,
        sample_rate:     SAMPLE_RATE_HZ,
        generated_at:    new Date().toISOString(),
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
  INWORLD_TTS_URL,
  DEFAULT_VOICE_ID,
  DEFAULT_MODEL_ID,
  VOICES_DIR,
  APPROVED_DIR,
};
