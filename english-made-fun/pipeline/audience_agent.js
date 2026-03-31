/**
 * pipeline/audience_agent.js
 *
 * Fetches YouTube comments for all uploaded videos, filters for high-engagement
 * ones, sends them to Claude for audience intelligence extraction, and saves
 * a structured insights file including next_batch_topics for script_agent.js.
 *
 * ── Prerequisites ─────────────────────────────────────────────────────────────
 *   .env: YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN,
 *         ANTHROPIC_API_KEY
 *
 * ── Data flow ─────────────────────────────────────────────────────────────────
 *   config/upload_log.json
 *     → YouTube Data API v3 commentThreads.list (paginated, ≥200 per video)
 *     → filter: likeCount > 2 OR replyCount > 0
 *     → Claude claude-opus-4-6
 *     → config/audience_insights.json
 *   audience_insights.json.next_batch_topics → fed into script_agent topic queue
 *
 * ── CLI usage ─────────────────────────────────────────────────────────────────
 *   node pipeline/audience_agent.js
 *   node pipeline/audience_agent.js --show-insights
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
const INSIGHTS_FILE  = path.join(CONFIG_DIR, 'audience_insights.json');

const MODEL         = 'claude-opus-4-6';
const MAX_RETRIES   = 3;
const RETRY_BASE_MS = 1500;

// Fetch at least this many comments per video before stopping pagination
const MIN_COMMENTS_TARGET = 200;
// Max pages to fetch per video (100 results/page → up to 1000 comments if needed)
const MAX_PAGES_PER_VIDEO = 10;
// High-engagement filter thresholds
const HIGH_LIKE_THRESHOLD = 2;
// Fallback if not enough high-engagement: take top N by likes
const FALLBACK_TOP_N = 50;

// ─── Embedded Audience Analysis Prompt ───────────────────────────────────────

const AUDIENCE_SYSTEM_PROMPT =
  'You are an Audience Intelligence Agent. Analyse these YouTube comments from an ' +
  'English learning channel. Extract: pain points (ranked by frequency), content ' +
  'opportunities (video ideas based on what viewers ask for), viral hooks (exact ' +
  'phrases from comments that can become hooks), product opportunities (what viewers ' +
  'would pay for), audience segments (who is watching). Use the EXACT language viewers ' +
  'use in your hooks. Output ONLY valid JSON:\n' +
  '{\n' +
  '  pain_points: [{topic: string, frequency: number, example_comment: string}],\n' +
  '  content_opportunities: [{idea: string, demand_score: number, suggested_format: string}],\n' +
  '  viral_hooks: [string],\n' +
  '  product_opportunities: [{name: string, evidence: string}],\n' +
  '  audience_segments: [string],\n' +
  '  next_batch_topics: [string]\n' +
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

// ─── YouTube Comments Fetcher ─────────────────────────────────────────────────

/**
 * Fetch at least MIN_COMMENTS_TARGET comments for one video using pagination.
 * Uses commentThreads.list with order=relevance (highest-quality first).
 *
 * Endpoint (googleapis): GET https://www.googleapis.com/youtube/v3/commentThreads
 * Params: videoId, part=snippet, maxResults=100, order=relevance, pageToken
 *
 * @param {object} youtube   Authenticated YouTube client
 * @param {string} videoId   YouTube video ID
 * @returns {Promise<Array<{ text, likeCount, replyCount, author }>>}
 */
async function fetchCommentsForVideo(youtube, videoId) {
  const comments  = [];
  let   pageToken = undefined;
  let   pages     = 0;

  do {
    const res = await youtube.commentThreads.list({
      part:       ['snippet'],
      videoId,
      maxResults: 100,
      order:      'relevance',
      textFormat: 'plainText',
      ...(pageToken ? { pageToken } : {}),
    });

    for (const item of (res.data.items ?? [])) {
      const top = item.snippet?.topLevelComment?.snippet;
      if (!top) continue;
      comments.push({
        text:       (top.textOriginal ?? top.textDisplay ?? '').trim(),
        likeCount:  top.likeCount ?? 0,
        replyCount: item.snippet.totalReplyCount ?? 0,
        author:     top.authorDisplayName ?? '',
        publishedAt: top.publishedAt ?? null,
      });
    }

    pageToken = res.data.nextPageToken;
    pages++;

    // Rate limit: 100ms between page requests
    if (pageToken && comments.length < MIN_COMMENTS_TARGET) {
      await sleep(100);
    }

  } while (pageToken && comments.length < MIN_COMMENTS_TARGET && pages < MAX_PAGES_PER_VIDEO);

  return comments;
}

/**
 * Filter comments for high engagement.
 * High engagement: likeCount > HIGH_LIKE_THRESHOLD OR replyCount > 0.
 * If too few qualify, falls back to top FALLBACK_TOP_N by likeCount.
 *
 * @param {Array} comments
 * @returns {Array}
 */
function filterHighEngagement(comments) {
  const high = comments.filter(
    c => c.likeCount > HIGH_LIKE_THRESHOLD || c.replyCount > 0
  );
  if (high.length >= 20) return high;

  // Fallback: top N by likeCount regardless of threshold
  return comments
    .slice()
    .sort((a, b) => b.likeCount - a.likeCount)
    .slice(0, FALLBACK_TOP_N);
}

// ─── Claude Analysis ──────────────────────────────────────────────────────────

/**
 * Send filtered comments to Claude claude-opus-4-6 and extract audience intelligence.
 *
 * @param {Array<{ youtubeId, title, comments }>} commentsByVideo
 * @param {number} [attempt]
 * @returns {Promise<object>}
 */
async function analyseWithClaude(commentsByVideo, attempt = 0) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set in .env');

  const client = new Anthropic({ apiKey });

  // Build a flat comment list for the prompt (trim long comments)
  const commentList = commentsByVideo.flatMap(v =>
    v.comments.map(c => ({
      video:      v.title ?? v.youtubeId,
      text:       c.text.slice(0, 300),
      likes:      c.likeCount,
      replies:    c.replyCount,
    }))
  );

  const totalVideos   = commentsByVideo.length;
  const totalComments = commentList.length;

  const userPrompt =
    `Here are ${totalComments} high-engagement comments from ${totalVideos} English ` +
    `learning YouTube Shorts:\n\n` +
    '```json\n' + JSON.stringify(commentList, null, 2) + '\n```\n\n' +
    'Extract comprehensive audience intelligence. The next_batch_topics array must ' +
    'contain at least 10 specific, actionable video topic ideas using the exact ' +
    'vocabulary and phrasing viewers use. Output ONLY the raw JSON object.';

  console.log(
    `  → Sending ${totalComments} comments (${totalVideos} videos) to ` +
    `Claude ${MODEL} (attempt ${attempt + 1})...`
  );

  try {
    const stream  = client.messages.stream({
      model:      MODEL,
      max_tokens: 4096,
      thinking:   { type: 'adaptive' },
      system:     AUDIENCE_SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: userPrompt }],
    });

    const message   = await stream.finalMessage();
    const textBlock = message.content.find(b => b.type === 'text');
    if (!textBlock?.text) {
      throw new Error(`No text block. stop_reason=${message.stop_reason}`);
    }

    return extractJSON(textBlock.text);

  } catch (error) {
    if (attempt < MAX_RETRIES && isRetryable(error)) {
      const backoffMs = Math.pow(2, attempt) * RETRY_BASE_MS;
      console.warn(`  ⚠  ${error.constructor.name}: ${error.message.slice(0, 100)}`);
      console.log(`  ↺  Retrying in ${(backoffMs / 1000).toFixed(1)}s...`);
      await sleep(backoffMs);
      return analyseWithClaude(commentsByVideo, attempt + 1);
    }
    throw error;
  }
}

// ─── Show Insights ────────────────────────────────────────────────────────────

async function showInsights() {
  try {
    const ins = await fs.readJson(INSIGHTS_FILE);
    console.log('\nLatest audience insights:\n');
    console.log(JSON.stringify(ins, null, 2));
  } catch {
    console.log('\nNo audience_insights.json found. Run audience_agent.js first.\n');
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

/**
 * Full run: fetch comments → filter → analyse with Claude → save insights.
 * Called weekly by the orchestrator.
 * The saved next_batch_topics are fed into script_agent.js topic queue.
 *
 * @returns {Promise<object>} insights JSON
 */
async function runAudienceAgent() {
  const divider = '═'.repeat(62);
  console.log(`\n${divider}`);
  console.log(`  english-made-fun / audience_agent.js`);
  console.log(`  Model         : ${MODEL}`);
  console.log(`  Target/video  : ≥${MIN_COMMENTS_TARGET} comments`);
  console.log(`  HE filter     : likes > ${HIGH_LIKE_THRESHOLD} OR replies > 0`);
  console.log(`${divider}\n`);

  // Load upload log
  let uploadLog;
  try { uploadLog = await fs.readJson(UPLOAD_LOG); }
  catch { throw new Error(`Cannot read ${UPLOAD_LOG}. Run upload_agent.js first.`); }

  const uploaded = uploadLog.filter(e => e.youtube_id && e.status === 'uploaded');
  if (uploaded.length === 0) {
    throw new Error('No successfully uploaded videos in upload_log.json.');
  }

  const auth    = buildOAuth2Client();
  const youtube = google.youtube({ version: 'v3', auth });

  console.log(`  Fetching comments for ${uploaded.length} video(s)...\n`);

  const commentsByVideo = [];
  let totalRaw      = 0;
  let totalFiltered = 0;

  for (const entry of uploaded) {
    console.log(`  → ${entry.youtube_id}  "${entry.title ?? ''}"`);
    try {
      const raw      = await fetchCommentsForVideo(youtube, entry.youtube_id);
      const filtered = filterHighEngagement(raw);
      totalRaw      += raw.length;
      totalFiltered += filtered.length;
      console.log(`    fetched=${raw.length}  high-engagement=${filtered.length}`);
      commentsByVideo.push({
        youtubeId: entry.youtube_id,
        title:     entry.title ?? entry.youtube_id,
        comments:  filtered,
      });
    } catch (err) {
      // Comments may be disabled on a video — skip gracefully
      console.warn(`    ⚠  Comments unavailable: ${err.message}`);
      commentsByVideo.push({ youtubeId: entry.youtube_id, title: entry.title ?? '', comments: [] });
    }
    await sleep(200);
  }

  console.log(`\n  Total : ${totalRaw} raw  |  ${totalFiltered} high-engagement kept\n`);

  if (totalFiltered === 0) {
    console.warn('  ⚠  No high-engagement comments found.');
    console.warn('     Videos may be too new, comments may be disabled, or engagement is low.');
    return null;
  }

  // Claude analysis
  const insights              = await analyseWithClaude(commentsByVideo);
  insights.generated_at       = new Date().toISOString();
  insights.videos_analysed    = uploaded.length;
  insights.total_comments_raw = totalRaw;
  insights.comments_analysed  = totalFiltered;

  await fs.ensureDir(CONFIG_DIR);
  await fs.writeJson(INSIGHTS_FILE, insights, { spaces: 2 });

  const sep = '─'.repeat(62);
  console.log(`\n${sep}`);
  console.log(`  ✓ Insights saved → ${INSIGHTS_FILE}`);
  console.log(`  Pain points          : ${(insights.pain_points ?? []).length}`);
  console.log(`  Content opportunities: ${(insights.content_opportunities ?? []).length}`);
  console.log(`  Viral hooks          : ${(insights.viral_hooks ?? []).length}`);
  console.log(`  Product opportunities: ${(insights.product_opportunities ?? []).length}`);
  console.log(`  Next batch topics    : ${(insights.next_batch_topics ?? []).length}`);
  console.log('\n  Next batch topics (top 5):');
  (insights.next_batch_topics ?? []).slice(0, 5).forEach(t => console.log(`    • ${t}`));
  console.log('\n  Viral hooks (top 3):');
  (insights.viral_hooks ?? []).slice(0, 3).forEach(h => console.log(`    • "${h}"`));
  console.log('');

  return insights;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    if (args.includes('--show-insights')) { await showInsights(); process.exit(0); }
    try {
      await runAudienceAgent();
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
  runAudienceAgent,
  fetchCommentsForVideo,
  filterHighEngagement,
  analyseWithClaude,
  INSIGHTS_FILE,
  AUDIENCE_SYSTEM_PROMPT,
};
