/**
 * pipeline/script_agent.js
 *
 * Generates complete English-learning YouTube Short scripts using the Claude API.
 * Rotates across 3 content formats and saves each output to scripts/.
 *
 * ── CLI usage ────────────────────────────────────────────────────────────────
 *   node pipeline/script_agent.js                         # uses DEFAULT_TOPICS
 *   node pipeline/script_agent.js "Topic A" "Topic B"     # explicit topics
 *
 * ── Programmatic usage ───────────────────────────────────────────────────────
 *   const { runBatch } = require('./pipeline/script_agent');
 *   const results = await runBatch(['Present Tense', 'Must vs Have To']);
 *
 * ── Output ───────────────────────────────────────────────────────────────────
 *   scripts/day[DD]_vid[NN].json   (e.g. day03_vid01.json)
 */

'use strict';

// ─── Environment ──────────────────────────────────────────────────────────────
// Load .env from the project root (one level above pipeline/)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// ─── Imports ──────────────────────────────────────────────────────────────────
// @anthropic-ai/sdk CJS: the module object carries the class on .default
// and all error classes at the top level (e.g. AnthropicPkg.RateLimitError).
const AnthropicPkg = require('@anthropic-ai/sdk');
const Anthropic     = AnthropicPkg.default ?? AnthropicPkg; // class constructor

const fs   = require('fs-extra');
const { v4: uuidv4 } = require('uuid');

// ─── Constants ────────────────────────────────────────────────────────────────

const MODEL       = 'claude-opus-4-6';  // Always Opus 4.6 per Anthropic SDK defaults
const MAX_RETRIES = 3;
const SCRIPTS_DIR = path.join(__dirname, '../scripts');

// ─── Content Formats ──────────────────────────────────────────────────────────
// Rotated across the batch: index 0 → format[0], index 1 → format[1], etc.

const FORMATS = [
  'Fail → Fix Stickman Skits',
  'Word Explosion Visual Builds',
  'Rule as Superpower Metaphor',
];

// ─── System Prompt ────────────────────────────────────────────────────────────
// Embedded verbatim as required. Do not modify the schema inside.

const SYSTEM_PROMPT = `You are a world-class YouTube content creator and scriptwriter specialising in English learning Shorts. Generate a complete video script using the specified format. Output ONLY a valid JSON object matching this exact schema — no markdown, no explanation, just raw JSON:
{
  video_id: string (uuid),
  video_title: string,
  format: string,
  hook: { options: [string, string, string], selected: string },
  script: { full_text: string, sentences: [string] },
  scenes: [
    {
      scene_id: number,
      start: number,
      duration: number,
      type: string (hook|explanation|example|payoff|CTA),
      text: string,
      voice_line: string,
      stickman_action: string,
      stickman_emotion: string,
      visual: { template: string, elements: { keywords: [string] } },
      animation: { in: string, out: string, emphasis: string },
      sfx_prompts: [string],
      use_image: boolean,
      visual_priority: string
    }
  ],
  audio: { voice: string, speed: number, tone: string },
  captions: { enabled: boolean, style: string },
  packaging: { titles: [string, string, string], thumbnail: { text: string, visual: string } },
  viral_triggers: [string],
  metrics: { ctr: null, retention: null, watch_time: null }
}`;

// ─── Anthropic client ─────────────────────────────────────────────────────────

let _client = null;
function getClient() {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY is not set.\n' +
        'Fill it in: english-made-fun/.env\n' +
        'Line to add: ANTHROPIC_API_KEY=sk-ant-...'
      );
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Pause for `ms` milliseconds. */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Robustly extract a JSON object from a raw text string.
 * Handles: plain JSON, ```json ... ``` fences, and stray preamble text.
 *
 * @param {string} text
 * @returns {object}
 * @throws {SyntaxError} if no valid JSON object can be found
 */
function extractJSON(text) {
  const trimmed = text.trim();

  // ── Happy path: entire response is clean JSON ─────────────────────────────
  try {
    return JSON.parse(trimmed);
  } catch (_) {}

  // ── Strip markdown code fences: ```json\n...\n``` ─────────────────────────
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch (_) {}
  }

  // ── Last resort: find the outermost { ... } block ─────────────────────────
  const braceStart = trimmed.indexOf('{');
  const braceEnd   = trimmed.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd > braceStart) {
    try {
      return JSON.parse(trimmed.slice(braceStart, braceEnd + 1));
    } catch (_) {}
  }

  throw new SyntaxError(
    `Could not extract valid JSON from response.\n` +
    `First 300 chars: ${trimmed.slice(0, 300)}`
  );
}

/**
 * Returns true for errors that are safe to retry.
 * Auth errors, bad-request errors, and permission errors are NOT retried.
 *
 * @param {Error} error
 * @returns {boolean}
 */
function isRetryable(error) {
  // Typed Anthropic SDK errors — checked most-specific first
  if (error instanceof AnthropicPkg.RateLimitError)            return true;  // 429
  if (error instanceof AnthropicPkg.InternalServerError)        return true;  // 500, 529
  if (error instanceof AnthropicPkg.APIConnectionError)         return true;  // network
  if (error instanceof AnthropicPkg.APIConnectionTimeoutError)  return true;  // timeout
  // Malformed JSON from model — worth a retry (rare)
  if (error instanceof SyntaxError)                             return true;
  return false;
}

// ─── Core Generator ───────────────────────────────────────────────────────────

/**
 * Generate a single video script for `topic` using `format`.
 * Streams the response to avoid HTTP timeout on large JSON outputs.
 * Retries up to MAX_RETRIES times with exponential backoff.
 *
 * @param {string} topic   - English grammar/vocabulary topic
 * @param {string} format  - One of the three FORMATS strings
 * @param {number} attempt - Internal retry counter (starts at 0)
 * @returns {Promise<object>} Parsed script JSON
 */
async function generateScript(topic, format, attempt = 0) {
  const client = getClient();

  const userPrompt =
    `Topic: "${topic}"\n` +
    `Format: "${format}"\n\n` +
    `Generate a complete English learning YouTube Short script in the "${format}" style. ` +
    `The video should be 45–60 seconds, high-energy, and educational for beginner/intermediate learners. ` +
    `Make the hook irresistible and the CTA clear. ` +
    `Output ONLY the raw JSON object — no markdown, no code fences, no explanation.`;

  console.log(`  → Claude ${MODEL} (attempt ${attempt + 1}/${MAX_RETRIES + 1})...`);

  try {
    /*
     * Use streaming via .stream() + .finalMessage() so that:
     *   1. Large JSON responses don't hit HTTP read timeouts
     *   2. We get the complete, validated Message object back
     *   3. adaptive thinking blocks are automatically filtered
     *
     * thinking: { type: 'adaptive' } lets Claude decide when deep reasoning
     * helps — it improves script quality without needing a fixed budget_tokens.
     */
    const stream = client.messages.stream({
      model:      MODEL,
      max_tokens: 8192,
      thinking:   { type: 'adaptive' },
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: userPrompt }],
    });

    // finalMessage() collects the full response; handles abort/error internally
    const message = await stream.finalMessage();

    // Filter for the text block — skip thinking blocks from adaptive mode
    const textBlock = message.content.find(block => block.type === 'text');

    if (!textBlock || !textBlock.text) {
      const blockTypes = message.content.map(b => b.type).join(', ');
      throw new Error(
        `No text block in Claude response. Blocks present: [${blockTypes}]. ` +
        `stop_reason=${message.stop_reason}`
      );
    }

    if (message.stop_reason === 'max_tokens') {
      throw new Error(
        'Response was truncated (max_tokens reached). ' +
        'Script JSON is incomplete — this attempt will be retried.'
      );
    }

    // Extract and validate JSON
    const scriptData = extractJSON(textBlock.text);

    // Ensure required fields are present
    if (!scriptData.video_id) {
      scriptData.video_id = uuidv4();
    }
    if (!scriptData.format) {
      scriptData.format = format;
    }
    if (!Array.isArray(scriptData.scenes)) {
      throw new SyntaxError('Parsed JSON is missing the required "scenes" array.');
    }

    return scriptData;

  } catch (error) {
    const exhausted  = attempt >= MAX_RETRIES;
    const retryable  = isRetryable(error);

    if (!exhausted && retryable) {
      // Exponential backoff: 1.5s → 3s → 6s
      const backoffMs = Math.pow(2, attempt) * 1500;
      const label = error instanceof AnthropicPkg.APIError
        ? `${error.constructor.name} [HTTP ${error.status}]`
        : error.constructor.name;

      console.warn(`  ⚠  ${label}: ${error.message.slice(0, 120)}`);
      console.log(`  ↺  Retrying in ${(backoffMs / 1000).toFixed(1)}s...`);
      await sleep(backoffMs);
      return generateScript(topic, format, attempt + 1);
    }

    // Non-retryable or retries exhausted — surface to caller
    throw error;
  }
}

// ─── Batch Runner ─────────────────────────────────────────────────────────────

/**
 * Process an array of topics, rotating across the 3 formats automatically.
 * Saves each script to scripts/day[DD]_vid[NN].json.
 *
 * Topics failing after all retries are recorded in results.failed and do NOT
 * abort the remaining batch — the pipeline continues.
 *
 * @param {string[]} topics  Array of English learning topic strings
 * @returns {Promise<{ saved: string[], failed: Array<{topic:string, error:string}> }>}
 */
async function runBatch(topics) {
  if (!Array.isArray(topics) || topics.length === 0) {
    throw new TypeError('runBatch() requires a non-empty array of topic strings.');
  }

  // Validate API key early (getClient() will throw if missing)
  getClient();

  await fs.ensureDir(SCRIPTS_DIR);

  // Zero-padded day of month for filename (e.g. "03" for March 3rd)
  const dayStr = new Date().getDate().toString().padStart(2, '0');

  const results = { saved: [], failed: [] };
  const divider = '═'.repeat(58);

  console.log(`\n${divider}`);
  console.log(`  english-made-fun / script_agent.js`);
  console.log(`  Model   : ${MODEL} (adaptive thinking)`);
  console.log(`  Batch   : ${topics.length} topic${topics.length !== 1 ? 's' : ''}`);
  console.log(`  Day tag : day${dayStr}`);
  console.log(`  Output  : ${SCRIPTS_DIR}`);
  console.log(`${divider}\n`);

  for (let i = 0; i < topics.length; i++) {
    const topic   = topics[i];
    // Format rotates: 0 → format[0], 1 → format[1], 2 → format[2], 3 → format[0], …
    const format  = FORMATS[i % FORMATS.length];
    const vidNum  = (i + 1).toString().padStart(2, '0');
    const fileName = `day${dayStr}_vid${vidNum}.json`;
    const filePath = path.join(SCRIPTS_DIR, fileName);

    console.log(`[${i + 1}/${topics.length}] Topic  : "${topic}"`);
    console.log(`         Format : ${format}`);
    console.log(`         Output : ${fileName}`);

    try {
      const scriptData = await generateScript(topic, format);

      // Pretty-print JSON (2-space indent) for readability and git diffs
      await fs.writeJson(filePath, scriptData, { spaces: 2 });

      const sceneCount = Array.isArray(scriptData.scenes)
        ? scriptData.scenes.length
        : '?';
      console.log(`  ✓ Saved  → ${fileName}  (${sceneCount} scenes)\n`);
      results.saved.push(filePath);

    } catch (error) {
      // Build a clean one-line error description
      let errorMsg;
      if (error instanceof AnthropicPkg.APIError) {
        errorMsg = `${error.constructor.name} [HTTP ${error.status}]: ${error.message}`;
      } else {
        errorMsg = `${error.constructor.name}: ${error.message}`;
      }

      console.error(`  ✗ FAILED → ${errorMsg}\n`);
      results.failed.push({ topic, error: errorMsg });
    }
  }

  // ── Final summary ───────────────────────────────────────────────────────
  const sep = '─'.repeat(58);
  console.log(sep);
  console.log(
    `  Batch complete: ${results.saved.length} saved, ` +
    `${results.failed.length} failed.`
  );

  if (results.failed.length > 0) {
    console.log('\n  Failed topics:');
    results.failed.forEach(({ topic, error }) => {
      console.log(`    • "${topic}"`);
      console.log(`      ${error}`);
    });
  }

  if (results.saved.length > 0) {
    console.log('\n  Saved files:');
    results.saved.forEach(p => console.log(`    ✓ ${path.basename(p)}`));
  }

  console.log('');
  return results;
}

// ─── Default Topics (standalone fallback) ────────────────────────────────────
// Used when running the script directly without CLI arguments.

const DEFAULT_TOPICS = [
  'Present Simple vs Present Continuous',
  'Must vs Have To — Modal Verbs',
  'Countable and Uncountable Nouns',
  'First Conditional — Real Future Situations',
  'Phrasal Verbs with GET',
  'When to Use THE — Definite Article Rules',
];

// ─── CLI Entry Point ──────────────────────────────────────────────────────────

if (require.main === module) {
  // Any CLI arguments after the script name are treated as topics
  const cliTopics = process.argv.slice(2).filter(s => s.trim().length > 0);
  const topics    = cliTopics.length > 0 ? cliTopics : DEFAULT_TOPICS;

  console.log(
    cliTopics.length > 0
      ? `Running with ${cliTopics.length} CLI topic(s).`
      : `No topics provided — using ${DEFAULT_TOPICS.length} default topics.`
  );

  runBatch(topics)
    .then(({ saved, failed }) => {
      // Exit 1 if any topics failed so CI/schedulers can detect partial failure
      process.exit(failed.length > 0 ? 1 : 0);
    })
    .catch(err => {
      console.error('\nFatal error:', err.message);
      if (err.stack) console.error(err.stack);
      process.exit(1);
    });
}

// ─── Module Exports ───────────────────────────────────────────────────────────

module.exports = {
  runBatch,
  generateScript,
  FORMATS,
  DEFAULT_TOPICS,
  SYSTEM_PROMPT,
};
