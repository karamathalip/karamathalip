/**
 * pipeline/thumbnail_compositor.js
 *
 * Composites bold text overlays onto raw thumbnail images for maximum CTR.
 * Runs after image_agent, before upload_agent.
 *
 * ── Pipeline ──────────────────────────────────────────────────────────────────
 *   1. Reads approved scripts for thumbnail text + visual description
 *   2. Loads raw thumbnail image (from thumbnails/{video_id}_thumb.png)
 *   3. Composites bold text overlay, emoji, contrast border, vignette
 *   4. Saves final thumbnail to thumbnails/{video_id}_thumb_final.png
 *
 * ── CLI usage ─────────────────────────────────────────────────────────────────
 *   node pipeline/thumbnail_compositor.js                 # all approved scripts
 *   node pipeline/thumbnail_compositor.js vid_001.json    # single script
 *
 * ── Output ────────────────────────────────────────────────────────────────────
 *   thumbnails/{video_id}_thumb_final.png — composited thumbnail (1080×1920)
 */

'use strict';

const path   = require('path');
const fs     = require('fs-extra');
const { createCanvas, loadImage, registerFont } = require('canvas');

// ─── Constants ────────────────────────────────────────────────────────────────

const PROJECT_ROOT  = path.join(__dirname, '..');
const APPROVED_DIR  = path.join(PROJECT_ROOT, 'scripts', 'approved');
const THUMBS_DIR    = path.join(PROJECT_ROOT, 'thumbnails');

const THUMB_WIDTH   = 1080;
const THUMB_HEIGHT  = 1920;

// Format-to-color mapping for the accent border and text glow
const FORMAT_COLORS = {
  'fail_fix_stickman_skit':       { accent: '#FF3B30', secondary: '#34C759' },
  'word_explosion_visual_build':  { accent: '#00d4ff', secondary: '#FFD700' },
  'rule_as_superpower_metaphor':  { accent: '#f7c948', secondary: '#1F8EF1' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Wrap text to fit within maxWidth on a canvas context.
 * Returns an array of lines.
 */
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

/**
 * Draw text with a stroke outline for maximum readability.
 */
function drawStrokedText(ctx, text, x, y, strokeColor, strokeWidth) {
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = strokeWidth;
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}

// ─── Core: Composite One Thumbnail ────────────────────────────────────────────

/**
 * Generate a composited thumbnail for one script.
 *
 * @param {object} scriptData  - Parsed approved script JSON
 * @param {string} videoId     - Internal video_id
 * @returns {Promise<string|null>}  Path to final thumbnail, or null if skipped
 */
async function compositeThumbnail(scriptData, videoId) {
  const rawThumbPath  = path.join(THUMBS_DIR, `${videoId}_thumb.png`);
  const finalThumbPath = path.join(THUMBS_DIR, `${videoId}_thumb_final.png`);

  // Skip if final already exists
  if (await fs.pathExists(finalThumbPath)) {
    console.log(`    ✓ Already composited: ${path.basename(finalThumbPath)}`);
    return finalThumbPath;
  }

  const canvas = createCanvas(THUMB_WIDTH, THUMB_HEIGHT);
  const ctx    = canvas.getContext('2d');

  // ── Layer 1: Background (raw thumbnail or gradient fallback) ──────────
  if (await fs.pathExists(rawThumbPath)) {
    try {
      const img = await loadImage(rawThumbPath);
      ctx.drawImage(img, 0, 0, THUMB_WIDTH, THUMB_HEIGHT);
    } catch {
      // Fallback to gradient
      const grad = ctx.createLinearGradient(0, 0, 0, THUMB_HEIGHT);
      grad.addColorStop(0, '#0d1b2e');
      grad.addColorStop(1, '#1a1a2e');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);
    }
  } else {
    // No raw thumbnail — create gradient background
    const grad = ctx.createLinearGradient(0, 0, 0, THUMB_HEIGHT);
    grad.addColorStop(0, '#0d1b2e');
    grad.addColorStop(1, '#1a1a2e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);
    console.log(`    ⚠  No raw thumbnail — using gradient fallback`);
  }

  // ── Layer 2: Darken overlay for text readability ──────────────────────
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);

  // ── Layer 3: Vignette ─────────────────────────────────────────────────
  const vigGrad = ctx.createRadialGradient(
    THUMB_WIDTH / 2, THUMB_HEIGHT / 2, THUMB_WIDTH * 0.3,
    THUMB_WIDTH / 2, THUMB_HEIGHT / 2, THUMB_WIDTH * 0.9
  );
  vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
  vigGrad.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);

  // ── Layer 4: Format-colored accent border ─────────────────────────────
  const format = (scriptData.format ?? '').toLowerCase().replace(/[^a-z_]/g, '').replace(/\s+/g, '_');
  const colors = FORMAT_COLORS[format] ?? { accent: '#1F8EF1', secondary: '#FFD700' };

  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 8;
  ctx.strokeRect(16, 16, THUMB_WIDTH - 32, THUMB_HEIGHT - 32);

  // ── Layer 5: Bold text overlay ────────────────────────────────────────
  const thumbText = scriptData.packaging?.thumbnail?.text ?? scriptData.video_title ?? '';

  if (thumbText) {
    // Large bold text in the center-upper area
    const fontSize = 120;
    ctx.font = `900 ${fontSize}px "Arial Black", "Impact", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const maxTextWidth = THUMB_WIDTH - 120;
    const lines = wrapText(ctx, thumbText.toUpperCase(), maxTextWidth);
    const lineHeight = fontSize * 1.15;
    const totalTextHeight = lines.length * lineHeight;
    const startY = (THUMB_HEIGHT * 0.38) - (totalTextHeight / 2);

    // Text shadow / glow
    ctx.shadowColor = colors.accent;
    ctx.shadowBlur = 30;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    for (let i = 0; i < lines.length; i++) {
      const y = startY + i * lineHeight;
      ctx.fillStyle = '#ffffff';
      drawStrokedText(ctx, lines[i], THUMB_WIDTH / 2, y, '#000000', 6);
    }

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  // ── Layer 6: Format-specific emoji or icon ────────────────────────────
  const emojiMap = {
    'fail_fix_stickman_skit':       '❌ → ✅',
    'word_explosion_visual_build':  '💥',
    'rule_as_superpower_metaphor':  '⚡',
  };
  const emoji = emojiMap[format] ?? '📚';

  ctx.font = '900 80px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(emoji, THUMB_WIDTH / 2, THUMB_HEIGHT * 0.7);

  // ── Layer 7: Saturation boost (simulate by brightening) ───────────────
  // Canvas doesn't have native saturation — apply a subtle warm overlay
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = 'rgba(255, 200, 100, 0.08)';
  ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);
  ctx.globalCompositeOperation = 'source-over';

  // ── Save final thumbnail ──────────────────────────────────────────────
  const buffer = canvas.toBuffer('image/png');
  await fs.writeFile(finalThumbPath, buffer);
  console.log(`    ✓ Composited: ${path.basename(finalThumbPath)}`);

  return finalThumbPath;
}

// ─── Batch Runner ─────────────────────────────────────────────────────────────

/**
 * Composite thumbnails for all approved scripts.
 *
 * @returns {Promise<object>} Batch summary
 */
async function runThumbnailCompositor() {
  await fs.ensureDir(THUMBS_DIR);

  const allFiles = await fs.readdir(APPROVED_DIR).catch(() => []);
  const targets = allFiles
    .filter(f => f.endsWith('.json') && f !== 'batch_summary.json' && f !== 'sfx_summary.json')
    .map(f => path.join(APPROVED_DIR, f));

  if (targets.length === 0) {
    console.log('No approved scripts found for thumbnail compositing.');
    return { total: 0, composited: [], failed: [] };
  }

  const divider = '═'.repeat(62);
  console.log(`\n${divider}`);
  console.log(`  english-made-fun / thumbnail_compositor.js`);
  console.log(`  Scripts : ${targets.length}`);
  console.log(`${divider}\n`);

  const summary = { total: targets.length, composited: [], failed: [] };

  for (const scriptPath of targets) {
    const fileName = path.basename(scriptPath);
    try {
      const scriptData = await fs.readJson(scriptPath);
      const videoId = scriptData.video_id ?? fileName.replace('.json', '');
      console.log(`  → ${fileName} (${videoId})`);
      const result = await compositeThumbnail(scriptData, videoId);
      if (result) summary.composited.push(result);
    } catch (err) {
      console.error(`    ✗ Failed: ${err.message}`);
      summary.failed.push({ file: fileName, error: err.message });
    }
  }

  console.log(`\n  ✓ Composited: ${summary.composited.length}, Failed: ${summary.failed.length}\n`);
  return summary;
}

// ─── CLI Entry Point ──────────────────────────────────────────────────────────

if (require.main === module) {
  runThumbnailCompositor()
    .then(summary => process.exit(summary.failed.length > 0 ? 1 : 0))
    .catch(err => {
      console.error('Fatal:', err.message);
      process.exit(1);
    });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { runThumbnailCompositor, compositeThumbnail };
