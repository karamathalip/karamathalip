# Running the Render Agent for vid_001

This document explains how to run `node pipeline/render_agent.js scripts/approved/vid_001.json`.

## Prerequisites

All dependencies are already installed. The `vid_001.json` script file exists at:
```
scripts/approved/vid_001.json
```

## Running the Render Agent

### Method 1: Direct CLI (Recommended)
From the `english-made-fun` directory, run:
```bash
node pipeline/render_agent.js scripts/approved/vid_001.json
```

### Method 2: Via npm script
```bash
npm run render:agent scripts/approved/vid_001.json
```

### Method 3: Direct invoker script
```bash
npm run render:vid_001
```
or
```bash
node render_vid_001.js
```

## What Will Happen

The render agent will:
1. **Bundle** the Remotion entry point (`src/index.tsx`) into a webpack bundle
2. **Read** the script from `scripts/approved/vid_001.json`
3. **Render** the video using Remotion (all 7 scenes @ 60 FPS)
4. **Output** a silent MP4 to `videos/vid_001.mp4`
5. **Merge** voice audio (if available at `audio/voices/vid_001_voice_full.mp3`)
6. **Output** final video to `output/final/vid_001_final.mp4`
7. **Log** render statistics to `output/final/render_log.json`

## Expected Output

Success output should look like:
```
╔════════════════════════════════════════════════════════════╗
║  english-made-fun / render_agent.js                        ║
║  Concurrency : 3 browser tabs                              ║
║  Timeout     : 120s per frame                              ║
║  Force re-render : false                                   ║
║  Batch       : 1 script                                    ║
║  Output dir  : output/final                                ║
╚════════════════════════════════════════════════════════════╝

[1/1] vid_001.json
     video_id : vid_001
     title    : STOP saying 'I have went' 🚫
     scenes   : 7
    → Rendering with Remotion (concurrency=3)...
    ✓ Render done in XX.Xs → vid_001.mp4
    → Merging voice + N SFX track(s) with FFmpeg...
    ✓ Final output: vid_001_final.mp4  (XX.XX MB)  total=XXs
```

## Script Structure

The `vid_001.json` file contains:
- **video_id**: `vid_001`
- **format**: `fail_fix_stickman_skit` 
- **topic**: "I have went vs I have gone"
- **scenes**: 7 scenes with:
  - Duration: 3-7 seconds each
  - Stickman animations (fail, win, explaining, etc.)
  - Visual effects and colors
  - Sound effect cues
  - Voice lines and captions
- **Total duration**: 37 seconds

## Troubleshooting

### If Remotion bundling is slow
This is normal on first run. The bundle is cached, subsequent renders are faster.

### If voice audio is missing
The render will still produce the video without audio. Place the voice file at:
```
audio/voices/vid_001_voice_full.mp3
```
Then re-run the render.

### If FFmpeg errors occur
Ensure FFmpeg is installed and available in your PATH:
```bash
ffmpeg -version
```

### To see detailed render log
```bash
node pipeline/render_agent.js --show-log
```

## File Locations

After a successful render, you'll find:
- **Silent render**: `videos/vid_001.mp4`
- **Final video**: `output/final/vid_001_final.mp4`
- **Render log**: `output/final/render_log.json`
- **Props file**: `videos/vid_001_props.json` (temporary, can be deleted)

## Configuration

Edit `pipeline/render_agent.js` top section to adjust:
- `RENDER_CONCURRENCY` (default: 3) — browser tabs for parallel rendering
- `RENDER_TIMEOUT_MS` (default: 120,000) — timeout per frame
- `FORCE_RERENDER` (default: false) — set true to re-render existing videos
