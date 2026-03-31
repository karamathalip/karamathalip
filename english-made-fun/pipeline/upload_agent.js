/**
 * pipeline/upload_agent.js
 *
 * Uploads final rendered videos to YouTube using the YouTube Data API v3.
 * Uses OAuth2 refresh-token flow — no browser interaction after initial setup.
 *
 * ── Prerequisites ─────────────────────────────────────────────────────────────
 *   .env must contain:
 *     YOUTUBE_CLIENT_ID=<OAuth2 client ID from Google Cloud Console>
 *     YOUTUBE_CLIENT_SECRET=<OAuth2 client secret>
 *     YOUTUBE_REFRESH_TOKEN=<obtained once via setupOAuth()>
 *
 * ── One-time setup ────────────────────────────────────────────────────────────
 *   node pipeline/upload_agent.js --setup
 *   Follow the printed URL, paste the code — refresh token is saved to .env.
 *
 * ── CLI usage ─────────────────────────────────────────────────────────────────
 *   node pipeline/upload_agent.js              # upload all un-uploaded finals
 *   node pipeline/upload_agent.js --setup      # run OAuth setup (once)
 *   node pipeline/upload_agent.js --show-log   # print upload log
 *
 * ── Scheduling ────────────────────────────────────────────────────────────────
 *   Videos are staggered 4 hours apart starting from the next available slot.
 *   If a slot is already taken in upload_log.json, the next free slot is used.
 *   All uploads are scheduled as "private" + publishAt for the calculated time,
 *   which YouTube automatically makes public at that moment.
 *
 * ── Output ────────────────────────────────────────────────────────────────────
 *   config/upload_log.json   — { video_id, youtube_id, url, scheduled_at, ... }
 */

'use strict';

// ─── Environment ──────────────────────────────────────────────────────────────
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// ─── Imports ──────────────────────────────────────────────────────────────────
const { google }   = require('googleapis');
const fs           = require('fs-extra');
const readline     = require('readline');

// ─── Constants ────────────────────────────────────────────────────────────────

const YOUTUBE_CATEGORY_EDUCATION = '27';
const PLAYLIST_TITLE             = 'English Shorts';
const UPLOAD_GAP_HOURS           = 4;    // stagger uploads N hours apart
const MAX_TAGS                   = 500;  // YouTube tag character limit (total)
const MAX_TITLE_LENGTH           = 100;
const MAX_DESCRIPTION_LENGTH     = 5000;

const PROJECT_ROOT  = path.join(__dirname, '..');
const FINAL_DIR     = path.join(PROJECT_ROOT, 'output', 'final');
const APPROVED_DIR  = path.join(PROJECT_ROOT, 'scripts', 'approved');
const CONFIG_DIR    = path.join(PROJECT_ROOT, 'config');
const UPLOAD_LOG    = path.join(CONFIG_DIR, 'upload_log.json');
const THUMBS_DIR    = path.join(PROJECT_ROOT, 'thumbnails');
const ENV_FILE      = path.join(PROJECT_ROOT, '.env');

// ─── OAuth2 Scopes ────────────────────────────────────────────────────────────
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.force-ssl',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Truncate a string to maxLen, appending "…" if cut. */
function truncate(str, maxLen) {
  if (!str) return '';
  return str.length <= maxLen ? str : str.slice(0, maxLen - 1) + '…';
}

/** Load and validate required env vars. Throws if any are missing. */
function getEnvConfig() {
  const clientId     = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
  const missing = [];
  if (!clientId)     missing.push('YOUTUBE_CLIENT_ID');
  if (!clientSecret) missing.push('YOUTUBE_CLIENT_SECRET');
  if (missing.length) {
    throw new Error(
      `Missing required env var(s): ${missing.join(', ')}\n` +
      'Add them to english-made-fun/.env'
    );
  }
  return { clientId, clientSecret, refreshToken };
}

/** Build and configure an OAuth2 client using env credentials. */
function buildOAuth2Client() {
  const { clientId, clientSecret, refreshToken } = getEnvConfig();
  const oauth2 = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'urn:ietf:wg:oauth:2.0:oob'   // out-of-band: no local server needed
  );
  if (refreshToken) {
    oauth2.setCredentials({ refresh_token: refreshToken });
  }
  return oauth2;
}

// ─── Upload Log ───────────────────────────────────────────────────────────────

async function loadUploadLog() {
  try { return await fs.readJson(UPLOAD_LOG); } catch { return []; }
}

async function saveUploadLog(log) {
  await fs.ensureDir(CONFIG_DIR);
  await fs.writeJson(UPLOAD_LOG, log, { spaces: 2 });
}

/** Returns the Set of video_ids already uploaded (marked done). */
async function getUploadedIds() {
  const log = await loadUploadLog();
  return new Set(log.filter(e => e.status === 'uploaded').map(e => e.video_id));
}

async function upsertUploadLog(entry) {
  const log = await loadUploadLog();
  const idx = log.findIndex(e => e.video_id === entry.video_id);
  if (idx >= 0) { log[idx] = { ...log[idx], ...entry }; }
  else          { log.push(entry); }
  await saveUploadLog(log);
}

async function showLog() {
  const log = await loadUploadLog();
  if (log.length === 0) { console.log('\nUpload log is empty.\n'); return; }
  const sep = '─'.repeat(70);
  console.log(`\n${sep}\n  Upload Log  |  ${log.length} entries\n${sep}`);
  log
    .slice()
    .sort((a, b) => new Date(b.uploaded_at ?? 0) - new Date(a.uploaded_at ?? 0))
    .forEach(e => {
      const icon = e.status === 'uploaded' ? '✓' : '✗';
      console.log(
        `\n  ${icon} ${e.video_id}\n` +
        `      youtube_id   : ${e.youtube_id ?? '—'}\n` +
        `      url          : ${e.url ?? '—'}\n` +
        `      scheduled_at : ${e.scheduled_at ?? '—'}\n` +
        `      uploaded_at  : ${e.uploaded_at ?? '—'}\n` +
        `      status       : ${e.status}` +
        (e.error ? `\n      error        : ${e.error}` : '')
      );
    });
  console.log('');
}

// ─── Schedule Calculator ──────────────────────────────────────────────────────

/**
 * Calculate the next available upload slot, staggered UPLOAD_GAP_HOURS apart.
 * Already-scheduled slots are read from the upload log so we never double-book.
 *
 * @returns {Promise<Date>}
 */
async function nextScheduledSlot() {
  const log = await loadUploadLog();

  // Collect all already-scheduled/uploaded times
  const scheduled = log
    .map(e => e.scheduled_at)
    .filter(Boolean)
    .map(s => new Date(s))
    .filter(d => !isNaN(d))
    .sort((a, b) => a - b);

  const now = new Date();

  if (scheduled.length === 0) {
    // First upload: schedule 1 hour from now
    return new Date(now.getTime() + 60 * 60 * 1000);
  }

  // Find the latest scheduled time; next slot is GAP hours after it
  const latest = scheduled[scheduled.length - 1];
  const candidate = new Date(latest.getTime() + UPLOAD_GAP_HOURS * 60 * 60 * 1000);

  // Must be at least 5 minutes in the future
  return candidate > new Date(now.getTime() + 5 * 60 * 1000)
    ? candidate
    : new Date(now.getTime() + UPLOAD_GAP_HOURS * 60 * 60 * 1000);
}

// ─── Metadata Builder ─────────────────────────────────────────────────────────

/**
 * Build YouTube video metadata from an approved script JSON.
 *
 * @param {object} scriptData
 * @returns {{ title: string, description: string, tags: string[] }}
 */
function buildVideoMetadata(scriptData) {
  const pkg         = scriptData.packaging  ?? {};
  const viralTrigs  = scriptData.viral_triggers ?? [];

  // Title: first packaging title (script_agent generates 3 options)
  const rawTitle = Array.isArray(pkg.titles) && pkg.titles.length > 0
    ? pkg.titles[0]
    : (scriptData.video_title ?? scriptData.title ?? 'English Made Fun');
  const title = truncate(rawTitle, MAX_TITLE_LENGTH);

  // Description: structured from script fields
  const hook      = scriptData.hook?.selected ?? '';
  const format    = scriptData.format ?? '';
  const thumbText = pkg.thumbnail?.text ?? '';
  const altTitles = Array.isArray(pkg.titles) && pkg.titles.length > 1
    ? pkg.titles.slice(1).join('\n')
    : '';

  const descParts = [
    hook                            ? `${hook}\n`                        : '',
    thumbText                       ? `${thumbText}\n`                   : '',
    '---\n',
    '🎓 English Made Fun — learn English in 60 seconds!\n',
    format                          ? `Format: ${format}\n`             : '',
    altTitles                       ? `\n${altTitles}\n`                : '',
    '\n#EnglishLearning #LearnEnglish #EnglishShorts #ESL #Grammar',
  ];
  const description = truncate(descParts.join('').trim(), MAX_DESCRIPTION_LENGTH);

  // Tags: viral_triggers + standard tags; trim to YouTube's 500-char total limit
  const standardTags = [
    'English learning', 'learn English', 'English grammar',
    'ESL', 'English for beginners', 'English shorts',
    'English tips', 'speak English', 'English lesson',
  ];
  const allTags = [...viralTrigs, ...standardTags];
  const tags    = [];
  let   charCount = 0;
  for (const tag of allTags) {
    if (charCount + tag.length + 1 > MAX_TAGS) break;
    tags.push(tag);
    charCount += tag.length + 1;
  }

  return { title, description, tags };
}

// ─── YouTube Helpers ──────────────────────────────────────────────────────────

/**
 * Find or create the "English Shorts" playlist.
 * Returns the playlist ID.
 *
 * @param {object} yt   - Authenticated youtube client
 * @returns {Promise<string>}
 */
async function findOrCreatePlaylist(yt) {
  // List the channel's playlists (max 50 per page — good enough for most channels)
  const listResp = await yt.playlists.list({
    part: ['snippet'],
    mine: true,
    maxResults: 50,
  });

  const existing = (listResp.data.items ?? []).find(
    p => p.snippet.title === PLAYLIST_TITLE
  );
  if (existing) {
    console.log(`    ✓ Playlist found: "${PLAYLIST_TITLE}" (${existing.id})`);
    return existing.id;
  }

  // Create it
  const createResp = await yt.playlists.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title:       PLAYLIST_TITLE,
        description: 'English learning YouTube Shorts — new video every 4 hours.',
        defaultLanguage: 'en',
      },
      status: { privacyStatus: 'public' },
    },
  });

  const id = createResp.data.id;
  console.log(`    ✓ Playlist created: "${PLAYLIST_TITLE}" (${id})`);
  return id;
}

/**
 * Add a YouTube video to a playlist.
 *
 * @param {object} yt
 * @param {string} playlistId
 * @param {string} youtubeVideoId
 */
async function addToPlaylist(yt, playlistId, youtubeVideoId) {
  await yt.playlistItems.insert({
    part: ['snippet'],
    requestBody: {
      snippet: {
        playlistId,
        resourceId: { kind: 'youtube#video', videoId: youtubeVideoId },
      },
    },
  });
}

/**
 * Upload a thumbnail image for a YouTube video.
 * Skips gracefully if no thumbnail file is found.
 *
 * @param {object} yt
 * @param {string} youtubeVideoId
 * @param {string} videoId           - Our internal video_id (used to find thumb file)
 */
async function uploadThumbnail(yt, youtubeVideoId, videoId) {
  const thumbPath = path.join(THUMBS_DIR, `${videoId}_thumb.png`);

  if (!(await fs.pathExists(thumbPath))) {
    console.log(`    ⚠  No thumbnail found at: ${thumbPath} — skipping.`);
    return;
  }

  await yt.thumbnails.set({
    videoId: youtubeVideoId,
    media: {
      mimeType: 'image/png',
      body:     fs.createReadStream(thumbPath),
    },
  });

  console.log(`    ✓ Thumbnail uploaded: ${path.basename(thumbPath)}`);
}

// ─── Core: Upload One Video ───────────────────────────────────────────────────

/**
 * Upload one final MP4 to YouTube with metadata, thumbnail, and playlist.
 *
 * @param {object} opts
 * @param {string}  opts.videoId       - Internal video_id
 * @param {string}  opts.finalPath     - Absolute path to the _final.mp4 file
 * @param {object}  opts.scriptData    - Parsed approved script JSON
 * @param {object}  opts.yt            - Authenticated youtube client
 * @param {string}  opts.playlistId    - Target playlist ID
 * @param {Date}    opts.scheduledAt   - UTC publish time
 * @returns {Promise<{ youtubeId: string, url: string }>}
 */
async function uploadVideo(opts) {
  const { videoId, finalPath, scriptData, yt, playlistId, scheduledAt } = opts;
  const { title, description, tags } = buildVideoMetadata(scriptData);

  console.log(`    → Uploading: "${title}"`);
  console.log(`      File: ${path.basename(finalPath)}`);
  console.log(`      Scheduled: ${scheduledAt.toISOString()}`);

  const fileSize  = (await fs.stat(finalPath)).size;
  const fileSizeMB = (fileSize / 1024 / 1024).toFixed(2);
  console.log(`      Size: ${fileSizeMB} MB`);

  const resp = await yt.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title,
        description,
        tags,
        categoryId:      YOUTUBE_CATEGORY_EDUCATION,
        defaultLanguage: 'en',
      },
      status: {
        // Use privacyStatus "private" + publishAt for scheduled publishing.
        // YouTube requires the channel to be in good standing for scheduling.
        privacyStatus:             'private',
        publishAt:                 scheduledAt.toISOString(),
        selfDeclaredMadeForKids:   false,
        madeForKids:               false,
      },
    },
    media: {
      mimeType: 'video/mp4',
      body:     fs.createReadStream(finalPath),
    },
  });

  const youtubeId = resp.data.id;
  const url       = `https://www.youtube.com/shorts/${youtubeId}`;
  console.log(`    ✓ Uploaded: ${url}`);

  // Thumbnail
  await uploadThumbnail(yt, youtubeId, videoId);

  // Playlist
  await addToPlaylist(yt, playlistId, youtubeId);
  console.log(`    ✓ Added to playlist: ${PLAYLIST_TITLE}`);

  return { youtubeId, url };
}

// ─── Batch Runner ─────────────────────────────────────────────────────────────

/**
 * Upload all un-uploaded final videos in output/final/.
 * Matches each _final.mp4 to an approved script JSON by video_id.
 * Skips videos already in the upload log.
 *
 * @returns {Promise<object>} Batch summary
 */
async function runUploadBatch() {
  getEnvConfig(); // validate env early

  await fs.ensureDir(CONFIG_DIR);
  await fs.ensureDir(FINAL_DIR);

  // Build authenticated YouTube client
  const auth = buildOAuth2Client();
  const yt   = google.youtube({ version: 'v3', auth });

  // Discover final videos
  const allFinals = (await fs.readdir(FINAL_DIR).catch(() => []))
    .filter(f => f.endsWith('_final.mp4'));

  if (allFinals.length === 0) {
    console.log('No final videos found in output/final/.\nRun render_agent.js first.');
    return { total: 0, uploaded: [], failed: [] };
  }

  const uploadedIds = await getUploadedIds();
  const toUpload    = allFinals.filter(f => {
    const vid = f.replace('_final.mp4', '');
    return !uploadedIds.has(vid);
  });

  const divider = '═'.repeat(64);
  console.log(`\n${divider}`);
  console.log(`  english-made-fun / upload_agent.js`);
  console.log(`  Found    : ${allFinals.length} final video(s)`);
  console.log(`  Uploaded : ${uploadedIds.size} already done`);
  console.log(`  To upload: ${toUpload.length}`);
  console.log(`${divider}\n`);

  if (toUpload.length === 0) {
    console.log('All videos already uploaded. Nothing to do.\n');
    return { total: 0, uploaded: [], failed: [] };
  }

  // Find or create playlist once
  const playlistId = await findOrCreatePlaylist(yt);

  const summary = { total: toUpload.length, uploaded: [], failed: [] };

  for (let i = 0; i < toUpload.length; i++) {
    const fileName = toUpload[i];
    const videoId  = fileName.replace('_final.mp4', '');
    const finalPath = path.join(FINAL_DIR, fileName);

    console.log(`\n[${i + 1}/${toUpload.length}] ${fileName}`);

    // Find matching approved script JSON (may have any filename — match by video_id field)
    const scriptData = await findScriptForVideoId(videoId);
    if (!scriptData) {
      console.error(`  ✗ No approved script found for video_id="${videoId}" — skipping.`);
      summary.failed.push({ videoId, error: 'No matching script JSON found' });
      await upsertUploadLog({
        video_id: videoId, status: 'failed',
        error: 'No matching script JSON', uploaded_at: new Date().toISOString(),
      });
      continue;
    }

    const scheduledAt = await nextScheduledSlot();

    try {
      const { youtubeId, url } = await uploadVideo({
        videoId, finalPath, scriptData, yt, playlistId, scheduledAt,
      });

      const entry = {
        video_id:     videoId,
        youtube_id:   youtubeId,
        url,
        title:        buildVideoMetadata(scriptData).title,
        scheduled_at: scheduledAt.toISOString(),
        uploaded_at:  new Date().toISOString(),
        status:       'uploaded',
      };
      await upsertUploadLog(entry);
      summary.uploaded.push(entry);

      console.log(`  ✓ Done\n`);

      // Brief pause between uploads to avoid quota bursts
      if (i < toUpload.length - 1) await sleep(2000);

    } catch (err) {
      const errMsg = err.message ?? String(err);
      console.error(`  ✗ FAILED: ${errMsg}\n`);
      summary.failed.push({ videoId, error: errMsg });
      await upsertUploadLog({
        video_id:   videoId,
        status:     'failed',
        error:      errMsg,
        uploaded_at: new Date().toISOString(),
      });
    }
  }

  // Summary
  const sep = '─'.repeat(64);
  console.log(sep);
  console.log(`  Upload batch complete:`);
  console.log(`    ✓ Uploaded : ${summary.uploaded.length}`);
  console.log(`    ✗ Failed   : ${summary.failed.length}`);
  if (summary.uploaded.length > 0) {
    console.log('\n  Uploaded videos:');
    summary.uploaded.forEach(u => {
      console.log(`    ✓ ${u.url}  (scheduled: ${u.scheduled_at})`);
    });
  }
  console.log('');
  return summary;
}

/**
 * Search approved script JSONs for one matching video_id.
 * Returns the parsed script object or null.
 *
 * @param {string} videoId
 * @returns {Promise<object|null>}
 */
async function findScriptForVideoId(videoId) {
  const SKIP = new Set([
    'batch_summary.json', 'voice_summary.json',
    'sfx_summary.json',   'image_summary.json', 'render_log.json',
  ]);
  let files = [];
  try { files = await fs.readdir(APPROVED_DIR); } catch { return null; }

  for (const f of files) {
    if (!f.endsWith('.json') || SKIP.has(f)) continue;
    try {
      const data = await fs.readJson(path.join(APPROVED_DIR, f));
      if (data.video_id === videoId) return data;
    } catch { /* skip */ }
  }
  return null;
}

// ─── OAuth Setup (run once manually) ─────────────────────────────────────────

/**
 * Walk through the OAuth2 authorization code flow and save the refresh token
 * to the .env file. Run this ONCE with:
 *   node pipeline/upload_agent.js --setup
 *
 * After completing setup, the refresh token persists in .env and all future
 * runs are fully automated.
 */
async function setupOAuth() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  YouTube OAuth2 Setup (run once)');
  console.log('═══════════════════════════════════════════\n');

  const { clientId, clientSecret } = getEnvConfig();

  const oauth2 = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'urn:ietf:wg:oauth:2.0:oob'
  );

  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    scope:       SCOPES,
    prompt:      'consent',   // force refresh_token to be returned every time
  });

  console.log('1. Open this URL in your browser:\n');
  console.log(`   ${authUrl}\n`);
  console.log('2. Sign in with the Google account that owns the YouTube channel.');
  console.log('3. Copy the authorization code shown on the page.\n');

  const rl   = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise(resolve => rl.question('4. Paste the code here: ', ans => {
    rl.close();
    resolve(ans.trim());
  }));

  console.log('\n   Exchanging code for tokens...');

  const { tokens } = await oauth2.getToken(code);
  oauth2.setCredentials(tokens);

  const refreshToken = tokens.refresh_token;
  if (!refreshToken) {
    console.error('\n✗ No refresh_token returned. Make sure you used prompt=consent.');
    console.error('  Try revoking the app at https://myaccount.google.com/permissions and re-running.');
    process.exit(1);
  }

  // Write refresh token into .env file
  let envContent = '';
  try { envContent = await fs.readFile(ENV_FILE, 'utf8'); } catch { /* new file */ }

  if (envContent.includes('YOUTUBE_REFRESH_TOKEN=')) {
    // Replace existing line
    envContent = envContent.replace(
      /YOUTUBE_REFRESH_TOKEN=.*/,
      `YOUTUBE_REFRESH_TOKEN=${refreshToken}`
    );
  } else {
    envContent += `\nYOUTUBE_REFRESH_TOKEN=${refreshToken}\n`;
  }

  await fs.writeFile(ENV_FILE, envContent, 'utf8');

  console.log('\n✓ Refresh token saved to .env');
  console.log(`  YOUTUBE_REFRESH_TOKEN=${refreshToken.slice(0, 12)}...`);
  console.log('\nSetup complete! Future runs are fully automated.\n');
}

// ─── CLI Entry Point ──────────────────────────────────────────────────────────

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);

    if (args.includes('--setup')) {
      try { await setupOAuth(); process.exit(0); }
      catch (err) { console.error(`\nFatal: ${err.message}`); process.exit(1); }
    }

    if (args.includes('--show-log')) {
      await showLog(); process.exit(0);
    }

    try {
      const summary = await runUploadBatch();
      process.exit(summary.failed.length > 0 ? 1 : 0);
    } catch (err) {
      console.error('\nFatal error:', err.message);
      if (err.stack) console.error(err.stack);
      process.exit(1);
    }
  })();
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  runUploadBatch, uploadVideo, buildVideoMetadata,
  findOrCreatePlaylist, setupOAuth, showLog,
  nextScheduledSlot, getUploadedIds, upsertUploadLog,
  UPLOAD_LOG, FINAL_DIR, APPROVED_DIR,
};
