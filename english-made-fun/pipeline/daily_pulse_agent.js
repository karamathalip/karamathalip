/**
 * pipeline/daily_pulse_agent.js
 *
 * Lightweight daily check on recently uploaded videos (last 7 days).
 * Flags performance signals so the next batch can adapt quickly without
 * waiting for the full weekly feedback_agent run.
 *
 * ── Output ────────────────────────────────────────────────────────────────────
 *   config/daily_pulse.json — refreshed every run
 *   {
 *     checked_at, videos_checked,
 *     replicate: [{ video_id, title, retention, engagement_rate, reason }],
 *     avoid:     [{ video_id, title, retention, engagement_rate, reason }],
 *     neutral:   [{ video_id, title, retention, engagement_rate }]
 *   }
 *
 * ── CLI usage ─────────────────────────────────────────────────────────────────
 *   node pipeline/daily_pulse_agent.js
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { google } = require('googleapis');
const fs         = require('fs-extra');

// ─── Constants ────────────────────────────────────────────────────────────────

const PROJECT_ROOT  = path.join(__dirname, '..');
const CONFIG_DIR    = path.join(PROJECT_ROOT, 'config');
const UPLOAD_LOG    = path.join(CONFIG_DIR, 'upload_log.json');
const PULSE_FILE    = path.join(CONFIG_DIR, 'daily_pulse.json');

const RETENTION_REPLICATE = 80;  // ≥80% avg view → "replicate this"
const RETENTION_AVOID     = 50;  // <50% avg view → "avoid this pattern"
const ENGAGEMENT_REPLICATE = 8;  // ≥8% engagement rate → "replicate"
const RECENT_DAYS = 7;           // Only check videos uploaded in last 7 days

const YTA_METRICS = [
  'views',
  'averageViewPercentage',
  'averageViewDuration',
  'likes',
  'comments',
  'shares',
].join(',');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function runDailyPulse() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  Daily Pulse Agent');
  console.log('═══════════════════════════════════════════\n');

  let uploadLog;
  try { uploadLog = await fs.readJson(UPLOAD_LOG); }
  catch { throw new Error(`Cannot read ${UPLOAD_LOG}. Run upload_agent.js first.`); }

  // Filter to videos uploaded in the last RECENT_DAYS days
  const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;
  const recent = uploadLog.filter(e => {
    if (!e.youtube_id || e.status !== 'uploaded') return false;
    const uploadTime = new Date(e.scheduled_at || e.uploaded_at || 0).getTime();
    return uploadTime > cutoff;
  });

  if (recent.length === 0) {
    console.log('  No recently uploaded videos found (last 7 days). Nothing to check.');
    return null;
  }

  const auth = buildOAuth2Client();
  const yta  = google.youtubeAnalytics({ version: 'v2', auth });
  const yt   = google.youtube({ version: 'v3', auth });

  const channelRes = await yt.channels.list({ part: ['id'], mine: true });
  const channelId  = channelRes.data.items?.[0]?.id;
  const analyticsId = channelId ? `channel==${channelId}` : 'channel==MINE';

  console.log(`  Checking ${recent.length} recent video(s)...\n`);

  const replicate = [];
  const avoid     = [];
  const neutral   = [];

  for (const entry of recent) {
    try {
      const res = await yta.reports.query({
        ids:        analyticsId,
        startDate:  daysAgo(RECENT_DAYS),
        endDate:    new Date().toISOString().slice(0, 10),
        metrics:    YTA_METRICS,
        dimensions: 'video',
        filters:    `video==${entry.youtube_id}`,
        maxResults: 1,
      });

      const headers = (res.data.columnHeaders ?? []).map(h => h.name);
      const rows    = res.data.rows ?? [];
      if (rows.length === 0) continue;

      const m = {};
      headers.forEach((h, i) => { m[h] = rows[0][i] ?? 0; });

      const retention = m.averageViewPercentage || 0;
      const views     = m.views || 0;
      const engagement_rate = views > 0
        ? parseFloat((((m.likes || 0) + (m.comments || 0) + (m.shares || 0)) / views * 100).toFixed(2))
        : 0;

      const record = {
        video_id: entry.video_id,
        youtube_id: entry.youtube_id,
        title: entry.title,
        retention,
        views,
        engagement_rate,
      };

      if (retention >= RETENTION_REPLICATE || engagement_rate >= ENGAGEMENT_REPLICATE) {
        const reasons = [];
        if (retention >= RETENTION_REPLICATE) reasons.push(`retention ${retention}% >= ${RETENTION_REPLICATE}%`);
        if (engagement_rate >= ENGAGEMENT_REPLICATE) reasons.push(`engagement ${engagement_rate}% >= ${ENGAGEMENT_REPLICATE}%`);
        replicate.push({ ...record, reason: reasons.join('; ') });
        console.log(`  ★ REPLICATE  ${entry.title}  (${reasons.join(', ')})`);
      } else if (retention < RETENTION_AVOID) {
        avoid.push({ ...record, reason: `retention ${retention}% < ${RETENTION_AVOID}%` });
        console.log(`  ✗ AVOID      ${entry.title}  (retention ${retention}%)`);
      } else {
        neutral.push(record);
        console.log(`  · NEUTRAL    ${entry.title}  (retention ${retention}%, engagement ${engagement_rate}%)`);
      }
    } catch (err) {
      console.warn(`  ⚠  ${entry.youtube_id}: ${err.message}`);
    }
    await sleep(150);
  }

  const pulse = {
    checked_at: new Date().toISOString(),
    videos_checked: recent.length,
    replicate,
    avoid,
    neutral,
  };

  await fs.ensureDir(CONFIG_DIR);
  await fs.writeJson(PULSE_FILE, pulse, { spaces: 2 });

  console.log(`\n  ✓ Daily pulse saved → ${PULSE_FILE}`);
  console.log(`    Replicate: ${replicate.length}  |  Avoid: ${avoid.length}  |  Neutral: ${neutral.length}\n`);

  return pulse;
}

// ─── Export & CLI ─────────────────────────────────────────────────────────────

module.exports = { runDailyPulse };

if (require.main === module) {
  runDailyPulse()
    .then(result => {
      if (result) {
        console.log('Daily pulse check complete.');
      }
      process.exit(0);
    })
    .catch(err => {
      console.error('Daily Pulse Agent failed:', err.message);
      process.exit(1);
    });
}
