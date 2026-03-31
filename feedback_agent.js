// pipeline/feedback_agent.js
// Agent 8: Pulls YouTube analytics and generates self-improvement insights
import { google } from "googleapis";
import Anthropic from "@anthropic-ai/sdk";
import path from "path";
import fs from "fs";
import { logger, writeJSON, readJSON, PATHS, datestamp } from "./utils.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── YouTube Analytics client ───────────────────────────────────────────────
function getAnalyticsClient() {
  const oauth2 = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    "urn:ietf:wg:oauth:2.0:oob"
  );
  oauth2.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
  return google.youtubeAnalytics({ version: "v2", auth: oauth2 });
}

function getYouTubeClient() {
  const oauth2 = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    "urn:ietf:wg:oauth:2.0:oob"
  );
  oauth2.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
  return google.youtube({ version: "v3", auth: oauth2 });
}

/**
 * Fetch analytics for recently uploaded videos (last 7 days).
 */
async function fetchRecentVideoAnalytics() {
  const analytics = getAnalyticsClient();
  const youtube = getYouTubeClient();

  // Get last 7 days of channel videos
  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  let channelMetrics;
  try {
    channelMetrics = await analytics.reports.query({
      ids: `channel==${process.env.YOUTUBE_CHANNEL_ID}`,
      startDate,
      endDate,
      metrics: "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained",
      dimensions: "video",
      sort: "-views",
      maxResults: 20,
    });
  } catch (err) {
    logger.warn(`[FeedbackAgent] Analytics API error: ${err.message}`);
    return null;
  }

  if (!channelMetrics.data.rows?.length) {
    logger.info("[FeedbackAgent] No analytics data yet (channel may be new).");
    return null;
  }

  // Map video IDs to titles
  const videoIds = channelMetrics.data.rows.map((r) => r[0]);
  const videoDetails = await youtube.videos.list({
    part: ["snippet"],
    id: videoIds,
  });

  const titleMap = {};
  videoDetails.data.items?.forEach((v) => {
    titleMap[v.id] = v.snippet?.title;
  });

  const columnHeaders = channelMetrics.data.columnHeaders?.map((h) => h.name);

  return channelMetrics.data.rows.map((row) => {
    const obj = {};
    columnHeaders?.forEach((header, i) => {
      obj[header] = row[i];
    });
    obj.title = titleMap[obj.video] || "Unknown";
    return obj;
  });
}

/**
 * Run Claude analysis on analytics to generate future content improvements.
 */
async function analyseAndImprove(analyticsData) {
  const prompt = `
You are an expert YouTube growth strategist analysing performance data for an English-learning Shorts channel.

ANALYTICS DATA (last 7 days):
${JSON.stringify(analyticsData, null, 2)}

Based on this data:
1. Identify which video FORMATS perform best (retention, views, engagement)
2. Identify which TOPICS perform best
3. Identify what HOOKS work (high CTR = high views relative to impressions)
4. Identify what is underperforming and why
5. Generate 10 optimised TOPIC IDEAS for the next batch, biased towards what works

Output ONLY this JSON:
{
  "top_performing_format": "...",
  "top_performing_topics": ["..."],
  "best_hook_patterns": ["..."],
  "underperforming_patterns": ["..."],
  "next_batch_topics": [
    { "format": "fail_fix|word_explosion|superpower", "topic": "...", "level": "A2|B1|B2", "predicted_score": 0-100 }
  ],
  "channel_health": "growing|stable|declining",
  "key_insight": "one sentence summary"
}`;

  logger.info("[FeedbackAgent] Analysing analytics with Claude...");

  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1500,
    system: "You are a YouTube growth strategist. Output ONLY valid JSON.",
    messages: [{ role: "user", content: prompt }],
  });

  const raw = response.content[0].text.trim();
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("[FeedbackAgent] Could not parse improvement JSON");
    return JSON.parse(match[0]);
  }
}

/**
 * Run the full feedback loop:
 * 1. Pull analytics
 * 2. Analyse with Claude
 * 3. Write improvement file for tomorrow's batch
 */
export async function runFeedbackLoop() {
  logger.info("[FeedbackAgent] Starting feedback loop...");

  const analyticsData = await fetchRecentVideoAnalytics();

  let improvements;
  if (analyticsData) {
    improvements = await analyseAndImprove(analyticsData);
    logger.info(`[FeedbackAgent] Key insight: ${improvements.key_insight}`);
    logger.info(`[FeedbackAgent] Channel health: ${improvements.channel_health}`);
  } else {
    // No data yet — use seeded topic list
    logger.info("[FeedbackAgent] No analytics — using seed topics.");
    improvements = getDefaultSeedTopics();
  }

  // Write improvement file — this feeds tomorrow's script_agent
  const improvementPath = path.join(PATHS.scripts, `improvements_${datestamp()}.json`);
  writeJSON(improvementPath, {
    generated_at: new Date().toISOString(),
    analytics: analyticsData,
    improvements,
  });

  logger.info(`[FeedbackAgent] ✓ Improvement file saved → ${improvementPath}`);
  return improvements;
}

/**
 * Load tomorrow's topics from most recent improvement file,
 * or fall back to hard-coded seed topics.
 */
export function loadNextBatchTopics() {
  // Find most recent improvements file
  const files = fs
    .readdirSync(PATHS.scripts)
    .filter((f) => f.startsWith("improvements_"))
    .sort()
    .reverse();

  if (files.length > 0) {
    const data = readJSON(path.join(PATHS.scripts, files[0]));
    const topics = data.improvements?.next_batch_topics;
    if (topics?.length) {
      logger.info(`[FeedbackAgent] Loaded ${topics.length} AI-optimised topics from improvements.`);
      return topics;
    }
  }

  logger.info("[FeedbackAgent] Using default seed topics.");
  return getDefaultSeedTopics().next_batch_topics;
}

function getDefaultSeedTopics() {
  return {
    next_batch_topics: [
      { format: "fail_fix", topic: "went vs gone (present perfect)", level: "B1", predicted_score: 82 },
      { format: "word_explosion", topic: "the word 'get' — 15 meanings", level: "B1", predicted_score: 88 },
      { format: "superpower", topic: "articles: a vs an vs the", level: "A2", predicted_score: 79 },
      { format: "fail_fix", topic: "I am agree vs I agree", level: "A2", predicted_score: 85 },
      { format: "word_explosion", topic: "phrasal verb: make up", level: "B2", predicted_score: 77 },
      { format: "superpower", topic: "conditional sentences: if + would", level: "B1", predicted_score: 80 },
      { format: "fail_fix", topic: "much vs many — common confusion", level: "A2", predicted_score: 83 },
      { format: "word_explosion", topic: "the word 'break' — 10 meanings", level: "B1", predicted_score: 86 },
    ],
    channel_health: "stable",
    key_insight: "Seed topics loaded — analytics will personalise after first week.",
  };
}
