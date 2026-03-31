// setup/health_check.js
// Validates all API keys, dependencies, and folder structure before first run.
// Run: node setup/health_check.js
import "dotenv/config";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import Anthropic from "@anthropic-ai/sdk";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

let passed = 0;
let failed = 0;
const results = [];

function check(label, ok, note = "") {
  const icon = ok ? "✅" : "❌";
  const line = `  ${icon} ${label}${note ? ` — ${note}` : ""}`;
  results.push(line);
  if (ok) passed++; else failed++;
}

async function run() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  🏥 HEALTH CHECK — English Made Fun Pipeline");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // ── Node version ──────────────────────────────────────────────────────────
  const nodeVersion = process.version;
  const nodeMajor = parseInt(nodeVersion.replace("v", "").split(".")[0]);
  check("Node.js version", nodeMajor >= 18, nodeVersion);

  // ── FFmpeg ────────────────────────────────────────────────────────────────
  try {
    const ffmpegVersion = execSync("ffmpeg -version 2>&1").toString().split("\n")[0];
    check("FFmpeg installed", true, ffmpegVersion.slice(0, 40));
  } catch {
    check("FFmpeg installed", false, "Install from https://ffmpeg.org/download.html");
  }

  // ── Folder structure ──────────────────────────────────────────────────────
  const requiredDirs = [
    "scripts", "audio/voices", "audio/sfx", "images",
    "thumbnails", "videos", "output/final", "components",
    "templates", "pipeline", "logs",
  ];
  const missingDirs = requiredDirs.filter(
    (d) => !fs.existsSync(path.join(ROOT, d))
  );
  check("Folder structure", missingDirs.length === 0,
    missingDirs.length > 0 ? `Missing: ${missingDirs.join(", ")}` : "All present");

  // ── .env file ─────────────────────────────────────────────────────────────
  check(".env file exists", fs.existsSync(path.join(ROOT, ".env")));

  // ── Required env vars ─────────────────────────────────────────────────────
  const requiredEnv = [
    "ANTHROPIC_API_KEY", "INWORLD_API_KEY", "ELEVENLABS_API_KEY",
    "TOGETHER_API_KEY", "OPENAI_API_KEY",
    "YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN",
  ];
  for (const envKey of requiredEnv) {
    const val = process.env[envKey];
    check(`env: ${envKey}`, !!val && val.length > 10 && !val.includes("XXX"),
      val ? "Set ✓" : "MISSING — add to .env");
  }

  // ── Claude API ────────────────────────────────────────────────────────────
  if (process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.includes("XXX")) {
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const res = await client.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 10,
        messages: [{ role: "user", content: "ping" }],
      });
      check("Claude API reachable", !!res.content[0].text);
    } catch (err) {
      check("Claude API reachable", false, err.message.slice(0, 60));
    }
  } else {
    check("Claude API reachable", false, "Key not set");
  }

  // ── ElevenLabs API ────────────────────────────────────────────────────────
  if (process.env.ELEVENLABS_API_KEY && !process.env.ELEVENLABS_API_KEY.includes("XXX")) {
    try {
      const res = await fetch("https://api.elevenlabs.io/v1/user", {
        headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY },
      });
      check("ElevenLabs API reachable", res.ok, res.ok ? "OK" : `HTTP ${res.status}`);
    } catch (err) {
      check("ElevenLabs API reachable", false, err.message.slice(0, 60));
    }
  } else {
    check("ElevenLabs API reachable", false, "Key not set");
  }

  // ── Together AI (Stable Diffusion) ────────────────────────────────────────
  if (process.env.TOGETHER_API_KEY && !process.env.TOGETHER_API_KEY.includes("XXX")) {
    try {
      const res = await fetch("https://api.together.xyz/v1/models", {
        headers: { Authorization: `Bearer ${process.env.TOGETHER_API_KEY}` },
      });
      check("Together AI API reachable", res.ok, res.ok ? "OK" : `HTTP ${res.status}`);
    } catch (err) {
      check("Together AI API reachable", false, err.message.slice(0, 60));
    }
  } else {
    check("Together AI API reachable", false, "Key not set");
  }

  // ── Remotion installed ────────────────────────────────────────────────────
  const hasRemotion = fs.existsSync(path.join(ROOT, "node_modules", "remotion"));
  check("Remotion installed", hasRemotion, hasRemotion ? "" : "Run: npm install");

  // ── Template files ────────────────────────────────────────────────────────
  const templates = ["fail_fix_template.json", "word_explosion_template.json", "superpower_rule_template.json"];
  for (const t of templates) {
    check(`Template: ${t}`, fs.existsSync(path.join(ROOT, "templates", t)));
  }

  // ── Print results ─────────────────────────────────────────────────────────
  results.forEach((r) => console.log(r));

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  PASSED: ${passed}   FAILED: ${failed}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  if (failed === 0) {
    console.log("🚀 All checks passed! You're ready to run:");
    console.log("   node pipeline/run_daily_batch.js\n");
  } else {
    console.log(`⚠  Fix the ${failed} failed check(s) above before running the pipeline.\n`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Health check crashed:", err.message);
  process.exit(1);
});
