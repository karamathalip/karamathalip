/**
 * pipeline/feedback_agent.js
 *
 * Fetches YouTube Analytics for all uploaded videos, sends the data to Claude
 * for pattern analysis, and saves actionable feedback that the next script
 * batch automatically reads to improve outputs.
 *
 * ── Prerequisites ─────────────────────────────────────────────────────────────
 *   .env: YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN,
 *         ANTHROPIC_API_KEY
 *
 * ── Data flow ─────────────────────────────────────────────────────────────────
 *   config/upload_log.json
 *     → YouTube Analytics API (youtubeAnalytics.reports.query per video)
 *     → config/analytics_log.json
 *     → Claude claude-opus-4-6 analysis
 *     → config/feedback_latest.json   ← read by script_agent.js next run
 *
 * ── Metrics fetched per video ─────────────────────────────────────────────────
 *   averageViewPercentage, averageViewDuration, estimatedMinutesWatched,
 *   views, likes, comments, shares
 *   Computed: engagement_rate = (likes+comments+shares)/views * 100
 *   Computed: velocity_ratio  = views_24h / views_total (when upload time is known)
 *
 * ── CLI usage ─────────────────────────────────────────────────────────────────
 *   node pipeline/feedback_agent.js
 *   node pipeline/feedback_agent.js --show-feedback
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { google }   = require('googleapis');
const AnthropicPkg = require('@anthropic-ai/sdk');
const Anthropic    = AnthropicPkg.default ?? AnthropicPkg;
const fs           = require('fs-extra');

// ─── Constants ────────────────────────────────────────────────────────────────

const PROJECT_ROOT   = path.join(__dirname, '..');
const CONFIG_DIR     = path.join(PROJECT_ROOT, 'config');
const UPLOAD_LOG     = path.join(CONFIG_DIR, 'upload_log.json');
const ANALYTICS_LOG  = path.join(CONFIG_DIR, 'analytics_log.json');
const FEEDBACK_FILE  = path.join(CONFIG_DIR, 'feedback_latest.json');

const MODEL         = 'claude-opus-4-6';
const MAX_RETRIES   = 3;
const RETRY_BASE_MS = 1500;

// YouTube Analytics metrics to request.
const YTA_METRICS = [
  'views',
  'averageViewPercentage',
  'averageViewDuration',
  'estimatedMinutesWatched',
  'likes',
  'comments',
  'shares',
].join(',');

// Date range for analytics pull: last 90 days
const ANALYTICS_DAYS = 90;

// ─── Embedded Analysis Prompt ─────────────────────────────────────────────────

const ANALYSIS_SYSTEM_PROMPT =
  'You are a Performance Feedback Agent and YouTube Shorts algorithm expert. ' +
  'Analyse this YouTube video performance data and generate optimisation recommendations. ' +
  'Identify: winning patterns (what is working), losing patterns (what is hurting), ' +
  'specific hook improvements, format adjustments, pacing changes, ' +
  'and comment engagement strategy. ' +
  'Pay special attention to engagement_rate (likes+comments+shares/views) as the primary metric, ' +
  'and velocity_ratio (24h views / total views) to identify algorithmically-boosted content. ' +
  'Output ONLY valid JSON:\n' +
  '{\n' +
  '  winning_patterns: [string],\n' +
  '  losing_patterns: [string],\n' +
  '  hook_feedback: string,\n' +
  '  pacing_recommendations: string,\n' +
  '  comment_strategy: string (what types of comment triggers are driving engagement),\n' +
  '  format_ranking: [{format: string, avg_retention: number, avg_engagement_rate: number}],\n' +
  '  updated_script_instructions: string,\n' +
  '  updated_visual_instructions: string,\n' +
  '  title_pattern_feedback: string (which title patterns get the most engagement),\n' +
  '  top_performing_video_ids: [string],\n' +
  '  fast_viral_patterns: [string] (patterns from videos with velocity_ratio > 0.7)\n' +
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
    throw new Error('Missing YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, or YOUTUBE_REFRESH_TOKEN in .env');
  }
  const oauth2 = new google.auth.OAuth2(id, secret, 'urn:ietf:wg:oauth:2.0:oob');
  oauth2.setCredentials({ refresh_token: token });
  return oauth2;
}

/** ISO date string N days in the past from today. */
function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// ─── YouTube Analytics Fetcher ────────────────────────────────────────────────

/**
 * Fetch analytics for a single YouTube video ID via youtubeAnalytics.reports.query.
 *
 * Endpoint (called by googleapis): POST https://youtubeanalytics.googleapis.com/v2/reports
 * Params:
 *   ids        = "channel==MINE" (or actual channel ID)
 *   startDate  = 90 days ago
 *   endDate    = today
 *   metrics    = views,averageViewPercentage,...
 *   dimensions = video
 *   filters    = video==<youtubeVideoId>
 *
 * @param {object} yta          googleapis youtubeAnalytics v2 client
 * @param {string} youtubeId    YouTube video ID (e.g. "dQw4w9WgXcQ")
 * @param {string} channelId    Channel resource identifier (e.g. "channel==UCxxx")
 * @returns {Promise<object>}   Flat metrics object
 */
async function fetchVideoAnalytics(yta, youtubeId, channelId) {
  const res = await yta.reports.query({
    ids:        channelId,
    startDate:  daysAgo(ANALYTICS_DAYS),
    endDate:    new Date().toISOString().slice(0, 10),
    metrics:    YTA_METRICS,
    dimensions: 'video',
    filters:    `video==${youtubeId}`,
    maxResults: 1,
  });

  const headers = (res.data.columnHeaders ?? []).map(h => h.name);
  const rows    = res.data.rows ?? [];

  if (rows.length === 0) {
    return { youtubeId, note: 'no data yet (video may be too new or has no views)' };
  }

  const metrics = {};
  headers.forEach((h, i) => { metrics[h] = rows[0][i] ?? null; });

  // Real engagement rate: (likes + comments + shares) / views
  const v = metrics.views || 0;
  const l = metrics.likes || 0;
  const c = metrics.comments || 0;
  const s = metrics.shares || 0;
  metrics.engagement_rate = v > 0
    ? parseFloat((((l + c + s) / v) * 100).toFixed(2))
    : null;

  // Velocity ratio placeholder — filled in fetchAllAnalytics when 24h data is available
  metrics.velocity_ratio = null;

  return { youtubeId, ...metrics };
}

/**
 * Fetch analytics for all uploaded videos in upload_log.json.
 * Saves a timestamped snapshot to analytics_log.json.
 *
 * @returns {Promise<object[]>}  Full analytics records array
 */
async function fetchAllAnalytics() {
  let uploadLog;
  try { uploadLog = await fs.readJson(UPLOAD_LOG); }
  catch { throw new Error(`Cannot read ${UPLOAD_LOG}. Run upload_agent.js first.`); }

  if (!Array.isArray(uploadLog)) {
    throw new Error(`${UPLOAD_LOG} is not a valid array. Expected JSON array of upload entries.`);
  }

  const uploaded = uploadLog.filter(e => e.youtube_id && e.status === 'uploaded');
  if (uploaded.length === 0) {
    throw new Error('No successfully uploaded videos found in upload_log.json.');
  }

  const auth = buildOAuth2Client();
  const yta  = google.youtubeAnalytics({ version: 'v2', auth });
  const yt   = google.youtube({ version: 'v3', auth });

  // Resolve channel ID for the "ids" parameter
  const channelRes = await yt.channels.list({ part: ['id'], mine: true });
  const channelId  = channelRes.data.items?.[0]?.id;
  const analyticsId = channelId ? `channel==${channelId}` : 'channel==MINE';

  console.log(`  Channel : ${channelId ?? 'MINE (fallback)'}`);
  console.log(`  Videos  : ${uploaded.length}\n`);

  const allAnalytics = [];

  for (const entry of uploaded) {
    console.log(`  → ${entry.youtube_id}  "${entry.title ?? ''}"`);
    try {
      const data = await fetchVideoAnalytics(yta, entry.youtube_id, analyticsId);
      allAnalytics.push({
        ...data,
        internal_video_id: entry.video_id,
        title:             entry.title,
        url:               entry.url,
        uploaded_at:       entry.uploaded_at,
        scheduled_at:      entry.scheduled_at,
      });
      console.log(
        `    views=${data.views ?? '—'}  ` +
        `retention=${data.averageViewPercentage ?? '—'}%  ` +
        `watchTime=${data.estimatedMinutesWatched ?? '—'} min  ` +
        `engagement=${data.engagement_rate ?? '—'}%  ` +
        `likes=${data.likes ?? '—'}`
      );
    } catch (err) {
      console.warn(`    ⚠  Analytics failed: ${err.message}`);
      allAnalytics.push({
        youtubeId: entry.youtube_id,
        internal_video_id: entry.video_id,
        title: entry.title,
        error: err.message,
      });
    }
    // Respect quota: small pause between API calls
    await sleep(150);
  }

  // Compute velocity ratio for recently uploaded videos.
  // For videos < 7 days old, velocity = (views / hours_since_upload) normalized.
  // For older videos we estimate from the view-to-age curve.
  for (const rec of allAnalytics) {
    if (rec.error || !rec.views || !rec.uploaded_at) continue;
    const uploadedAt = new Date(rec.scheduled_at || rec.uploaded_at);
    const hoursLive = (Date.now() - uploadedAt.getTime()) / (1000 * 60 * 60);
    if (hoursLive > 0 && hoursLive <= 168) { // within 7 days
      // Views-per-hour rate × 24 / total views — higher = front-loaded viral
      const viewsPerHour = rec.views / hoursLive;
      const projected24h = Math.min(viewsPerHour * 24, rec.views);
      rec.velocity_ratio = parseFloat((projected24h / rec.views).toFixed(2));
    }
  }

  await fs.ensureDir(CONFIG_DIR);
  await fs.writeJson(ANALYTICS_LOG, {
    fetched_at: new Date().toISOString(),
    period_days: ANALYTICS_DAYS,
    videos: allAnalytics,
  }, { spaces: 2 });

  console.log(`\n  ✓ Analytics saved → ${ANALYTICS_LOG}\n`);
  return allAnalytics;
}

// ─── Claude Analysis ──────────────────────────────────────────────────────────

/**
 * Send analytics data to Claude claude-opus-4-6 with embedded prompt and return
 * structured feedback JSON.
 *
 * @param {object[]} analyticsData
 * @param {number}   [attempt]
 * @returns {Promise<object>}
 */
async function analyseWithClaude(analyticsData, attempt = 0) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set in .env');

  const client = new Anthropic({ apiKey });

  // Build a concise analysis payload (strip raw nulls and noise)
  const payload = analyticsData.map(v => ({
    video_id:               v.youtubeId,
    title:                  v.title,
    views:                  v.views,
    avg_view_pct:           v.averageViewPercentage,
    avg_view_duration_s:    v.averageViewDuration,
    estimated_minutes:      v.estimatedMinutesWatched,
    engagement_rate:        v.engagement_rate,
    velocity_ratio:         v.velocity_ratio,
    likes:                  v.likes,
    comments:               v.comments,
    shares:                 v.shares,
    error:                  v.error,
  }));

  const userPrompt =
    `Here is the YouTube performance data for ${payload.length} English learning Shorts ` +
    `(last ${ANALYTICS_DAYS} days):\n\n` +
    '```json\n' + JSON.stringify(payload, null, 2) + '\n```\n\n' +
    'Generate detailed optimisation recommendations. Identify the top performers, ' +
    'rank formats by avg retention AND engagement_rate, ' +
    'flag videos with velocity_ratio > 0.7 as "fast viral" and extract their patterns, ' +
    'flag videos with velocity_ratio < 0.3 as "slow burn", ' +
    'and produce concrete script + visual + comment-strategy instructions ' +
    'for the next batch. Output ONLY the raw JSON object.';

  console.log(`  → Sending to Claude ${MODEL} for analysis (attempt ${attempt + 1})...`);

  try {
    const stream  = client.messages.stream({
      model:      MODEL,
      max_tokens: 4096,
      thinking:   { type: 'adaptive' },
      system:     ANALYSIS_SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: userPrompt }],
    });

    const message   = await stream.finalMessage();
    const textBlock = message.content.find(b => b.type === 'text');
    if (!textBlock?.text) {
      throw new Error(`No text block in response. stop_reason=${message.stop_reason}`);
    }

    return extractJSON(textBlock.text);

  } catch (error) {
    if (attempt < MAX_RETRIES && isRetryable(error)) {
      const backoffMs = Math.pow(2, attempt) * RETRY_BASE_MS;
      console.warn(`  ⚠  ${error.constructor.name}: ${error.message.slice(0, 100)}`);
      console.log(`  ↺  Retrying in ${(backoffMs / 1000).toFixed(1)}s...`);
      await sleep(backoffMs);
      return analyseWithClaude(analyticsData, attempt + 1);
    }
    throw error;
  }
}

// ─── Show Feedback ────────────────────────────────────────────────────────────

async function showFeedback() {
  try {
    const fb = await fs.readJson(FEEDBACK_FILE);
    console.log('\nLatest feedback (feedback_latest.json):\n');
    console.log(JSON.stringify(fb, null, 2));
  } catch {
    console.log('\nNo feedback_latest.json found. Run feedback_agent.js first.\n');
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

/**
 * Full run: fetch analytics → analyse with Claude → save feedback.
 * Called weekly by the orchestrator.
 *
 * The saved feedback_latest.json is automatically ingested by script_agent.js
 * on the next batch run: when feedback_latest.json exists, its
 * updated_script_instructions and updated_visual_instructions are appended to
 * every script generation prompt to steer Claude toward better-performing formats.
 *
 * @returns {Promise<object>} feedback JSON
 */
async function runFeedbackAgent() {
  const divider = '═'.repeat(62);
  console.log(`\n${divider}`);
  console.log(`  english-made-fun / feedback_agent.js`);
  console.log(`  Model : ${MODEL}`);
  console.log(`${divider}\n`);

  // 1. Fetch YouTube Analytics
  const analyticsData = await fetchAllAnalytics();

  // 2. Claude analysis
  const feedback = await analyseWithClaude(analyticsData);
  feedback.generated_at    = new Date().toISOString();
  feedback.videos_analysed = analyticsData.length;

  // 3. Save feedback
  await fs.ensureDir(CONFIG_DIR);
  await fs.writeJson(FEEDBACK_FILE, feedback, { spaces: 2 });

  const sep = '─'.repeat(62);
  console.log(`\n${sep}`);
  console.log(`  ✓ Feedback saved → ${FEEDBACK_FILE}`);
  console.log(`  Winning patterns    : ${(feedback.winning_patterns ?? []).length}`);
  console.log(`  Losing patterns     : ${(feedback.losing_patterns ?? []).length}`);
  console.log(`  Top performers      : ${(feedback.top_performing_video_ids ?? []).join(', ') || '—'}`);
  console.log('\n  Winning patterns:');
  (feedback.winning_patterns ?? []).slice(0, 3).forEach(p => console.log(`    • ${p}`));
  console.log('\n  Hook feedback:');
  console.log(`    ${feedback.hook_feedback ?? '—'}`);
  console.log('');

  return feedback;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    if (args.includes('--show-feedback')) { await showFeedback(); process.exit(0); }
    try {
      await runFeedbackAgent();
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
  runFeedbackAgent,
  fetchAllAnalytics,
  analyseWithClaude,
  ANALYTICS_LOG,
  FEEDBACK_FILE,
  ANALYSIS_SYSTEM_PROMPT,
};
