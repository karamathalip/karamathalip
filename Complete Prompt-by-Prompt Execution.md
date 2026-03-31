# Complete Prompt-by-Prompt Execution Guide for Claude
### "Paste & Go" — Claude Does Everything

---

> **How to use this guide:** Each section has a numbered prompt. Open Claude (claude.ai), go to the mode specified, paste the prompt exactly as written, and Claude will execute or generate the output for you. Do nothing manually — just paste and follow Claude's output into the next step.

---

## PHASE 0 — MASTER KICKOFF PROMPT
### (Paste this FIRST in Claude Chat to orient the entire session)

**Mode: Chat**

```
You are my fully autonomous AI assistant and technical co-founder. I am building an automated YouTube channel that teaches English using short animated videos (stickman animations, 30–90 seconds). I have access to:
- Claude API (for scripting and agent logic)
- Inworld API (for voice generation)
- ElevenLabs API (for SFX generation)
- Remotion (for animation and video rendering, runs locally via Node.js)
- A cheap image generation API (Stable Diffusion via Together AI for scenes, DALL·E for thumbnails only)
- YouTube API (for automated uploading)
- FFmpeg (locally installed for audio/video merging)
- Local machine (no AWS, everything stored locally)

My goal: Set up a fully automated multi-agent pipeline that generates, renders, uploads, and self-improves English learning YouTube Shorts at 3–5 videos per day — completely hands-off after setup.

For every task I give you, I want you to:
1. Generate ALL code, JSON, scripts, and configuration files completely — no placeholders, no "fill this in yourself"
2. Give me exact terminal commands to run each step
3. Tell me exactly which file to save each output to
4. Flag any API keys or environment variables I need to set (I will provide values separately)
5. Never ask me to do something manually if it can be automated

Confirm you understand this and are ready to begin. Reply with "READY" and a brief summary of what we are building together.
```

---

## PHASE 1 — CREATE THE FOLDER STRUCTURE

### Prompt 1 — Generate the Local Folder Structure
**Mode: Code**

```
Create a complete shell script that sets up the entire local folder structure for my automated YouTube channel pipeline. The script must:

1. Create ALL of these directories:
   - english-made-fun/scripts/
   - english-made-fun/audio/voices/
   - english-made-fun/audio/sfx/
   - english-made-fun/images/
   - english-made-fun/thumbnails/
   - english-made-fun/videos/
   - english-made-fun/output/final/
   - english-made-fun/components/
   - english-made-fun/templates/
   - english-made-fun/pipeline/
   - english-made-fun/config/
   - english-made-fun/assets/stickman/
   - english-made-fun/assets/icons/

2. Create placeholder files in each folder with a README.txt explaining what goes there

3. Create a .env file template in the root with these variable names (empty values — I will fill them):
   ELEVEN_API_KEY=
   INWORLD_API_KEY=
   OPENAI_API_KEY=
   TOGETHER_API_KEY=
   YOUTUBE_CLIENT_ID=
   YOUTUBE_CLIENT_SECRET=
   YOUTUBE_REFRESH_TOKEN=

4. Output the complete shell script I can run in one command on Mac/Linux.

Output ONLY the shell script, nothing else. Make it executable.
```

---

### Prompt 2 — Initialise Node.js Project and Install Dependencies
**Mode: Code**

```
Generate the complete package.json file and a one-line terminal command for my automated YouTube channel pipeline project called "english-made-fun".

The package.json must include ALL of these dependencies:
- remotion (latest)
- @remotion/renderer (latest)
- @remotion/cli (latest)
- axios (for API calls to ElevenLabs, Inworld, Together AI)
- dotenv (for environment variables)
- fluent-ffmpeg (for audio/video merging)
- googleapis (for YouTube API)
- uuid (for generating video IDs)
- node-cron (for scheduling daily batches)
- fs-extra (for file operations)
- readline (for any interactive prompts)

Also give me:
1. The exact npm install command
2. The exact command to initialise Remotion in this project
3. A tsconfig.json optimised for Remotion TypeScript components

Output each file separately, clearly labelled. Include all file paths.
```

---

## PHASE 2 — BUILD THE CHANNEL IDENTITY

### Prompt 3 — Generate Channel Name, Description, and All Branding
**Mode: Chat**

```
I am building an automated English-learning YouTube channel using stickman animations. Generate a complete channel identity package for me with NO placeholders — everything fully written out and ready to copy-paste directly into YouTube.

Generate ALL of the following:

1. TOP 5 channel name options (short, memorable, global-friendly, emphasises fun + learning + animation). For each name, check if the concept is suitable for YouTube, TikTok, and Instagram simultaneously.

2. Full YouTube channel description (250–300 words), fully SEO-optimised, including:
   - Emoji-rich opening hook
   - What the channel teaches and how
   - Who it is for (all ages, global)
   - Upload schedule mention
   - Subscribe CTA
   - Include these keywords naturally: English learning, vocabulary, grammar, English for beginners, English Shorts, animated English, English hacks, learn English fast

3. Three logo generation prompts (ready to paste into DALL·E or Midjourney):
   - Variation 1: Classic stickman with book
   - Variation 2: Word-focused with exploding letter
   - Variation 3: Hero stickman with cape

4. Three YouTube banner generation prompts (2560x1440px, ready to paste into DALL·E):
   - Variation 1: Fun & colorful
   - Variation 2: Dark neon pop
   - Variation 3: Minimal & clean

5. Intro animation prompt (2–3 seconds) for Remotion or AI video tool

6. Outro animation prompt (3 seconds) for Remotion or AI video tool

7. Thumbnail design template prompt (reusable across all video types)

8. Complete color palette with exact hex codes

9. Font recommendations with download links

Format everything clearly, one section per item. Make it copy-paste ready.
```

---

## PHASE 3 — BUILD THE REMOTION ANIMATION SYSTEM

### Prompt 4 — Generate the Stickman Component
**Mode: Code**

```
Write the complete, production-ready Stickman.tsx Remotion component for my English-learning YouTube channel. 

Requirements:
- The component must accept these props: pose, emotion, action, x, y, color
- Supported poses: standing, falling, jumping, flying, hero_pose, facepalm, victory_pose, winking, thumbs_up, pointing, celebrate, trip, sword_glow, fly_off, cameo_wave, shocked, epic_win
- Supported emotions: happy, sad, shocked, victorious, confused, excited, neutral
- Use Remotion's useCurrentFrame, spring, and interpolate for smooth animations
- All limbs are SVG lines/circles only — no complex rigging
- Add spring physics bounce on key actions (falling, jumping, celebrating)
- Add simple eye/mouth SVG paths that change per emotion
- Include inline comments explaining each animation section
- Export as named export AND default export
- Must render at 60fps without performance issues
- Include a StickmanDemo composition at the bottom showing all poses in sequence

Save path: english-made-fun/components/Stickman.tsx

Output the COMPLETE file, no placeholders, no "add your logic here".
```

---

### Prompt 5 — Generate the Scene Components
**Mode: Code**

```
Write ALL of these complete Remotion scene component files for my English learning YouTube channel. Each must be production-ready with no placeholders.

FILE 1: english-made-fun/components/TextBurstScene.tsx
- Takes props: text, backgroundColor, textColor, emphasis (zoom | shake | highlight | pop)
- Text explodes onto screen with spring animation
- Keywords highlighted in yellow by default
- Scale animation from 0 to 1 with bounce
- Duration driven by durationInFrames prop

FILE 2: english-made-fun/components/StickmanScene.tsx
- Takes props: sceneData (object with text, stickman_action, stickman_emotion, bg_color, bg_image)
- Renders Stickman component with correct pose/emotion
- Renders bold text overlay at bottom
- Optional background image or solid color
- Particle effects (red X for wrong, green check for correct) based on sceneData.effect prop

FILE 3: english-made-fun/components/DialogueScene.tsx
- Takes props: speaker, text, bubbleColor
- Renders a chat bubble with animated text appear
- Stickman appears on the side of the bubble

FILE 4: english-made-fun/components/WordExplosionScene.tsx
- Takes props: word, meanings (array of {text, icon}), backgroundColor
- Word appears small then explodes to full screen
- Each meaning fades in sequentially with a small icon next to it
- Neon glow effect on dark background

FILE 5: english-made-fun/components/SuperpowerScene.tsx
- Takes props: ruleText, heroAction, worldColor
- Stickman in cape appears
- Glowing rule text animates in as a "weapon"
- World changes from grey to color (color shift on entire canvas)

FILE 6: english-made-fun/components/Scene.tsx (Scene Router)
- Reads scene.visual.template and routes to correct component
- Handles: "stickman", "text_burst", "dialogue", "word_explosion", "superpower"
- Falls back to StickmanScene for unknown templates

FILE 7: english-made-fun/components/VideoTemplate.tsx
- Reads the full jsonData prop
- Maps scenes array → wraps each in Remotion <Sequence> with correct from and durationInFrames
- Includes <Audio> tag for voice file
- Includes <Audio> tags for each SFX file at correct start times
- Includes caption overlay at bottom using captions.style from JSON

FILE 8: english-made-fun/components/index.ts
- Re-exports all components

Write EVERY file completely. Include all Remotion imports. No placeholders.
```

---

### Prompt 6 — Generate the Remotion Root Composition
**Mode: Code**

```
Write the complete Remotion root file (english-made-fun/remotion.config.ts and english-made-fun/src/index.ts or Root.tsx — use whichever is correct for the latest Remotion version) that:

1. Registers a composition called "VideoTemplate" that:
   - Uses the VideoTemplate component from components/VideoTemplate.tsx
   - Width: 1080, Height: 1920 (vertical Shorts format)
   - FPS: 60
   - Duration: dynamically calculated from inputProps.jsonData.scenes total duration

2. Registers a composition called "StickmanDemo" for testing

3. Sets up inputProps schema using Zod so the JSON schema is validated at render time

4. Includes the remotion.config.ts with:
   - webpack override for SVG support
   - Entry point set correctly

Give me the exact file contents AND the exact terminal command to preview this in browser locally.
```

---

## PHASE 4 — BUILD THE PIPELINE AGENTS

### Prompt 7 — Generate the Script Agent (Claude API Integration)
**Mode: Code**

```
Write the complete Node.js file english-made-fun/pipeline/script_agent.js that:

1. Uses the Claude API (Anthropic SDK) to generate video scripts
2. Accepts a batch of topics as input (array of strings)
3. For each topic, calls Claude with this exact system prompt embedded in the code:

SYSTEM PROMPT TO EMBED:
"You are a world-class YouTube content creator and scriptwriter specialising in English learning Shorts. Generate a complete video script using the specified format. Output ONLY a valid JSON object matching this exact schema — no markdown, no explanation, just raw JSON:
{
  video_id: string (uuid),
  video_title: string,
  format: string,
  hook: { options: [string, string, string], selected: string },
  script: { full_text: string, sentences: [string] },
  scenes: [
    {
      scene_id: number,
      start: number,
      duration: number,
      type: string (hook|explanation|example|payoff|CTA),
      text: string,
      voice_line: string,
      stickman_action: string,
      stickman_emotion: string,
      visual: { template: string, elements: { keywords: [string] } },
      animation: { in: string, out: string, emphasis: string },
      sfx_prompts: [string],
      use_image: boolean,
      visual_priority: string
    }
  ],
  audio: { voice: string, speed: number, tone: string },
  captions: { enabled: boolean, style: string },
  packaging: { titles: [string, string, string], thumbnail: { text: string, visual: string } },
  viral_triggers: [string],
  metrics: { ctr: null, retention: null, watch_time: null }
}"

4. Supports all 3 formats: "Fail → Fix Stickman Skits", "Word Explosion Visual Builds", "Rule as Superpower Metaphor"
5. Rotates formats automatically across the batch (format 1, 2, 3, 1, 2, 3…)
6. Saves each output JSON to english-made-fun/scripts/day[DD]_vid[N].json
7. Logs progress to console
8. Handles API errors with retry logic (3 retries, exponential backoff)
9. Uses dotenv for ANTHROPIC_API_KEY

Write the COMPLETE file. Use the official @anthropic-ai/sdk package. No placeholders.
```

---

### Prompt 8 — Generate the Viral Prediction Agent
**Mode: Code**

```
Write the complete Node.js file english-made-fun/pipeline/viral_prediction_agent.js that:

1. Reads a script JSON file (or accepts script JSON as parameter)
2. Calls Claude API with this embedded scoring prompt:

SCORING PROMPT TO EMBED:
"You are a Viral Prediction Agent. Score this video script on viral potential. Analyse: hook strength (30%), retention structure (25%), emotional impact (15%), clarity (10%), shareability (10%), novelty (10%). 
Decision rules: score ≥ 80 → produce, score 60–79 → revise, score < 60 → reject.
Output ONLY valid JSON:
{
  viral_score: number,
  retention_score: number,
  ctr_score: number,
  engagement_score: number,
  strengths: [string],
  weaknesses: [string],
  improvement_suggestions: [string],
  decision: 'produce'|'revise'|'reject'
}"

3. If decision is "revise", calls the Script Agent again with the improvement_suggestions injected into the prompt, then re-scores
4. If decision is "reject", logs the rejection and moves to next script
5. If decision is "produce", marks the script as approved and returns it
6. Maximum 2 revision attempts before rejecting
7. Saves final approved scripts to english-made-fun/scripts/approved/ subfolder
8. Outputs a summary JSON of what was produced/revised/rejected

Write the COMPLETE file. No placeholders.
```

---

### Prompt 9 — Generate the Voice Agent (Inworld API)
**Mode: Code**

```
Write the complete Node.js file english-made-fun/pipeline/voice_agent.js that:

1. Reads all approved script JSONs from english-made-fun/scripts/approved/
2. For each script, extracts all voice_line strings from every scene
3. Calls Inworld API to generate MP3 for each voice line with these parameters:
   - Character: "Energetic English Coach"
   - Speed: taken from script's audio.speed field
   - Tone: taken from script's audio.tone field
   - Format: MP3
4. Saves voice files to english-made-fun/audio/voices/ with naming: [video_id]_scene[N]_voice.mp3
5. Also generates a single combined voice track for the full script: [video_id]_voice_full.mp3
6. Updates the script JSON with the file paths in audio.file_url field
7. Logs progress and cost estimate per video
8. Handles API errors with retry logic
9. Uses INWORLD_API_KEY from .env
10. Includes a function to list all available Inworld voices and their IDs

Write the COMPLETE file. Include the exact Inworld API endpoint and request format. No placeholders.
```

---

### Prompt 10 — Generate the SFX Agent (ElevenLabs API)
**Mode: Code**

```
Write the complete Node.js file english-made-fun/pipeline/sfx_agent.js that:

1. Reads all approved script JSONs from english-made-fun/scripts/approved/
2. For each scene that has sfx_prompts array, generates each SFX using ElevenLabs API
3. ElevenLabs SFX generation endpoint: POST https://api.elevenlabs.io/v1/sound-generation
   - Request body: { text: sfx_prompt, duration_seconds: sfx_duration, prompt_influence: 0.3 }
   - Headers: { xi-api-key: ELEVEN_API_KEY }
   - Response: audio binary (MP3)
4. Saves SFX files to english-made-fun/audio/sfx/ with naming: [video_id]_scene[N]_sfx[index].mp3
5. Implements a CACHING SYSTEM:
   - Before generating, check if a file with the same prompt already exists in a cache index JSON
   - If yes, copy the cached file instead of making a new API call
   - Cache index stored at english-made-fun/audio/sfx/cache_index.json
   - Cache key = MD5 hash of the prompt string
6. Updates the script JSON with actual SFX file paths
7. Logs total API calls made vs cached (to show cost savings)
8. Uses ELEVEN_API_KEY from .env

Write the COMPLETE file. Include the full ElevenLabs SFX API implementation. No placeholders.
```

---

### Prompt 11 — Generate the Image Agent
**Mode: Code**

```
Write the complete Node.js file english-made-fun/pipeline/image_agent.js that:

1. Reads approved script JSONs and processes scenes where use_image = true
2. Also processes the packaging.thumbnail field for every video

3. MODEL SELECTION LOGIC (hard-coded in the file):
   - If visual_priority = "high_emotion" OR scene type = thumbnail → use DALL·E (OpenAI API)
   - All other scenes → use Stable Diffusion via Together AI API
   
4. For Stable Diffusion (Together AI):
   - Endpoint: POST https://api.together.xyz/inference
   - Model: "stabilityai/stable-diffusion-xl-base-1.0"
   - Resolution: 512x512
   - Steps: 25
   - Always append to every prompt: ", colorful semi-cartoon style, high contrast, clean composition, minimal background, expressive emotion, optimized for short-form video"

5. For DALL·E thumbnails:
   - Use OpenAI images.generate endpoint
   - Model: dall-e-3
   - Size: 1024x1024
   - Quality: standard

6. CACHING SYSTEM:
   - Cache key = MD5 hash of full prompt string
   - Cache index at english-made-fun/images/cache_index.json
   - Skip API call if cached version exists

7. REUSE LIBRARY:
   - Maintain a "reuse_library.json" that maps common emotional scenes to pre-generated images
   - Before any API call, check if reuse_key matches an existing library entry
   - Common keys to pre-generate: confused_person, celebrating_person, shocked_person, classroom_scene, victory_moment

8. Save scene images to english-made-fun/images/[video_id]_scene[N].png
9. Save thumbnails to english-made-fun/thumbnails/[video_id]_thumb.png
10. Update script JSON with all image file paths

Write the COMPLETE file. Include both API implementations fully. No placeholders.
```

---

### Prompt 12 — Generate the Render Agent (Remotion)
**Mode: Code**

```
Write the complete Node.js file english-made-fun/pipeline/render_agent.js that:

1. Reads all approved scripts from english-made-fun/scripts/approved/
2. For each script, constructs the full inputProps JSON that VideoTemplate.tsx expects (mapping all scene data, image paths, audio paths, SFX paths into the correct schema)
3. Calls Remotion's renderMedia() programmatically with:
   - composition: "VideoTemplate"
   - codec: "h264"
   - outputLocation: english-made-fun/videos/[video_id].mp4
   - inputProps: the constructed props object
   - concurrency: 3 (adjust to CPU — expose as a config variable)
   - timeoutInMilliseconds: 120000
4. After rendering, runs FFmpeg to merge the Remotion video (which has no audio) with the combined audio track:
   - Input 1: english-made-fun/videos/[video_id].mp4
   - Input 2: english-made-fun/audio/voices/[video_id]_voice_full.mp3
   - Input 3+: each SFX file from the script's scenes at the correct timestamp offset
   - FFmpeg command: merge all audio streams with amix, then mux into final MP4
   - Output: english-made-fun/output/final/[video_id]_final.mp4
5. Logs render time per video
6. Updates a render_log.json with: video_id, render_time, file_size, status
7. Handles errors: if render fails, log and continue to next video (do not crash)
8. Uses fluent-ffmpeg for all FFmpeg operations

Write the COMPLETE file including all FFmpeg merge logic. No placeholders.
```

---

### Prompt 13 — Generate the Upload Agent (YouTube API)
**Mode: Code**

```
Write the complete Node.js file english-made-fun/pipeline/upload_agent.js that:

1. Uses the YouTube Data API v3 via the googleapis package
2. Authenticates using OAuth2 with YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN from .env (refresh token flow — no browser interaction needed after initial setup)
3. For each final video in english-made-fun/output/final/:
   a. Read the corresponding script JSON to get: titles[0] as video title, packaging.thumbnail.text for description, viral_triggers for tags
   b. Upload the MP4 file using videos.insert with:
      - snippet: { title, description (auto-generated from script), tags, categoryId: "27" (Education), defaultLanguage: "en" }
      - status: { privacyStatus: "public", selfDeclaredMadeForKids: false }
      - scheduledTime: stagger uploads 4 hours apart starting from the next scheduled slot
   c. Upload the thumbnail using thumbnails.set
   d. Add the video to a playlist called "English Shorts" (create playlist if it does not exist)
4. Save upload results (video URL, video ID, upload time) to english-made-fun/config/upload_log.json
5. Mark uploaded videos so they are not re-uploaded
6. Include a separate function: setupOAuth() that walks through the initial OAuth setup and saves the refresh token — I run this once manually, everything else is automated

Write the COMPLETE file. No placeholders. Include the full OAuth2 setup function.
```

---

### Prompt 14 — Generate the Performance Feedback Agent
**Mode: Code**

```
Write the complete Node.js file english-made-fun/pipeline/feedback_agent.js that:

1. Reads upload_log.json to get all uploaded video IDs
2. Calls YouTube Analytics API (youtubeAnalytics.reports.query) for each video to fetch:
   - averageViewPercentage (retention)
   - averageViewDuration (watch time in seconds)
   - estimatedMinutesWatched
   - clickThroughRate (CTR)
   - likes
   - comments
   - shares
3. Stores raw analytics in english-made-fun/config/analytics_log.json
4. Calls Claude API with this embedded analysis prompt:

ANALYSIS PROMPT TO EMBED:
"You are a Performance Feedback Agent. Analyse this YouTube video performance data and generate optimisation recommendations for the next batch of videos. Identify: winning patterns (what is working), losing patterns (what is hurting), specific hook improvements, format adjustments, and pacing changes. Output ONLY valid JSON:
{
  winning_patterns: [string],
  losing_patterns: [string],
  hook_feedback: string,
  pacing_recommendations: string,
  format_ranking: [{format: string, avg_retention: number}],
  updated_script_instructions: string,
  updated_visual_instructions: string,
  top_performing_video_ids: [string]
}"

5. Saves feedback JSON to english-made-fun/config/feedback_latest.json
6. This feedback file is automatically read by script_agent.js in the next batch run to improve outputs
7. Runs automatically — designed to be called by the orchestrator weekly

Write the COMPLETE file. No placeholders.
```

---

### Prompt 15 — Generate the Audience Intelligence Agent
**Mode: Code**

```
Write the complete Node.js file english-made-fun/pipeline/audience_agent.js that:

1. Fetches YouTube comments for all uploaded videos using YouTube Data API v3 commentThreads.list
2. Fetches at least 200 comments per video (paginated)
3. Filters for comments with high engagement (likeCount > 2 OR replyCount > 0)
4. Sends all comments to Claude API with this embedded prompt:

AUDIENCE ANALYSIS PROMPT TO EMBED:
"You are an Audience Intelligence Agent. Analyse these YouTube comments from an English learning channel. Extract: pain points (ranked by frequency), content opportunities (video ideas based on what viewers ask for), viral hooks (exact phrases from comments that can become hooks), product opportunities (what viewers would pay for), audience segments (who is watching). Use the EXACT language viewers use in your hooks. Output ONLY valid JSON:
{
  pain_points: [{topic: string, frequency: number, example_comment: string}],
  content_opportunities: [{idea: string, demand_score: number, suggested_format: string}],
  viral_hooks: [string],
  product_opportunities: [{name: string, evidence: string}],
  audience_segments: [string],
  next_batch_topics: [string]
}"

5. Saves output to english-made-fun/config/audience_insights.json
6. The next_batch_topics array is automatically fed into the script_agent.js topic queue
7. Runs weekly (called by orchestrator)

Write the COMPLETE file. No placeholders.
```

---

### Prompt 16 — Generate the Competitor Intelligence Agent
**Mode: Code**

```
Write the complete Node.js file english-made-fun/pipeline/competitor_agent.js that:

1. Accepts a list of competitor YouTube channel IDs (stored in english-made-fun/config/competitors.json)
2. Uses YouTube Data API v3 to fetch:
   - Top 20 most viewed videos from each channel (search.list with order=viewCount)
   - Video details: title, description, duration, viewCount, likeCount, commentCount
3. Sends the collected data to Claude API with this embedded prompt:

COMPETITOR ANALYSIS PROMPT TO EMBED:
"You are a Competitor Intelligence Agent. Analyse these top-performing YouTube English learning videos. Do NOT recommend copying them directly. Instead, identify what to do BETTER. Extract: viral hook structures (the pattern, not the exact words), repeatable formats, thumbnail patterns (describe visually), content gaps (topics they cover poorly or miss entirely), differentiation strategy (how to beat them with simplicity + humor + speed). Output ONLY valid JSON:
{
  winning_hook_patterns: [string],
  repeatable_formats: [string],
  thumbnail_patterns: [string],
  content_gaps: [string],
  differentiation_strategy: [string],
  recommended_topics_to_dominate: [string],
  hooks_to_use_next_batch: [string]
}"

4. Saves output to english-made-fun/config/competitor_insights.json
5. The hooks_to_use_next_batch and recommended_topics_to_dominate are fed into the Script Agent
6. Creates a starter competitors.json with 5 known large English-learning YouTube channels pre-populated
7. Runs weekly (called by orchestrator)

Write the COMPLETE file. No placeholders.
```

---

### Prompt 17 — Generate the Revenue Agent
**Mode: Code**

```
Write the complete Node.js file english-made-fun/pipeline/revenue_agent.js that:

1. Reads analytics_log.json, audience_insights.json, and upload_log.json
2. Determines current channel stage from subscriber count (early: 0–10K, growing: 10K–100K, scaled: 100K+)
3. Calls Claude API with this embedded prompt:

REVENUE PROMPT TO EMBED:
"You are a Revenue Optimisation Agent for a YouTube English learning channel. Based on the performance and audience data provided, generate a concrete monetisation plan. Include: current stage strategy, top 3 revenue opportunities ranked by effort vs return, specific product ideas (with suggested price points), CTA rotation schedule for the next 30 videos (which videos get which CTA), affiliate product recommendations (English learning apps/tools with affiliate programs), funnel structure (lead magnet → email sequence → paid product). Output ONLY valid JSON:
{
  current_stage: string,
  stage_strategy: string,
  top_revenue_opportunities: [{opportunity: string, effort: string, monthly_estimate: string}],
  product_ideas: [{name: string, price: string, format: string, audience_evidence: string}],
  cta_schedule: [{video_number: number, cta_type: string, cta_text: string}],
  affiliate_recommendations: [{product: string, program_url: string, commission: string}],
  funnel_structure: {lead_magnet: string, email_sequence: [string], paid_product: string}
}"

4. Saves output to english-made-fun/config/revenue_plan.json
5. Extracts the cta_schedule and injects the correct CTA into the next batch of script JSONs automatically before production
6. Runs monthly (called by orchestrator)

Write the COMPLETE file. No placeholders.
```

---

## PHASE 5 — THE ORCHESTRATOR (Master Controller)

### Prompt 18 — Generate the Master Orchestrator
**Mode: Code**

```
Write the complete Node.js file english-made-fun/pipeline/orchestrator.js that is the BRAIN of the entire automation system.

This file must:

1. Be executable as the single entry point: node pipeline/orchestrator.js
2. Read a topics_queue.json from english-made-fun/config/ (array of topic strings for today)
3. Execute the FULL pipeline in this exact order, waiting for each step before proceeding:

   STEP 1: competitor_agent.js (if it is Monday — runs weekly)
   STEP 2: audience_agent.js (if it is Monday — runs weekly)
   STEP 3: script_agent.js — generate scripts for today's topics
            → Injects insights from: audience_insights.json, competitor_insights.json, feedback_latest.json
            → Generates 5 scripts per run
   STEP 4: viral_prediction_agent.js — score and filter all scripts
   STEP 5: image_agent.js — generate all images for approved scripts
   STEP 6: voice_agent.js — generate all voice lines
   STEP 7: sfx_agent.js — generate all SFX
   STEP 8: render_agent.js — render all videos
   STEP 9: upload_agent.js — upload all final videos to YouTube
   STEP 10: feedback_agent.js (if it is Sunday — runs weekly)
   STEP 11: revenue_agent.js (if it is the 1st of the month — runs monthly)

4. After uploads, automatically replenish topics_queue.json using next_batch_topics from audience_insights.json + hooks from competitor_insights.json
5. Log each step with: step name, start time, end time, success/failure, output summary
6. Save a daily_run_log.json with the complete run summary
7. Send a terminal notification when the daily run is complete with stats: videos produced, videos uploaded, videos rejected
8. Handle failures gracefully: if any step fails, log the error and skip to the next video (never crash the whole batch)
9. Expose a DRY_RUN=true environment variable that runs everything except the actual API calls (for testing)

10. Also create a separate file: english-made-fun/pipeline/scheduler.js that uses node-cron to:
    - Run orchestrator.js every day at 6:00 AM local time
    - Log "Scheduler started" on boot
    - Be runnable as: node pipeline/scheduler.js (keep-alive process)

Write BOTH complete files. No placeholders.
```

---

## PHASE 6 — PRE-FILLED CONTENT TEMPLATES

### Prompt 19 — Generate the Three Video Format Templates
**Mode: Code**

```
Generate three complete JSON template files that my Script Agent uses as format blueprints. Each file must be a fully filled example that Claude can use as a reference when generating new scripts.

FILE 1: english-made-fun/templates/fail_fix_template.json
Complete example of a "Fail → Fix Stickman Skits" video about the grammar mistake "I have went" vs "I have gone". Include all scenes with: scene_id, start, duration, type, text, voice_line, stickman_action, stickman_emotion, visual template, animation in/out/emphasis, sfx_prompts array, use_image, visual_priority. Also include full hook options, script sentences, packaging titles, thumbnail prompt.

FILE 2: english-made-fun/templates/word_explosion_template.json
Complete example of a "Word Explosion Visual Builds" video about the word "Set" with 4 meanings. Same full structure as above. Use dark neon visual style. Include mini-story scene and save-this CTA.

FILE 3: english-made-fun/templates/superpower_rule_template.json
Complete example of a "Rule as Superpower Metaphor" video about Present Perfect tense. Same full structure. Include hero_pose, villain scene, power_up, world transformation, quick_wins, fly_off CTA.

Each file must be valid JSON, no comments inside the JSON, completely filled with no placeholder values. These are reference templates — every field must have a real value.

Write all three complete files.
```

---

### Prompt 20 — Generate the 7-Day Starter Batch
**Mode: Code**

```
Generate the complete 7-day starter content batch as individual JSON files for my pipeline. These are the first 7 days of content, 2–3 videos per day, fully mapped and ready to feed directly into the pipeline.

Create files: day01.json through day07.json saved to english-made-fun/scripts/

Each video JSON must follow the master schema exactly and include:
- video_id (use placeholder uuid format like "vid_001")
- format (rotating: Fail→Fix, Word Explosion, Superpower, Fail→Fix, Word Explosion, Superpower, Fail→Fix)
- Full topic and hook
- All scenes with: scene_id, start, duration, type, text, voice_line, stickman_action, stickman_emotion, sfx_prompts, use_image, visual_priority
- audio settings
- packaging with 3 title options and thumbnail prompt
- viral_triggers array

Use these topics in rotation:
Day 1: "I have went vs I have gone" + Word "Break" (4 meanings)
Day 2: "She go vs She goes" + "Much vs Many superpower rule"
Day 3: "In the bus vs On the bus" + Word "Run" (3 meanings)
Day 4: "More tall vs Taller" + "Past simple superpower rule"
Day 5: Word "Make" (3 meanings) + "Present perfect superpower"
Day 6: "You are coming? vs Are you coming?" + Word "Take" (3 meanings)
Day 7: "I have saw vs I have seen" + "Countable vs uncountable superpower"

Every scene must have SFX prompts. The Fail scenes must have "trip_whoosh" and "fall_thud" type prompts. Correct scenes must have "victory_chime" and "sparkle_pop" type prompts. CTA scenes always get "ding" type prompt.

Write ALL 7 complete JSON files. No placeholders. Valid JSON only.
```

---

## PHASE 7 — CONFIGURATION FILES

### Prompt 21 — Generate All Configuration Files
**Mode: Code**

```
Generate ALL of these configuration files for my pipeline:

FILE 1: english-made-fun/config/local_config.json
Complete local execution configuration including:
- rendering: frame_rate 60, resolution 1080x1920, parallel_jobs 3, output_format MP4, subtitles true
- audio: voice profile "Energetic English Coach", speed 1.1, sample_rate 44100, batch_generation true
- images: max_images_per_video 2, max_thumbnails_per_video 3, reuse_threshold 0.7, primary_model "stable_diffusion", thumbnail_model "dalle"
- upload: daily_shorts 3, weekly_long_form 1, stagger_hours 4, tags array with 10 English learning tags
- pipeline: viral_score_threshold 50, revision_threshold 60, max_revisions 2
- storage: all local folder paths
- logging: log_level INFO, enable_terminal_notifications true
- scheduling: daily_run_time "06:00", competitor_agent_day "Monday", audience_agent_day "Monday", feedback_agent_day "Sunday", revenue_agent_day 1

FILE 2: english-made-fun/config/topics_queue.json
A starter queue of 30 English learning topics (10 grammar mistakes, 10 vocabulary words, 10 grammar rules) formatted as an array of objects with: topic, format_suggestion, priority_score

FILE 3: english-made-fun/config/competitors.json
Array of 5 real large English-learning YouTube channel IDs (find ones that exist) with their channel name and a note about their content style

FILE 4: english-made-fun/config/voice_profiles.json
Inworld voice configuration with: character name "Energetic English Coach", personality traits, speech parameters for each format (Fail→Fix slightly dramatic, Word Explosion excited, Superpower heroic)

FILE 5: english-made-fun/config/sfx_library.json
A pre-built SFX description library mapping action names to ElevenLabs generation prompts:
- trip_whoosh: "quick whooshing sound of someone tripping and falling"
- fall_thud: "cartoon thud impact sound"
- victory_chime: "upbeat success chime"
- sparkle_pop: "magical sparkle pop sound"
- explode_pop: "fun cartoon explosion pop"
- shatter_pop: "glass shattering into pieces"
- whoosh_slide: "quick slide whoosh transition"
- magic_whoosh: "magical power-up whoosh"
- power_chime: "heroic power activation chime"
- cheer_crowd: "small cheerful crowd reaction"
- fail_boop: "cartoon fail boop sound"
- ding: "clean notification ding"

Write ALL files as valid JSON. No placeholders.
```

---

## PHASE 8 — FIRST-TIME SETUP & TESTING

### Prompt 22 — Generate the Setup Verification Script
**Mode: Code**

```
Write a complete Node.js script english-made-fun/pipeline/setup_check.js that I run ONCE to verify my entire system is correctly configured before starting production.

The script must check and report on ALL of the following:

1. ENVIRONMENT VARIABLES: Check each .env variable is set (not empty): ELEVEN_API_KEY, INWORLD_API_KEY, ANTHROPIC_API_KEY, TOGETHER_API_KEY, YOUTUBE_CLIENT_