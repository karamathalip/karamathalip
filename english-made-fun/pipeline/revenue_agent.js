/**
 * pipeline/revenue_agent.js
 *
 * Reads analytics, audience insights, and upload data to generate a concrete
 * monetisation plan via Claude, then automatically injects the correct CTA
 * into the next batch of approved script JSONs.
 *
 * ── Prerequisites ─────────────────────────────────────────────────────────────
 *   .env: ANTHROPIC_API_KEY, YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET,
 *         YOUTUBE_REFRESH_TOKEN (for subscriber count lookup)
 *
 * ── Data flow ─────────────────────────────────────────────────────────────────
 *   config/analytics_log.json    \
 *   config/audience_insights.json >→ Claude claude-opus-4-6 → config/revenue_plan.json
 *   config/upload_log.json       /
 *   YouTube API (subscriber count) → stage detection (early/growing/scaled)
 *   revenue_plan.json.cta_schedule → injected into next approved script JSONs
 *
 * ── Channel stages ─────────────────────────────────────────────────────────────
 *   early   :  0–10K subscribers
 *   growing : 10K–100K subscribers
 *   scaled  : 100K+ subscribers
 *
 * ── CLI usage ─────────────────────────────────────────────────────────────────
 *   node pipeline/revenue_agent.js               # generate plan + inject CTAs
 *   node pipeline/revenue_agent.js --plan-only   # generate plan, skip injection
 *   node pipeline/revenue_agent.js --inject-only # inject CTAs from existing plan
 *   node pipeline/revenue_agent.js --show-plan
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { google }   = require('googleapis');
const AnthropicPkg = require('@anthropic-ai/sdk');
const Anthropic    = AnthropicPkg.default ?? AnthropicPkg;
const fs           = require('fs-extra');

// ─── Constants ────────────────────────────────────────────────────────────────

const PROJECT_ROOT     = path.join(__dirname, '..');
const CONFIG_DIR       = path.join(PROJECT_ROOT, 'config');
const APPROVED_DIR     = path.join(PROJECT_ROOT, 'scripts', 'approved');

const ANALYTICS_LOG   = path.join(CONFIG_DIR, 'analytics_log.json');
const AUDIENCE_FILE   = path.join(CONFIG_DIR, 'audience_insights.json');
const UPLOAD_LOG      = path.join(CONFIG_DIR, 'upload_log.json');
const REVENUE_PLAN    = path.join(CONFIG_DIR, 'revenue_plan.json');

const MODEL         = 'claude-opus-4-6';
const MAX_RETRIES   = 3;
const RETRY_BASE_MS = 1500;

// Subscriber count thresholds for stage detection
const STAGE_EARLY_MAX   = 10_000;
const STAGE_GROWING_MAX = 100_000;

// ─── Embedded Revenue Prompt ──────────────────────────────────────────────────

const REVENUE_SYSTEM_PROMPT =
  'You are a Revenue Optimisation Agent for a YouTube English learning channel. ' +
  'Based on the performance and audience data provided, generate a concrete ' +
  'monetisation plan. Include: current stage strategy, top 3 revenue opportunities ' +
  'ranked by effort vs return, specific product ideas (with suggested price points), ' +
  'CTA rotation schedule for the next 30 videos (which videos get which CTA), ' +
  'affiliate product recommendations (English learning apps/tools with affiliate programs), ' +
  'funnel structure (lead magnet → email sequence → paid product). Output ONLY valid JSON:\n' +
  '{\n' +
  '  current_stage: string,\n' +
  '  stage_strategy: string,\n' +
  '  top_revenue_opportunities: [{opportunity: string, effort: string, monthly_estimate: string}],\n' +
  '  product_ideas: [{name: string, price: string, format: string, audience_evidence: string}],\n' +
  '  cta_schedule: [{video_number: number, cta_type: string, cta_text: string}],\n' +
  '  affiliate_recommendations: [{product: string, program_url: string, commission: string}],\n' +
  '  funnel_structure: {lead_magnet: string, email_sequence: [string], paid_product: string}\n' +
  '}';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function isRetryable(err) {
  if (err instanceof AnthropicPkg.RateLimitError)            return true;
  if (err instanceof AnthropicPkg.InternalServerError)       return true;
  if (err instanceof AnthropicPkg.APIConnectionError)        return true;
  if (err instanceof AnthropicPkg.APIConnectionTimeoutError) return true;
  if (err instanceof SyntaxError)                            return true;
  return false;
}

function extractJSON(text) {
  const t = text.trim();
  try { return JSON.parse(t); } catch (_) {}
  const fence = t.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fence) { try { return JSON.parse(fence[1].trim()); } catch (_) {} }
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s !== -1 && e > s) { try { return JSON.parse(t.slice(s, e + 1)); } catch (_) {} }
  throw new SyntaxError(`Could not extract JSON. Preview: ${t.slice(0, 300)}`);
}

function buildOAuth2Client() {
  const { YOUTUBE_CLIENT_ID: id, YOUTUBE_CLIENT_SECRET: secret, YOUTUBE_REFRESH_TOKEN: token } = process.env;
  if (!id || !secret || !token) {
    throw new Error('Missing YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, or YOUTUBE_REFRESH_TOKEN');
  }
  const oauth2 = new google.auth.OAuth2(id, secret, 'urn:ietf:wg:oauth:2.0:oob');
  oauth2.setCredentials({ refresh_token: token });
  return oauth2;
}

// ─── Channel Stage Detector ───────────────────────────────────────────────────

/**
 * Fetch the authenticated channel's subscriber count from the YouTube Data API
 * and return the channel stage string.
 *
 * @returns {Promise<{ stage: string, subscriberCount: number }>}
 */
async function detectChannelStage() {
  try {
    const auth = buildOAuth2Client();
    const yt   = google.youtube({ version: 'v3', auth });

    const res = await yt.channels.list({
      part: ['statistics'],
      mine: true,
    });

    const stats = res.data.items?.[0]?.statistics;
    const count = parseInt(stats?.subscriberCount ?? '0', 10);

    let stage;
    if (count < STAGE_EARLY_MAX)   { stage = 'early'; }
    else if (count < STAGE_GROWING_MAX) { stage = 'growing'; }
    else                            { stage = 'scaled'; }

    console.log(`  Subscribers : ${count.toLocaleString()}  → stage: ${stage}`);
    return { stage, subscriberCount: count };

  } catch (err) {
    // Non-fatal: default to early stage if API fails
    console.warn(`  ⚠  Could not fetch subscriber count: ${err.message}`);
    console.warn('     Defaulting to "early" stage.');
    return { stage: 'early', subscriberCount: 0 };
  }
}

// ─── Data Loader ─────────────────────────────────────────────────────────────

/**
 * Load analytics, audience insights, and upload log.
 * Returns a combined data object for Claude.
 *
 * Missing files are noted but do not crash the run — Claude generates a
 * plan based on whatever data is available.
 *
 * @returns {Promise<object>}
 */
async function loadAllData() {
  const result = {};
  const missing = [];

  // Analytics log
  try {
    const raw = await fs.readJson(ANALYTICS_LOG);
    result.analytics = raw.videos ?? raw;
    console.log(`  ✓ analytics_log.json (${(result.analytics ?? []).length} videos)`);
  } catch {
    missing.push('analytics_log.json — run feedback_agent.js first');
    result.analytics = [];
  }

  // Audience insights
  try {
    result.audience = await fs.readJson(AUDIENCE_FILE);
    console.log(`  ✓ audience_insights.json`);
  } catch {
    missing.push('audience_insights.json — run audience_agent.js first');
    result.audience = null;
  }

  // Upload log
  try {
    result.uploads = await fs.readJson(UPLOAD_LOG);
    const uploaded = (result.uploads ?? []).filter(e => e.status === 'uploaded');
    console.log(`  ✓ upload_log.json (${uploaded.length} uploaded)`);
    result.uploadedCount = uploaded.length;
  } catch {
    missing.push('upload_log.json — run upload_agent.js first');
    result.uploads = [];
    result.uploadedCount = 0;
  }

  if (missing.length > 0) {
    console.warn('\n  ⚠  Missing data sources (plan will be less accurate):');
    missing.forEach(m => console.warn(`    • ${m}`));
    console.log('');
  }

  return result;
}

// ─── Claude Revenue Analysis ──────────────────────────────────────────────────

/**
 * Send combined data to Claude and receive a concrete revenue plan.
 *
 * @param {object} data    - { analytics, audience, uploads, uploadedCount, stage, subscriberCount }
 * @param {number} [attempt]
 * @returns {Promise<object>}  Revenue plan JSON
 */
async function generateRevenuePlan(data, attempt = 0) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set in .env');

  const client = new Anthropic({ apiKey });

  // Build a concise payload
  const analyticsSnapshot = (data.analytics ?? []).slice(0, 20).map(v => ({
    title:            v.title,
    views:            v.views,
    avg_retention:    v.averageViewPercentage,
    avg_duration_s:   v.averageViewDuration,
    estimated_minutes: v.estimatedMinutesWatched,
    likes:            v.likes,
    comments:         v.comments,
    shares:           v.shares,
  }));

  const audienceSnapshot = data.audience ? {
    pain_points:          (data.audience.pain_points ?? []).slice(0, 5),
    product_opportunities: (data.audience.product_opportunities ?? []).slice(0, 5),
    audience_segments:    data.audience.audience_segments ?? [],
    viral_hooks:          (data.audience.viral_hooks ?? []).slice(0, 5),
  } : null;

  const payload = {
    channel_stage:       data.stage,
    subscriber_count:    data.subscriberCount,
    videos_uploaded:     data.uploadedCount,
    analytics_snapshot:  analyticsSnapshot,
    audience_snapshot:   audienceSnapshot,
  };

  const userPrompt =
    `Generate a concrete monetisation plan for this English learning YouTube Shorts channel.\n\n` +
    `Channel data:\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n\n` +
    `The channel is in the "${data.stage}" stage (${data.subscriberCount.toLocaleString()} subscribers). ` +
    `The cta_schedule must cover exactly 30 videos, numbered 1–30, with a rotating mix of CTA types ` +
    `appropriate for this stage. Output ONLY the raw JSON object.`;

  console.log(`  → Sending to Claude ${MODEL} (attempt ${attempt + 1})...`);

  try {
    const stream  = client.messages.stream({
      model:      MODEL,
      max_tokens: 6000,
      thinking:   { type: 'adaptive' },
      system:     REVENUE_SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: userPrompt }],
    });

    const message   = await stream.finalMessage();
    const textBlock = message.content.find(b => b.type === 'text');
    if (!textBlock?.text) throw new Error(`No text block. stop_reason=${message.stop_reason}`);

    return extractJSON(textBlock.text);

  } catch (error) {
    if (attempt < MAX_RETRIES && isRetryable(error)) {
      const backoffMs = Math.pow(2, attempt) * RETRY_BASE_MS;
      console.warn(`  ⚠  ${error.constructor.name}: ${error.message.slice(0, 100)}`);
      console.log(`  ↺  Retrying in ${(backoffMs / 1000).toFixed(1)}s...`);
      await sleep(backoffMs);
      return generateRevenuePlan(data, attempt + 1);
    }
    throw error;
  }
}

// ─── CTA Injection ────────────────────────────────────────────────────────────

/**
 * SKIP files list — summary JSONs in the approved dir that are not scripts
 */
const APPROVED_SKIP = new Set([
  'batch_summary.json', 'voice_summary.json', 'sfx_summary.json',
  'image_summary.json', 'render_log.json',
]);

/**
 * Inject CTAs from the revenue plan's cta_schedule into approved script JSONs.
 *
 * Matching: cta_schedule is ordered 1–30. We iterate approved scripts in
 * file-system order and assign the next CTA slot to each script that hasn't
 * yet had a CTA injected (or whose CTA slot has changed).
 *
 * The CTA is written into:
 *   script.cta = { type: cta_type, text: cta_text, injected_by: "revenue_agent" }
 *
 * Also updates the last scene's voice_line to append the CTA text (if the
 * scene type is "CTA" or it's the final scene).
 *
 * @param {object[]} ctaSchedule  Array of { video_number, cta_type, cta_text }
 * @returns {Promise<number>}     Number of scripts updated
 */
async function injectCTAs(ctaSchedule) {
  if (!Array.isArray(ctaSchedule) || ctaSchedule.length === 0) {
    console.warn('  ⚠  No cta_schedule in revenue plan — skipping CTA injection.');
    return 0;
  }

  const files = (await fs.readdir(APPROVED_DIR).catch(() => []))
    .filter(f => f.endsWith('.json') && !APPROVED_SKIP.has(f))
    .sort();  // consistent ordering

  let updated = 0;

  for (let i = 0; i < files.length; i++) {
    const scriptPath = path.join(APPROVED_DIR, files[i]);
    // Use a cyclic schedule: if we have more scripts than CTA entries, wrap around
    const ctaEntry = ctaSchedule[i % ctaSchedule.length];
    if (!ctaEntry) continue;

    let scriptData;
    try { scriptData = await fs.readJson(scriptPath); } catch { continue; }

    const existingCta = scriptData.cta;
    // Skip if CTA already injected with the same type and text
    if (
      existingCta &&
      existingCta.type === ctaEntry.cta_type &&
      existingCta.text === ctaEntry.cta_text
    ) {
      continue;
    }

    // Inject CTA object
    scriptData.cta = {
      type:         ctaEntry.cta_type,
      text:         ctaEntry.cta_text,
      video_number: ctaEntry.video_number,
      injected_by:  'revenue_agent',
      injected_at:  new Date().toISOString(),
    };

    // Find and update the CTA scene (last scene or scene with type==="CTA")
    const scenes = scriptData.scenes ?? [];
    let ctaSceneIdx = scenes.findIndex(s =>
      (s.type ?? '').toLowerCase() === 'cta'
    );
    if (ctaSceneIdx === -1) ctaSceneIdx = scenes.length - 1;

    if (ctaSceneIdx >= 0 && scenes[ctaSceneIdx]) {
      const ctaScene = { ...scenes[ctaSceneIdx] };

      // Append CTA text to voice_line
      const existingLine = (ctaScene.voice_line ?? ctaScene.text ?? '').trim();
      const ctaLine      = ctaEntry.cta_text.trim();

      if (!existingLine.includes(ctaLine)) {
        ctaScene.voice_line = existingLine
          ? `${existingLine} ${ctaLine}`
          : ctaLine;
      }

      ctaScene.cta_injected = true;
      scenes[ctaSceneIdx] = ctaScene;
      scriptData.scenes = scenes;
    }

    await fs.writeJson(scriptPath, scriptData, { spaces: 2 });
    updated++;

    console.log(
      `    ✓ ${files[i]}  →  [${ctaEntry.cta_type}] "${ctaEntry.cta_text.slice(0, 60)}…"`
    );
  }

  return updated;
}

// ─── Show Plan ────────────────────────────────────────────────────────────────

async function showPlan() {
  try {
    const plan = await fs.readJson(REVENUE_PLAN);
    console.log('\nLatest revenue plan:\n');
    console.log(JSON.stringify(plan, null, 2));
  } catch {
    console.log('\nNo revenue_plan.json found. Run revenue_agent.js first.\n');
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

/**
 * Full run: load data → detect stage → Claude analysis → save plan → inject CTAs.
 * Called monthly by the orchestrator.
 *
 * @param {{ planOnly?: boolean, injectOnly?: boolean }} [options]
 * @returns {Promise<object>} revenue plan JSON
 */
async function runRevenueAgent(options = {}) {
  const { planOnly = false, injectOnly = false } = options;

  const divider = '═'.repeat(62);
  console.log(`\n${divider}`);
  console.log(`  english-made-fun / revenue_agent.js`);
  console.log(`  Model : ${MODEL}`);
  if (planOnly)   console.log(`  Mode  : plan-only (no CTA injection)`);
  if (injectOnly) console.log(`  Mode  : inject-only (skip plan generation)`);
  console.log(`${divider}\n`);

  let plan;

  if (!injectOnly) {
    // Load all data
    console.log('  Loading data sources...\n');
    const data = await loadAllData();

    // Detect channel stage
    console.log('\n  Detecting channel stage...');
    const { stage, subscriberCount } = await detectChannelStage();
    data.stage           = stage;
    data.subscriberCount = subscriberCount;

    console.log('');

    // Claude analysis
    plan = await generateRevenuePlan(data);
    plan.generated_at     = new Date().toISOString();
    plan.channel_stage    = stage;
    plan.subscriber_count = subscriberCount;

    await fs.ensureDir(CONFIG_DIR);
    await fs.writeJson(REVENUE_PLAN, plan, { spaces: 2 });

    const sep = '─'.repeat(62);
    console.log(`\n${sep}`);
    console.log(`  ✓ Revenue plan saved → ${REVENUE_PLAN}`);
    console.log(`  Stage                    : ${plan.current_stage ?? stage}`);
    console.log(`  Revenue opportunities    : ${(plan.top_revenue_opportunities ?? []).length}`);
    console.log(`  Product ideas            : ${(plan.product_ideas ?? []).length}`);
    console.log(`  CTA schedule entries     : ${(plan.cta_schedule ?? []).length}`);
    console.log(`  Affiliate recommendations: ${(plan.affiliate_recommendations ?? []).length}`);
    console.log('\n  Top revenue opportunity:');
    const top = (plan.top_revenue_opportunities ?? [])[0];
    if (top) {
      console.log(`    ${top.opportunity}`);
      console.log(`    Effort: ${top.effort}  |  Est. monthly: ${top.monthly_estimate}`);
    }
    console.log('\n  Stage strategy:');
    console.log(`    ${(plan.stage_strategy ?? '—').slice(0, 200)}`);

  } else {
    // Inject-only: load existing plan
    try {
      plan = await fs.readJson(REVENUE_PLAN);
      console.log(`  ✓ Loaded existing revenue plan (${plan.generated_at ?? 'unknown date'})\n`);
    } catch {
      throw new Error(`No revenue_plan.json found at ${REVENUE_PLAN}. Run without --inject-only first.`);
    }
  }

  // Inject CTAs into approved scripts
  if (!planOnly) {
    console.log('\n  Injecting CTAs into approved scripts...');
    const updatedCount = await injectCTAs(plan.cta_schedule ?? []);
    console.log(`  ✓ CTAs injected into ${updatedCount} script(s)`);
  }

  console.log('');
  return plan;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    if (args.includes('--show-plan'))    { await showPlan(); process.exit(0); }

    const planOnly   = args.includes('--plan-only');
    const injectOnly = args.includes('--inject-only');

    try {
      await runRevenueAgent({ planOnly, injectOnly });
      process.exit(0);
    } catch (err) {
      console.error('\nFatal error:', err.message);
      if (err.stack) console.error(err.stack);
      process.exit(1);
    }
  })();
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  runRevenueAgent,
  generateRevenuePlan,
  detectChannelStage,
  injectCTAs,
  loadAllData,
  showPlan,
  REVENUE_PLAN,
  REVENUE_SYSTEM_PROMPT,
  STAGE_EARLY_MAX,
  STAGE_GROWING_MAX,
};
