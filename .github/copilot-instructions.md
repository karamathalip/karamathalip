# Copilot Instructions for English Made Fun

## Project Overview

This is a fully autonomous multi-agent pipeline that generates and uploads English-learning YouTube Shorts. It runs 3–5 videos per day with zero manual intervention after setup.

**Pipeline Flow:**
```
Topics (AI-curated) → Scripts (Claude) → Viral Filter (Claude) → Visual Blueprint (Claude)
→ Voice (Inworld) → SFX (ElevenLabs) → Images (Stable Diffusion / DALL·E) 
→ Render (Remotion) → Merge (FFmpeg) → Upload (YouTube API) → Feedback Loop (Claude)
```

## Build, Test & Run Commands

### Setup & Validation
```bash
npm install                           # Install all dependencies
npm run studio                        # Preview animations in browser (http://localhost:3000)
node setup/health_check.js           # Pre-flight system check (must pass before running)
node setup/get_youtube_token.js      # One-time YouTube OAuth setup
```

### Production Commands
```bash
node pipeline/run_daily_batch.js     # Run one complete batch manually (4 videos, ~20-30 min first run)
node pipeline/scheduler.js           # Start fully automatic mode (runs 3x/day at 07:00, 12:00, 17:00)

# With PM2 (for persistent background scheduling)
npm install -g pm2
pm2 start pipeline/scheduler.js --name "english-made-fun"
pm2 logs english-made-fun            # View real-time logs
pm2 status                           # Check if running
```

### Individual Agent Commands
```bash
node pipeline/script_agent.js        # Generate scripts only
node pipeline/viral_agent.js         # Score scripts for viral potential
node pipeline/visual_agent.js        # Create visual blueprints (storyboards)
node pipeline/audio_agent.js         # Generate voice narration (Inworld)
node pipeline/sfx_agent.js           # Generate sound effects (ElevenLabs)
node pipeline/image_agent.js         # Generate scene images (Stable Diffusion / DALL·E)
node pipeline/render_agent.js        # Render videos with Remotion
node pipeline/upload_agent.js        # Upload to YouTube
node pipeline/feedback_agent.js      # Analyze performance & generate next day's topics
```

## Architecture

### Core Pipeline Orchestration
- **`pipeline/run_daily_batch.js`** — Master orchestrator. Invokes all agents in sequence for a single batch. Tracks status (produced/uploaded/rejected/errors) and saves a JSON report.
- **`pipeline/scheduler.js`** — Cron-like scheduler that triggers `run_daily_batch.js` 3x daily.

### Multi-Agent System
Each agent is stateless and specialized:

1. **script_agent.js** — Claude API generates structured JSON scripts with storyboard scenes, dialogue, format type (fail_fix, word_explosion, superpower).
2. **viral_agent.js** — Claude API scores scripts (0-100) for viral potential using heuristics like hook strength, emotional punch, rewatch value.
3. **visual_agent.js** — Claude API converts scripts into storyboard blueprints (timing, scene descriptions, stickman poses, effects, colors).
4. **audio_agent.js** — Calls Inworld API to generate voice narration MP3s.
5. **sfx_agent.js** — Calls ElevenLabs API for sound effects (cached and reused).
6. **image_agent.js** — Calls Together AI (Stable Diffusion) and OpenAI (DALL·E) to generate scene images.
7. **render_agent.js** — Renders video frames with Remotion, outputs MP4. Also merges audio via FFmpeg.
8. **upload_agent.js** — YouTube Data API v3 uploads MP4, generates thumbnail, adds to playlist.
9. **feedback_agent.js** — Pulls YouTube Analytics, identifies top formats/topics, generates optimized topic ideas for next batch.

### Rendering Pipeline (Remotion)
- **`src/Root.tsx`** — Composition registry. Loads props from `REMOTION_PROPS` env var (set by `render_agent.js`).
- **`components/VideoTemplate.tsx`** — Main video composition. Accepts storyboard and renders frame-by-frame.
- **`components/Scene.tsx`** — Single scene renderer (3 seconds each).
- **`components/Stickman.tsx`** — Animated stickman character with 10+ poses (fail, win, pointing, jumping, etc.).
- **`components/Background.tsx`** — Animated backgrounds + visual effects (color transitions, explosions, glows).

### Shared Utilities
- **`pipeline/utils.js`** — Winston logger (stdout + daily log files), file I/O helpers, retry logic with exponential backoff, date/time utilities, path constants.

### File Structure
```
english-made-fun/
├── .env                              ← API keys (never commit)
├── package.json
├── src/
│   ├── index.tsx                     ← Remotion entry point
│   └── Root.tsx                      ← Composition registry
├── components/                       ← Remotion React components
│   ├── VideoTemplate.tsx
│   ├── Scene.tsx
│   ├── Stickman.tsx
│   └── Background.tsx
├── pipeline/                         ← Node.js agents
│   ├── run_daily_batch.js            ★ Master orchestrator
│   ├── scheduler.js
│   ├── script_agent.js
│   ├── viral_agent.js
│   ├── visual_agent.js
│   ├── audio_agent.js
│   ├── sfx_agent.js
│   ├── image_agent.js
│   ├── render_agent.js
│   ├── upload_agent.js
│   ├── feedback_agent.js
│   └── utils.js
├── setup/                            ← One-time setup scripts
│   ├── get_youtube_token.js
│   └── health_check.js
├── templates/                        ← JSON storyboard templates
│   ├── fail_fix_template.json
│   ├── word_explosion_template.json
│   └── superpower_rule_template.json
├── scripts/                          ← Generated daily (JSON scripts)
├── audio/                            ← Generated voice & SFX
│   ├── voices/
│   └── sfx/
├── images/                           ← Generated scene images
├── videos/                           ← Remotion-rendered MP4s
├── output/final/                     ← FFmpeg-merged final videos
├── logs/                             ← Daily batch reports
└── thumbnails/                       ← Generated YouTube thumbnails
```

## Key Conventions

### Naming & IDs
- **video_id** — Unique per video per batch. Format: `${format}_${topic_slug}_${timestamp}`. Used throughout for tracking.
- **format** — One of: `fail_fix`, `word_explosion`, `superpower` (defined in `script_agent.js`).
- **Timestamps** — ISO 8601 strings for logs. Date-only format (YYYY-MM-DD) for file organization via `datestamp()` helper.

### Data Flow & JSON Structure
- **Scripts** — Generated by `script_agent.js`, saved to `scripts/` as JSON with fields: `video_id`, `video_title`, `format`, `topic`, `level`, `storyboard` (array of scenes), `script_lines`, `hooks`.
- **Storyboards** — Array of scenes, each with: `time`, `scene_description`, `on_screen_text`, `stickman_pose`, `text_color`, `background_color`, `effects[]`.
- **Visual Blueprints** — Same storyboard structure, enhanced with timing, pose details, and effect metadata.
- **Batch Status** — Saved to `logs/` at end of each run. Fields: `date`, `started`, `total`, `produced`, `uploaded`, `rejected`, `errors[]`, `videos[]`.

### Logging
- **Logger** — Winston instance configured in `utils.js`. Logs to both stdout and daily log files in `logs/` directory.
- **Log Level** — Controlled by `LOG_LEVEL` env var (default: "info"). Use `logger.info()`, `logger.warn()`, `logger.error()` throughout agents.
- **Timestamps** — All logs include `[HH:MM:SS]` prefix for debugging.

### Environment Variables
- **API Keys** — `ANTHROPIC_API_KEY`, `INWORLD_API_KEY`, `INWORLD_WORKSPACE`, `INWORLD_CHARACTER_ID`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `TOGETHER_API_KEY`, `OPENAI_API_KEY`, `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`, `YOUTUBE_CHANNEL_ID`.
- **Tuning** — `VIDEOS_PER_DAY` (default: 4), `VIRAL_SCORE_THRESHOLD` (default: 60), `MAX_IMAGES_PER_VIDEO` (default: 2).
- **Remotion** — `REMOTION_PROPS` env var points to JSON file with video props (set by `render_agent.js` before rendering).

### Error Handling
- **Retry Logic** — `withRetry()` helper in `utils.js` implements exponential backoff. Used for API calls.
- **Graceful Degradation** — If audio generation fails, video renders without voice. If image generation fails, continues with placeholder. Each stage has try-catch; errors are logged and tracked in `batchStatus.errors[]`.
- **Batch Recovery** — If a video fails partway through, the batch continues with remaining videos. Failed video's error is logged to `videoRecord.error`.

### Stickman Animations
- **Poses** — Defined in `Stickman.tsx`. Available: fail, win, pointing, jumping, waving, thinking, shocked, celebrating, confused, dancing.
- **Colors** — Red (#FF3B30) for wrong/fail, Green (#34C759) for correct/win, Blue (#1F8EF1) for neutral/learning.
- **Effects** — Handled in `Background.tsx`. Types: wrong (red flash), correct (green pulse), explosion, glow, confetti.

### Remotion Rendering
- **FPS** — 30 frames per second (hardcoded in `Root.tsx`).
- **Scene Duration** — 3 seconds (90 frames) per scene by default.
- **Total Video Length** — `totalFrames = storyboard.length * framesPerScene`.
- **Props Passing** — Video props loaded from file path in `REMOTION_PROPS` env var. This allows dynamic rendering from JSON without code changes.

### Self-Improvement Loop
After each batch:
1. `feedback_agent.js` pulls YouTube Analytics (views, watch time, retention, CTR).
2. Identifies top-performing formats and topics.
3. Generates 10 optimized topic ideas for tomorrow's batch.
4. Saves to `scripts/improvements_${date}.json`.
5. Next batch automatically loads from this file.

After first week, pipeline is entirely data-driven (no seed topics needed).

## Performance & Debugging Tips

- **Dry run** — Run `npm run studio` first to verify Remotion setup and animation rendering.
- **Health check first** — Always run `node setup/health_check.js` before production runs. It validates Node.js, FFmpeg, folder structure, API key presence, and API connectivity.
- **Watch the logs** — `pipeline-${date}.log` in `logs/` directory contains full execution trace. Check for API timeouts, failed retries, or image generation issues.
- **Test a single agent** — Each agent can be tested independently. E.g., `node -e "import('./pipeline/script_agent.js').then(m => m.generateScript({format: 'fail_fix', topic: 'have vs have got', level: 'B1'}).then(console.log))"`.
- **PM2 monitoring** — `pm2 logs english-made-fun --lines 100 --err` shows last 100 lines of logs and any error output. Use `pm2 stop english-made-fun` to pause, `pm2 restart` to resume.
