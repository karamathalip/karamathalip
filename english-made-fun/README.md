# English Made Fun — Automated YouTube Shorts Pipeline

Fully autonomous multi-agent pipeline that generates and uploads English-learning YouTube Shorts. Produces 3–5 videos per day with zero manual intervention after initial setup.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Environment Variables](#environment-variables)
5. [Pipeline Steps](#pipeline-steps)
6. [Running the Pipeline](#running-the-pipeline)
7. [Individual Agents](#individual-agents)
8. [Remotion Studio (Preview)](#remotion-studio-preview)
9. [Scheduling (Unattended)](#scheduling-unattended)
10. [Configuration Files](#configuration-files)
11. [Directory Structure](#directory-structure)
12. [Content Formats](#content-formats)
13. [Viral Optimization System](#viral-optimization-system)
14. [Feedback Loop](#feedback-loop)
15. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     orchestrator.js                              │
│  Runs all steps sequentially, logs timing, handles errors       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  WEEKLY (Monday)                                                │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │ 1. competitor     │  │ 2. audience       │                    │
│  │    agent          │  │    agent          │                    │
│  └──────────────────┘  └──────────────────┘                    │
│                                                                 │
│  DAILY                                                          │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │ 3. script_agent   │→│ 4. viral_predict  │                    │
│  │    (Claude)       │  │    ion_agent      │                    │
│  └──────────────────┘  └───────┬──────────┘                    │
│          ↓ approved scripts    │ reject/revise/approve          │
│  ┌──────────────────┐  ┌──────┴───────────┐                    │
│  │ 5. image_agent    │→│ 5b. thumbnail     │                    │
│  │    (DALL-E/SDXL)  │  │    compositor     │                    │
│  └──────────────────┘  └──────────────────┘                    │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │ 6. voice_agent    │  │ 7. sfx_agent      │                    │
│  │    (Inworld TTS)  │  │    (ElevenLabs)   │                    │
│  └──────────────────┘  └──────────────────┘                    │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │ 8. render_agent   │→│ 9. upload_agent   │                    │
│  │    (Remotion)     │  │    (YouTube API)  │                    │
│  └──────────────────┘  └──────────────────┘                    │
│                                                                 │
│  WEEKLY (Sunday)                     DAILY                      │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │ 10. feedback      │  │ 10b. daily_pulse  │                    │
│  │     agent         │  │      agent        │                    │
│  └──────────────────┘  └──────────────────┘                    │
│                                                                 │
│  MONTHLY (1st)                                                  │
│  ┌──────────────────┐                                           │
│  │ 11. revenue_agent │                                           │
│  └──────────────────┘                                           │
└─────────────────────────────────────────────────────────────────┘
```

**Data flow:**

```
Topics Queue → Scripts (Claude) → Viral Scoring (Claude) → Images (DALL-E/SDXL)
→ Thumbnails (canvas compositor) → Voice (Inworld TTS) → SFX (ElevenLabs)
→ Render (Remotion + FFmpeg) → Upload (YouTube API) → Feedback (Analytics + Claude)
→ Daily Pulse → Back to Topics Queue (auto-replenish)
```

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | >= 18.0.0 | Runtime for all agents |
| **npm** | >= 9 | Package manager |
| **FFmpeg** | >= 5.0 | Audio stitching, video merging |
| **Chrome/Chromium** | Latest | Remotion rendering (headless) |

FFmpeg must be on your system PATH. Verify with:

```bash
ffmpeg -version
node --version   # must be >= 18
```

---

## Installation

```bash
# 1. Clone / navigate to the project
cd english-made-fun

# 2. Install dependencies
npm install

# 3. Create your .env file manually
# There is no committed .env.example in this repo.

# 4. Run the pre-flight check (validates everything + auto-creates folders)
node pipeline/setup_check.js --fix

# 5. Verify Remotion works
npm run dev   # opens http://localhost:3000
```

The `setup_check.js --fix` command will:
- Validate all environment variables are set
- Create missing directories (`scripts/approved/`, `images/cache/`, `audio/voice/`, etc.)
- Test API connectivity (Claude, YouTube, Inworld, ElevenLabs)
- Verify FFmpeg is installed and accessible
- Check Remotion can bundle

---

## Environment Variables

Create `english-made-fun/.env` with the following:

```env
# ─── REQUIRED ──────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...          # Claude API (script generation + analysis)
INWORLD_API_KEY=...                   # Inworld Studio TTS
INWORLD_WORKSPACE_ID=...              # Inworld workspace identifier
INWORLD_CHARACTER_ID=...              # Inworld character for voice style
ELEVEN_API_KEY=...                    # ElevenLabs (SFX generation)
YOUTUBE_CLIENT_ID=...                 # Google OAuth2 client ID
YOUTUBE_CLIENT_SECRET=...             # Google OAuth2 client secret
YOUTUBE_REFRESH_TOKEN=...             # Long-lived refresh token (see below)

# ─── OPTIONAL ──────────────────────────────────────────────────
TOGETHER_API_KEY=...                  # Together.ai (SDXL image generation)
OPENAI_API_KEY=sk-...                 # OpenAI (DALL-E 3 thumbnails + images)
YOUTUBE_CHANNEL_ID=UC...              # Explicit channel ID (auto-detected if omitted)
ELEVENLABS_VOICE_ID=...              # Custom voice ID for SFX
LOG_LEVEL=info                        # debug | info | warn | error
DRY_RUN=false                         # true = skip real API calls
```

### Getting a YouTube Refresh Token

```bash
node get_youtube_token.js
```

This opens a browser for OAuth2 consent. Grant access to your YouTube channel and the script will output a refresh token. Paste it into `.env` as `YOUTUBE_REFRESH_TOKEN`.

---

## Pipeline Steps

The orchestrator runs these steps in order. Each step is isolated — a failure in one step does not abort subsequent steps.

| Step | Agent | Frequency | Description |
|------|-------|-----------|-------------|
| **1** | `competitor_agent` | Monday | Analyses top competitor channels for hooks, formats, trends |
| **2** | `audience_agent` | Monday | Mines audience comments for pain points, generates topic ideas |
| **3** | `script_agent` | Daily | Generates 5 scripts via Claude with viral optimization prompts |
| **4** | `viral_prediction_agent` | Daily | Scores scripts (0-100). ≥80 approved, 60-79 revised, <60 rejected |
| **5** | `image_agent` | Daily | Generates scene images (SDXL) and raw thumbnails (DALL-E 3) |
| **5b** | `thumbnail_compositor` | Daily | Composites bold text overlays + borders onto raw thumbnails |
| **6** | `voice_agent` | Daily | Generates voice narration (Inworld TTS) with dynamic pauses |
| **7** | `sfx_agent` | Daily | Generates/caches sound effects (ElevenLabs) |
| **8** | `render_agent` | Daily | Renders Remotion compositions to MP4, merges audio via FFmpeg |
| **9** | `upload_agent` | Daily | Uploads to YouTube with peak-time scheduling and A/B title rotation |
| **9.5** | *(auto)* | Daily | Replenishes topics queue from audience + competitor insights |
| **10** | `feedback_agent` | Sunday | Pulls YouTube Analytics, analyses engagement/velocity with Claude |
| **10b** | `daily_pulse_agent` | Daily | Quick 7-day performance check — flags replicate/avoid patterns |
| **11** | `revenue_agent` | 1st of month | Monthly monetization plan and CTA schedule |

---

## Running the Pipeline

### Full Daily Run (Production)

```bash
# Standard production run (all steps)
node pipeline/orchestrator.js

# Dry run — traces the full pipeline without real API calls
node pipeline/orchestrator.js --dry-run

# Start from a specific step (e.g., skip script generation)
node pipeline/orchestrator.js --step=5

# Run only specific steps
node pipeline/orchestrator.js --only=3,4

# Combine: dry-run only steps 8 and 9
node pipeline/orchestrator.js --dry-run --only=8,9
```

### What Happens During a Run

1. The orchestrator checks the day of week (Monday/Sunday triggers extra agents)
2. Topics are dequeued from `config/topics_queue.json` (5 per run)
3. Topics are enriched with feedback intelligence (performance data, audience hooks, competitor patterns, daily pulse signals)
4. Scripts are generated, scored, filtered, and approved into `scripts/approved/`
5. Images, voice, and SFX are generated for each approved script
6. Thumbnails are composited with text overlays
7. Videos are rendered via Remotion at 60fps 1080×1920
8. Audio tracks are merged via FFmpeg (voice + SFX + background music)
9. Final videos are uploaded to YouTube with staggered peak-time scheduling
10. Topics queue is auto-replenished from intelligence files
11. Performance signals are checked (daily pulse) and logged

### Output

After a successful run:

```
output/final/          — rendered MP4 files
thumbnails/            — composited thumbnails (PNG)
config/daily_run_log.json  — last 30 run logs with per-step timing
config/upload_log.json     — upload history with YouTube IDs + URLs
config/analytics_log.json  — performance snapshots
config/daily_pulse.json    — latest replicate/avoid signals
```

---

## Individual Agents

Every agent can be run independently for testing or re-processing:

```bash
# Generate scripts for specific topics
node pipeline/script_agent.js "Present Tense" "Modal Verbs"

# Score all un-scored scripts in scripts/
node pipeline/viral_prediction_agent.js

# Generate images for approved scripts
node pipeline/image_agent.js

# Composite thumbnails
node pipeline/thumbnail_compositor.js

# Generate voice lines
node pipeline/voice_agent.js

# Generate SFX (cached — fast on subsequent runs)
node pipeline/sfx_agent.js

# Render approved scripts to video
node pipeline/render_agent.js

# Upload rendered videos
node pipeline/upload_agent.js
node pipeline/upload_agent.js --show-log

# Weekly analytics + feedback
node pipeline/feedback_agent.js
node pipeline/feedback_agent.js --show-feedback

# Daily performance pulse
node pipeline/daily_pulse_agent.js

# Weekly intelligence
node pipeline/competitor_agent.js
node pipeline/audience_agent.js

# Monthly revenue plan
node pipeline/revenue_agent.js
```

---

## Remotion Studio (Preview)

Preview all video templates and scenes before rendering:

```bash
npm run dev
```

This opens Remotion Studio at `http://localhost:3000` where you can:
- Preview all 5 scene types (Stickman, TextBurst, Dialogue, WordExplosion, Superpower)
- Scrub through frame-by-frame with the timeline
- Test different props/data by editing the compositions
- Verify Ken Burns drift, quiz countdowns, caption overlays, progress bar

### Scene Templates

| Template | Description | Visual Style |
|----------|-------------|-------------|
| `StickmanScene` | Character animation + text overlay | Gradient bg, particle effects |
| `TextBurstScene` | Text explodes with spring physics | 4 modes: zoom, shake, highlight, pop |
| `DialogueScene` | Chat bubble + speaking character | Speaker label + animated bubble |
| `WordExplosionScene` | Vocabulary reveal with meaning cards | Neon glow, dark background |
| `SuperpowerScene` | Grammar rule as hero power | Color shift, power burst rays |

All scenes include:
- **Ken Burns drift** — subtle 3% zoom + 8px pan over scene duration
- **Spring entrance animations** — smooth physics-based entrances
- **Keyword highlighting** — ALL-CAPS words glow in accent color
- **Gradient backgrounds** — animated radial gradients

The `VideoTemplate` composition orchestrates everything and adds:
- **3-frame crossfade transitions** between scenes
- **Progress bar** at the bottom of the video
- **Pattern interrupt** at ~18 seconds (attention reset flash)
- **Word-level TikTok-style captions** (when voice_agent produces caption files)
- **Quiz countdown overlay** (3-2-1 with spring animation)

---

## Scheduling (Unattended)

For fully autonomous daily operation:

```bash
# Start the scheduler daemon (runs orchestrator daily at 06:00 local time)
npm run schedule

# Or directly:
node pipeline/scheduler.js

# Trigger a run immediately (then continue scheduling)
node pipeline/scheduler.js --run-now

# Check next scheduled run
node pipeline/scheduler.js --status

# Dry-run mode (pass through to orchestrator)
node pipeline/scheduler.js --dry-run
```

### Running as a Background Service (Windows)

```powershell
# Option 1: PM2 (recommended)
npm install -g pm2
pm2 start pipeline/scheduler.js --name english-made-fun
pm2 save
pm2 startup    # auto-start on boot

# Option 2: Windows Task Scheduler
# Create a task that runs: node <full-path>/pipeline/orchestrator.js
# Trigger: Daily at 06:00
# Action: Start a program → node.exe
# Arguments: D:\...\english-made-fun\pipeline\orchestrator.js
```

### Running as a Background Service (Linux)

```bash
# systemd service
sudo nano /etc/systemd/system/english-made-fun.service

[Unit]
Description=English Made Fun Pipeline Scheduler
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/english-made-fun
ExecStart=/usr/bin/node pipeline/scheduler.js
Restart=on-failure

[Install]
WantedBy=multi-user.target

# Enable and start
sudo systemctl enable english-made-fun
sudo systemctl start english-made-fun
```

---

## Configuration Files

All configuration lives in `config/`:

| File | Purpose | Updated By |
|------|---------|------------|
| `local_config.json` | Rendering, audio, image, upload, and pipeline settings | Manual edit |
| `topics_queue.json` | Queue of topic strings (FIFO, auto-replenished) | orchestrator / audience_agent |
| `voice_profiles.json` | TTS voice character definitions | Manual edit |
| `sfx_library.json` | SFX key-to-prompt mapping (26 cues) | Manual edit |
| `competitors.json` | Competitor channel IDs to monitor | Manual edit |
| `feedback_latest.json` | Latest Claude analysis of performance | feedback_agent |
| `daily_pulse.json` | Daily replicate/avoid signals | daily_pulse_agent |
| `upload_log.json` | Upload history with YouTube IDs | upload_agent |
| `analytics_log.json` | Raw analytics snapshots | feedback_agent |
| `daily_run_log.json` | Last 30 orchestrator runs | orchestrator |
| `audience_insights.json` | Audience pain points + topic ideas | audience_agent |
| `competitor_insights.json` | Competitor hooks + format analysis | competitor_agent |

### Key Settings in `local_config.json`

```jsonc
{
  "rendering": {
    "frame_rate": 60,             // 60fps for smooth Shorts
    "resolution": "1080x1920",    // 9:16 vertical
    "parallel_jobs": 3,           // concurrent Remotion renders
    "crf": 18                     // quality (lower = better, 18 is visually lossless)
  },
  "pipeline": {
    "viral_score_threshold": 50,  // below this → reject permanently
    "revision_threshold": 60,     // 50-79 → revise
    "produce_threshold": 80,      // 80+ → approve
    "scripts_per_run": 5          // how many scripts per daily batch
  },
  "upload": {
    "daily_shorts": 3,            // videos uploaded per day
    "stagger_hours": 4,           // gap between uploads
    "privacy_status": "private"   // "private" | "public" | "unlisted"
  }
}
```

### Topics Queue

`config/topics_queue.json` is a simple JSON array of topic strings:

```json
[
  "Present Simple vs Present Continuous",
  "Must vs Have To — Modal Verbs",
  "Phrasal Verbs with GET",
  "First Conditional — Real Future Situations"
]
```

The orchestrator dequeues 5 topics per run. After uploads, it auto-replenishes from audience + competitor intelligence. If the queue is empty, built-in fallback topics are used.

---

## Directory Structure

```
english-made-fun/
├── pipeline/                    # All pipeline agents (Node.js)
│   ├── orchestrator.js          # Master pipeline runner
│   ├── scheduler.js             # Cron-based scheduler daemon
│   ├── setup_check.js           # Pre-flight validation + auto-fix
│   ├── script_agent.js          # Claude script generation
│   ├── viral_prediction_agent.js# Viral scoring + filter
│   ├── image_agent.js           # DALL-E / SDXL image generation
│   ├── thumbnail_compositor.js  # Canvas text overlay compositing
│   ├── voice_agent.js           # Inworld TTS + caption export
│   ├── sfx_agent.js             # ElevenLabs SFX generation
│   ├── render_agent.js          # Remotion render + FFmpeg merge
│   ├── upload_agent.js          # YouTube upload + scheduling
│   ├── feedback_agent.js        # Weekly analytics + Claude analysis
│   ├── daily_pulse_agent.js     # Daily quick performance check
│   ├── competitor_agent.js      # Weekly competitor analysis
│   ├── audience_agent.js        # Weekly audience mining
│   └── revenue_agent.js         # Monthly monetization plan
│
├── components/                  # Remotion React components (TSX)
│   ├── VideoTemplate.tsx        # Main composition (sequences, audio, captions, overlays)
│   ├── Scene.tsx                # Scene type router
│   ├── StickmanScene.tsx        # Character animation scene
│   ├── TextBurstScene.tsx       # Text explosion scene
│   ├── DialogueScene.tsx        # Chat bubble scene
│   ├── WordExplosionScene.tsx   # Vocabulary reveal scene
│   ├── SuperpowerScene.tsx      # Grammar-as-power scene
│   ├── Stickman.tsx             # Stickman character (SVG poses)
│   └── index.ts                 # Component exports
│
├── src/                         # Remotion entry points
│   ├── index.tsx                # registerRoot
│   ├── Root.tsx                 # Composition definitions
│   └── compositions/            # Composition configs
│
├── config/                      # All configuration + state files
├── scripts/                     # Generated scripts (daily)
│   └── approved/                # Viral-approved scripts
├── images/                      # Generated images
│   ├── cache/                   # MD5 hash-based cache
│   └── reuse_library/           # Reusable stock images
├── audio/
│   ├── voice/                   # Generated voice tracks
│   ├── voices/                  # Voice profile samples
│   └── sfx/                     # Generated + cached SFX
├── thumbnails/                  # Composited thumbnails
├── output/final/                # Rendered MP4 files + render log
├── templates/                   # JSON templates per format
├── renders/                     # Intermediate render files
├── videos/                      # Additional video assets
├── package.json
├── tsconfig.json
├── remotion.config.ts
└── .env                         # API keys (not committed)
```

---

## Content Formats

The pipeline rotates across three content formats optimized for YouTube Shorts:

### 1. Fail → Fix Stickman Skit (`fail_fix_stickman_skit`)

- **Style:** Red (#FF3B30) wrong → Green (#34C759) correct
- **Flow:** Common mistake demo → embarrassing context → rule explanation → correct usage → CTA
- **Scenes:** StickmanScene (fail + fix) + TextBurstScene (rule)

### 2. Word Explosion Visual Build (`word_explosion_visual_build`)

- **Style:** Dark neon background, glowing accents
- **Flow:** Big word appears → explodes into meanings → examples → quiz → CTA
- **Scenes:** WordExplosionScene + TextBurstScene

### 3. Rule as Superpower Metaphor (`rule_as_superpower_metaphor`)

- **Style:** Navy (#1a1a2e) + Gold (#f7c948)
- **Flow:** Grey world → hero learns rule → world transforms → power demo → CTA
- **Scenes:** SuperpowerScene + StickmanScene + DialogueScene

---

## Viral Optimization System

Every video goes through a multi-layered viral optimization pipeline:

### Script Generation (script_agent)

Claude generates scripts with enforced rules:
- **Hook:** First 3 seconds must use identity attack, impossible claim, or social fear pattern
- **Comment engineering:** Every script includes a debate statement + fill-in-the-blank quiz
- **Emotional arc:** SHOCK → PAIN → CLARITY → TRIUMPH → URGENCY
- **Loop trigger:** Last scene echoes/contradicts the hook for rewatch behavior
- **Titles:** 3 variants, max 50 chars, 1-2 CAPS power words

### Viral Scoring (viral_prediction_agent)

Claude scores each script across 9 weighted dimensions:

| Sub-Score | Weight | What it measures |
|-----------|--------|-----------------|
| Hook Power | 25% | First 3 seconds scroll-stopping strength |
| First Frame Stop | 10% | Visual arrest on frame 1 |
| Retention Forecast | 20% | Predicted watch-through rate |
| Emotional Impact | 10% | Emotional arc strength |
| Clarity | 10% | Educational value + simplicity |
| Shareability | 10% | Will viewers send this to friends? |
| Novelty | 5% | Unique angle vs. existing content |
| Comment Trigger | 5% | Likelihood of comment engagement |
| Rewatch Probability | 5% | Loop effect + curiosity gap |

Additional predictions:
- `predicted_dropoff_second` — when most viewers will leave
- `retention_curve_prediction` — [25%, 50%, 75%, 100%] retention estimates
- `thumbnail_ctr_score` — estimated click-through rate of thumbnail

**Decision rules:**
- Score ≥ 80 → **Approved** (moved to `scripts/approved/`)
- Score 60–79 → **Revised** (Claude improves it, re-scored)
- Score < 60 → **Rejected** (logged, not produced)

### Video Features

- **Ken Burns drift** on all scenes (3% zoom + 8px pan)
- **3-frame crossfades** between scenes
- **Progress bar** showing video position
- **Pattern interrupt** at 18s (attention flash)
- **Dynamic voice pauses** per scene type (0.8s dramatic pause before payoff)
- **Word-level TikTok captions** with active word highlighting
- **Peak-time upload scheduling** (12:00, 17:00, or 21:00 UTC)
- **A/B title rotation** across batch (tests 3 title variants)

---

## Feedback Loop

The pipeline continuously learns from performance data:

### Daily: `daily_pulse_agent`

Checks videos uploaded in the last 7 days:
- **Replicate** (retention ≥ 80% or engagement ≥ 8%) — patterns fed back as "do more of this"
- **Avoid** (retention < 50%) — patterns flagged as "stop doing this"
- Output: `config/daily_pulse.json`

### Weekly: `feedback_agent` (Sundays)

Pulls full YouTube Analytics for all uploaded videos:
- **Engagement rate:** `(likes + comments + shares) / views × 100`
- **Velocity ratio:** estimates front-loaded virality from view rate
- **Claude analysis:** identifies winning/losing patterns, format rankings, hook feedback
- Output: `config/feedback_latest.json` → automatically read by script_agent on next run

### Intelligence Injection

The orchestrator enriches every topic with signals from:

1. `feedback_latest.json` → script instructions from feedback analysis
2. `audience_insights.json` → audience pain points and hooks
3. `competitor_insights.json` → competitor hook patterns
4. `daily_pulse.json` → recent replicate/avoid titles

This creates a closed loop: **generate → upload → measure → learn → improve → generate.**

---

## Troubleshooting

### Pre-Flight Check

```bash
node pipeline/setup_check.js --fix
```

This validates everything and auto-creates missing folders. Run it first if anything seems broken.

### Common Issues

| Problem | Solution |
|---------|----------|
| `ANTHROPIC_API_KEY not set` | Add it to `english-made-fun/.env` |
| `Cannot read upload_log.json` | Run `upload_agent.js` at least once first |
| `FFmpeg not found` | Install FFmpeg and add to PATH |
| `Remotion render fails` | Run `npm run dev` to check composition errors |
| `YouTube quota exceeded` | YouTube API has daily quotas. Wait 24h or request quota increase |
| `SFX generation slow` | SFX are cached by MD5(prompt). Second runs are instant |
| `Scripts all rejected` | Lower `viral_score_threshold` in `config/local_config.json` |
| `Topics queue empty` | Add topics to `config/topics_queue.json` or let audience_agent replenish |

### Logs

```bash
# PowerShell examples (Windows)
Get-Content config/daily_run_log.json
Get-Content output/final/render_log.json
Get-Content config/upload_log.json
Get-Content config/feedback_latest.json
Get-Content config/daily_pulse.json
```

### Dry Run

Always test with `--dry-run` first:

```bash
node pipeline/orchestrator.js --dry-run
```

This traces the full pipeline flow without consuming API credits. Script generation still calls Claude (for realistic testing), but all other agents return mock data.

### Manual Re-Processing

If a step fails mid-batch, you can re-run from that step:

```bash
# Re-run from step 8 (render) onwards
node pipeline/orchestrator.js --step=8

# Re-run only upload
node pipeline/orchestrator.js --only=9
```

---

## Quick Start (TL;DR)

```bash
cd english-made-fun
npm install
# Set up .env with API keys (see Environment Variables section)
node pipeline/setup_check.js --fix
node pipeline/orchestrator.js --dry-run    # verify the flow
node pipeline/orchestrator.js              # run for real
npm run schedule                           # automate daily
```
