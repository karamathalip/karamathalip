/**
 * render_kisco.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders the KiscoLearning Remotion composition to MP4.
 *
 * Prerequisites:
 *   1. Run: python kisco_generate_cartoon_assets.py  (generates images + audio)
 *   2. Run: node render_kisco.js
 *
 * Output:
 *   output/kisco/The_Perfect_School_Morning_Kisco_Remotion.mp4
 */

const path = require("path");
const { bundle } = require("@remotion/bundler");
const { renderMedia, selectComposition } = require("@remotion/renderer");

const OUTPUT_DIR  = path.join(__dirname, "output", "kisco");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "The_Perfect_School_Morning_Kisco_Remotion.mp4");
const ENTRY_POINT = path.join(__dirname, "src", "index.tsx");

async function main() {
  const fs = require("fs");
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log("=".repeat(60));
  console.log("  Kisco Learning - Remotion Render");
  console.log("=".repeat(60));
  console.log(`  Composition : KiscoLearning`);
  console.log(`  Resolution  : 1920x1080 @ 30fps`);
  console.log(`  Output      : ${OUTPUT_FILE}`);
  console.log();

  // ── Bundle ─────────────────────────────────────────────────────────────────
  console.log("[1/3] Bundling...");
  const bundled = await bundle({
    entryPoint: ENTRY_POINT,
    onProgress: (p) => {
      if (p % 25 === 0) process.stdout.write(`  ${p}%\r`);
    },
  });
  console.log("  Bundle complete.\n");

  // ── Select composition ─────────────────────────────────────────────────────
  console.log("[2/3] Selecting composition...");
  const composition = await selectComposition({
    serveUrl: bundled,
    id: "KiscoLearning",
  });
  console.log(`  Duration: ${composition.durationInFrames} frames (${(composition.durationInFrames / composition.fps).toFixed(1)}s)\n`);

  // ── Render ─────────────────────────────────────────────────────────────────
  console.log("[3/3] Rendering...");
  const start = Date.now();

  await renderMedia({
    composition,
    serveUrl:   bundled,
    codec:      "h264",
    outputLocation: OUTPUT_FILE,
    crf:        18,
    concurrency: 4,
    onProgress: ({ renderedFrames, totalFrames, stitchStage }) => {
      if (stitchStage === "muxing") {
        process.stdout.write("  Muxing audio+video...\r");
        return;
      }
      if (renderedFrames % 60 === 0) {
        const pct = Math.round((renderedFrames / totalFrames) * 100);
        const elapsed = ((Date.now() - start) / 1000).toFixed(0);
        process.stdout.write(`  ${pct}% (${renderedFrames}/${totalFrames} frames, ${elapsed}s)\r`);
      }
    },
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const sizeMb  = (require("fs").statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(1);

  console.log("\n");
  console.log("=".repeat(60));
  console.log("  RENDER COMPLETE");
  console.log("=".repeat(60));
  console.log(`  Time   : ${elapsed}s`);
  console.log(`  Size   : ${sizeMb} MB`);
  console.log(`  Output : ${OUTPUT_FILE}`);
  console.log();
}

main().catch((err) => {
  console.error("[RENDER ERROR]", err.message);
  process.exit(1);
});
