// pipeline/upload_agent.js
// Agent 7: Uploads final MP4 to YouTube with full SEO metadata
import { google } from "googleapis";
import fs from "fs";
import path from "path";
import { logger, withRetry } from "./utils.js";

// ── OAuth2 client setup ───────────────────────────────────────────────────────
function getOAuthClient() {
  const oauth2 = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    "urn:ietf:wg:oauth:2.0:oob"
  );
  oauth2.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
  return oauth2;
}

function getYouTubeClient() {
  const auth = getOAuthClient();
  return google.youtube({ version: "v3", auth });
}

// ── SEO tag builder ───────────────────────────────────────────────────────────
function buildTags(script) {
  const base = [
    "english learning",
    "learn english",
    "english grammar",
    "english vocabulary",
    "english for beginners",
    "english shorts",
    "animated english",
    "english hacks",
    "english tips",
    "fluent english",
    "stickman english",
    "english mistakes",
  ];

  const topicTags = (script.youtube_tags || []).slice(0, 10);
  const all = [...new Set([...topicTags, ...base])].slice(0, 30);
  return all;
}

function buildDescription(script) {
  const base = `🎉 ${script.hook_text}

${script.youtube_description || script.call_to_action || ""}

━━━━━━━━━━━━━━━━━━━━━━
🔔 Subscribe for 3–5 new English lessons DAILY!
👆 Turn on notifications so you never miss one.
💬 Drop your answer in the comments!
━━━━━━━━━━━━━━━━━━━━━━

#EnglishLearning #LearnEnglish #EnglishGrammar #EnglishShorts #EnglishTips #AnimatedEnglish #EnglishMistakes #ESL #EnglishVocabulary #Shorts`;

  return base;
}

/**
 * Upload a video to YouTube.
 * @param {Object} script - Script JSON (with youtube_title, youtube_description, etc.)
 * @param {string} videoPath - Path to final MP4
 * @param {string} thumbnailPath - Path to thumbnail PNG
 * @returns {string} YouTube video ID
 */
export async function uploadToYouTube(script, videoPath, thumbnailPath) {
  logger.info(`[UploadAgent] Uploading: "${script.youtube_title || script.video_title}"`);

  if (!fs.existsSync(videoPath)) {
    throw new Error(`[UploadAgent] Video file not found: ${videoPath}`);
  }

  const youtube = getYouTubeClient();
  const fileSize = fs.statSync(videoPath).size;
  logger.info(`[UploadAgent] File size: ${(fileSize / 1024 / 1024).toFixed(1)} MB`);

  // ── Upload video ──────────────────────────────────────────────────────────
  const uploadResponse = await withRetry(
    async () => {
      const res = await youtube.videos.insert({
        part: ["snippet", "status"],
        requestBody: {
          snippet: {
            title: (script.youtube_title || script.video_title || "English Learning Short").slice(0, 100),
            description: buildDescription(script),
            tags: buildTags(script),
            categoryId: "27", // Education
            defaultLanguage: "en",
            defaultAudioLanguage: "en",
          },
          status: {
            privacyStatus: "public",
            selfDeclaredMadeForKids: false,
            madeForKids: false,
          },
        },
        media: {
          body: fs.createReadStream(videoPath),
          mimeType: "video/mp4",
        },
      });
      return res;
    },
    3,
    10000,
    "UploadAgent:video"
  );

  const youtubeVideoId = uploadResponse.data.id;
  logger.info(`[UploadAgent] ✓ Video uploaded: https://youtu.be/${youtubeVideoId}`);

  // ── Set thumbnail ─────────────────────────────────────────────────────────
  if (thumbnailPath && fs.existsSync(thumbnailPath)) {
    try {
      await withRetry(
        async () => {
          await youtube.thumbnails.set({
            videoId: youtubeVideoId,
            media: {
              body: fs.createReadStream(thumbnailPath),
              mimeType: "image/png",
            },
          });
        },
        3,
        5000,
        "UploadAgent:thumbnail"
      );
      logger.info(`[UploadAgent] ✓ Thumbnail set.`);
    } catch (err) {
      logger.warn(`[UploadAgent] Thumbnail upload failed (non-fatal): ${err.message}`);
    }
  }

  return youtubeVideoId;
}

/**
 * Add video to a playlist (optional — creates playlist if it doesn't exist).
 */
export async function addToPlaylist(youtubeVideoId, playlistTitle) {
  const youtube = getYouTubeClient();

  // Search for existing playlist
  const playlists = await youtube.playlists.list({
    part: ["snippet"],
    mine: true,
    maxResults: 50,
  });

  let playlistId = playlists.data.items?.find(
    (p) => p.snippet?.title === playlistTitle
  )?.id;

  // Create if not found
  if (!playlistId) {
    const created = await youtube.playlists.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: { title: playlistTitle, description: `Auto-generated: ${playlistTitle}` },
        status: { privacyStatus: "public" },
      },
    });
    playlistId = created.data.id;
    logger.info(`[UploadAgent] Created playlist: "${playlistTitle}" (${playlistId})`);
  }

  await youtube.playlistItems.insert({
    part: ["snippet"],
    requestBody: {
      snippet: {
        playlistId,
        resourceId: { kind: "youtube#video", videoId: youtubeVideoId },
      },
    },
  });

  logger.info(`[UploadAgent] ✓ Added to playlist: ${playlistTitle}`);
}
