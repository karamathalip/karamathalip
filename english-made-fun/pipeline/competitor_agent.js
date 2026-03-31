/**
 * pipeline/competitor_agent.js
 *
 * Fetches top-performing videos from competitor YouTube channels and analyses
 * them with Claude to generate strategic differentiation insights and hooks
 * for the next script batch.
 *
 * ── Prerequisites ─────────────────────────────────────────────────────────────
 *   .env: YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN,
 *         ANTHROPIC_API_KEY
 *   config/competitors.json — list of { name, channel_id } objects
 *     (auto-created with 5 starters via --init-competitors)
 *
 * ── Data flow ─────────────────────────────────────────────────────────────────
 *   config/competitors.json
 *     → YouTube Data API v3: search.list (order=viewCount) + videos.list
 *     → Claude claude-opus-4-6 strategic analysis
 *     → config/competitor_insights.json
 *   .hooks_to_use_next_batch + .recommended_topics_to_dominate → script_agent
 *
 * ── CLI usage ─────────────────────────────────────────────────────────────────
 *   node pipeline/competitor_agent.js
 *   node pipeline/competitor_agent.js --init-competitors   # write starter file
 *   node pipeline/competitor_agent.js --show-insights
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
const COMPETITORS_FILE = path.join(CONFIG_DIR, 'competitors.json');
const INSIGHTS_FILE    = path.join(CONFIG_DIR, 'competitor_insights.json');

const MODEL              = 'claude-opus-4-6';
const MAX_RETRIES        = 3;
const RETRY_BASE_MS      = 1500;
const TOP_VIDEOS_PER_CHANNEL = 20;

// ─── Starter Competitors ──────────────────────────────────────────────────────
// 5 large English-learning YouTube channels, pre-populated by --init-competitors.
// Channel IDs verified as of mid-2025.

const STARTER_COMPETITORS = [
  {
    name:       'English with Lucy',
    channel_id: 'UCz4tgANd4yy8Oe0iXCdSWfA',
    notes:      'British English, grammar + vocabulary, very large audience',
  },
  {
    name:       'mmmEnglish',
    channel_id: 'UCrRiVfHqzi5v7a4wZZZOlTg',
    notes:      'Pronunciation, confidence building, Australian English',
  },
  {
    name:       'English Addict with Mr Steve',
    channel_id: 'UC_OskgZBoS4dAnVUgJVexcw',
    notes:      'Live lessons, British slang, idioms, warm format',
  },
  {
    name:       'Learn English with TV Series',
    channel_id: 'UCKgpamMohtkl5OqwKe5Y3Gg',
    notes:      'Pop-culture clips, American English, high entertainment value',
  },
  {
    name:       'EnglishClass101',
    channel_id: 'UCeTeSNGDyq3LQvKr1gB0zIA',
    notes:      'Structured multi-level lessons, largest channel in the niche',
  },
];

// ─── Embedded Competitor Analysis Prompt ─────────────────────────────────────

const COMPETITOR_SYSTEM_PROMPT =
  'You are a Competitor Intelligence Agent. Analyse these top-performing YouTube ' +
  'English learning videos. Do NOT recommend copying them directly. Instead, identify ' +
  'what to do BETTER. Extract: viral hook structures (the pattern, not the exact words), ' +
  'repeatable formats, thumbnail patterns (describe visually), content gaps (topics they ' +
  'cover poorly or miss entirely), differentiation strategy (how to beat them with ' +
  'simplicity + humor + speed). Output ONLY valid JSON:\n' +
  '{\n' +
  '  winning_hook_patterns: [string],\n' +
  '  repeatable_formats: [string],\n' +
  '  thumbnail_patterns: [string],\n' +
  '  content_gaps: [string],\n' +
  '  differentiation_strategy: [string],\n' +
  '  recommended_topics_to_dominate: [string],\n' +
  '  hooks_to_use_next_batch: [string]\n' +
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

// ─── Competitors File ─────────────────────────────────────────────────────────

async function loadCompetitors() {
  try {
    const data = await fs.readJson(COMPETITORS_FILE);
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('competitors.json is empty or not an array.');
    }
    return data;
  } catch (err) {
    throw new Error(
      `Cannot read ${COMPETITORS_FILE}: ${err.message}\n` +
      'Run: node pipeline/competitor_agent.js --init-competitors'
    );
  }
}

async function initCompetitorsFile() {
  await fs.ensureDir(CONFIG_DIR);

  if (await fs.pathExists(COMPETITORS_FILE)) {
    console.log(`\ncompetitors.json already exists at:\n  ${COMPETITORS_FILE}\n`);
    console.log('Edit it to add or remove channels. Delete it to regenerate from starters.\n');
    return;
  }

  await fs.writeJson(COMPETITORS_FILE, STARTER_COMPETITORS, { spaces: 2 });

  console.log(`\n✓ Created ${COMPETITORS_FILE}`);
  console.log(`  Pre-populated with ${STARTER_COMPETITORS.length} English-learning channels:\n`);
  STARTER_COMPETITORS.forEach(c => {
    console.log(`  • ${c.name}`);
    console.log(`    ID    : ${c.channel_id}`);
    console.log(`    Notes : ${c.notes}\n`);
  });
  console.log('Edit this file to add your own competitors, then run without --init-competitors.\n');
}

// ─── YouTube Data Fetcher ─────────────────────────────────────────────────────

/**
 * Parse ISO 8601 duration (e.g. "PT1M30S") to a human-readable string.
 * Used in the analysis payload so Claude can reason about video length.
 *
 * @param {string} iso  e.g. "PT2M45S"
 * @returns {string}    e.g. "2m 45s"
 */
function parseIsoDuration(iso) {
  if (!iso) return '—';
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return iso;
  const parts = [];
  if (m[1]) parts.push(`${m[1]}h`);
  if (m[2]) parts.push(`${m[2]}m`);
  if (m[3]) parts.push(`${m[3]}s`);
  return parts.join(' ') || iso;
}

/**
 * Fetch the top TOP_VIDEOS_PER_CHANNEL videos by view count from one channel.
 *
 * Step 1: search.list with order=viewCount to get video IDs
 *   Endpoint: GET https://www.googleapis.com/youtube/v3/search
 *   Params: channelId, type=video, order=viewCount, maxResults=20
 *
 * Step 2: videos.list to get full snippet + statistics + contentDetails
 *   Endpoint: GET https://www.googleapis.com/youtube/v3/videos
 *   Params: id=<comma-separated IDs>, part=snippet,statistics,contentDetails
 *
 * @param {object} youtube   Authenticated YouTube client
 * @param {string} channelId
 * @param {string} channelName
 * @returns {Promise<object[]>}
 */
async function fetchTopVideos(youtube, channelId, channelName) {
  // Step 1: search for top videos by view count
  const searchRes = await youtube.search.list({
    part:       ['id', 'snippet'],
    channelId,
    type:       'video',
    order:      'viewCount',
    maxResults: TOP_VIDEOS_PER_CHANNEL,
  });

  const videoIds = (searchRes.data.items ?? [])
    .map(item => item.id?.videoId)
    .filter(Boolean);

  if (videoIds.length === 0) return [];

  // Brief pause to avoid hitting search quota
  await sleep(200);

  // Step 2: full video details
  const detailsRes = await youtube.videos.list({
    part: ['snippet', 'statistics', 'contentDetails'],
    id:   videoIds.join(','),
  });

  return (detailsRes.data.items ?? []).map(v => ({
    videoId:         v.id,
    title:           v.snippet?.title ?? '—',
    description:     (v.snippet?.description ?? '').slice(0, 200),
    duration:        parseIsoDuration(v.contentDetails?.duration),
    durationRaw:     v.contentDetails?.duration,
    viewCount:       parseInt(v.statistics?.viewCount ?? '0', 10),
    likeCount:       parseInt(v.statistics?.likeCount ?? '0', 10),
    commentCount:    parseInt(v.statistics?.commentCount ?? '0', 10),
    publishedAt:     v.snippet?.publishedAt,
    channelName,
    channelId,
    url:             `https://www.youtube.com/watch?v=${v.id}`,
  }));
}

// ─── Claude Analysis ──────────────────────────────────────────────────────────

/**
 * Send competitor video data to Claude claude-opus-4-6 for strategic analysis.
 *
 * @param {Array<{ channelName, videos }>} videosByChannel
 * @param {number} [attempt]
 * @returns {Promise<object>}
 */
async function analyseWithClaude(videosByChannel, attempt = 0) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set in .env');

  const client = new Anthropic({ apiKey });

  // Build a concise summary — titles + key stats only to stay within context limits
  const payload = videosByChannel.map(ch => ({
    channel: ch.channelName,
    top_videos: ch.videos.slice(0, TOP_VIDEOS_PER_CHANNEL).map(v => ({
      title:    v.title,
      views:    v.viewCount,
      likes:    v.likeCount,
      duration: v.duration,
      url:      v.url,
    })),
  }));

  const totalVideos = videosByChannel.reduce((s, c) => s + c.videos.length, 0);

  const userPrompt =
    `Here are the top ${totalVideos} videos from ${videosByChannel.length} competitor ` +
    `English learning YouTube channels:\n\n` +
    '```json\n' + JSON.stringify(payload, null, 2) + '\n```\n\n' +
    'Analyse strategically. The hooks_to_use_next_batch array must contain at least ' +
    '8 specific, ready-to-use hook templates we can adapt immediately. ' +
    'The recommended_topics_to_dominate array must have at least 10 topics. ' +
    'Output ONLY the raw JSON object.';

  console.log(
    `  → Sending ${totalVideos} videos (${videosByChannel.length} channels) to ` +
    `Claude ${MODEL} (attempt ${attempt + 1})...`
  );

  try {
    const stream  = client.messages.stream({
      model:      MODEL,
      max_tokens: 4096,
      thinking:   { type: 'adaptive' },
      system:     COMPETITOR_SYSTEM_PROMPT,
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
      return analyseWithClaude(videosByChannel, attempt + 1);
    }
    throw error;
  }
}

// ─── Show Insights ────────────────────────────────────────────────────────────

async function showInsights() {
  try {
    const ins = await fs.readJson(INSIGHTS_FILE);
    console.log('\nLatest competitor insights:\n');
    console.log(JSON.stringify(ins, null, 2));
  } catch {
    console.log('\nNo competitor_insights.json found. Run competitor_agent.js first.\n');
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

/**
 * Full run: load competitors → fetch videos → analyse → save insights.
 * Called weekly by the orchestrator.
 *
 * @returns {Promise<object>} insights JSON
 */
async function runCompetitorAgent() {
  const divider = '═'.repeat(62);
  console.log(`\n${divider}`);
  console.log(`  english-made-fun / competitor_agent.js`);
  console.log(`  Model      : ${MODEL}`);
  console.log(`  Top videos : ${TOP_VIDEOS_PER_CHANNEL} per channel`);
  console.log(`${divider}\n`);

  const competitors = await loadCompetitors();

  const auth    = buildOAuth2Client();
  const youtube = google.youtube({ version: 'v3', auth });

  console.log(`  Analysing ${competitors.length} competitor channel(s)...\n`);

  const videosByChannel = [];

  for (const comp of competitors) {
    const { channel_id, name } = comp;
    if (!channel_id) {
      console.warn(`  ⚠  Skipping "${name}" — no channel_id`);
      continue;
    }

    console.log(`  → ${name}  (${channel_id})`);

    try {
      const videos = await fetchTopVideos(youtube, channel_id, name);
      videosByChannel.push({ channelName: name, channelId: channel_id, videos });

      if (videos.length > 0) {
        const top = videos.sort((a, b) => b.viewCount - a.viewCount)[0];
        console.log(
          `    fetched=${videos.length}  ` +
          `top: "${top.title.slice(0, 55)}" (${top.viewCount.toLocaleString()} views)`
        );
      } else {
        console.log(`    fetched=0 (no public videos or API issue)`);
      }
    } catch (err) {
      console.warn(`    ⚠  Failed: ${err.message}`);
      videosByChannel.push({ channelName: name, channelId: channel_id, videos: [] });
    }

    // Respect YouTube API quota between channels
    await sleep(500);
  }

  const totalVideos = videosByChannel.reduce((s, c) => s + c.videos.length, 0);
  console.log(`\n  Total: ${totalVideos} competitor videos collected\n`);

  if (totalVideos === 0) {
    throw new Error(
      'No competitor videos fetched. Check channel IDs in competitors.json ' +
      'and verify your YouTube API quota.'
    );
  }

  const insights              = await analyseWithClaude(videosByChannel);
  insights.generated_at       = new Date().toISOString();
  insights.channels_analysed  = competitors.length;
  insights.videos_analysed    = totalVideos;

  await fs.ensureDir(CONFIG_DIR);
  await fs.writeJson(INSIGHTS_FILE, insights, { spaces: 2 });

  const sep = '─'.repeat(62);
  console.log(`\n${sep}`);
  console.log(`  ✓ Insights saved → ${INSIGHTS_FILE}`);
  console.log(`  Content gaps                : ${(insights.content_gaps ?? []).length}`);
  console.log(`  Topics to dominate          : ${(insights.recommended_topics_to_dominate ?? []).length}`);
  console.log(`  Hooks for next batch        : ${(insights.hooks_to_use_next_batch ?? []).length}`);
  console.log(`  Differentiation strategies  : ${(insights.differentiation_strategy ?? []).length}`);
  console.log('\n  Sample hooks for next batch:');
  (insights.hooks_to_use_next_batch ?? []).slice(0, 4).forEach(h => console.log(`    • ${h}`));
  console.log('\n  Top topics to dominate:');
  (insights.recommended_topics_to_dominate ?? []).slice(0, 5).forEach(t => console.log(`    • ${t}`));
  console.log('');

  return insights;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    if (args.includes('--show-insights'))    { await showInsights(); process.exit(0); }
    if (args.includes('--init-competitors')) { await initCompetitorsFile(); process.exit(0); }

    try {
      await runCompetitorAgent();
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
  runCompetitorAgent,
  fetchTopVideos,
  initCompetitorsFile,
  loadCompetitors,
  analyseWithClaude,
  COMPETITORS_FILE,
  INSIGHTS_FILE,
  STARTER_COMPETITORS,
  COMPETITOR_SYSTEM_PROMPT,
};
