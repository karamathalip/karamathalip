# English Made Fun — Automated YouTube Pipeline
## Complete Setup Guide

---

## WHAT YOU HAVE

A fully autonomous multi-agent pipeline that runs on your local machine:

```
Topics (AI-curated) → Scripts (Claude) → Viral Filter (Claude)
 → Visual Blueprint (Claude) → Voice (Inworld) → SFX (ElevenLabs)
 → Images (Stable Diffusion / DALL·E) → Render (Remotion)
 → Merge (FFmpeg) → Upload (YouTube API) → Feedback Loop (Claude)
```

3–5 videos per day, fully hands-off after setup.

---

## STEP 1 — Copy the project to your machine

All files are in the `english-made-fun/` folder. Copy it wherever you want to run it, e.g.:

```
~/Desktop/english-made-fun/
```

---

## STEP 2 — Install Node.js (if not already installed)

Download from: https://nodejs.org  (choose LTS, version 18 or higher)

Verify:
```bash
node --version   # must show v18.x or higher
```

---

## STEP 3 — Install FFmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Windows:**
Download from https://ffmpeg.org/download.html  
Add to PATH: System → Advanced → Environment Variables → PATH → add ffmpeg/bin folder.

**Ubuntu/Linux:**
```bash
sudo apt-get install ffmpeg
```

Verify:
```bash
ffmpeg -version
```

---

## STEP 4 — Install Node dependencies

```bash
cd english-made-fun
npm install
```

This installs: Remotion, Anthropic SDK, googleapis, OpenAI SDK, ElevenLabs, Winston, etc.

---

## STEP 5 — Fill in your .env file

Open `english-made-fun/.env` and replace every `XXXXXXXX` with your real API keys:

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | https://console.anthropic.com |
| `INWORLD_API_KEY` | https://studio.inworld.ai → Settings → API |
| `INWORLD_WORKSPACE` | https://studio.inworld.ai → your workspace name in URL |
| `INWORLD_CHARACTER_ID` | Create a character, copy ID from URL |
| `ELEVENLABS_API_KEY` | https://elevenlabs.io → Profile → API Key |
| `ELEVENLABS_VOICE_ID` | https://elevenlabs.io → Voices → copy voice ID |
| `TOGETHER_API_KEY` | https://api.together.xyz → Settings → API Keys |
| `OPENAI_API_KEY` | https://platform.openai.com → API Keys |
| `YOUTUBE_CLIENT_ID` | See Step 6 below |
| `YOUTUBE_CLIENT_SECRET` | See Step 6 below |
| `YOUTUBE_REFRESH_TOKEN` | See Step 7 below |
| `YOUTUBE_CHANNEL_ID` | YouTube Studio → Settings → Channel → Basic Info |

---

## STEP 6 — Set up YouTube API (Google Cloud Console)

1. Go to: https://console.cloud.google.com
2. Create a new project (e.g. "english-made-fun")
3. Enable these APIs:
   - **YouTube Data API v3**
   - **YouTube Analytics API**
4. Go to **Credentials → Create Credentials → OAuth 2.0 Client ID**
5. Application type: **Desktop app**
6. Download the JSON — copy `client_id` → `YOUTUBE_CLIENT_ID` and `client_secret` → `YOUTUBE_CLIENT_SECRET` into `.env`
7. Go to **OAuth consent screen** → add your email as a test user

---

## STEP 7 — Get your YouTube Refresh Token (one time)

```bash
node setup/get_youtube_token.js
```

This will:
1. Print a URL — open it in your browser
2. Sign in with your YouTube channel's Google account
3. Click Allow
4. Copy the code it shows
5. Paste it into the terminal

It will print your `YOUTUBE_REFRESH_TOKEN` — copy it into `.env`.

---

## STEP 8 — Run the health check

```bash
node setup/health_check.js
```

This checks:
- ✅ Node.js version
- ✅ FFmpeg installed
- ✅ All folder structure
- ✅ All API keys set
- ✅ Claude API reachable
- ✅ ElevenLabs API reachable
- ✅ Together AI API reachable
- ✅ Remotion installed
- ✅ All template files present

**All checks must pass before continuing.**

---

## STEP 9 — Test Remotion Studio (verify animations look correct)

```bash
npm run studio
```

Opens your browser at http://localhost:3000 — you should see the stickman animation preview. Press play to verify it renders correctly. Press Ctrl+C when done.

---

## STEP 10 — Run your first manual batch (test run)

```bash
node pipeline/run_daily_batch.js
```

Watch the logs. It will:
1. Load today's topics (seed list on first run)
2. Generate 4 scripts via Claude
3. Score each for viral potential
4. Generate voice, SFX, images for approved scripts
5. Render each video with Remotion
6. Merge audio with FFmpeg
7. Upload to YouTube
8. Run the feedback loop

**First run takes ~20–30 minutes** for 4 videos (mostly render time).

---

## STEP 11 — Enable fully automatic daily schedule

```bash
node pipeline/scheduler.js
```

This runs forever in the background, triggering batches at:
- **07:00** — morning batch
- **12:00** — midday batch  
- **17:00** — afternoon batch

To keep it running after you close your terminal, use `pm2`:

```bash
npm install -g pm2
pm2 start pipeline/scheduler.js --name "english-made-fun"
pm2 save
pm2 startup     # auto-start on machine reboot
```

Check it's running:
```bash
pm2 logs english-made-fun
pm2 status
```

---

## FILE STRUCTURE SUMMARY

```
english-made-fun/
├── .env                          ← YOUR API KEYS (never commit)
├── package.json
├── tsconfig.json
├── remotion.config.ts
├── src/
│   ├── index.tsx                 ← Remotion entry point
│   └── Root.tsx                  ← Composition registry
├── components/
│   ├── Stickman.tsx              ← Animated stickman character
│   ├── Background.tsx            ← Animated backgrounds + effects
│   ├── Scene.tsx                 ← Single storyboard scene
│   └── VideoTemplate.tsx         ← Full video composition
├── pipeline/
│   ├── run_daily_batch.js        ← MASTER ORCHESTRATOR ★
│   ├── scheduler.js              ← Auto-runs batch 3x per day
│   ├── script_agent.js           ← Generates scripts (Claude)
│   ├── viral_agent.js            ← Scores + filters scripts
│   ├── visual_agent.js           ← Plans animation blueprints
│   ├── audio_agent.js            ← Voice generation (Inworld)
│   ├── sfx_agent.js              ← SFX generation (ElevenLabs)
│   ├── image_agent.js            ← Image generation (SD + DALL·E)
│   ├── render_agent.js           ← Remotion video rendering
│   ├── upload_agent.js           ← YouTube upload + thumbnail
│   ├── feedback_agent.js         ← Analytics → self-improvement
│   └── utils.js                  ← Shared logger, file helpers
├── setup/
│   ├── get_youtube_token.js      ← One-time OAuth setup
│   └── health_check.js           ← Pre-flight system check
├── templates/
│   ├── fail_fix_template.json
│   ├── word_explosion_template.json
│   └── superpower_rule_template.json
├── scripts/                      ← Generated daily (auto)
├── audio/voices/                 ← Generated voice MP3s (auto)
├── audio/sfx/                    ← Generated SFX (cached, reused)
├── images/                       ← Generated scene images (auto)
├── thumbnails/                   ← Generated thumbnails (auto)
├── videos/                       ← Remotion-rendered MP4s (auto)
├── output/final/                 ← FFmpeg-merged final videos (auto)
└── logs/                         ← Daily batch reports (auto)
```

---

## QUICK REFERENCE — All commands

```bash
# One-time setup
node setup/get_youtube_token.js    # get YouTube OAuth token
node setup/health_check.js        # verify everything works
npm run studio                     # preview animations in browser

# Production
node pipeline/run_daily_batch.js  # run one batch manually
node pipeline/scheduler.js        # start fully automatic mode

# With pm2 (auto-restart + background)
pm2 start pipeline/scheduler.js --name "english-made-fun"
pm2 logs english-made-fun
pm2 status
pm2 stop english-made-fun
```

---

## HOW THE SELF-IMPROVEMENT LOOP WORKS

After each batch, the feedback agent:
1. Pulls YouTube Analytics (views, watch time, retention, CTR)
2. Identifies top-performing formats and topics
3. Generates 10 optimised topic ideas for tomorrow's batch
4. Saves them to `scripts/improvements_YYYY-MM-DD.json`

The next batch automatically loads from this file — so after the first week, the pipeline is completely driven by real performance data.

---

## TUNING

Edit `.env` to change:
- `VIDEOS_PER_DAY=4` — how many videos per batch
- `VIRAL_SCORE_THRESHOLD=60` — minimum score to produce (0–100)
- `MAX_IMAGES_PER_VIDEO=2` — max AI images per video

---

## COSTS (estimated per video)

| Service | Cost per video |
|---|---|
| Claude API (scripting + analysis) | ~$0.08 |
| Inworld API (voice) | ~$0.02 |
| ElevenLabs (SFX) | ~$0.01 |
| Together AI — Stable Diffusion | ~$0.004 |
| DALL·E (thumbnail) | ~$0.04 |
| **Total per video** | **~$0.15** |
| **At 4 videos/day (30 days)** | **~$18/month** |

---

Ready. Run `node setup/health_check.js` and share the output.
