/**
 * generate-sfx.js — ElevenLabs Sound Generation for vid_009
 *
 * Generates SFX audio files using ElevenLabs Sound Generation API.
 * Each SFX cue maps to a descriptive prompt for the AI sound generator.
 *
 * Usage:
 *   ELEVEN_API_KEY=your_key node scripts/generate-sfx.js
 *
 * Output: public/audio/sfx/<cue_name>.mp3
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

// ─── Config ───────────────────────────────────────────────────────────────────

const API_KEY = process.env.ELEVEN_API_KEY;
const OUTPUT_DIR = path.join(__dirname, "..", "public", "audio", "sfx");

if (!API_KEY) {
  console.error("ERROR: Set ELEVEN_API_KEY environment variable.");
  process.exit(1);
}

// ─── SFX Definitions ─────────────────────────────────────────────────────────
// Each maps to a unique sound effect with an AI-friendly prompt and duration.

const SFX_DEFS = [
  {
    id: "whoosh_slide",
    prompt: "Fast cinematic whoosh slide transition, single quick swoosh, digital, clean, no reverb tail",
    duration_seconds: 1.0,
  },
  {
    id: "explode_pop",
    prompt: "Short punchy pop explosion, comic book style, crisp burst with quick decay, digital, bright",
    duration_seconds: 1.5,
  },
  {
    id: "sparkle_pop",
    prompt: "Magical sparkle chime pop, bright crystalline twinkle, short digital bell, upbeat",
    duration_seconds: 1.2,
  },
  {
    id: "victory_chime",
    prompt: "Victory achievement chime, bright ascending three-note fanfare bell, positive, triumphant, short",
    duration_seconds: 1.5,
  },
  {
    id: "neon_buzz",
    prompt: "Short electric neon sign buzz flicker, crackling electricity zap, brief, digital",
    duration_seconds: 0.8,
  },
  {
    id: "text_reveal",
    prompt: "Quick digital text typing reveal sound, subtle keyboard click sequence, clean, modern",
    duration_seconds: 1.0,
  },
  {
    id: "bass_drop",
    prompt: "Deep bass drop impact hit, single punchy sub-bass thud, cinematic, short, clean",
    duration_seconds: 1.0,
  },
];

// ─── API Call ─────────────────────────────────────────────────────────────────

function generateSFX(sfx) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      text: sfx.prompt,
      duration_seconds: sfx.duration_seconds,
    });

    const options = {
      hostname: "api.elevenlabs.io",
      path: "/v1/sound-generation",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": API_KEY,
        Accept: "audio/mpeg",
      },
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          reject(new Error(`ElevenLabs SFX API error ${res.statusCode}: ${body}`))
        );
        return;
      }

      const outPath = path.join(OUTPUT_DIR, `${sfx.id}.mp3`);
      const fileStream = fs.createWriteStream(outPath);
      res.pipe(fileStream);
      fileStream.on("finish", () => {
        fileStream.close();
        const stats = fs.statSync(outPath);
        console.log(`  ✓ ${sfx.id}.mp3 (${(stats.size / 1024).toFixed(1)} KB)`);
        resolve(outPath);
      });
    });

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🔊 ElevenLabs SFX Generation — vid_009 MAKE\n");
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`Effects: ${SFX_DEFS.length}\n`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const results = [];
  for (const sfx of SFX_DEFS) {
    try {
      const filePath = await generateSFX(sfx);
      results.push({ id: sfx.id, path: filePath, status: "success" });
    } catch (err) {
      console.error(`  ✗ ${sfx.id}: ${err.message}`);
      results.push({ id: sfx.id, error: err.message, status: "failed" });
    }
  }

  const succeeded = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "failed").length;

  console.log(`\n📊 Results: ${succeeded} succeeded, ${failed} failed`);

  if (succeeded === SFX_DEFS.length) {
    console.log("\n✅ All SFX generated!");
  }

  // Write manifest
  const manifest = {
    video_id: "vid_009",
    generated_at: new Date().toISOString(),
    files: results,
  };
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
  console.log("📄 Manifest written to public/audio/sfx/manifest.json\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
