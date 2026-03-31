# Copilot Instructions for English Made Fun

## Project Overview

Fully autonomous multi-agent pipeline that generates and uploads English-learning YouTube Shorts. Runs 3–5 videos per day with zero manual intervention after setup.

**Two-layer workspace:** Root-level files are an earlier/simpler prototype. The **`english-made-fun/`** subfolder is the production system — always default to working in `english-made-fun/` unless explicitly asked about root files.

**Pipeline Flow (11 steps):**
```
Topics Queue → Scripts (Claude) → Viral Prediction (Claude) → Images (SD/DALL·E)
→ Voice (Inworld TTS) → SFX (ElevenLabs) → Render (Remotion) → Merge (FFmpeg)
→ Upload (YouTube API) → Feedback (YouTube Analytics + Claude) → Revenue Report
```

Weekly agents (Monday: competitor + audience; Sunday: feedback; 1st of month: revenue).

---

## Build & Run Commands

```bash
# Setup (from english-made-fun/)
npm install
npm run dev                              # Remotion Studio (http://localhost:3000)
node pipeline/setup_check.js --fix       # Pre-flight + auto-create folders

# Production
node pipeline/orchestrator.js            # Full 11-step pipeline
node pipeline/orchestrator.js --dry-run  # Skip real API calls
node pipeline/orchestrator.js --step=3   # Start from step 3
node pipeline/orchestrator.js --only=3,4 # Run only steps 3 and 4
npm run schedule                         # Daily cron scheduler

# Individual agents
node pipeline/script_agent.js "Topic"    # Generate scripts
node pipeline/render_agent.js scripts/approved/x.json
node pipeline/upload_agent.js --show-log
```

---

## Key Conventions

- **Formats:** `fail_fix_stickman_skit` (red→green), `word_explosion_visual_build` (dark neon), `rule_as_superpower_metaphor` (navy+gold)
- **Colors:** Wrong `#FF3B30`, Correct `#34C759`, Neutral `#1F8EF1`, Hero `#f7c948`
- **Production rendering:** 60fps, 1080×1920, H.264, CRF 18, concurrency 3
- **Root prototype:** 30fps, same resolution, Remotion CLI instead of programmatic API
- **Caching:** SFX + images use MD5(prompt) → cache_index.json. Remotion bundle cached per batch.
- **Error handling:** `withRetry()` exponential backoff on all API calls. Audio/image failures don't stop batch.
- **IDs:** Production uses UUID (`uuid` package). Root uses `${format}_${topic}_${timestamp}`.

## Environment Variables

`ANTHROPIC_API_KEY`, `INWORLD_API_KEY`, `INWORLD_WORKSPACE_ID`, `INWORLD_CHARACTER_ID`, `ELEVEN_API_KEY`, `TOGETHER_API_KEY`, `OPENAI_API_KEY`, `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`. Optional: `YOUTUBE_CHANNEL_ID`, `ELEVENLABS_VOICE_ID`, `LOG_LEVEL`, `DRY_RUN`.

## Debugging

- `node pipeline/setup_check.js --fix` — validates env vars, folders, APIs, FFmpeg, Remotion
- `npm run dev` — preview all scene templates in Remotion Studio
- `output/final/render_log.json` — per-video render status
- `config/daily_run_log.json` — last 30 runs with per-step timing
- `--dry-run` on orchestrator to trace without API costs
