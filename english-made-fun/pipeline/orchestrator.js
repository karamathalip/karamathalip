/**
 * pipeline/orchestrator.js
 *
 * MASTER ORCHESTRATOR — single entry point for the full english-made-fun pipeline.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *   node pipeline/orchestrator.js              # normal daily run
 *   DRY_RUN=true node pipeline/orchestrator.js # test mode — skips real API calls
 *   node pipeline/orchestrator.js --dry-run    # same as above
 *   node pipeline/orchestrator.js --step=3     # run from step 3 onwards
 *   node pipeline/orchestrator.js --only=5,6   # run only steps 5 and 6
 *
 * ── Pipeline order ────────────────────────────────────────────────────────────
 *   STEP 1  competitor_agent   — Monday only (weekly)
 *   STEP 2  audience_agent     — Monday only (weekly)
 *   STEP 3  script_agent       — daily: generate 5 scripts, inject intelligence
 *   STEP 4  viral_prediction   — score + filter scripts (approve/reject/revise)
 *   STEP 5  image_agent        — generate scene images + thumbnails
 *   STEP 5b thumbnail_compositor— composite text overlays onto thumbnails
 *   STEP 6  voice_agent        — generate voice lines + combined track
 *   STEP 6b whisper_agent      — optional Whisper captions fallback/QA
 *   STEP 7  sfx_agent          — generate sound effects (cached)
 *   STEP 8  render_agent       — render Remotion → MP4, merge audio
 *   STEP 9  upload_agent       — upload to YouTube with scheduling
 *   STEP 10 feedback_agent     — Sunday only (weekly analytics pull)
 *   STEP 10b daily_pulse_agent — daily quick performance check (last 7 days)
 *   STEP 11 revenue_agent      — 1st of month only (monthly monetisation plan)
 *
 * ── Config files read ─────────────────────────────────────────────────────────
 *   config/topics_queue.json           — today's topic strings (array)
 *   config/audience_insights.json      — next_batch_topics (auto-replenish)
 *   config/competitor_insights.json    — hooks_to_use_next_batch
 *   config/feedback_latest.json        — updated_script_instructions
 *
 * ── Output ────────────────────────────────────────────────────────────────────
 *   config/daily_run_log.json           — appended after every run
 *
 * ── DRY_RUN mode ─────────────────────────────────────────────────────────────
 *   Set DRY_RUN=true (env) or pass --dry-run flag.
 *   In dry-run mode: agent functions are called but no real API keys are used.
 *   script_agent still runs (reads .env for ANTHROPIC_API_KEY); other agents
 *   are mocked with placeholder results so the full flow can be verified
 *   without consuming credits.
 */

'use strict';

// ─── Environment ──────────────────────────────────────────────────────────────
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// ─── Imports ──────────────────────────────────────────────────────────────────
const fs = require('fs-extra');

// Pipeline agents — loaded lazily inside each step so a broken agent module
// does not prevent the orchestrator from starting up.
function loadAgent(name) {
  try {
    return require(path.join(__dirname, name));
  } catch (err) {
    throw new Error(`Failed to load agent '${name}': ${err.message}`);
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PROJECT_ROOT    = path.join(__dirname, '..');
const CONFIG_DIR      = path.join(PROJECT_ROOT, 'config');
const TOPICS_QUEUE    = path.join(CONFIG_DIR, 'topics_queue.json');
const DAILY_RUN_LOG   = path.join(CONFIG_DIR, 'daily_run_log.json');
const AUDIENCE_FILE   = path.join(CONFIG_DIR, 'audience_insights.json');
const COMPETITOR_FILE = path.join(CONFIG_DIR, 'competitor_insights.json');
const FEEDBACK_FILE   = path.join(CONFIG_DIR, 'feedback_latest.json');
const PULSE_FILE      = path.join(CONFIG_DIR, 'daily_pulse.json');

/** Number of scripts to generate each daily run. */
const SCRIPTS_PER_RUN = 5;

/** Default topics used when topics_queue.json is empty or missing. */
const FALLBACK_TOPICS = [
  'Present Simple vs Present Continuous',
  'Must vs Have To — Modal Verbs',
  'Countable and Uncountable Nouns',
  'First Conditional — Real Future Situations',
  'Phrasal Verbs with GET',
];

// ─── CLI Flags ────────────────────────────────────────────────────────────────

const ARGS     = process.argv.slice(2);
const DRY_RUN  = process.env.DRY_RUN === 'true' || ARGS.includes('--dry-run');

/** Parse --step=N → run from step N onwards. */
const FROM_STEP_ARG = (() => {
  const a = ARGS.find(a => a.startsWith('--step='));
  return a ? parseInt(a.split('=')[1], 10) : 1;
})();

/** Parse --only=N,M → run only those step numbers. */
const ONLY_STEPS = (() => {
  const a = ARGS.find(a => a.startsWith('--only='));
  return a ? a.split('=')[1].split(',').map(Number) : null;
})();

/** Returns true if we should execute a given step number. */
function shouldRun(stepNum) {
  if (ONLY_STEPS) return ONLY_STEPS.includes(stepNum);
  return stepNum >= FROM_STEP_ARG;
}

// ─── Date Helpers ─────────────────────────────────────────────────────────────

/** 0=Sunday … 6=Saturday */
const TODAY      = new Date();
const DAY_OF_WEEK = TODAY.getDay();
const DATE_OF_MONTH = TODAY.getDate();

const IS_MONDAY  = DAY_OF_WEEK === 1;
const IS_SUNDAY  = DAY_OF_WEEK === 0;
const IS_FIRST_OF_MONTH = DATE_OF_MONTH === 1;

// ─── Logger ───────────────────────────────────────────────────────────────────

const runLog = {
  run_id:     `run_${TODAY.toISOString().slice(0, 10)}_${Date.now()}`,
  started_at: TODAY.toISOString(),
  dry_run:    DRY_RUN,
  steps:      [],
  summary:    {},
};

/**
 * Run a single pipeline step with timing, logging, and error isolation.
 *
 * @param {object} opts
 * @param {number}   opts.num        - Step number (1–11)
 * @param {string}   opts.name       - Display name
 * @param {Function} opts.fn         - Async function to run; must return a result object
 * @param {boolean}  [opts.skip]     - If true, log as skipped and return null
 * @param {string}   [opts.skipReason]
 * @returns {Promise<any>}  The return value of fn(), or null if skipped/failed
 */
async function runStep(opts) {
  const { num, name, fn, skip = false, skipReason = '' } = opts;

  const line  = `${'─'.repeat(60)}`;
  const label = `[STEP ${num}] ${name}`;

  if (!shouldRun(num)) {
    console.log(`\n${line}`);
    console.log(`  ${label} — SKIPPED (not in run range)`);
    runLog.steps.push({ step: num, name, status: 'skipped', reason: 'not in run range' });
    return null;
  }

  if (skip) {
    console.log(`\n${line}`);
    console.log(`  ${label} — SKIPPED${skipReason ? `: ${skipReason}` : ''}`);
    runLog.steps.push({ step: num, name, status: 'skipped', reason: skipReason });
    return null;
  }

  console.log(`\n${line}`);
  console.log(`  ${label}`);
  console.log(`  Started: ${new Date().toISOString()}`);
  if (DRY_RUN) console.log('  [DRY RUN]\n');

  const startMs = Date.now();
  let result = null;
  let status = 'success';
  let errorMsg = null;

  try {
    result = await fn();
    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
    console.log(`\n  ✓ ${label} completed in ${elapsed}s`);
  } catch (err) {
    status   = 'failed';
    errorMsg = err.message ?? String(err);
    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
    console.error(`\n  ✗ ${label} FAILED after ${elapsed}s:`);
    console.error(`    ${errorMsg}`);
    if (err.stack) {
      // Print first 3 stack frames only to keep log readable
      const frames = err.stack.split('\n').slice(1, 4).join('\n');
      console.error(frames);
    }
  }

  runLog.steps.push({
    step:       num,
    name,
    status,
    duration_s: parseFloat(((Date.now() - startMs) / 1000).toFixed(1)),
    ...(errorMsg ? { error: errorMsg } : {}),
    ...(result && typeof result === 'object' ? { output_summary: summariseResult(result) } : {}),
  });

  return result;
}

/**
 * Extract a small flat summary object from a step's result for the log.
 * Handles different result shapes from each agent.
 */
function summariseResult(r) {
  if (!r || typeof r !== 'object') return {};
  const s = {};
  if (r.saved)        s.saved    = Array.isArray(r.saved)    ? r.saved.length    : r.saved;
  if (r.failed)       s.failed   = Array.isArray(r.failed)   ? r.failed.length   : r.failed;
  if (r.produced)     s.produced = Array.isArray(r.produced) ? r.produced.length : r.produced;
  if (r.rejected)     s.rejected = Array.isArray(r.rejected) ? r.rejected.length : r.rejected;
  if (r.processed)    s.processed= Array.isArray(r.processed)? r.processed.length: r.processed;
  if (r.uploaded)     s.uploaded = Array.isArray(r.uploaded) ? r.uploaded.length : r.uploaded;
  if (r.rendered)     s.rendered = Array.isArray(r.rendered) ? r.rendered.length : r.rendered;
  if (r.total !== undefined) s.total = r.total;
  return s;
}

// ─── Topics Queue ─────────────────────────────────────────────────────────────

/**
 * Load today's topics from topics_queue.json.
 * Dequeues up to SCRIPTS_PER_RUN topics and writes the remainder back.
 * Falls back to FALLBACK_TOPICS if the file is empty or missing.
 *
 * @returns {Promise<string[]>}
 */
async function dequeueTopics() {
  await fs.ensureDir(CONFIG_DIR);

  let queue = [];
  try {
    queue = await fs.readJson(TOPICS_QUEUE);
    if (!Array.isArray(queue)) queue = [];
  } catch { queue = []; }

  // Take up to SCRIPTS_PER_RUN from the front of the queue
  const today    = queue.splice(0, SCRIPTS_PER_RUN);
  const topics   = today.length > 0 ? today : [...FALLBACK_TOPICS];

  // Write remaining queue back
  await fs.writeJson(TOPICS_QUEUE, queue, { spaces: 2 });

  console.log(`  Topics dequeued (${topics.length}):`);
  topics.forEach(t => console.log(`    • ${t}`));
  if (queue.length > 0) {
    console.log(`  Queue remaining: ${queue.length} topics`);
  } else {
    console.log('  Queue is now empty — will replenish after uploads.');
  }

  return topics;
}

/**
 * Replenish topics_queue.json after uploads using:
 *   1. audience_insights.json → next_batch_topics
 *   2. competitor_insights.json → recommended_topics_to_dominate
 *
 * Deduplicates against whatever is already in the queue.
 * Appends new topics to the end (does not overwrite).
 *
 * @returns {Promise<number>} number of topics added
 */
async function replenishTopicsQueue() {
  const newTopics = [];

  // Source 1: audience insights
  try {
    const insights = await fs.readJson(AUDIENCE_FILE);
    const topics   = Array.isArray(insights.next_batch_topics)
      ? insights.next_batch_topics
      : [];
    newTopics.push(...topics);
  } catch { /* audience agent hasn't run yet */ }

  // Source 2: competitor insights
  try {
    const compIns  = await fs.readJson(COMPETITOR_FILE);
    const topics   = Array.isArray(compIns.recommended_topics_to_dominate)
      ? compIns.recommended_topics_to_dominate
      : [];
    newTopics.push(...topics);
  } catch { /* competitor agent hasn't run yet */ }

  if (newTopics.length === 0) {
    console.log('  No new topics available for replenishment.');
    return 0;
  }

  // Deduplicate
  let existing = [];
  try { existing = await fs.readJson(TOPICS_QUEUE); } catch { existing = []; }
  if (!Array.isArray(existing)) existing = [];

  const existingSet = new Set(existing.map(t => t.toLowerCase().trim()));
  const toAdd = newTopics.filter(t => !existingSet.has(t.toLowerCase().trim()));

  const updated = [...existing, ...toAdd];
  await fs.writeJson(TOPICS_QUEUE, updated, { spaces: 2 });

  console.log(`  ✓ Topics queue replenished with ${toAdd.length} new topics (${updated.length} total)`);
  return toAdd.length;
}

// ─── Script Generation with Intelligence Injection ────────────────────────────

/**
 * Build an enriched topics list for script_agent.runBatch() that injects
 * performance feedback, audience pain points, and competitor hooks into the
 * topic strings themselves. script_agent embeds the full topic in its user
 * prompt, so appending structured guidance here influences generation without
 * modifying script_agent.js.
 *
 * @param {string[]} topics  Raw topic strings
 * @returns {Promise<string[]>}  Enriched topic strings
 */
async function buildEnrichedTopics(topics) {
  // Load intelligence files (all optional)
  let feedbackInstructions  = null;
  let viralHooks            = [];
  let compHooks             = [];
  let pulseReplicate        = [];
  let pulseAvoid            = [];

  try {
    const fb = await fs.readJson(FEEDBACK_FILE);
    feedbackInstructions = fb.updated_script_instructions ?? null;
  } catch { /* not yet available */ }

  try {
    const aud = await fs.readJson(AUDIENCE_FILE);
    viralHooks = Array.isArray(aud.viral_hooks) ? aud.viral_hooks.slice(0, 3) : [];
  } catch { /* not yet available */ }

  try {
    const comp = await fs.readJson(COMPETITOR_FILE);
    compHooks = Array.isArray(comp.hooks_to_use_next_batch)
      ? comp.hooks_to_use_next_batch.slice(0, 3)
      : [];
  } catch { /* not yet available */ }

  try {
    const pulse = await fs.readJson(PULSE_FILE);
    pulseReplicate = (pulse.replicate ?? []).map(v => v.title).slice(0, 3);
    pulseAvoid     = (pulse.avoid ?? []).map(v => v.title).slice(0, 3);
  } catch { /* not yet available */ }

  // Nothing to inject — return raw topics
  if (!feedbackInstructions && viralHooks.length === 0 && compHooks.length === 0 && pulseReplicate.length === 0 && pulseAvoid.length === 0) {
    return topics;
  }

  // Build a single instruction block to append to each topic
  const parts = [];

  if (feedbackInstructions) {
    parts.push(`PERFORMANCE FEEDBACK: ${feedbackInstructions}`);
  }
  if (viralHooks.length > 0) {
    parts.push(`AUDIENCE HOOKS (use these patterns): ${viralHooks.join(' | ')}`);
  }
  if (compHooks.length > 0) {
    parts.push(`COMPETITOR HOOK PATTERNS (do better): ${compHooks.join(' | ')}`);
  }
  if (pulseReplicate.length > 0) {
    parts.push(`REPLICATE (these performed well recently): ${pulseReplicate.join(' | ')}`);
  }
  if (pulseAvoid.length > 0) {
    parts.push(`AVOID (these underperformed recently): ${pulseAvoid.join(' | ')}`);
  }

  const injection = parts.join('\n');

  return topics.map(topic => `${topic}\n\n${injection}`);
}

// ─── Dry-Run Stubs ────────────────────────────────────────────────────────────
// When DRY_RUN=true, replace real agent calls with instant stubs that return
// plausible result shapes. script_agent still runs for real (uses Claude).

function dryRunStub(stepName, resultShape) {
  return async () => {
    console.log(`  [DRY RUN] ${stepName} — returning mock result`);
    await new Promise(r => setTimeout(r, 200));  // tiny delay for realism
    return resultShape;
  };
}

// ─── Daily Run Log ────────────────────────────────────────────────────────────

async function saveRunLog() {
  await fs.ensureDir(CONFIG_DIR);

  let history = [];
  try { history = await fs.readJson(DAILY_RUN_LOG); } catch { history = []; }
  if (!Array.isArray(history)) history = [];

  // Keep last 30 runs
  history.push(runLog);
  if (history.length > 30) history.splice(0, history.length - 30);

  await fs.writeJson(DAILY_RUN_LOG, history, { spaces: 2 });
}

// ─── Terminal Notification ────────────────────────────────────────────────────

/**
 * Print a final run summary to the terminal.
 * On Windows this also triggers the system bell (BEL character) if available.
 */
function printNotification(stats) {
  const bell = process.platform !== 'win32' ? '\x07' : '';
  const sep  = '═'.repeat(62);

  console.log(`\n${bell}${sep}`);
  console.log(`  ✅ DAILY RUN COMPLETE — ${TODAY.toISOString().slice(0, 10)}`);
  console.log(sep);
  console.log(`  Videos produced : ${stats.produced}`);
  console.log(`  Videos uploaded : ${stats.uploaded}`);
  console.log(`  Videos rejected : ${stats.rejected}`);
  console.log(`  Total duration  : ${stats.durationMinutes}m`);
  if (DRY_RUN) console.log('  Mode            : DRY RUN (no real API calls)');
  console.log(`  Log saved       → ${DAILY_RUN_LOG}`);
  console.log(sep + '\n');
}

// ─── MAIN ORCHESTRATOR ────────────────────────────────────────────────────────

async function run() {
  const runStartMs = Date.now();

  const header = '═'.repeat(62);
  console.log(`\n${header}`);
  console.log(`  english-made-fun / orchestrator.js`);
  console.log(`  Date    : ${TODAY.toISOString().slice(0, 10)}`);
  console.log(`  Day     : ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][DAY_OF_WEEK]}`);
  console.log(`  DryRun  : ${DRY_RUN}`);
  console.log(`  Steps   : ${ONLY_STEPS ? ONLY_STEPS.join(',') : `${FROM_STEP_ARG}–11`}`);
  console.log(header + '\n');

  // ── STEP 1: competitor_agent (Mondays) ──────────────────────────────────────
  await runStep({
    num:        1,
    name:       'competitor_agent (weekly)',
    skip:       !IS_MONDAY,
    skipReason: IS_MONDAY ? '' : `not Monday (today is ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][DAY_OF_WEEK]})`,
    fn: DRY_RUN
      ? dryRunStub('competitor_agent', {
          channels_analysed: 5, videos_analysed: 100,
          hooks_to_use_next_batch: ['stub hook 1', 'stub hook 2'],
        })
      : async () => {
          const { runCompetitorAgent } = loadAgent('./competitor_agent');
          return runCompetitorAgent();
        },
  });

  // ── STEP 2: audience_agent (Mondays) ───────────────────────────────────────
  await runStep({
    num:        2,
    name:       'audience_agent (weekly)',
    skip:       !IS_MONDAY,
    skipReason: IS_MONDAY ? '' : `not Monday`,
    fn: DRY_RUN
      ? dryRunStub('audience_agent', {
          videos_analysed: 5, total_comments_raw: 500,
          next_batch_topics: FALLBACK_TOPICS,
        })
      : async () => {
          const { runAudienceAgent } = loadAgent('./audience_agent');
          return runAudienceAgent();
        },
  });

  // ── STEP 3: script_agent ─────────────────────────────────────────────────
  const topics = await dequeueTopics();
  const enrichedTopics = await buildEnrichedTopics(topics);

  const scriptResult = await runStep({
    num:  3,
    name: 'script_agent (generate scripts)',
    fn: DRY_RUN
      ? dryRunStub('script_agent', {
          saved:  enrichedTopics.map((_, i) => `scripts/day00_vid0${i + 1}.json`),
          failed: [],
        })
      : async () => {
          const { runBatch } = loadAgent('./script_agent');
          return runBatch(enrichedTopics);
        },
  });

  // ── STEP 4: viral_prediction_agent ───────────────────────────────────────
  const viralResult = await runStep({
    num:  4,
    name: 'viral_prediction_agent (score + filter)',
    fn: DRY_RUN
      ? dryRunStub('viral_prediction_agent', {
          produced_count: topics.length,
          rejected_count: 0,
          produced: topics.map((t, i) => ({
            fileName: `day00_vid0${i + 1}.json`,
            viral_score: 85,
          })),
          rejected: [],
        })
      : async () => {
          const { runViralBatch } = loadAgent('./viral_prediction_agent');
          // Pass saved script file paths directly if available
          const filePaths = scriptResult?.saved ?? [];
          return runViralBatch(filePaths.length > 0 ? filePaths : undefined);
        },
  });

  // ── STEP 5: image_agent ──────────────────────────────────────────────────
  await runStep({
    num:  5,
    name: 'image_agent (generate images + thumbnails)',
    fn: DRY_RUN
      ? dryRunStub('image_agent', {
          total_generated: topics.length * 4,
          total_cached: 0, total_reused: 0,
        })
      : async () => {
          const { runImageBatch } = loadAgent('./image_agent');
          return runImageBatch();
        },
  });

  // ── STEP 5b: thumbnail_compositor ─────────────────────────────────────
  await runStep({
    num:  5.5,
    name: 'thumbnail_compositor (text overlays)',
    fn: DRY_RUN
      ? dryRunStub('thumbnail_compositor', { composited: topics.length })
      : async () => {
          const { runThumbnailCompositor } = loadAgent('./thumbnail_compositor');
          return runThumbnailCompositor();
        },
  });

  // ── STEP 6: voice_agent ──────────────────────────────────────────────────
  await runStep({
    num:  6,
    name: 'voice_agent (generate voice lines)',
    fn: DRY_RUN
      ? dryRunStub('voice_agent', { processed: topics.length, failed: 0 })
      : async () => {
          const { runVoiceBatch } = loadAgent('./voice_agent');
          return runVoiceBatch();
        },
  });

  // ── STEP 6.5: whisper_agent ──────────────────────────────────────────────
  await runStep({
    num:  6.5,
    name: 'whisper_agent (optional caption fallback)',
    fn: DRY_RUN
      ? dryRunStub('whisper_agent', {
          processed: 0,
          skipped: topics.length,
          failed: 0,
        })
      : async () => {
          const { runWhisperBatch } = loadAgent('./whisper_agent');
          return runWhisperBatch(undefined, { force: false, preferExisting: true });
        },
  });

  // ── STEP 7: sfx_agent ───────────────────────────────────────────────────
  await runStep({
    num:  7,
    name: 'sfx_agent (generate sound effects)',
    fn: DRY_RUN
      ? dryRunStub('sfx_agent', {
          total_api_calls: 10, total_cache_hits: 2,
        })
      : async () => {
          const { runSfxBatch } = loadAgent('./sfx_agent');
          return runSfxBatch();
        },
  });

  // ── STEP 8: render_agent ─────────────────────────────────────────────────
  const renderResult = await runStep({
    num:  8,
    name: 'render_agent (Remotion render + FFmpeg merge)',
    fn: DRY_RUN
      ? dryRunStub('render_agent', {
          rendered: topics.map((_, i) => ({
            video_id:  `dry-run-${i}`,
            output_path: `output/final/dry-run-${i}_final.mp4`,
          })),
          failed: [],
        })
      : async () => {
          const { runRenderBatch } = loadAgent('./render_agent');
          return runRenderBatch();
        },
  });

  // ── STEP 9: upload_agent ─────────────────────────────────────────────────
  const uploadResult = await runStep({
    num:  9,
    name: 'upload_agent (upload to YouTube)',
    fn: DRY_RUN
      ? dryRunStub('upload_agent', {
          uploaded: (renderResult?.rendered ?? []).map(r => ({
            video_id:   r.video_id,
            youtube_id: 'dry-run-yt-id',
            url:        'https://youtube.com/shorts/dry-run',
          })),
          failed: [],
        })
      : async () => {
          const { runUploadBatch } = loadAgent('./upload_agent');
          return runUploadBatch();
        },
  });

  // After uploads: replenish the topics queue from intelligence files
  console.log('\n  Replenishing topics queue...');
  const added = await replenishTopicsQueue();
  runLog.steps.push({
    step: 9.5, name: 'topics_queue_replenish',
    status: 'success', topics_added: added,
  });

  // ── STEP 10: feedback_agent (Sundays) ────────────────────────────────────
  await runStep({
    num:        10,
    name:       'feedback_agent (weekly analytics)',
    skip:       !IS_SUNDAY,
    skipReason: IS_SUNDAY ? '' : `not Sunday`,
    fn: DRY_RUN
      ? dryRunStub('feedback_agent', {
          videos_analysed: 5,
          winning_patterns: ['stub pattern'],
        })
      : async () => {
          const { runFeedbackAgent } = loadAgent('./feedback_agent');
          return runFeedbackAgent();
        },
  });

  // ── STEP 10b: daily_pulse_agent (daily) ───────────────────────────────
  await runStep({
    num:        10.5,
    name:       'daily_pulse_agent (quick performance check)',
    fn: DRY_RUN
      ? dryRunStub('daily_pulse_agent', {
          videos_checked: 3,
          replicate: [], avoid: [], neutral: [],
        })
      : async () => {
          const { runDailyPulse } = loadAgent('./daily_pulse_agent');
          return runDailyPulse();
        },
  });

  // ── STEP 11: revenue_agent (1st of month) ───────────────────────────────
  await runStep({
    num:        11,
    name:       'revenue_agent (monthly plan + CTA injection)',
    skip:       !IS_FIRST_OF_MONTH,
    skipReason: IS_FIRST_OF_MONTH ? '' : `not 1st of month (today is ${DATE_OF_MONTH}th)`,
    fn: DRY_RUN
      ? dryRunStub('revenue_agent', {
          current_stage: 'early',
          cta_schedule:  [],
        })
      : async () => {
          const { runRevenueAgent } = loadAgent('./revenue_agent');
          return runRevenueAgent();
        },
  });

  // ── Compute final stats ──────────────────────────────────────────────────
  const durationMinutes = Math.ceil((Date.now() - runStartMs) / 60000);

  const produced = viralResult?.produced_count
    ?? viralResult?.produced?.length
    ?? scriptResult?.saved?.length
    ?? 0;

  const rejected = viralResult?.rejected_count
    ?? viralResult?.rejected?.length
    ?? 0;

  const uploaded = uploadResult?.uploaded?.length
    ?? uploadResult?.total
    ?? 0;

  const stats = { produced, uploaded, rejected, durationMinutes };
  runLog.summary = {
    ...stats,
    completed_at: new Date().toISOString(),
    steps_run:    runLog.steps.filter(s => s.status !== 'skipped').length,
    steps_failed: runLog.steps.filter(s => s.status === 'failed').length,
  };
  runLog.finished_at = new Date().toISOString();

  // ── Save run log ─────────────────────────────────────────────────────────
  await saveRunLog();

  // ── Terminal notification ─────────────────────────────────────────────────
  printNotification(stats);

  return runLog;
}

// ─── CLI Entry Point ──────────────────────────────────────────────────────────

if (require.main === module) {
  run()
    .then(log => {
      const failed = (log.steps ?? []).filter(s => s.status === 'failed').length;
      process.exit(failed > 0 ? 1 : 0);
    })
    .catch(err => {
      // Fatal: something crashed outside a step boundary
      console.error('\n[ORCHESTRATOR FATAL]', err.message);
      if (err.stack) console.error(err.stack);

      runLog.fatal_error  = err.message;
      runLog.finished_at  = new Date().toISOString();
      runLog.summary      = { error: err.message };

      saveRunLog().catch(() => {}).finally(() => process.exit(1));
    });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  run,
  runStep,
  dequeueTopics,
  replenishTopicsQueue,
  buildEnrichedTopics,
  TOPICS_QUEUE,
  DAILY_RUN_LOG,
  SCRIPTS_PER_RUN,
};
