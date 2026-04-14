/**
 * generate-voice.js — ElevenLabs TTS voice generation for vid_009
 *
 * Generates per-scene voice clips and writes a timing manifest
 * so the video's scene durations can be set from actual clip lengths.
 *
 * Voice: Sam — casual, creator-style, energetic male narrator.
 * Narration text is trimmed for punchy delivery (~4-7s per scene).
 *
 * After generation each clip is silence-stripped with ffmpeg
 * (silences > 0.4s removed) and the timing manifest uses
 * clipDuration + 0.2 hard cap for scene durations.
 *
 * Usage:
 *   ELEVEN_API_KEY=your_key node scripts/generate-voice.js
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { execSync } = require("child_process");

// ─── Config ───────────────────────────────────────────────────────────────────

const API_KEY = process.env.ELEVEN_API_KEY || process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.VOICE_ID || "yoZ06aMxZJJ28mfd3POQ"; // Sam — casual, creator-style
const MODEL_ID = "eleven_multilingual_v2";
const OUTPUT_DIR = path.join(__dirname, "..", "public", "audio", "voice");

if (!API_KEY) {
  console.error("ERROR: Set ELEVEN_API_KEY environment variable.");
  process.exit(1);
}

// ─── Voice Lines (trimmed for tight sync) ─────────────────────────────────────
//
// Each line targets a scene. Text is kept concise so the clip naturally
// finishes within 4-8 seconds at a calm reading pace.

const VOICE_LINES = [
  {
    id: "01_hook",
    sceneId: "hook",
    text: "she made me a cake to make me cry so she could make money. wait. that sentence uses make three completely different ways.",
    stability: 0.40,
    similarity_boost: 0.85,
    style: 0.55,
  },
  {
    id: "02_meaning_1",
    sceneId: "meaning_1",
    text: "make number one. to create. you make a cake. you make a plan. you make a mistake. you're building something that didn't exist.",
    stability: 0.40,
    similarity_boost: 0.85,
    style: 0.55,
  },
  {
    id: "03_meaning_2",
    sceneId: "meaning_2",
    text: "make number two. to force. the movie made me cry. my boss makes me work late. nobody built anything. somebody got forced.",
    stability: 0.40,
    similarity_boost: 0.85,
    style: 0.55,
  },
  {
    id: "04_meaning_3",
    sceneId: "meaning_3",
    text: "make number three. to earn. she makes fifty thousand a year. he makes good money. this is the one about getting paid.",
    stability: 0.40,
    similarity_boost: 0.85,
    style: 0.55,
  },
  {
    id: "05_explosion",
    sceneId: "explosion_reveal",
    text: "create. force. earn. one tiny word doing three completely different jobs.",
    stability: 0.40,
    similarity_boost: 0.85,
    style: 0.55,
  },
  {
    id: "06_mini_story",
    sceneId: "mini_story",
    text: "watch all three in one sentence. she makes great money making youtube videos which makes her followers happy.",
    stability: 0.40,
    similarity_boost: 0.85,
    style: 0.55,
  },
  {
    id: "07_loop_back",
    sceneId: "loop_back",
    text: "okay one more. he made it after she made him make her a cake. how many makes is that? count again.",
    stability: 0.40,
    similarity_boost: 0.85,
    style: 0.55,
  },
];

// ─── API Call ─────────────────────────────────────────────────────────────────

function generateVoice(line) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      text: line.text,
      model_id: MODEL_ID,
      voice_settings: {
        stability: line.stability,
        similarity_boost: line.similarity_boost,
        style: line.style,
        use_speaker_boost: true,
      },
    });

    const options = {
      hostname: "api.elevenlabs.io",
      path: `/v1/text-to-speech/${VOICE_ID}`,
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
          reject(new Error(`ElevenLabs API error ${res.statusCode}: ${body}`))
        );
        return;
      }

      const outPath = path.join(OUTPUT_DIR, `${line.id}.mp3`);
      const fileStream = fs.createWriteStream(outPath);
      res.pipe(fileStream);
      fileStream.on("finish", () => {
        fileStream.close();
        console.log(`  ✓ ${line.id}.mp3`);

        // Post-process: strip internal silences > 0.4s down to 0.15s
        try {
          const tightPath = outPath.replace('.mp3', '.tight.mp3');
          execSync(`ffmpeg -y -i "${outPath}" -af ` +
            `"silenceremove=stop_periods=-1:stop_duration=0.4:` +
            `stop_threshold=-40dB:detection=peak" ` +
            `"${tightPath}"`, { stdio: 'inherit' });
          // Use copy+delete instead of rename to avoid EPERM on Windows
          fs.copyFileSync(tightPath, outPath);
          fs.unlinkSync(tightPath);
          console.log(`       ✓ silence-stripped`);
        } catch (e) {
          console.warn(`       ⚠ silence-strip failed: ${e.message}`);
        }

        resolve(outPath);
      });
    });

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function probeDuration(filePath) {
  try {
    const raw = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`,
      { encoding: "utf-8" }
    ).trim();
    return parseFloat(raw);
  } catch {
    return 0;
  }
}

async function main() {
  console.log("\n🎙️  ElevenLabs Voice Generation — vid_009 MAKE\n");
  console.log(`Voice: Sam (${VOICE_ID}) — casual, creator-style`);
  console.log(`Model: ${MODEL_ID}`);
  console.log(`Output: ${OUTPUT_DIR}\n`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const results = [];
  for (const line of VOICE_LINES) {
    try {
      const filePath = await generateVoice(line);
      const duration = probeDuration(filePath);
      console.log(`       duration: ${duration.toFixed(2)}s`);
      results.push({ id: line.id, sceneId: line.sceneId, path: filePath, duration, status: "success" });
    } catch (err) {
      console.error(`  ✗ ${line.id}: ${err.message}`);
      results.push({ id: line.id, sceneId: line.sceneId, error: err.message, duration: 0, status: "failed" });
    }
  }

  const succeeded = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const totalDur = results.reduce((a, r) => a + r.duration, 0);

  console.log(`\n📊 Results: ${succeeded} succeeded, ${failed} failed`);
  console.log(`⏱️  Total voice duration: ${totalDur.toFixed(1)}s`);

  // Write timing manifest (scene durations = clip duration + 0.2s hard cap)
  const timing = {};
  for (const r of results) {
    if (r.status === "success") {
      const sceneDur = parseFloat((r.duration + 0.2).toFixed(2));
      timing[r.sceneId] = {
        clipFile: `${r.id}.mp3`,
        clipDuration: parseFloat(r.duration.toFixed(2)),
        sceneDuration: sceneDur,
      };
    }
  }

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "timing.json"),
    JSON.stringify(timing, null, 2)
  );
  console.log("\n📄 Timing manifest → public/audio/voice/timing.json");

  // Also write full manifest
  const manifest = {
    video_id: "vid_009",
    voice_id: VOICE_ID,
    voice_name: "Sam",
    model_id: MODEL_ID,
    generated_at: new Date().toISOString(),
    total_voice_duration: parseFloat(totalDur.toFixed(2)),
    files: results,
    timing,
  };
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
  console.log("📄 Full manifest → public/audio/voice/manifest.json");

  if (succeeded === VOICE_LINES.length) {
    console.log("\n✅ All voice lines generated! Use timing.json to update scene durations.\n");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
