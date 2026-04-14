/**
 * pipeline/whisper_agent.js
 *
 * Optional caption fallback/augmentation using OpenAI Whisper CLI.
 *
 * This agent transcribes stitched voice tracks and emits caption JSON in the
 * same token-level shape consumed by components/VideoTemplate.tsx:
 *   [{ text, startMs, endMs, timestampMs, confidence }]
 *
 * By default, it preserves existing script.captions_file values and only fills
 * missing caption files. Use --force to overwrite script.captions_file.
 *
 * Usage:
 *   node pipeline/whisper_agent.js
 *   node pipeline/whisper_agent.js scripts/approved/day01_vid01.json
 *   node pipeline/whisper_agent.js --force
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const fs = require('fs-extra');
const os = require('os');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.join(__dirname, '..');
const APPROVED_DIR = path.join(PROJECT_ROOT, 'scripts', 'approved');
const VOICES_DIR = path.join(PROJECT_ROOT, 'audio', 'voices');

const DEFAULT_MODEL = process.env.WHISPER_MODEL || 'turbo';
const DEFAULT_LANGUAGE = process.env.WHISPER_LANGUAGE || 'English';

function toRelative(absPath) {
  return path.relative(PROJECT_ROOT, absPath).replace(/\\/g, '/');
}

function resolveProjectPath(candidate) {
  if (!candidate) return null;
  return path.isAbsolute(candidate) ? candidate : path.join(PROJECT_ROOT, candidate);
}

function runCommand(cmd, args) {
  return spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true });
}

function detectWhisperRunner() {
  const envRunner = process.env.WHISPER_RUNNER;
  if (envRunner) {
    return { cmd: envRunner, baseArgs: [] };
  }

  const candidates = [
    { cmd: 'whisper', baseArgs: [] },
    { cmd: 'python', baseArgs: ['-m', 'whisper'] },
    { cmd: 'py', baseArgs: ['-m', 'whisper'] },
  ];

  for (const candidate of candidates) {
    const probe = runCommand(candidate.cmd, [...candidate.baseArgs, '--help']);
    if (probe.status === 0) return candidate;
  }

  return null;
}

function sanitizeTokenText(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text ? `${text} ` : '';
}

function parseMs(valueSeconds) {
  const n = Number(valueSeconds);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n * 1000));
}

function fromWhisperWords(words) {
  const out = [];

  for (const word of words ?? []) {
    const text = sanitizeTokenText(word?.word ?? word?.text);
    const startMs = parseMs(word?.start);
    const endMs = parseMs(word?.end);
    if (!text || startMs == null || endMs == null || endMs <= startMs) continue;

    out.push({
      text,
      startMs,
      endMs,
      timestampMs: startMs,
      confidence: 1,
    });
  }

  return out;
}

function fromWhisperSegments(segments) {
  const out = [];

  for (const segment of segments ?? []) {
    const segmentText = String(segment?.text ?? '').trim();
    const startMs = parseMs(segment?.start);
    const endMs = parseMs(segment?.end);

    if (!segmentText || startMs == null || endMs == null || endMs <= startMs) continue;

    const tokens = segmentText.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;

    const segmentDur = endMs - startMs;
    const tokenDur = Math.max(1, Math.floor(segmentDur / tokens.length));

    for (let i = 0; i < tokens.length; i++) {
      const tokenStart = startMs + i * tokenDur;
      const tokenEnd = i === tokens.length - 1 ? endMs : Math.min(endMs, tokenStart + tokenDur);
      if (tokenEnd <= tokenStart) continue;

      out.push({
        text: `${tokens[i]} `,
        startMs: tokenStart,
        endMs: tokenEnd,
        timestampMs: tokenStart,
        confidence: 1,
      });
    }
  }

  return out;
}

function buildCaptionTokens(whisperJson) {
  const segments = Array.isArray(whisperJson?.segments) ? whisperJson.segments : [];

  const allWords = [];
  for (const segment of segments) {
    if (Array.isArray(segment?.words) && segment.words.length > 0) {
      allWords.push(...segment.words);
    }
  }

  let captions = allWords.length > 0
    ? fromWhisperWords(allWords)
    : fromWhisperSegments(segments);

  captions = captions
    .sort((a, b) => a.startMs - b.startMs)
    .filter((item, idx, arr) => {
      if (idx === 0) return true;
      return item.endMs > item.startMs && item.startMs >= 0 && item.startMs >= arr[idx - 1].startMs;
    });

  return captions;
}

function runWhisper({ audioPath, outputDir, model = DEFAULT_MODEL, language = DEFAULT_LANGUAGE }) {
  const runner = detectWhisperRunner();
  if (!runner) {
    throw new Error(
      'Whisper CLI not found. Install with "pip install -U openai-whisper" and ensure whisper or python -m whisper is available.'
    );
  }

  const args = [
    ...runner.baseArgs,
    audioPath,
    '--model', model,
    '--task', 'transcribe',
    '--language', language,
    '--output_format', 'json',
    '--output_dir', outputDir,
    '--word_timestamps', 'True',
    '--fp16', 'False',
    '--verbose', 'False',
  ];

  const exec = runCommand(runner.cmd, args);

  if (exec.status !== 0) {
    const stderr = (exec.stderr || '').trim();
    const stdout = (exec.stdout || '').trim();
    throw new Error(`Whisper failed (${runner.cmd}): ${stderr || stdout || 'unknown error'}`);
  }

  const jsonPath = path.join(outputDir, `${path.parse(audioPath).name}.json`);
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Whisper output JSON not found: ${jsonPath}`);
  }

  return jsonPath;
}

async function processScript(scriptPath, opts = {}) {
  const { force = false, preferExisting = true } = opts;

  const script = await fs.readJson(scriptPath);
  const videoId = script.video_id;
  if (!videoId) {
    throw new Error(`Missing video_id in ${path.basename(scriptPath)}`);
  }

  const currentCaptionsPath = resolveProjectPath(script.captions_file || script.captions?.file);
  const hasExistingCaptions = Boolean(currentCaptionsPath && await fs.pathExists(currentCaptionsPath));

  if (preferExisting && hasExistingCaptions && !force) {
    return {
      status: 'skipped',
      reason: 'existing-captions',
      videoId,
      scriptPath,
      captionsFile: script.captions_file || script.captions?.file,
    };
  }

  const voiceCandidate =
    script.voice_file ||
    script.audio?.file_url ||
    `audio/voices/${videoId}_voice_full.mp3`;

  const voicePath = resolveProjectPath(voiceCandidate);
  if (!voicePath || !(await fs.pathExists(voicePath))) {
    throw new Error(`Voice track missing for ${videoId}: ${voiceCandidate}`);
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `whisper-${videoId}-`));
  try {
    const whisperJsonPath = runWhisper({ audioPath: voicePath, outputDir: tmpDir });
    const whisperJson = await fs.readJson(whisperJsonPath);
    const captions = buildCaptionTokens(whisperJson);

    if (!captions.length) {
      throw new Error(`Whisper produced no timestamp tokens for ${videoId}`);
    }

    await fs.ensureDir(VOICES_DIR);
    const outputPath = path.join(VOICES_DIR, `${videoId}_captions_whisper.json`);
    await fs.writeJson(outputPath, captions, { spaces: 2 });
    const relOutput = toRelative(outputPath);

    const nextScript = {
      ...script,
      ...(force || !script.captions_file ? { captions_file: relOutput } : {}),
      audio: {
        ...(script.audio || {}),
        whisper_agent_meta: {
          model: DEFAULT_MODEL,
          language: DEFAULT_LANGUAGE,
          generated_at: new Date().toISOString(),
          source_audio: toRelative(voicePath),
          captions_tokens: captions.length,
          used_as_primary_caption_file: Boolean(force || !script.captions_file),
        },
      },
    };

    await fs.writeJson(scriptPath, nextScript, { spaces: 2 });

    return {
      status: 'processed',
      videoId,
      scriptPath,
      captionsFile: relOutput,
      tokenCount: captions.length,
      assignedPrimary: Boolean(force || !script.captions_file),
    };
  } finally {
    await fs.remove(tmpDir);
  }
}

async function runWhisperBatch(filePaths, opts = {}) {
  const { force = false, preferExisting = true } = opts;

  await fs.ensureDir(APPROVED_DIR);

  let targets = filePaths;
  if (!targets || targets.length === 0) {
    const all = await fs.readdir(APPROVED_DIR).catch(() => []);
    targets = all
      .filter((f) => f.endsWith('.json') && f !== 'batch_summary.json')
      .map((f) => path.join(APPROVED_DIR, f));
  }

  const summary = {
    run_at: new Date().toISOString(),
    total: targets.length,
    processed: [],
    skipped: [],
    failed: [],
  };

  if (targets.length === 0) {
    console.log('No approved scripts found for whisper caption processing.');
    return summary;
  }

  console.log(`\n${'═'.repeat(62)}`);
  console.log('  english-made-fun / whisper_agent.js');
  console.log(`  Batch     : ${targets.length} script${targets.length !== 1 ? 's' : ''}`);
  console.log(`  Model     : ${DEFAULT_MODEL}`);
  console.log(`  Language  : ${DEFAULT_LANGUAGE}`);
  console.log(`  Mode      : ${force ? 'force-overwrite captions_file' : 'preserve existing captions_file'}`);
  console.log(`${'═'.repeat(62)}\n`);

  for (let i = 0; i < targets.length; i++) {
    const scriptPath = targets[i];
    const fileName = path.basename(scriptPath);

    console.log(`[${i + 1}/${targets.length}] ${fileName}`);

    try {
      const result = await processScript(scriptPath, { force, preferExisting });
      if (result.status === 'skipped') {
        summary.skipped.push(result);
        console.log(`  ↳ skipped (${result.reason})\n`);
      } else {
        summary.processed.push(result);
        console.log(`  ✓ captions=${result.tokenCount} file=${result.captionsFile}${result.assignedPrimary ? ' [primary]' : ''}\n`);
      }
    } catch (err) {
      summary.failed.push({ fileName, error: err.message });
      console.log(`  ✗ ${err.message}\n`);
    }
  }

  console.log(`${'─'.repeat(62)}`);
  console.log(`  Processed : ${summary.processed.length}`);
  console.log(`  Skipped   : ${summary.skipped.length}`);
  console.log(`  Failed    : ${summary.failed.length}`);
  console.log(`${'─'.repeat(62)}\n`);

  return summary;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const paths = args
    .filter((a) => !a.startsWith('--'))
    .map((p) => path.resolve(process.cwd(), p));

  runWhisperBatch(paths, { force, preferExisting: !force })
    .then((summary) => process.exit(summary.failed.length > 0 ? 1 : 0))
    .catch((err) => {
      console.error(`Fatal whisper_agent error: ${err.message}`);
      process.exit(1);
    });
}

module.exports = {
  runWhisperBatch,
  processScript,
  buildCaptionTokens,
  detectWhisperRunner,
};
