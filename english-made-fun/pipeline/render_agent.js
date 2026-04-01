/**
 * pipeline/render_agent.js
 *
 * Renders approved scripts to MP4 using Remotion's programmatic API,
 * then merges the Remotion video with voice + SFX audio tracks using FFmpeg.
 *
 * ── Pipeline per video ────────────────────────────────────────────────────────
 *   1. Build inputProps  — map approved script JSON → VideoTemplate schema
 *   2. Bundle            — webpack-bundle the Remotion entry point (cached once)
 *   3. selectComposition — resolve "VideoTemplate" composition + dynamic duration
 *   4. renderMedia()     — render silent MP4 to videos/[video_id].mp4
 *   5. mergeAudio()      — FFmpeg amix voice + SFX into output/final/[video_id]_final.mp4
 *   6. render_log.json   — upsert log entry: video_id, render_time, file_size, status
 *
 * ── Output ────────────────────────────────────────────────────────────────────
 *   videos/[video_id].mp4                   — Remotion render (silent, lossless)
 *   output/final/[video_id]_final.mp4       — final video with all audio merged
 *   output/final/render_log.json            — render history
 *
 * ── CLI usage ─────────────────────────────────────────────────────────────────
 *   node pipeline/render_agent.js                        # all approved scripts
 *   node pipeline/render_agent.js scripts/approved/x.json [...]
 *   node pipeline/render_agent.js --force scripts/approved/x.json
 *   node pipeline/render_agent.js --show-log             # print render log
 *
 * ── Config variables (top of file) ────────────────────────────────────────────
 *   RENDER_CONCURRENCY     browser tabs used in parallel (default 3)
 *   RENDER_TIMEOUT_MS      per-frame timeout in ms (default 120 000)
 *   FORCE_RERENDER         if true, re-renders even when output already exists
 */

'use strict';

// ─── Environment ──────────────────────────────────────────────────────────────
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// ─── Imports ──────────────────────────────────────────────────────────────────
const { bundle }              = require('@remotion/bundler');
const { renderMedia, selectComposition } = require('@remotion/renderer');
const ffmpeg                  = require('fluent-ffmpeg');
const fs                      = require('fs-extra');
const os                      = require('os');

// ─── Config (adjust to your machine) ──────────────────────────────────────────

const RENDER_CONCURRENCY  = 3;        // browser tabs for parallel frame rendering
const RENDER_TIMEOUT_MS   = 120_000;  // per-frame timeout (ms); increase for slow machines
const FORCE_RERENDER      = process.argv.includes('--force') || process.env.FORCE_RERENDER === '1';

// ─── Paths ────────────────────────────────────────────────────────────────────

const PROJECT_ROOT  = path.join(__dirname, '..');
const ENTRY_POINT   = path.join(PROJECT_ROOT, 'src', 'index.tsx');
const APPROVED_DIR  = path.join(PROJECT_ROOT, 'scripts', 'approved');
const VIDEOS_DIR    = path.join(PROJECT_ROOT, 'videos');
const FINAL_DIR     = path.join(PROJECT_ROOT, 'output', 'final');
const VOICES_DIR    = path.join(PROJECT_ROOT, 'audio', 'voices');
const RENDER_LOG    = path.join(FINAL_DIR, 'render_log.json');
const RENDER_SOURCE_FILES = [
  ENTRY_POINT,
  path.join(PROJECT_ROOT, 'src', 'Root.tsx'),
  path.join(PROJECT_ROOT, 'components', 'VideoTemplate.tsx'),
  path.join(PROJECT_ROOT, 'components', 'Scene.tsx'),
  path.join(PROJECT_ROOT, 'components', 'Stickman.tsx'),
  path.join(PROJECT_ROOT, 'components', 'StickmanScene.tsx'),
  path.join(PROJECT_ROOT, 'components', 'DialogueScene.tsx'),
  path.join(PROJECT_ROOT, 'components', 'TextBurstScene.tsx'),
  path.join(PROJECT_ROOT, 'components', 'WordExplosionScene.tsx'),
  path.join(PROJECT_ROOT, 'components', 'SuperpowerScene.tsx'),
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Absolute path → project-root-relative, forward slashes. */
function toRelative(absPath) {
  return path.relative(PROJECT_ROOT, absPath).replace(/\\/g, '/');
}

function stageStaticImage(candidatePath, videoId) {
  if (!candidatePath) return null;
  if (/^(https?:|data:|file:)/i.test(candidatePath)) return candidatePath;

  const absoluteSource = path.isAbsolute(candidatePath)
    ? candidatePath
    : path.join(PROJECT_ROOT, candidatePath);

  if (!fs.existsSync(absoluteSource)) {
    return candidatePath;
  }

  const ext = path.extname(absoluteSource).toLowerCase();
  const mimeType = ext === '.jpg' || ext === '.jpeg'
    ? 'image/jpeg'
    : ext === '.webp'
      ? 'image/webp'
      : 'image/png';
  const fileBuffer = fs.readFileSync(absoluteSource);
  return `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
}

function primeStaticImages(scriptData) {
  const videoId = scriptData.video_id ?? 'unknown';
  for (const scene of scriptData.scenes ?? []) {
    stageStaticImage(scene?.image_file, videoId);
    stageStaticImage(scene?.visual?.bg_image, videoId);
  }
}

/** Stat a file for size in MB; returns null if file doesn't exist. */
async function fileSizeMB(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return (stat.size / 1024 / 1024).toFixed(2);
  } catch {
    return null;
  }
}

async function fileMtimeMs(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.mtimeMs;
  } catch {
    return 0;
  }
}

async function outputIsCurrent(outputPath, inputPaths) {
  if (!(await fs.pathExists(outputPath))) return false;

  const outputMtimeMs = await fileMtimeMs(outputPath);
  for (const inputPath of inputPaths) {
    if (!inputPath) continue;
    if ((await fileMtimeMs(inputPath)) > outputMtimeMs) {
      return false;
    }
  }

  return true;
}

// ─── Render Log ───────────────────────────────────────────────────────────────

async function loadRenderLog() {
  try { return await fs.readJson(RENDER_LOG); } catch { return []; }
}

async function upsertRenderLog(entry) {
  const log = await loadRenderLog();
  const idx = log.findIndex(e => e.video_id === entry.video_id);
  if (idx >= 0) { log[idx] = { ...log[idx], ...entry }; }
  else          { log.push(entry); }
  await fs.writeJson(RENDER_LOG, log, { spaces: 2 });
}

async function showLog() {
  const log = await loadRenderLog();
  if (log.length === 0) { console.log('\nRender log is empty.\n'); return; }

  const sep = '─'.repeat(70);
  console.log(`\n${sep}`);
  console.log(`  Render Log  |  ${log.length} entries`);
  console.log(sep);
  log
    .slice()
    .sort((a, b) => new Date(b.rendered_at) - new Date(a.rendered_at))
    .forEach(e => {
      const icon = e.status === 'success' ? '✓' : '✗';
      console.log(
        `\n  ${icon} ${e.video_id}\n` +
        `      status      : ${e.status}\n` +
        `      render_time : ${e.render_time_s}s\n` +
        `      file_size   : ${e.file_size_mb ?? '—'} MB\n` +
        `      output      : ${e.output_path ?? '—'}\n` +
        `      rendered_at : ${e.rendered_at}` +
        (e.error ? `\n      error       : ${e.error}` : '')
      );
    });
  console.log('');
}

// ─── inputProps Builder ───────────────────────────────────────────────────────

/**
 * Maps an approved script JSON to the exact VideoTemplate inputProps schema
 * defined in src/Root.tsx (VideoTemplateSchema).
 *
 * VideoTemplate expects:
 *   jsonData: {
 *     title:      string,
 *     voice_file: string,                   ← relative to public/ OR absolute
 *     scenes:     SceneData[],
 *     captions?:  { file?, style? }
 *   }
 *
 * SceneData:
 *   { id, duration, visual: SceneVisual, sfx?: SfxCue[] }
 *
 * SfxCue:  { file, startTime, volume }
 *
 * voice_file comes from:
 *   1. scriptData.voice_file  (set by voice_agent.js)
 *   2. scriptData.audio.file_url
 *   3. fallback: audio/voices/[video_id]_voice_full.mp3
 *
 * SFX file paths come from scene.sfx[] entries (set by sfx_agent.js).
 * Image paths come from scene.image_file (set by image_agent.js).
 *
 * @param {object} scriptData
 * @returns {object} inputProps matching VideoTemplateSchema
 */
function buildInputProps(scriptData) {
  const videoId = scriptData.video_id ?? 'unknown';

  // ── Voice file ──────────────────────────────────────────────────────────
  const voiceFile =
    scriptData.voice_file ??
    scriptData.audio?.file_url ??
    `audio/voices/${videoId}_voice_full.mp3`;

  // ── Caption style ───────────────────────────────────────────────────────
  const captionStyle = scriptData.captions?.style ?? {
    fontSize:        60,
    color:           '#ffffff',
    backgroundColor: 'rgba(8,10,24,0.82)',
    fontFamily:      '"Arial Black", "Trebuchet MS", "Segoe UI", "Segoe UI Emoji", sans-serif',
    position:        'bottom',
    fontWeight:      900,
  };

  const resolveExistingProjectFile = (candidatePath) => {
    if (!candidatePath) return null;

    const absolutePath = path.isAbsolute(candidatePath)
      ? candidatePath
      : path.join(PROJECT_ROOT, candidatePath);

    return fs.existsSync(absolutePath) ? candidatePath : null;
  };

  const resolvedCaptionFile =
    resolveExistingProjectFile(scriptData.captions_file) ??
    resolveExistingProjectFile(scriptData.captions?.file);

  const captions = {
    ...(resolvedCaptionFile ? { file: resolvedCaptionFile } : {}),
    style: captionStyle,
  };

  // ── Scenes ──────────────────────────────────────────────────────────────
  const rawScenes = scriptData.scenes ?? [];
  const scenes = rawScenes.map((rawScene, idx) => {
    const sceneId = rawScene.scene_id != null
      ? String(rawScene.scene_id)
      : rawScene.id ?? `scene_${idx + 1}`;

    // Duration: script_agent stores it as seconds (number).
    // Clamp to a minimum of 1 second to avoid zero-frame sequences.
    const duration = typeof rawScene.duration === 'number' && rawScene.duration > 0
      ? rawScene.duration
      : 3;

    // ── Visual ─────────────────────────────────────────────────────────────
    // script_agent embeds visual fields directly on the scene (flat) OR
    // nested under scene.visual — support both layouts.
    const rawVisual = rawScene.visual ?? {};

    // Determine template: check scene.visual.template, then top-level fields
    const template = normaliseTemplate(
      rawVisual.template ??
      rawScene.visual_template ??
      inferTemplate(rawScene)
    );

    const stagedImage = stageStaticImage(rawVisual.bg_image ?? rawScene.image_file, videoId);

    const visual = {
      template,

      // ── shared / stickman ───────────────────────────────────────────────
      text:             rawVisual.text             ?? rawScene.text,
      stickman_action:  rawVisual.stickman_action  ?? rawScene.stickman_action,
      stickman_emotion: rawVisual.stickman_emotion ?? rawScene.stickman_emotion,
      bg_color:         rawVisual.bg_color         ?? rawScene.bg_color,
      bg_image:         stagedImage,  // image_agent output staged into public/ for Remotion
      effect:           rawVisual.effect           ?? null,

      // ── text_burst ──────────────────────────────────────────────────────
      backgroundColor:  rawVisual.backgroundColor  ?? rawVisual.bg_color ?? rawScene.bg_color,
      textColor:        rawVisual.textColor,
      emphasis:         rawVisual.emphasis,
      keywords:         rawVisual.elements?.keywords ?? rawVisual.keywords,

      // ── dialogue ────────────────────────────────────────────────────────
      speaker:     rawVisual.speaker,
      bubbleColor: rawVisual.bubbleColor,
      emotion:     rawVisual.emotion ?? rawVisual.stickman_emotion ?? rawScene.stickman_emotion,

      // ── word_explosion ──────────────────────────────────────────────────
      word:        rawVisual.word,
      meanings:    rawVisual.meanings,
      accentColor: rawVisual.accentColor,

      // ── superpower ──────────────────────────────────────────────────────
      ruleText:   rawVisual.ruleText,
      heroAction: rawVisual.heroAction,
      worldColor: rawVisual.worldColor,

      // ── quiz countdown ─────────────────────────────────────────────────
      quizCountdown: rawVisual.quizCountdown,
    };

    // Strip undefined fields so Remotion's schema validation stays clean
    Object.keys(visual).forEach(k => {
      if (visual[k] === undefined) delete visual[k];
    });

    // ── SFX cues ────────────────────────────────────────────────────────────
    // sfx_agent.js writes scene.sfx as [{ file, startTime, volume }]
    const sfx = Array.isArray(rawScene.sfx)
      ? rawScene.sfx
          .filter(c => c && c.file)
          .map(c => ({
            file:      c.file,
            startTime: typeof c.startTime === 'number' ? c.startTime : 0,
            volume:    typeof c.volume    === 'number' ? c.volume    : 1,
          }))
      : undefined;

    const sceneEntry = { id: sceneId, duration, visual };
    if (sfx && sfx.length > 0) sceneEntry.sfx = sfx;
    return sceneEntry;
  });

  return {
    jsonData: {
      title:      scriptData.video_title ?? scriptData.title ?? videoId,
      voice_file: voiceFile,
      render_embedded_audio: false,
      scenes,
      captions,
    },
  };
}

/**
 * Normalise a template string to one of the five known values.
 * Falls back to "stickman" for unknown/missing values.
 *
 * @param {string|undefined} raw
 * @returns {string}
 */
function normaliseTemplate(raw) {
  const known = ['stickman', 'text_burst', 'dialogue', 'word_explosion', 'superpower'];
  const t     = (raw ?? '').toLowerCase().trim().replace(/[\s-]/g, '_');
  return known.includes(t) ? t : 'stickman';
}

/**
 * Infer a Remotion template from the script_agent's "type" field heuristic.
 * script_agent uses types: hook | explanation | example | payoff | CTA
 *
 * @param {object} scene
 * @returns {string}
 */
function inferTemplate(scene) {
  const type = (scene.type ?? '').toLowerCase();
  if (type === 'hook' || type === 'cta')          return 'text_burst';
  if (type === 'payoff')                          return 'superpower';
  if (type === 'example')                         return 'dialogue';
  return 'stickman';
}

// ─── Bundle (cached per run) ──────────────────────────────────────────────────

let _bundleLocation = null;

/**
 * Webpack-bundle the Remotion entry point once per process.
 * Subsequent calls return the cached bundle path.
 *
 * @returns {Promise<string>} bundleLocation (temp directory path)
 */
async function getBundle() {
  if (_bundleLocation) return _bundleLocation;

  console.log(`  → Bundling Remotion entry point...`);
  console.log(`    ${ENTRY_POINT}`);

  const bundleStart = Date.now();

  _bundleLocation = await bundle({
    entryPoint:    ENTRY_POINT,
    // Serve static assets (audio, images) from the project root so that
    // staticFile('audio/voices/x.mp3') resolves to <PROJECT_ROOT>/audio/voices/x.mp3
    // This matches the paths used by voice_agent.js and sfx_agent.js.
    publicDir:     PROJECT_ROOT,
    // Forward any webpack overrides from remotion.config.ts if needed.
    // For programmatic rendering, the config file is NOT automatically loaded —
    // we replicate the SVG override here.
    webpackOverride: (config) => {
      return {
        ...config,
        module: {
          ...config.module,
          rules: [
            ...(config.module?.rules ?? []).map(rule => {
              if (
                rule &&
                typeof rule === 'object' &&
                !Array.isArray(rule) &&
                'test' in rule &&
                rule.test instanceof RegExp &&
                rule.test.source.includes('svg')
              ) {
                return { ...rule, exclude: /\.svg$/i };
              }
              return rule;
            }),
            {
              test:   /\.svg$/i,
              issuer: /\.[jt]sx?$/,
              use: [{
                loader: require.resolve('@svgr/webpack'),
                options: { svgoConfig: { plugins: [{ name: 'removeViewBox', active: false }] } },
              }],
            },
          ],
        },
      };
    },
  });

  console.log(`    Bundle ready in ${((Date.now() - bundleStart) / 1000).toFixed(1)}s → ${_bundleLocation}\n`);
  return _bundleLocation;
}

// ─── Remotion Render ──────────────────────────────────────────────────────────

/**
 * Render one approved script to a silent MP4 using Remotion's renderMedia().
 *
 * @param {object} scriptData       - Parsed approved script JSON
 * @param {string} bundleLocation   - Webpack bundle path from getBundle()
 * @param {string} outputPath       - Absolute path for the rendered MP4
 * @returns {Promise<void>}
 */
async function renderVideo(scriptData, bundleLocation, outputPath) {
  const inputProps = buildInputProps(scriptData);

  // Resolve the composition — this runs calculateMetadata, giving us the
  // dynamic durationInFrames derived from the sum of scene durations.
  const composition = await selectComposition({
    serveUrl:    bundleLocation,
    id:          'VideoTemplate',
    inputProps,
    timeoutInMilliseconds: RENDER_TIMEOUT_MS,
  });

  await renderMedia({
    composition,
    serveUrl:    bundleLocation,
    codec:       'h264',
    outputLocation: outputPath,
    inputProps,
    concurrency:    RENDER_CONCURRENCY,
    timeoutInMilliseconds: RENDER_TIMEOUT_MS,
    // CRF 18 = visually lossless; matches remotion.config.ts
    videoCrf:    18,
    // Suppress per-frame progress to keep logs readable;
    // set onProgress below if you want a progress bar
    onProgress: ({ progress }) => {
      const pct = Math.round(progress * 100);
      process.stdout.write(`\r    rendering... ${pct}%`);
    },
  });

  process.stdout.write('\r');   // clear progress line
}

// ─── FFmpeg: Merge Audio into Final MP4 ──────────────────────────────────────

/**
 * Merge a silent Remotion video with voice and SFX audio tracks using FFmpeg.
 *
 * Strategy:
 *   - Voice track starts at 0 and runs for the full video duration
 *   - Each SFX is a separate input delayed to its absolute timestamp:
 *       absolute_offset = scene_start_seconds + sfx.startTime
 *   - All audio streams are mixed with amix (normalised sum)
 *   - The merged audio is muxed with the video stream (copy — no re-encode)
 *   - Output: H.264 video + AAC audio in MP4
 *
 * FFmpeg filter graph built:
 *   [1:a]adelay=0|0[voice];          ← voice (always input 1)
 *   [2:a]adelay=T1ms|T1ms[sfx0];     ← first SFX, delayed T1 ms
 *   [3:a]adelay=T2ms|T2ms[sfx1];     ← second SFX ...
 *   [voice][sfx0][sfx1]amix=inputs=3:duration=first:normalize=0[aout]
 *
 * @param {object} opts
 * @param {string}   opts.silentVideoPath  - Remotion render output
 * @param {string}   opts.voicePath        - Full voice track MP3
 * @param {Array<{filePath:string, offsetSeconds:number, volume:number}>} opts.sfxTracks
 * @param {object}   [opts.backgroundMusic] - { filePath, volume } for ambient layer
 * @param {number}   [opts.totalDurationSeconds] - Video total duration for music fade-out
 * @param {string}   opts.outputPath       - Final MP4 output path
 * @returns {Promise<void>}
 */
function mergeAudio(opts) {
  return new Promise((resolve, reject) => {
    const { silentVideoPath, voicePath, sfxTracks, backgroundMusic, totalDurationSeconds, outputPath } = opts;

    const cmd = ffmpeg();

    // Input 0: silent video (from Remotion)
    cmd.input(silentVideoPath);

    // Input 1: full voice track
    const hasVoice = voicePath && fs.existsSync(voicePath);
    if (hasVoice) {
      cmd.input(voicePath);
    }

    // Input 2 (optional): Background music
    const hasBgMusic = backgroundMusic?.filePath && fs.existsSync(backgroundMusic.filePath);
    if (hasBgMusic) {
      cmd.input(backgroundMusic.filePath);
    }

    // Inputs 3..N: SFX files
    const validSfx = (sfxTracks ?? []).filter(s => s.filePath && fs.existsSync(s.filePath));
    validSfx.forEach(s => cmd.input(s.filePath));

    // ── Build filter_complex ──────────────────────────────────────────────
    const filterParts  = [];
    const mixInputs    = [];

    let inputIndex = 1;  // 0 = video, voice starts at 1

    if (hasVoice) {
      // Voice at delay 0 (plays from start)
      filterParts.push(`[${inputIndex}:a]adelay=0|0,volume=1[voice]`);
      mixInputs.push('[voice]');
      inputIndex++;
    }

    if (hasBgMusic) {
      // Background music: loop if shorter than video, apply volume, fade in/out
      const bgVol = typeof backgroundMusic.volume === 'number' ? backgroundMusic.volume : 0.08;
      const fadeOutStart = Math.max(0, (totalDurationSeconds ?? 51) - 4);
      filterParts.push(`[${inputIndex}:a]aloop=loop=-1:size=2e+09,volume=${bgVol},afade=t=in:d=2,afade=t=out:st=${fadeOutStart}:d=4[bgm]`);
      mixInputs.push('[bgm]');
      inputIndex++;
    }

    validSfx.forEach((sfx, i) => {
      const delayMs = Math.round(Math.max(0, sfx.offsetSeconds) * 1000);
      const vol     = typeof sfx.volume === 'number' ? sfx.volume : 1;
      const label   = `sfx${i}`;
      filterParts.push(`[${inputIndex}:a]adelay=${delayMs}|${delayMs},volume=${vol}[${label}]`);
      mixInputs.push(`[${label}]`);
      inputIndex++;
    });

    let filterComplex;

    if (mixInputs.length === 0) {
      // No audio at all — just copy the silent video
      cmd
        .outputOptions(['-c:v copy', '-an'])
        .output(outputPath)
        .on('end', resolve)
        .on('error', err => reject(new Error(`FFmpeg (no-audio copy) error: ${err.message}`)))
        .run();
      return;
    }

    if (mixInputs.length === 1) {
      // Single audio source — skip amix, use it directly
      filterParts.push(`${mixInputs[0]}aresample=44100[aout]`);
      filterComplex = filterParts.join('; ');
    } else {
      // Multiple audio sources — amix them together
      filterParts.push(
        `${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=first:normalize=0[aout]`
      );
      filterComplex = filterParts.join('; ');
    }

    cmd
      .complexFilter(filterComplex)
      .outputOptions([
        '-map 0:v',          // video stream from silent render (input 0)
        '-map [aout]',       // merged audio
        '-c:v copy',         // copy video — no re-encode
        '-c:a aac',          // encode audio to AAC
        '-b:a 192k',
        '-shortest',         // trim to shortest stream (handles audio/video length mismatch)
        '-movflags +faststart',  // web-friendly MP4 atom placement
      ])
      .output(outputPath)
      .on('start', cmdLine => {
        // Uncomment to debug the full FFmpeg command:
        // console.log('    ffmpeg:', cmdLine);
      })
      .on('end', resolve)
      .on('error', err => reject(new Error(`FFmpeg merge error: ${err.message}`)));

    cmd.run();
  });
}

/**
 * Compute the absolute SFX tracks (file path + offset from video start)
 * for all scenes in a script, ready to pass to mergeAudio().
 *
 * Uses the same frame-based rounding as Remotion's buildFramedScenes()
 * to prevent drift between the visual scene boundaries and audio SFX timing.
 *
 * @param {object}   scriptData   - Approved script JSON
 * @param {number}   fps          - Frames per second used during render (60)
 * @returns {Array<{filePath:string, offsetSeconds:number, volume:number}>}
 */
function buildSfxTracks(scriptData, fps = 60) {
  const scenes    = scriptData.scenes ?? [];
  const sfxTracks = [];
  let accFrames   = 0;

  for (const scene of scenes) {
    const dur = typeof scene.duration === 'number' && scene.duration > 0
      ? scene.duration
      : 3;

    // Use the same rounding as Remotion's buildFramedScenes() to stay in sync
    const sceneDurFrames = Math.max(1, Math.round(dur * fps));

    if (Array.isArray(scene.sfx)) {
      for (const cue of scene.sfx) {
        if (!cue || !cue.file) continue;

        // cue.file is relative to project root (set by sfx_agent)
        const absPath = path.isAbsolute(cue.file)
          ? cue.file
          : path.join(PROJECT_ROOT, cue.file);

        // Convert accumulated frames back to seconds for FFmpeg adelay
        const sceneStartSeconds = accFrames / fps;
        const offsetSeconds = sceneStartSeconds + (typeof cue.startTime === 'number' ? cue.startTime : 0);

        sfxTracks.push({
          filePath:      absPath,
          offsetSeconds,
          volume:        typeof cue.volume === 'number' ? cue.volume : 1,
        });
      }
    }

    accFrames += sceneDurFrames;
  }

  return sfxTracks;
}

// ─── Core: Process One Script ─────────────────────────────────────────────────

/**
 * Render + merge one approved script.
 *
 * @param {object} scriptData     - Parsed approved script JSON
 * @param {string} scriptPath     - Absolute path of the approved JSON file
 * @param {string} bundleLocation - Webpack bundle from getBundle()
 * @returns {Promise<{
 *   videoId: string,
 *   renderTimeS: number,
 *   outputPath: string,
 *   fileSizeMB: string|null,
 *   status: 'success'|'failed',
 *   error?: string,
 * }>}
 */
async function processScript(scriptData, scriptPath, bundleLocation) {
  const videoId     = scriptData.video_id ?? path.basename(scriptPath, '.json');
  const startMs     = Date.now();

  const silentPath  = path.join(VIDEOS_DIR, `${videoId}.mp4`);
  const finalPath   = path.join(FINAL_DIR,  `${videoId}_final.mp4`);

  const voiceRelative =
    scriptData.voice_file ??
    scriptData.audio?.file_url ??
    `audio/voices/${videoId}_voice_full.mp3`;

  const voicePath = path.isAbsolute(voiceRelative)
    ? voiceRelative
    : path.join(PROJECT_ROOT, voiceRelative);

  const sfxTracks = buildSfxTracks(scriptData);

  let backgroundMusic = null;
  if (scriptData.background_music?.file) {
    const bgPath = path.isAbsolute(scriptData.background_music.file)
      ? scriptData.background_music.file
      : path.join(PROJECT_ROOT, scriptData.background_music.file);
    if (await fs.pathExists(bgPath)) {
      backgroundMusic = {
        filePath: bgPath,
        volume: scriptData.background_music.volume ?? 0.08,
      };
    }
  }

  // ── Skip if final output already exists and FORCE_RERENDER is false ──────
  const renderInputs = [
    scriptPath,
    voicePath,
    backgroundMusic?.filePath,
    ...sfxTracks.map(track => track.filePath),
    ...RENDER_SOURCE_FILES,
  ];

  if (!FORCE_RERENDER && await outputIsCurrent(finalPath, renderInputs)) {
    console.log(`    ✓ Already rendered — skipping: ${path.basename(finalPath)}`);
    const sizeMB = await fileSizeMB(finalPath);
    return {
      videoId,
      renderTimeS:  0,
      outputPath:   toRelative(finalPath),
      fileSizeMB:   sizeMB,
      status:       'success',
    };
  }

  // ── Step 1: Remotion render ───────────────────────────────────────────────
  console.log(`    → Rendering with Remotion (concurrency=${RENDER_CONCURRENCY})...`);
  const renderStart = Date.now();
  await renderVideo(scriptData, bundleLocation, silentPath);
  const renderMs = Date.now() - renderStart;
  console.log(`    ✓ Render done in ${(renderMs / 1000).toFixed(1)}s → ${path.basename(silentPath)}`);

  if (!(await fs.pathExists(voicePath))) {
    console.warn(`    ⚠  Voice file not found: ${voiceRelative}`);
    console.warn(`       Run voice_agent.js first, or place the MP3 at that path.`);
  }

  // ── Step 3b: Background music ────────────────────────────────────────────
  if (scriptData.background_music?.file) {
    if (backgroundMusic) {
      console.log(`    → Background music: ${path.basename(backgroundMusic.filePath)} (vol=${backgroundMusic.volume})`);
    } else {
      console.warn(`    ⚠  Background music not found: ${scriptData.background_music.file}`);
    }
  }

  if (sfxTracks.length > 0) {
    console.log(`    → Merging voice + ${sfxTracks.length} SFX track(s)${backgroundMusic ? ' + background music' : ''} with FFmpeg...`);
  } else {
    console.log(`    → Merging voice track${backgroundMusic ? ' + background music' : ''} with FFmpeg...`);
  }

  // ── Step 4: FFmpeg merge ──────────────────────────────────────────────────
  await mergeAudio({
    silentVideoPath: silentPath,
    voicePath,
    sfxTracks,
    backgroundMusic,
    totalDurationSeconds: scriptData.total_duration_seconds,
    outputPath:      finalPath,
  });

  const totalS  = ((Date.now() - startMs) / 1000).toFixed(1);
  const sizeMB  = await fileSizeMB(finalPath);

  console.log(
    `    ✓ Final output: ${path.basename(finalPath)}` +
    (sizeMB ? `  (${sizeMB} MB)` : '') +
    `  total=${totalS}s`
  );

  return {
    videoId,
    renderTimeS:  parseFloat(totalS),
    outputPath:   toRelative(finalPath),
    fileSizeMB:   sizeMB,
    status:       'success',
  };
}

// ─── Batch Runner ─────────────────────────────────────────────────────────────

/**
 * Render all approved scripts.
 * Bundles Remotion once, then processes each script sequentially
 * (Remotion already parallelises internally via concurrency).
 *
 * @param {string[]} [filePaths]  Explicit absolute paths; auto-discovers if omitted.
 * @returns {Promise<object>}     Batch summary
 */
async function runRenderBatch(filePaths) {
  await fs.ensureDir(VIDEOS_DIR);
  await fs.ensureDir(FINAL_DIR);
  await fs.ensureDir(APPROVED_DIR);

  // Discover targets
  let targets = filePaths;
  if (!targets || targets.length === 0) {
    const SKIP = new Set([
      'batch_summary.json', 'voice_summary.json',
      'sfx_summary.json',   'image_summary.json',
      'render_log.json',
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
    return { total: 0, rendered: [], failed: [] };
  }

  const divider = '═'.repeat(66);
  console.log(`\n${divider}`);
  console.log(`  english-made-fun / render_agent.js`);
  console.log(`  Concurrency : ${RENDER_CONCURRENCY} browser tabs`);
  console.log(`  Timeout     : ${RENDER_TIMEOUT_MS / 1000}s per frame`);
  console.log(`  Force re-render : ${FORCE_RERENDER}`);
  console.log(`  Batch       : ${targets.length} script${targets.length !== 1 ? 's' : ''}`);
  console.log(`  Output dir  : ${FINAL_DIR}`);
  console.log(`${divider}\n`);

  for (const scriptPath of targets) {
    try {
      const scriptData = await fs.readJson(scriptPath);
      primeStaticImages(scriptData);
    } catch {
      // Ignore here; the normal per-script read below will report concrete failures.
    }
  }

  // Bundle once for the whole batch
  let bundleLocation;
  try {
    bundleLocation = await getBundle();
  } catch (err) {
    console.error(`Fatal: Remotion bundle failed: ${err.message}`);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }

  const summary = {
    run_at:   new Date().toISOString(),
    total:    targets.length,
    rendered: [],
    failed:   [],
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

    const videoId = scriptData.video_id ?? path.basename(scriptPath, '.json');
    console.log(`         video_id : ${videoId}`);
    console.log(`         title    : ${scriptData.video_title ?? scriptData.title ?? '(untitled)'}`);
    console.log(`         scenes   : ${(scriptData.scenes ?? []).length}`);

    let result;
    try {
      result = await processScript(scriptData, scriptPath, bundleLocation);
    } catch (err) {
      const errMsg = err.message ?? String(err);
      console.error(`  ✗ FAILED: ${errMsg}\n`);

      result = {
        videoId,
        renderTimeS: 0,
        outputPath:  null,
        fileSizeMB:  null,
        status:      'failed',
        error:       errMsg,
      };

      summary.failed.push({ fileName, video_id: videoId, error: errMsg });
    }

    // Upsert render log entry regardless of success/failure
    await upsertRenderLog({
      video_id:     result.videoId,
      file_name:    fileName,
      status:       result.status,
      render_time_s: result.renderTimeS,
      file_size_mb: result.fileSizeMB ?? null,
      output_path:  result.outputPath ?? null,
      rendered_at:  new Date().toISOString(),
      ...(result.error ? { error: result.error } : {}),
    });

    if (result.status === 'success') {
      console.log('');
      summary.rendered.push({
        fileName,
        video_id:      result.videoId,
        output_path:   result.outputPath,
        render_time_s: result.renderTimeS,
        file_size_mb:  result.fileSizeMB,
      });
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const sep = '─'.repeat(66);
  console.log(sep);
  console.log(`  Render batch complete:`);
  console.log(`    ✓ Rendered : ${summary.rendered.length}`);
  console.log(`    ✗ Failed   : ${summary.failed.length}`);

  if (summary.rendered.length > 0) {
    const totalTime = summary.rendered.reduce((s, r) => s + (r.render_time_s ?? 0), 0);
    console.log(`    Total time : ${totalTime.toFixed(1)}s`);
    console.log('\n  Output files:');
    summary.rendered.forEach(r => {
      console.log(
        `    ✓ ${r.output_path}` +
        (r.file_size_mb ? `  (${r.file_size_mb} MB)` : '') +
        `  ${r.render_time_s}s`
      );
    });
  }

  if (summary.failed.length > 0) {
    console.log('\n  Failed:');
    summary.failed.forEach(({ fileName: fn, error }) => {
      console.log(`    ✗ ${fn}  — ${error}`);
    });
  }

  console.log(`\n  Render log → ${RENDER_LOG}\n`);
  return summary;
}

// ─── CLI Entry Point ──────────────────────────────────────────────────────────

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2).filter(s => s.trim().length > 0);

    if (args.includes('--show-log')) {
      await showLog();
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
      const summary = await runRenderBatch(targets);
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
  runRenderBatch,
  processScript,
  buildInputProps,
  buildSfxTracks,
  mergeAudio,
  getBundle,
  renderVideo,
  showLog,
  upsertRenderLog,
  RENDER_CONCURRENCY,
  RENDER_TIMEOUT_MS,
  VIDEOS_DIR,
  FINAL_DIR,
  APPROVED_DIR,
  RENDER_LOG,
};
