/**
 * generate_audio_vid_001.js
 *
 * Generates real voice + SFX audio for vid_001 using ElevenLabs APIs:
 *   - Voice: ElevenLabs TTS  (/v1/text-to-speech/{voice_id})
 *   - SFX:   ElevenLabs Sound Generation (/v1/sound-generation)
 *
 * SFX keys in sfx_prompts (e.g. "trip_whoosh") are resolved through
 * config/sfx_library.json to get the actual ElevenLabs prompts.
 *
 * Voice timing: each scene's voice_line is synthesised separately, then
 * FFmpeg delays each track to scene.start seconds and mixes them into one
 * continuous voice file (vid_001_voice_full.mp3).
 *
 * Usage:
 *   node generate_audio_vid_001.js
 *   node generate_audio_vid_001.js --voice-only
 *   node generate_audio_vid_001.js --sfx-only
 */

'use strict';

const path       = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const axios      = require('axios');
const fs         = require('fs-extra');
const { execSync } = require('child_process');

// ─── Config ───────────────────────────────────────────────────────────────────

const PROJECT_ROOT = __dirname;
const VOICES_DIR   = path.join(PROJECT_ROOT, 'audio', 'voices');
const SFX_DIR      = path.join(PROJECT_ROOT, 'audio', 'sfx');

const SCRIPT_PATH      = path.join(PROJECT_ROOT, 'scripts', 'approved', 'vid_001.json');
const SFX_LIBRARY_PATH = path.join(PROJECT_ROOT, 'config', 'sfx_library.json');

// ElevenLabs credentials — supports both key names in .env
const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_API_KEY;

// ElevenLabs voice to use for the narrator.
// "Rachel" (21m00Tcm4TlvDq8ikWAM) = calm, clear female — great for English lessons.
// "Adam"   (pNInz6obpgDQGcFmaJgB) = warm male narrator.
// Override with env var ELEVENLABS_VOICE_ID if you prefer a different voice.
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

const TTS_MODEL     = 'eleven_monolingual_v1';
const RETRY_MAX     = 3;
const RETRY_BASE_MS = 1500;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function log(msg)  { console.log(msg); }
function warn(msg) { console.warn(`  ⚠  ${msg}`); }
function ok(msg)   { console.log(`  ✓ ${msg}`); }

/**
 * Make an axios request with exponential backoff on 429 / 5xx.
 */
async function axiosWithRetry(config, attempt = 0) {
  try {
    return await axios(config);
  } catch (err) {
    const status    = err.response?.status;
    const retryable = !err.response || status === 429 || status >= 500;

    if (retryable && attempt < RETRY_MAX) {
      const delayMs = Math.pow(2, attempt) * RETRY_BASE_MS;
      warn(`HTTP ${status ?? 'network error'} — retrying in ${delayMs / 1000}s...`);
      await sleep(delayMs);
      return axiosWithRetry(config, attempt + 1);
    }

    // Decode arraybuffer error body for a useful message
    let errMsg = err.message;
    if (err.response?.data) {
      try {
        const decoded = Buffer.from(err.response.data).toString('utf8');
        const parsed  = JSON.parse(decoded);
        errMsg = parsed?.detail?.message ?? parsed?.message ?? decoded;
      } catch { /* keep original message */ }
    }
    throw new Error(`ElevenLabs [HTTP ${status ?? 'ERR'}]: ${errMsg}`);
  }
}

// ─── Voice Generation ─────────────────────────────────────────────────────────

/**
 * Call ElevenLabs TTS for one text string. Returns raw MP3 buffer.
 */
async function callTTS(text) {
  const res = await axiosWithRetry({
    method:       'post',
    url:          `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    headers: {
      'xi-api-key':   ELEVENLABS_KEY,
      'Content-Type': 'application/json',
      'Accept':       'audio/mpeg',
    },
    data: {
      text,
      model_id:       TTS_MODEL,
      voice_settings: {
        stability:        0.55,
        similarity_boost: 0.75,
        style:            0.40,
        use_speaker_boost: true,
      },
    },
    responseType: 'arraybuffer',
    timeout:      60000,
  });
  return Buffer.from(res.data);
}

/**
 * Generate per-scene voice MP3s, then use FFmpeg to mix them at the right
 * start times into one continuous voice track.
 *
 * Each scene audio is delayed to scene.start seconds so the narration is
 * synchronised with the visual timeline.
 */
async function generateVoice(scenes) {
  log('\n── Voice Generation ─────────────────────────────────────────────');
  await fs.ensureDir(VOICES_DIR);

  const perSceneFiles = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene      = scenes[i];
    const voiceLine  = scene.voice_line ?? scene.text ?? '';
    const startSec   = scene.start ?? 0;
    const outFile    = path.join(VOICES_DIR, `vid_001_scene${String(i + 1).padStart(2, '0')}_voice.mp3`);

    if (!voiceLine.trim()) {
      warn(`Scene ${i + 1} has no voice_line — skipping.`);
      continue;
    }

    log(`  [${i + 1}/${scenes.length}] scene "${scene.scene_id ?? scene.id}" (starts at ${startSec}s)`);
    log(`         "${voiceLine.slice(0, 72)}${voiceLine.length > 72 ? '…' : ''}"`);

    // Skip if already generated
    if (await fs.pathExists(outFile)) {
      ok(`Already exists: ${path.basename(outFile)}`);
    } else {
      const buffer = await callTTS(voiceLine);
      await fs.writeFile(outFile, buffer);
      ok(`Generated: ${path.basename(outFile)}  (${buffer.length} bytes)`);
      await sleep(600);   // small pause between requests
    }

    perSceneFiles.push({ file: outFile, startSec, duration: scene.duration ?? 5 });
  }

  if (perSceneFiles.length === 0) {
    warn('No voice lines generated.');
    return;
  }

  // ── Pad each scene audio to EXACTLY its scene duration, then concatenate ─
  // This guarantees zero overlap: each voice segment ends exactly when the
  // next scene begins.
  //   atrim=end=N  → truncate if TTS is longer than scene (prevents bleed)
  //   apad=whole_dur=N → pad with silence if TTS is shorter than scene
  // Result: each padded file is exactly scene.duration seconds.

  log('\n  Padding each scene voice to exact scene duration...');

  const paddedFiles = [];
  for (let i = 0; i < perSceneFiles.length; i++) {
    const { file, startSec, duration } = perSceneFiles[i];
    const paddedPath = path.join(VOICES_DIR, `vid_001_scene${String(i + 1).padStart(2, '0')}_padded.mp3`);

    const trimAndPadCmd = [
      'ffmpeg',
      `-i "${file}"`,
      `-af "atrim=end=${duration},apad=whole_dur=${duration}"`,
      '-c:a libmp3lame',
      '-q:a 4',
      `"${paddedPath}"`,
      '-y',
    ].join(' ');

    execSync(trimAndPadCmd, { stdio: ['ignore', 'pipe', 'pipe'] });
    ok(`Scene ${i + 1}: padded to ${duration}s → ${path.basename(paddedPath)}`);
    paddedFiles.push(paddedPath);
  }

  // ── Concatenate all padded files in order ────────────────────────────────
  log('\n  Concatenating padded scenes into one voice track...');

  const finalVoicePath  = path.join(VOICES_DIR, 'vid_001_voice_full.mp3');
  const concatListPath  = path.join(VOICES_DIR, 'vid_001_concat_list.txt');

  const listContent = paddedFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n');
  fs.writeFileSync(concatListPath, listContent);

  const concatCmd = [
    'ffmpeg',
    '-f concat',
    '-safe 0',
    `-i "${concatListPath}"`,
    '-c:a libmp3lame',
    '-q:a 4',
    `"${finalVoicePath}"`,
    '-y',
  ].join(' ');

  execSync(concatCmd, { stdio: ['ignore', 'pipe', 'pipe'] });
  ok(`Voice track ready: audio/voices/vid_001_voice_full.mp3`);
}

// ─── SFX Generation ───────────────────────────────────────────────────────────

/**
 * Call ElevenLabs Sound Generation API. Returns raw MP3 buffer.
 */
async function callSoundGeneration(prompt, durationSeconds) {
  const res = await axiosWithRetry({
    method:       'post',
    url:          'https://api.elevenlabs.io/v1/sound-generation',
    headers: {
      'xi-api-key':   ELEVENLABS_KEY,
      'Content-Type': 'application/json',
      'Accept':       'audio/mpeg',
    },
    data: {
      text:             prompt,
      duration_seconds: Math.min(22, Math.max(0.5, durationSeconds)),
      prompt_influence: 0.3,
    },
    responseType: 'arraybuffer',
    timeout:      60000,
  });
  return Buffer.from(res.data);
}

/**
 * Generate SFX files for all unique sfx_prompt keys found across scenes.
 * Keys are resolved via sfx_library.json → actual ElevenLabs prompt text.
 * Output files: audio/sfx/{key}.mp3  (matching vid_001.json sfx[].file paths)
 */
async function generateSFX(scenes, sfxLibrary) {
  log('\n── SFX Generation ───────────────────────────────────────────────');
  await fs.ensureDir(SFX_DIR);

  // Collect unique sfx keys across all scenes
  const uniqueKeys = new Set();
  for (const scene of scenes) {
    if (Array.isArray(scene.sfx_prompts)) {
      for (const key of scene.sfx_prompts) {
        if (key) uniqueKeys.add(key);
      }
    }
  }

  if (uniqueKeys.size === 0) {
    warn('No sfx_prompts keys found in script.');
    return;
  }

  log(`  Found ${uniqueKeys.size} unique SFX keys to generate.`);

  const cues = sfxLibrary.cues ?? {};
  let generated = 0;
  let skipped   = 0;

  for (const key of uniqueKeys) {
    const cue = cues[key];
    if (!cue) {
      warn(`Key "${key}" not found in sfx_library.json — skipping.`);
      skipped++;
      continue;
    }

    const outFile = path.join(SFX_DIR, `${key}.mp3`);

    if (await fs.pathExists(outFile)) {
      ok(`Already exists: ${key}.mp3`);
      skipped++;
      continue;
    }

    log(`  [${key}]`);
    log(`    prompt   : "${cue.prompt.slice(0, 70)}${cue.prompt.length > 70 ? '…' : ''}"`);
    log(`    duration : ${cue.duration_seconds}s`);

    const buffer = await callSoundGeneration(cue.prompt, cue.duration_seconds);
    await fs.writeFile(outFile, buffer);
    ok(`Generated: ${key}.mp3  (${buffer.length} bytes)`);
    generated++;
    await sleep(700);   // pace requests
  }

  log(`\n  SFX done — generated: ${generated}, skipped/cached: ${skipped}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  const args      = process.argv.slice(2);
  const voiceOnly = args.includes('--voice-only');
  const sfxOnly   = args.includes('--sfx-only');

  // Guard: API key must be present
  if (!ELEVENLABS_KEY) {
    console.error(
      '\nERROR: ELEVENLABS_API_KEY (or ELEVEN_API_KEY) is not set in .env\n'
    );
    process.exit(1);
  }

  log('╔════════════════════════════════════════════════════════════╗');
  log('║  ElevenLabs Audio Generation — vid_001                    ║');
  log('╚════════════════════════════════════════════════════════════╝');
  log(`  Voice ID : ${VOICE_ID}`);
  log(`  TTS model: ${TTS_MODEL}`);
  log('');

  // Load script and SFX library
  const script     = await fs.readJson(SCRIPT_PATH);
  const sfxLibrary = await fs.readJson(SFX_LIBRARY_PATH);
  const scenes     = script.scenes ?? [];

  log(`  Script   : ${script.video_id} — ${script.video_title}`);
  log(`  Scenes   : ${scenes.length}`);

  if (!sfxOnly)  await generateVoice(scenes);
  if (!voiceOnly) await generateSFX(scenes, sfxLibrary);

  log('\n╔════════════════════════════════════════════════════════════╗');
  log('║  Audio generation complete.                                ║');
  log('║  Next: npm run render:vid_001                              ║');
  log('╚════════════════════════════════════════════════════════════╝\n');
})().catch(err => {
  console.error('\nFatal:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
