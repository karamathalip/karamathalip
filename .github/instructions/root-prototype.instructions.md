---
description: "Use when working on root-level prototype files (not english-made-fun/). Covers all root agent exports, Remotion components, rendering differences from production, and data flow."
applyTo: "*.js, *.tsx, !english-made-fun/**"
---
# Root-Level Prototype Reference

The root-level files are a simpler earlier version of the pipeline. Key differences from production: 30fps (not 60), Remotion CLI (not programmatic API), ${format}_${topic}_${timestamp} IDs (not UUID), fewer scene templates, simpler orchestrator (6 stages not 11).

## Root Dependencies (`package.json`)
@anthropic-ai/sdk, @remotion/cli, @remotion/renderer, googleapis, google-auth-library, openai, axios, node-fetch, winston, dotenv, p-limit, form-data. Node ≥18.

## utils.js Exports
- `logger` — Winston (`[HH:mm:ss] LEVEL: message`, daily file: `logs/pipeline-YYYY-MM-DD.log`)
- `datestamp()` → YYYY-MM-DD, `timestamp()` → ms since epoch
- `ensureDir()`, `writeJSON()`, `readJSON()`, `saveBase64File()`, `saveBinaryFile()`
- `withRetry(fn, retries=3, delayMs=2000, label)` → exponential backoff
- `sleep(ms)`, `PATHS` object (scripts, voices, sfx, images, thumbnails, videos, final, components, templates, logs)

## script_agent.js
- `generateScript({ format, topic, level, hooks=[] })` → Claude claude-opus-4-6, 2000 tokens
- `generateDailyBatch(topics[])` → saves to `scripts/YYYY-MM-DD.json`
- 7 predefined viral hooks, format timing: fail_fix/word_explosion (60s), superpower (70s)
- Schema: `{ video_id, format, topic, level, video_title, hook_text, storyboard[], script_lines[], voice_tone, call_to_action, youtube_title, youtube_description, youtube_tags[] }`

## viral_agent.js
- `scoreScript(script)` → Claude claude-opus-4-5, 800 tokens, threshold: VIRAL_SCORE_THRESHOLD env (default: 60)
- `filterBatch(scripts[])` → approved scripts; scores 60-79 get revisions applied
- Weighted: hook 30%, retention 25%, emotional 15%, clarity 10%, shareability 10%, novelty 10%

## visual_agent.js
- `generateVisualBlueprint(script)` → Claude claude-opus-4-5, 600 tokens
- FORMAT_VISUAL_DEFAULTS: fail_fix (light blue, confetti/red_x/green_check), word_explosion (dark, explosion/neon), superpower (warm, speed_lines/glow_rings)
- Output: `{ animation_blueprint, thumbnail_prompt, image_prompts[] }`

## audio_agent.js
- `generateScriptAudio(script)` → Inworld TTS per-line MP3, FFmpeg concat
- Endpoint: `studio.inworld.ai/v1/workspaces/{id}/characters/{id}:simpleSendText`
- Output: `audio/voices/{video_id}/line_NNN.mp3` → `{video_id}_voice.mp3`

## sfx_agent.js
- `generateVideoSFX(script)` → ElevenLabs `/v1/sound-generation`, 3s each, 30s for bg
- 11 SFX: fail, success, explosion, wrong, correct, powerup, transition, hook, cta, background
- Format maps: fail_fix (8 cues), word_explosion (5), superpower (7). Cached at `audio/sfx/{key}.mp3`

## image_agent.js
- `generateVideoImages(script, blueprint)` → max 2 per video
- Together AI SDXL (512×512, 20 steps) for scenes, DALL·E 3 (1024×1024) for thumbnails
- Style suffix: "colorful semi-cartoon style, high contrast, clean composition..."
- Output: `images/{video_id}/scene_{N}.png`, `thumbnails/{video_id}_thumb.png`

## render_agent.js
- `renderVideo(script, audio, sfx, images)` → `npx remotion render`, 30fps, h264, JPEG q85, concurrency 4
- `mergeAudioVideo(video, voice, bg, id)` → FFmpeg amix (voice 1.0 + bg 0.12, looped)
- FRAMES_PER_SCENE = 90 (3s @ 30fps)

## upload_agent.js / feedback_agent.js
- `uploadToYouTube(script, videoPath, thumbnailPath)` → category 27, 12 base tags
- `runFeedbackLoop()` → YouTube Analytics (7 days), Claude analysis, 8 seed topics fallback

## run_daily_batch.js
- VIDEOS_PER_DAY (default: 4), 6 stages per video, 3s cooldown
- Pipeline: topics → scripts → viral filter → per-video (blueprint→voice→SFX→images→render→merge→upload) → feedback → report

## Remotion Components (Root)
- **Root.tsx** — 1 composition "EnglishShort", 30fps, FRAMES_PER_SCENE=90, props from REMOTION_PROPS env
- **VideoTemplate.tsx** — Sequences scenes + audio, phase detection (hook→fail→correct→remix), persistent title bar
- **Scene.tsx** — Pose normalization (regex: fail/trip→fail, win/success→win), text sizing (<20/40/≥40 chars), wrong/correct badges
- **Stickman.tsx** — 8 poses (idle/fail/win/thinking/pointing/waving/cape/jumping), SVG 80×140, idle bob sine wave
- **Background.tsx** — Phase-driven bg colors, 12 speed lines (superpower), 20 confetti (correct), 3 glow rings (powerup), FailX/CorrectCheck overlay
