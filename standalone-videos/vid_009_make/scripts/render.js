/**
 * render.js — Programmatic render using @remotion/renderer
 *
 * Audio is wired per-scene directly in MakeVideo.tsx — no external voice file needed.
 *
 * Usage:
 *   node scripts/render.js
 *   node scripts/render.js --quality=high   # CRF 18 (default: 23)
 *
 * Output: output/vid_009_make.mp4
 */

const path = require("path");
const fs = require("fs");

async function main() {
  const { bundle } = await import("@remotion/bundler");
  const { renderMedia, selectComposition } = await import("@remotion/renderer");

  const args = process.argv.slice(2);
  const highQuality = args.includes("--quality=high");

  const entryPoint = path.join(__dirname, "..", "src", "index.tsx");
  const outputDir = path.join(__dirname, "..", "output");
  const outputPath = path.join(outputDir, "vid_009_make.mp4");

  fs.mkdirSync(outputDir, { recursive: true });

  console.log("\n🎬 Rendering vid_009 — The word MAKE\n");
  console.log(`  Entry: ${entryPoint}`);
  console.log(`  Output: ${outputPath}`);
  console.log(`  Quality: ${highQuality ? "HIGH (CRF 18)" : "STANDARD (CRF 23)"}\n`);

  // Step 1: Bundle
  console.log("📦 Bundling...");
  const bundleLocation = await bundle({
    entryPoint,
    webpackOverride: (config) => config,
  });

  // Step 2: Select composition
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: "MakeVideo",
    inputProps: {},
  });

  console.log(
    `📐 Composition: ${composition.width}x${composition.height} @ ${composition.fps}fps, ${composition.durationInFrames} frames (${(composition.durationInFrames / composition.fps).toFixed(1)}s)\n`
  );

  // Step 3: Render
  console.log("🎥 Rendering...");
  const startTime = Date.now();

  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: "h264",
    outputLocation: outputPath,
    inputProps: {},
    imageFormat: "jpeg",
    jpegQuality: 90,
    crf: highQuality ? 18 : 23,
    onProgress: ({ progress }) => {
      const pct = Math.round(progress * 100);
      process.stdout.write(`\r  Progress: ${pct}%`);
    },
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n\n✅ Render complete! (${elapsed}s)`);
  console.log(`📁 Output: ${outputPath}`);

  // File size
  const stats = fs.statSync(outputPath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);
  console.log(`📊 Size: ${sizeMB} MB\n`);

  // QA checklist
  console.log("─── QA Checklist ───");
  console.log("  [ ] Text legible at 1080×1920");
  console.log("  [ ] Neon glow effects visible");
  console.log("  [ ] Stickman poses correct per scene");
  console.log("  [ ] Scene transitions smooth");
  console.log("  [ ] Audio sync (if voice enabled)");
  console.log("  [ ] Total duration ~44 seconds");
  console.log("  [ ] Colors match brand (blue/pink/yellow/green)");
  console.log("  [ ] Caption text readable at bottom\n");
}

main().catch((err) => {
  console.error("Render failed:", err);
  process.exit(1);
});
