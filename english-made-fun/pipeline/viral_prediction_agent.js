/**
 * pipeline/viral_prediction_agent.js
 *
 * Scores English-learning YouTube Short scripts for viral potential using the
 * Claude API, then conditionally revises (via script_agent) or approves them.
 *
 * ── Decision logic ────────────────────────────────────────────────────────────
 *   score ≥ 80  → produce  (saved to scripts/approved/)
 *   score 60–79 → revise   (re-generates script with improvement_suggestions,
 *                            then re-scores; max 2 revision attempts)
 *   score < 60  → reject   (logged, skipped)
 *
 * ── CLI usage ─────────────────────────────────────────────────────────────────
 *   node pipeline/viral_prediction_agent.js                     # scores all scripts/day*.json
 *   node pipeline/viral_prediction_agent.js scripts/day03_vid01.json [...]
 *
 * ── Programmatic usage ────────────────────────────────────────────────────────
 *   const { runViralBatch } = require('./pipeline/viral_prediction_agent');
 *   const summary = await runViralBatch([scriptData, ...]);   // array of parsed JSON objects
 *   // OR pass file paths:
 *   const summary = await runViralBatch(['scripts/day03_vid01.json']);
 *
 * ── Output ────────────────────────────────────────────────────────────────────
 *   scripts/approved/[original_filename]    — approved script JSON
 *   scripts/approved/batch_summary.json     — full run summary
 */

'use strict';

// ─── Environment ──────────────────────────────────────────────────────────────
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// ─── Imports ──────────────────────────────────────────────────────────────────
const AnthropicPkg = require('@anthropic-ai/sdk');
const Anthropic    = AnthropicPkg.default ?? AnthropicPkg;

const fs              = require('fs-extra');
const { generateScript } = require('./script_agent');

// ─── Constants ────────────────────────────────────────────────────────────────

const MODEL        = 'claude-opus-4-6';
const MAX_RETRIES  = 3;           // API-level retries per call (rate limits, network)
const MAX_REVISIONS = 2;          // max script revision loops before forced reject
const SCRIPTS_DIR  = path.join(__dirname, '../scripts');
const APPROVED_DIR = path.join(SCRIPTS_DIR, 'approved');

// ─── Scoring Prompt ───────────────────────────────────────────────────────────
// Embedded verbatim as specified. Do not modify the schema inside.

const SCORING_SYSTEM_PROMPT =
  'You are a Viral Prediction Agent. Score this video script on viral potential. ' +
  'Analyse: hook strength (30%), retention structure (25%), emotional impact (15%), ' +
  'clarity (10%), shareability (10%), novelty (10%). ' +
  'Decision rules: score ≥ 80 → produce, score 60–79 → revise, score < 60 → reject. ' +
  'Output ONLY valid JSON:\n' +
  '{\n' +
  '  viral_score: number,\n' +
  '  retention_score: number,\n' +
  '  ctr_score: number,\n' +
  '  engagement_score: number,\n' +
  '  strengths: [string],\n' +
  '  weaknesses: [string],\n' +
  '  improvement_suggestions: [string],\n' +
  '  decision: \'produce\'|\'revise\'|\'reject\'\n' +
  '}';

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Robustly extract a JSON object from a raw text string.
 * Handles: plain JSON, ```json...``` fences, and stray preamble text.
 */
function extractJSON(text) {
  const trimmed = text.trim();

  try { return JSON.parse(trimmed); } catch (_) {}

  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch (_) {}
  }

  const braceStart = trimmed.indexOf('{');
  const braceEnd   = trimmed.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd > braceStart) {
    try { return JSON.parse(trimmed.slice(braceStart, braceEnd + 1)); } catch (_) {}
  }

  throw new SyntaxError(
    `Could not extract valid JSON from response.\nFirst 300 chars: ${trimmed.slice(0, 300)}`
  );
}

/**
 * Returns true for errors that are safe to retry with exponential backoff.
 */
function isRetryable(error) {
  if (error instanceof AnthropicPkg.RateLimitError)           return true;
  if (error instanceof AnthropicPkg.InternalServerError)      return true;
  if (error instanceof AnthropicPkg.APIConnectionError)       return true;
  if (error instanceof AnthropicPkg.APIConnectionTimeoutError) return true;
  if (error instanceof SyntaxError)                           return true;
  return false;
}

/**
 * Load an input item — either a file path string or an already-parsed object.
 * Returns { scriptData, fileName } where fileName is used for saving output.
 *
 * @param {string|object} input
 * @returns {{ scriptData: object, fileName: string }}
 */
async function resolveInput(input) {
  if (typeof input === 'string') {
    // Treat as a file path (absolute or relative to project root)
    const filePath = path.isAbsolute(input)
      ? input
      : path.join(__dirname, '..', input);
    const scriptData = await fs.readJson(filePath);
    return { scriptData, fileName: path.basename(filePath) };
  }

  if (typeof input === 'object' && input !== null) {
    // Already parsed — derive a file name from video_id or title
    const slug = (input.video_title ?? input.title ?? 'script')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48);
    const fileName = `${slug}_${(input.video_id ?? 'unknown').slice(0, 8)}.json`;
    return { scriptData: input, fileName };
  }

  throw new TypeError(`resolveInput: expected a file path string or script object, got ${typeof input}`);
}

// ─── Core: Score a Script ─────────────────────────────────────────────────────

/**
 * Send a script JSON to Claude for viral scoring.
 * Streams the response; retries on transient errors.
 *
 * @param {object} scriptData   - Parsed script JSON
 * @param {number} attempt      - Internal retry counter (starts at 0)
 * @returns {Promise<object>}   - Parsed scoring result JSON
 */
async function scoreScript(scriptData, attempt = 0) {
  const client = getClient();

  // Condense the script for scoring — keep the fields that matter most to virality
  const scriptSummary = {
    video_title:    scriptData.video_title   ?? scriptData.title,
    format:         scriptData.format,
    hook:           scriptData.hook,
    scenes:         (scriptData.scenes ?? []).map(s => ({
      type:       s.type,
      text:       s.text,
      voice_line: s.voice_line,
    })),
    viral_triggers: scriptData.viral_triggers,
    packaging:      scriptData.packaging,
  };

  const userPrompt =
    'Score the following English-learning YouTube Short script for viral potential.\n\n' +
    '```json\n' + JSON.stringify(scriptSummary, null, 2) + '\n```\n\n' +
    'Output ONLY the raw JSON scoring object — no markdown, no code fences, no explanation.';

  console.log(`    ↳ Scoring via Claude ${MODEL} (attempt ${attempt + 1}/${MAX_RETRIES + 1})...`);

  try {
    const stream = client.messages.stream({
      model:    MODEL,
      max_tokens: 2048,
      thinking: { type: 'adaptive' },
      system:   SCORING_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const message = await stream.finalMessage();

    const textBlock = message.content.find(block => block.type === 'text');
    if (!textBlock || !textBlock.text) {
      const blockTypes = message.content.map(b => b.type).join(', ');
      throw new Error(
        `No text block in scoring response. Blocks: [${blockTypes}]. ` +
        `stop_reason=${message.stop_reason}`
      );
    }

    if (message.stop_reason === 'max_tokens') {
      throw new Error('Scoring response was truncated (max_tokens). Retrying.');
    }

    const scoring = extractJSON(textBlock.text);

    // Validate required fields
    const required = ['viral_score', 'retention_score', 'ctr_score',
                      'engagement_score', 'strengths', 'weaknesses',
                      'improvement_suggestions', 'decision'];
    for (const field of required) {
      if (!(field in scoring)) {
        throw new SyntaxError(`Scoring JSON is missing required field: "${field}"`);
      }
    }

    if (!['produce', 'revise', 'reject'].includes(scoring.decision)) {
      throw new SyntaxError(
        `Invalid decision value: "${scoring.decision}". ` +
        'Must be "produce", "revise", or "reject".'
      );
    }

    // Enforce decision rules in case the model drifts from the threshold logic
    const score = Number(scoring.viral_score);
    if (score >= 80 && scoring.decision !== 'produce') {
      console.warn(`    ⚠  Score ${score} ≥ 80 but decision="${scoring.decision}" — correcting to "produce".`);
      scoring.decision = 'produce';
    } else if (score >= 60 && score < 80 && scoring.decision === 'produce') {
      console.warn(`    ⚠  Score ${score} in 60–79 range but decision="produce" — correcting to "revise".`);
      scoring.decision = 'revise';
    } else if (score < 60 && scoring.decision !== 'reject') {
      console.warn(`    ⚠  Score ${score} < 60 but decision="${scoring.decision}" — correcting to "reject".`);
      scoring.decision = 'reject';
    }

    return scoring;

  } catch (error) {
    const exhausted = attempt >= MAX_RETRIES;
    const retryable = isRetryable(error);

    if (!exhausted && retryable) {
      const backoffMs = Math.pow(2, attempt) * 1500;
      const label = error instanceof AnthropicPkg.APIError
        ? `${error.constructor.name} [HTTP ${error.status}]`
        : error.constructor.name;

      console.warn(`    ⚠  ${label}: ${error.message.slice(0, 120)}`);
      console.log(`    ↺  Retrying score in ${(backoffMs / 1000).toFixed(1)}s...`);
      await sleep(backoffMs);
      return scoreScript(scriptData, attempt + 1);
    }

    throw error;
  }
}

// ─── Core: Revise a Script ────────────────────────────────────────────────────

/**
 * Re-generate a script using the original topic + format, injecting the
 * improvement_suggestions from the previous scoring round into the prompt.
 *
 * Delegates to generateScript() from script_agent.js — same model, same
 * streaming pattern. The suggestions are appended to the user prompt as
 * a "REVISION NOTES" section so the model knows what to fix.
 *
 * @param {object} originalScript  - The script that scored "revise"
 * @param {string[]} suggestions   - improvement_suggestions from scoring
 * @param {number} revisionNum     - 1-based revision attempt number
 * @returns {Promise<object>}      - New script JSON
 */
async function reviseScript(originalScript, suggestions, revisionNum) {
  const topic  = originalScript.video_title ?? originalScript.title ?? 'Unknown Topic';
  const format = originalScript.format ?? 'Fail → Fix Stickman Skits';

  console.log(`    ↳ Revision ${revisionNum}: regenerating "${topic}" (${format})...`);

  // We monkey-patch the topic string to carry revision notes into generateScript().
  // generateScript() embeds the full topic in its user prompt, so by appending
  // a structured block here the model sees the feedback without altering script_agent.js.
  const revisedTopic =
    `${topic}\n\n` +
    `REVISION NOTES (apply all of these to improve the script):\n` +
    suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n');

  return generateScript(revisedTopic, format);
}

// ─── Core: Evaluate One Script (score → revise loop) ─────────────────────────

/**
 * Score a single script, revise if needed (up to MAX_REVISIONS times),
 * and return the final outcome.
 *
 * @param {object} scriptData
 * @param {string} fileName      - Used in log output and for saving approved files
 * @returns {Promise<{
 *   status: 'produced'|'rejected',
 *   fileName: string,
 *   finalScript: object|null,
 *   finalScoring: object,
 *   revisions: number,
 *   history: Array<{ revision: number, scoring: object }>
 * }>}
 */
async function evaluateScript(scriptData, fileName) {
  let currentScript = scriptData;
  let revisions     = 0;
  const history     = [];

  for (let round = 0; round <= MAX_REVISIONS; round++) {
    const isRevisionRound = round > 0;

    console.log(
      isRevisionRound
        ? `  [revision ${round}/${MAX_REVISIONS}] Scoring revised script...`
        : `  [score]  Analysing "${currentScript.video_title ?? currentScript.title}"...`
    );

    const scoring = await scoreScript(currentScript);
    history.push({ revision: round, scoring });

    const { viral_score, decision } = scoring;

    console.log(
      `  [score]  viral_score=${viral_score}  decision=${decision.toUpperCase()}` +
      (scoring.strengths?.length
        ? `  strengths: ${scoring.strengths.slice(0, 2).join(' / ')}`
        : '')
    );

    if (decision === 'produce') {
      // ── Approved ───────────────────────────────────────────────────────────
      // Attach scoring metadata to the final script object before saving
      const approvedScript = {
        ...currentScript,
        viral_prediction: {
          viral_score:             scoring.viral_score,
          retention_score:         scoring.retention_score,
          ctr_score:               scoring.ctr_score,
          engagement_score:        scoring.engagement_score,
          strengths:               scoring.strengths,
          weaknesses:              scoring.weaknesses,
          improvement_suggestions: scoring.improvement_suggestions,
          decision:                scoring.decision,
          revisions_required:      revisions,
          evaluated_at:            new Date().toISOString(),
        },
      };

      return {
        status:       'produced',
        fileName,
        finalScript:  approvedScript,
        finalScoring: scoring,
        revisions,
        history,
      };
    }

    if (decision === 'reject') {
      // ── Rejected ───────────────────────────────────────────────────────────
      console.log(
        `  ✗ REJECTED  (score=${viral_score}) ` +
        (scoring.weaknesses?.length
          ? `— ${scoring.weaknesses[0]}`
          : '')
      );
      return {
        status:       'rejected',
        fileName,
        finalScript:  null,
        finalScoring: scoring,
        revisions,
        history,
      };
    }

    // decision === 'revise'
    if (round >= MAX_REVISIONS) {
      // Revision cap reached — force reject
      console.log(
        `  ✗ REJECTED after ${MAX_REVISIONS} revision${MAX_REVISIONS !== 1 ? 's' : ''} ` +
        `(score never reached 80).`
      );
      return {
        status:       'rejected',
        fileName,
        finalScript:  null,
        finalScoring: scoring,
        revisions,
        history,
      };
    }

    // ── Revise ─────────────────────────────────────────────────────────────
    revisions++;
    console.log(
      `  ↻ REVISING  (score=${viral_score}, attempt ${revisions}/${MAX_REVISIONS})` +
      (scoring.improvement_suggestions?.length
        ? `\n     → ${scoring.improvement_suggestions[0]}`
        : '')
    );

    try {
      currentScript = await reviseScript(
        currentScript,
        scoring.improvement_suggestions ?? [],
        revisions
      );
    } catch (revErr) {
      console.error(`  ✗ Revision ${revisions} failed: ${revErr.message}`);
      return {
        status:       'rejected',
        fileName,
        finalScript:  null,
        finalScoring: scoring,
        revisions,
        history,
      };
    }
  }

  // Should never reach here — loop always returns inside
  throw new Error('evaluateScript: unexpected loop exit');
}

// ─── Batch Runner ─────────────────────────────────────────────────────────────

/**
 * Process an array of scripts (file paths or parsed objects).
 * Saves approved scripts to scripts/approved/.
 * Saves a batch_summary.json to scripts/approved/ after the run.
 *
 * @param {Array<string|object>} inputs  File paths or script JSON objects
 * @returns {Promise<object>}            Summary JSON
 */
async function runViralBatch(inputs) {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new TypeError('runViralBatch() requires a non-empty array of file paths or script objects.');
  }

  getClient(); // validate API key early

  await fs.ensureDir(APPROVED_DIR);

  const divider = '═'.repeat(62);
  console.log(`\n${divider}`);
  console.log(`  english-made-fun / viral_prediction_agent.js`);
  console.log(`  Model   : ${MODEL} (adaptive thinking)`);
  console.log(`  Batch   : ${inputs.length} script${inputs.length !== 1 ? 's' : ''}`);
  console.log(`  Approved dir : ${APPROVED_DIR}`);
  console.log(`${divider}\n`);

  const summary = {
    run_at:   new Date().toISOString(),
    total:    inputs.length,
    produced: [],   // { fileName, viral_score, revisions }
    rejected: [],   // { fileName, viral_score, reason }
    errors:   [],   // { fileName, error }
  };

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];

    // ── Resolve input ────────────────────────────────────────────────────────
    let scriptData, fileName;
    try {
      ({ scriptData, fileName } = await resolveInput(input));
    } catch (err) {
      const label = typeof input === 'string' ? input : `<object[${i}]>`;
      console.error(`[${i + 1}/${inputs.length}] ✗ Could not load input: ${err.message}`);
      summary.errors.push({ fileName: label, error: err.message });
      continue;
    }

    console.log(`[${i + 1}/${inputs.length}] File   : ${fileName}`);
    console.log(`         Title  : ${scriptData.video_title ?? scriptData.title ?? '(untitled)'}`);
    console.log(`         Format : ${scriptData.format ?? '(unknown)'}`);

    // ── Evaluate ─────────────────────────────────────────────────────────────
    let result;
    try {
      result = await evaluateScript(scriptData, fileName);
    } catch (err) {
      let errorMsg;
      if (err instanceof AnthropicPkg.APIError) {
        errorMsg = `${err.constructor.name} [HTTP ${err.status}]: ${err.message}`;
      } else {
        errorMsg = `${err.constructor.name}: ${err.message}`;
      }
      console.error(`  ✗ ERROR: ${errorMsg}\n`);
      summary.errors.push({ fileName, error: errorMsg });
      continue;
    }

    // ── Handle outcome ───────────────────────────────────────────────────────
    if (result.status === 'produced') {
      // Save approved script
      const outPath = path.join(APPROVED_DIR, fileName);
      await fs.writeJson(outPath, result.finalScript, { spaces: 2 });

      console.log(
        `  ✓ APPROVED → approved/${fileName}` +
        `  (score=${result.finalScoring.viral_score}, revisions=${result.revisions})\n`
      );

      summary.produced.push({
        fileName,
        viral_score:      result.finalScoring.viral_score,
        retention_score:  result.finalScoring.retention_score,
        ctr_score:        result.finalScoring.ctr_score,
        engagement_score: result.finalScoring.engagement_score,
        revisions:        result.revisions,
        approved_path:    outPath,
        strengths:        result.finalScoring.strengths,
      });
    } else {
      // Rejected
      const lastScoring = result.history[result.history.length - 1]?.scoring ?? {};
      console.log('');
      summary.rejected.push({
        fileName,
        viral_score:  lastScoring.viral_score ?? null,
        revisions:    result.revisions,
        weaknesses:   lastScoring.weaknesses ?? [],
        improvement_suggestions: lastScoring.improvement_suggestions ?? [],
      });
    }
  }

  // ── Final summary ─────────────────────────────────────────────────────────
  summary.produced_count = summary.produced.length;
  summary.rejected_count = summary.rejected.length;
  summary.error_count    = summary.errors.length;

  const summaryPath = path.join(APPROVED_DIR, 'batch_summary.json');
  await fs.writeJson(summaryPath, summary, { spaces: 2 });

  const sep = '─'.repeat(62);
  console.log(sep);
  console.log(`  Viral prediction complete:`);
  console.log(`    ✓ Produced : ${summary.produced_count}`);
  console.log(`    ✗ Rejected : ${summary.rejected_count}`);
  console.log(`    ! Errors   : ${summary.error_count}`);
  console.log(`  Summary saved → ${summaryPath}`);

  if (summary.produced.length > 0) {
    console.log('\n  Approved scripts:');
    summary.produced.forEach(({ fileName: fn, viral_score, revisions }) => {
      console.log(`    ✓ ${fn}  (score=${viral_score}, revisions=${revisions})`);
    });
  }

  if (summary.rejected.length > 0) {
    console.log('\n  Rejected scripts:');
    summary.rejected.forEach(({ fileName: fn, viral_score, revisions }) => {
      console.log(
        `    ✗ ${fn}  (score=${viral_score ?? 'n/a'}, revisions=${revisions})`
      );
    });
  }

  if (summary.errors.length > 0) {
    console.log('\n  Errors:');
    summary.errors.forEach(({ fileName: fn, error }) => {
      console.log(`    ! ${fn}  — ${error}`);
    });
  }

  console.log('');
  return summary;
}

// ─── CLI Entry Point ──────────────────────────────────────────────────────────
// When called with no arguments: finds all day*.json files in scripts/
// (excluding anything already in scripts/approved/).
// When called with arguments: treats each argument as a file path.

if (require.main === module) {
  (async () => {
    let inputs = process.argv.slice(2).filter(s => s.trim().length > 0);

    if (inputs.length === 0) {
      // Auto-discover all scripts/day*.json files
      const allFiles = await fs.readdir(SCRIPTS_DIR).catch(() => []);
      inputs = allFiles
        .filter(f => /^day\d+_vid\d+\.json$/.test(f))
        .map(f => path.join(SCRIPTS_DIR, f));

      if (inputs.length === 0) {
        console.error(
          'No script files found in scripts/.\n' +
          'Run `node pipeline/script_agent.js` first to generate scripts,\n' +
          'or pass file paths explicitly:\n' +
          '  node pipeline/viral_prediction_agent.js scripts/day03_vid01.json'
        );
        process.exit(1);
      }

      console.log(`Auto-discovered ${inputs.length} script file(s) in scripts/.`);
    } else {
      console.log(`Running with ${inputs.length} explicit file path(s).`);
    }

    try {
      const summary = await runViralBatch(inputs);
      // Exit 1 if everything was rejected or errored and nothing was produced
      process.exit(summary.produced_count === 0 && inputs.length > 0 ? 1 : 0);
    } catch (err) {
      console.error('\nFatal error:', err.message);
      if (err.stack) console.error(err.stack);
      process.exit(1);
    }
  })();
}

// ─── Module Exports ───────────────────────────────────────────────────────────

module.exports = {
  runViralBatch,
  evaluateScript,
  scoreScript,
  reviseScript,
  SCORING_SYSTEM_PROMPT,
  MAX_REVISIONS,
  APPROVED_DIR,
};
