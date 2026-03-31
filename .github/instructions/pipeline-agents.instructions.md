---
description: "Use when working on pipeline agents, orchestrator, scheduling, or any Node.js files in english-made-fun/pipeline/. Covers all agent exports, CLI flags, API details, and data flow."
applyTo: "english-made-fun/pipeline/**"
---
# Pipeline Agents Reference

## Orchestrator (`orchestrator.js` — ~420 lines)
CLI-exec only (no exported functions). Used via `node pipeline/orchestrator.js`.

**CLI flags:** `--dry-run`, `--step=N`, `--only=N,M`

**11-step pipeline:**
| Step | Agent | Frequency | Purpose |
|------|-------|-----------|---------|
| 1 | competitor_agent | Monday | Top competitor videos → hooks, gaps |
| 2 | audience_agent | Monday | YouTube comments → pain points, opportunities |
| 3 | script_agent | Daily | Generate 5 scripts (Claude claude-opus-4-6) |
| 4 | viral_prediction_agent | Daily | Score + filter: ≥80 produce, 60-79 revise, <60 reject |
| 5 | image_agent | Daily | Scene images (SDXL) + thumbnails (DALL·E 3) |
| 6 | voice_agent | Daily | Inworld TTS per-scene → FFmpeg stitch |
| 7 | sfx_agent | Daily | ElevenLabs SFX with MD5 caching |
| 8 | render_agent | Daily | Remotion bundle + renderMedia → FFmpeg merge |
| 9 | upload_agent | Daily | YouTube upload, staggered 4h, private→publishAt |
| 10 | feedback_agent | Sunday | YouTube Analytics → format ranking |
| 11 | revenue_agent | 1st of month | Monthly revenue analysis |

**Key functions:** `runStep()`, `dequeueTopics()`, `replenishTopicsQueue()`, `buildEnrichedTopics()`, `saveRunLog()`

**Output:** `config/daily_run_log.json` (keeps last 30 runs)

---

## script_agent.js (~380 lines)
**Exports:** `runBatch(topics[])`
**CLI:** `node pipeline/script_agent.js "Topic A" "Topic B"` or uses DEFAULT_TOPICS

**Key function:** `generateScript(topic, format, attempt)`
- Model: Claude claude-opus-4-6, 8192 tokens, adaptive thinking
- Retries: 3 with exponential backoff
- Returns parsed script JSON with UUID video_id

**Output:** `scripts/day${DD}_vid${NN}.json`

---

## viral_prediction_agent.js (~380 lines)
**Exports:** `runViralBatch(inputs)`
**CLI:** `node pipeline/viral_prediction_agent.js scripts/day03_vid01.json`

**Key functions:**
- `scoreScript(scriptData, attempt)` → `{ viral_score, retention_score, ctr_score, engagement_score, strengths[], weaknesses[], decision }`
- `reviseScript(originalScript, suggestions, revisionNum)` → calls generateScript() with feedback

**Decision:** ≥80 produce → `scripts/approved/`, 60-79 revise (max 2 attempts), <60 reject
**Output:** `scripts/approved/[filename].json`, `scripts/approved/batch_summary.json`

---

## image_agent.js (~480 lines)
**Exports:** `runImageAgent()`

**Model selection:**
- `visual_priority === "high_emotion"` or thumbnails → DALL·E 3 (1024×1024, ~$0.04)
- Everything else → Together AI SDXL (512×512, 25 steps, ~$0.013)

**Caching:** MD5(prompt) → `images/cache_index.json` + `images/reuse_library.json`
**Output:** `images/{video_id}_scene{N}.png`, `thumbnails/{video_id}_thumb.png`

---

## voice_agent.js (~420 lines)
**Exports:** `runVoiceAgent()`
**CLI:** `node pipeline/voice_agent.js scripts/approved/*.json` or `--list-voices`

**Key functions:**
- `synthesizeVoiceLine(text, speakingRate, pitch, attempt)` → Inworld TTS POST `/v1/{workspace}/{character}:synthesize`
- `stitchVoiceTracks()` → FFmpeg concat per-scene audio + delays

**Config:** MP3, 24kHz, speed 0.25–4.0, pitch -20 to +20 semitones (~$0.006/1K chars)
**Auth:** Basic base64("key:")
**Output:** `audio/voices/{video_id}_scene{N}_voice.mp3` → `{video_id}_voice_full.mp3`

---

## sfx_agent.js (~350 lines)
**Exports:** `runSFXAgent()`
**CLI:** `node pipeline/sfx_agent.js scripts/approved/*.json` or `--show-cache`

**Key functions:**
- `callElevenLabsSfx(prompt, durationSeconds, attempt)` → POST `/v1/sound-generation`, returns raw MP3
- `generateOrRetrieveSFX(prompt, duration)` → cache hit check, then generate

**Caching:** MD5(prompt) → `audio/sfx/cache_index.json` + `audio/sfx/{md5}.mp3`
**Cost:** ~$0.30/1K chars
**Output:** `audio/sfx/{video_id}_scene{N}_sfx{M}.mp3`

---

## render_agent.js (~450 lines)
**Exports:** `runRenderBatch(scriptPaths)`
**CLI:** `node pipeline/render_agent.js scripts/approved/x.json` or `--show-log`

**Key functions:**
- `buildInputProps(scriptData)` → Map script JSON → VideoTemplate schema
- `bundle()` → Webpack-bundle Remotion entry point (cached once per batch)
- `selectComposition()` → Resolve "VideoTemplate" + dynamic duration
- `renderMedia()` → Remotion silent MP4 (concurrency: 3, timeout: 120s/frame)
- `mergeAudio()` → FFmpeg amix voice + SFX

**Output:** `videos/{video_id}.mp4` (silent) → `output/final/{video_id}_final.mp4`
**Log:** `output/final/render_log.json`

---

## upload_agent.js (~420 lines)
**Exports:** `runUploadAgent()`
**CLI:** `node pipeline/upload_agent.js --show-log` or `--setup` (one-time auth)

**Key functions:**
- `nextScheduledSlot()` → stagger 4h apart, first upload 1h from now
- `buildVideoMetadata(scriptData)` → title, description, tags
- `uploadVideo(filePath, metadata)` → YouTube Data API v3, private + publishAt
- `findOrCreatePlaylist()` → "English Shorts" playlist
- `addToPlaylist()` → add video to playlist

**Scopes:** youtube.upload, youtube, youtube.force-ssl
**Output:** `config/upload_log.json`

---

## feedback_agent.js (~380 lines, Sunday only)
**Exports:** `runFeedbackAgent()`

Fetches YouTube Analytics (last 90 days): views, averageViewPercentage, averageViewDuration, likes, comments, shares.
Claude analysis → format ranking, updated_script_instructions, updated_visual_instructions.

**Output:** `config/feedback_latest.json` (consumed by script_agent next run)

---

## audience_agent.js (~360 lines, Monday only)
**Exports:** `runAudienceAgent()`

YouTube Data API `commentThreads.list()` → 200+ comments, filter likeCount > 2 OR replyCount > 0.
Claude analysis → pain_points, content_opportunities, viral_hooks, next_batch_topics.

**Output:** `config/audience_insights.json`

---

## competitor_agent.js (~380 lines, Monday only)
**Exports:** `runCompetitorAgent()`

5 channels from `config/competitors.json`, `search.list()` 20 top videos each.
Claude analysis → winning_hook_patterns, content_gaps, hooks_to_use_next_batch.

**Output:** `config/competitor_insights.json`

---

## setup_check.js (~500 lines, CLI only)
**CLI:** `node pipeline/setup_check.js [--fix] [--quiet] [--no-api]`

**8 check categories:**
1. Environment variables (10 required keys)
2. Node.js ≥18.0.0 + npm packages
3. Folder structure (creates on --fix)
4. Config files present
5. Live API connectivity (Anthropic, ElevenLabs, Together, Inworld, YouTube)
6. FFmpeg binary
7. Remotion bundle test (optional, slow)
8. Starter batch files (day01–day07.json)

---

## Self-Improvement Data Flow
```
audience_agent (Mon) → config/audience_insights.json ─┐
competitor_agent (Mon) → config/competitor_insights.json ─┤
feedback_agent (Sun) → config/feedback_latest.json ─────┤
                                                         ↓
orchestrator.buildEnrichedTopics() → script_agent (next run)
```
