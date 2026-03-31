// pipeline/run_daily_batch.js
// ═══════════════════════════════════════════════════════════════════════════
//  MASTER ORCHESTRATOR — runs every agent in sequence for the full daily batch
//  Usage: node pipeline/run_daily_batch.js
// ═══════════════════════════════════════════════════════════════════════════
import "dotenv/config";
import path from "path";
import { logger, writeJSON, datestamp, PATHS, sleep } from "./utils.js";

import { generateDailyBatch }      from "./script_agent.js";
import { filterBatch }             from "./viral_agent.js";
import { generateVisualBlueprint } from "./visual_agent.js";
import { generateScriptAudio }     from "./audio_agent.js";
import { generateVideoSFX }        from "./sfx_agent.js";
import { generateVideoImages }     from "./image_agent.js";
import { renderVideo, mergeAudioVideo } from "./render_agent.js";
import { uploadToYouTube, addToPlaylist } from "./upload_agent.js";
import { runFeedbackLoop, loadNextBatchTopics } from "./feedback_agent.js";

const VIDEOS_PER_DAY = parseInt(process.env.VIDEOS_PER_DAY || "4", 10);
const PLAYLIST_NAME  = "English Learning Shorts";

// ═══════════════════════════════════════════════════════════════════════════
//  STATUS TRACKER
// ═══════════════════════════════════════════════════════════════════════════
const batchStatus = {
  date:     datestamp(),
  started:  new Date().toISOString(),
  total:    0,
  produced: 0,
  uploaded: 0,
  rejected: 0,
  errors:   [],
  videos:   [],
};

function logStatus() {
  logger.info(
    `\n${"═".repeat(56)}\n` +
    `  BATCH STATUS  —  ${batchStatus.date}\n` +
    `  Produced : ${batchStatus.produced}/${batchStatus.total}\n` +
    `  Uploaded : ${batchStatus.uploaded}\n` +
    `  Rejected : ${batchStatus.rejected}\n` +
    `  Errors   : ${batchStatus.errors.length}\n` +
    `${"═".repeat(56)}`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  SINGLE VIDEO PIPELINE
// ═══════════════════════════════════════════════════════════════════════════
async function processOneVideo(script) {
  const { video_id, video_title } = script;
  logger.info(`\n${"─".repeat(56)}`);
  logger.info(`📹 Processing: "${video_title}"  [${video_id}]`);

  const videoRecord = {
    video_id,
    title: video_title,
    format: script.format,
    stages: {},
    youtube_url: null,
    error: null,
  };

  try {
    // ── Stage 1: Visual blueprint ──────────────────────────────────────────
    logger.info(`[${video_id}] Stage 1/6: Visual blueprint...`);
    const blueprint = await generateVisualBlueprint(script);
    videoRecord.stages.blueprint = "✓";
    await sleep(500);

    // ── Stage 2: Audio (voice) ─────────────────────────────────────────────
    logger.info(`[${video_id}] Stage 2/6: Voice generation...`);
    let audioResult = null;
    try {
      audioResult = await generateScriptAudio(script);
      videoRecord.stages.audio = "✓";
    } catch (err) {
      logger.warn(`[${video_id}] Audio generation failed (continuing without voice): ${err.message}`);
      videoRecord.stages.audio = "⚠ skipped";
    }

    // ── Stage 3: SFX ──────────────────────────────────────────────────────
    logger.info(`[${video_id}] Stage 3/6: SFX generation...`);
    let sfxPaths = {};
    try {
      sfxPaths = await generateVideoSFX(script);
      videoRecord.stages.sfx = "✓";
    } catch (err) {
      logger.warn(`[${video_id}] SFX generation failed (continuing): ${err.message}`);
      videoRecord.stages.sfx = "⚠ skipped";
    }

    // ── Stage 4: Images ────────────────────────────────────────────────────
    logger.info(`[${video_id}] Stage 4/6: Image generation...`);
    let imageResult = null;
    try {
      imageResult = await generateVideoImages(script, blueprint);
      videoRecord.stages.images = "✓";
    } catch (err) {
      logger.warn(`[${video_id}] Image generation failed (continuing): ${err.message}`);
      videoRecord.stages.images = "⚠ skipped";
    }

    // ── Stage 5: Render ────────────────────────────────────────────────────
    logger.info(`[${video_id}] Stage 5/6: Rendering video...`);
    const renderedPath = await renderVideo(script, audioResult, sfxPaths, imageResult);
    videoRecord.stages.render = "✓";

    // ── Stage 5b: FFmpeg audio merge ───────────────────────────────────────
    const finalPath = await mergeAudioVideo(
      renderedPath,
      audioResult?.mergedPath,
      sfxPaths?.background,
      video_id
    );
    videoRecord.stages.merge = "✓";

    // ── Stage 6: Upload ────────────────────────────────────────────────────
    logger.info(`[${video_id}] Stage 6/6: Uploading to YouTube...`);
    const youtubeId = await uploadToYouTube(
      script,
      finalPath,
      imageResult?.thumbnailPath
    );

    // Add to playlist
    try {
      await addToPlaylist(youtubeId, PLAYLIST_NAME);
    } catch (err) {
      logger.warn(`[${video_id}] Playlist add failed (non-fatal): ${err.message}`);
    }

    videoRecord.stages.upload = "✓";
    videoRecord.youtube_url = `https://youtu.be/${youtubeId}`;
    videoRecord.youtube_id  = youtubeId;

    logger.info(`[${video_id}] ✅ COMPLETE → https://youtu.be/${youtubeId}`);
    batchStatus.produced++;
    batchStatus.uploaded++;
  } catch (err) {
    logger.error(`[${video_id}] ❌ FAILED: ${err.message}`);
    videoRecord.error = err.message;
    batchStatus.errors.push({ video_id, error: err.message });
  }

  batchStatus.videos.push(videoRecord);
  return videoRecord;
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════════════
async function main() {
  logger.info(`\n${"═".repeat(56)}`);
  logger.info(`🚀 ENGLISH MADE FUN — Daily Batch  ${datestamp()}`);
  logger.info(`   Target: ${VIDEOS_PER_DAY} videos`);
  logger.info(`${"═".repeat(56)}\n`);

  // ── Step 1: Load topics (from feedback agent or seed list) ───────────────
  logger.info("Step 1: Loading topics...");
  const allTopics = loadNextBatchTopics();
  const topics    = allTopics.slice(0, VIDEOS_PER_DAY);
  batchStatus.total = topics.length;
  logger.info(`Loaded ${topics.length} topics for today.`);

  // ── Step 2: Generate scripts ─────────────────────────────────────────────
  logger.info("\nStep 2: Generating scripts...");
  const rawScripts = await generateDailyBatch(topics);

  // ── Step 3: Viral filter ─────────────────────────────────────────────────
  logger.info("\nStep 3: Viral scoring + filtering...");
  const approvedScripts = await filterBatch(rawScripts);
  batchStatus.rejected = rawScripts.length - approvedScripts.length;

  if (approvedScripts.length === 0) {
    logger.warn("⚠ No scripts passed viral filter. Exiting.");
    process.exit(0);
  }

  // ── Step 4: Produce each video ───────────────────────────────────────────
  logger.info(`\nStep 4: Producing ${approvedScripts.length} videos...\n`);
  for (const script of approvedScripts) {
    await processOneVideo(script);
    // Small cooldown between videos to respect API rate limits
    await sleep(3000);
  }

  // ── Step 5: Feedback loop ────────────────────────────────────────────────
  logger.info("\nStep 5: Running feedback loop...");
  try {
    await runFeedbackLoop();
  } catch (err) {
    logger.warn(`Feedback loop failed (non-fatal): ${err.message}`);
  }

  // ── Final report ─────────────────────────────────────────────────────────
  batchStatus.completed = new Date().toISOString();
  const reportPath = path.join(PATHS.logs, `batch_report_${datestamp()}.json`);
  writeJSON(reportPath, batchStatus);

  logStatus();

  if (batchStatus.errors.length > 0) {
    logger.error(`\n⚠ ${batchStatus.errors.length} video(s) failed:`);
    batchStatus.errors.forEach((e) => logger.error(`  • ${e.video_id}: ${e.error}`));
  }

  logger.info(`\n📊 Report saved → ${reportPath}`);
  logger.info("✅ Daily batch complete.\n");
}

main().catch((err) => {
  logger.error(`FATAL: ${err.stack}`);
  process.exit(1);
});
