# vid_009 — The word MAKE: 3 completely different meanings

A standalone Remotion video project for a viral YouTube Short explaining the 3 meanings of "MAKE" (Create / Force / Earn).

## Specs

| Property | Value |
|----------|-------|
| Format | `word_explosion_visual_build` |
| Resolution | 1080 × 1920 (9:16 vertical) |
| FPS | 60 |
| Duration | 44 seconds (2640 frames) |
| Style | Dark neon, electric blue / pink / yellow / green |
| Audience | All ages — kids & adults, ESL learners |

## Scene Breakdown

| # | Scene | Duration | Template | Description |
|---|-------|----------|----------|-------------|
| 1 | Hook | 3s | NeonText + Flicker | Giant "MAKE" flickers on, 3 meaning badges |
| 2 | Meaning 1 | 8s | MeaningCard | CREATE — pink neon, examples stagger in |
| 3 | Meaning 2 | 8s | MeaningCard | FORCE/CAUSE — yellow neon |
| 4 | Meaning 3 | 8s | MeaningCard | EARN — green neon |
| 5 | Explosion | 6s | Shockwave + Labels | All 3 labels explode outward from MAKE |
| 6 | Mini Story | 7s | WordHighlight | One sentence uses all 3 meanings |
| 7 | Loop Back | 4s | NeonText + Recap | Quick recap, loop indicator |

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Preview in Remotion Studio
npm run dev
# → Open http://localhost:3000, select "MakeVideo" composition

# 3. Generate voice with ElevenLabs
ELEVEN_API_KEY=your_key node scripts/generate-voice.js

# 4. Render final video
npm run render
# or with voice:
node scripts/render.js --with-voice --quality=high
```

## ElevenLabs Voice

The voice generation script (`scripts/generate-voice.js`) uses ElevenLabs' Text-to-Speech API.

### Recommended Voices

| Voice | ID | Style | Best For |
|-------|-----|-------|----------|
| **Josh** | `TxGEqnHWrfWFTfGW9XjX` | Warm, energetic, clear | **Recommended** — works for all ages |
| Rachel | `21m00Tcm4TlvDq8ikWAM` | Warm, articulate | Female voice option |
| Adam | `pNInz6obpgDQGcFmaJgB` | Deep, confident | Authoritative tone |
| Antoni | `ErXwobaYiN019PkySvjV` | Young, friendly | Younger audience |

```bash
# Use default (Josh):
ELEVEN_API_KEY=sk_... node scripts/generate-voice.js

# Use a different voice:
ELEVEN_API_KEY=sk_... VOICE_ID=21m00Tcm4TlvDq8ikWAM node scripts/generate-voice.js
```

Voice files are saved to `public/audio/voice/`.

## Project Structure

```
vid_009_make/
├── package.json                # Dependencies
├── tsconfig.json               # TypeScript config
├── remotion.config.ts          # Remotion entry point
├── src/
│   ├── index.tsx               # registerRoot()
│   ├── Root.tsx                # Composition registry + Zod schemas
│   ├── MakeVideo.tsx           # Main composition (sequences all scenes)
│   ├── constants.ts            # Colors, timing, scene data, helpers
│   ├── fonts.ts                # Google Fonts (Bangers, Inter, Space Grotesk)
│   ├── components/
│   │   ├── Stickman.tsx        # SVG stickman with 11 poses + 7 emotions
│   │   ├── NeonText.tsx        # Neon glow text (flicker/pulse/burst)
│   │   ├── AnimatedBg.tsx      # Dark gradient + radial glow + vignette
│   │   ├── MeaningCard.tsx     # Neon-bordered meaning card
│   │   └── Shockwave.tsx       # Expanding ring explosion effect
│   └── scenes/
│       ├── HookScene.tsx       # Scene 1: Opening hook
│       ├── MeaningScene.tsx    # Scenes 2-4: Meaning explanation
│       ├── ExplosionScene.tsx  # Scene 5: All 3 meanings reveal
│       ├── MiniStoryScene.tsx  # Scene 6: One sentence, all meanings
│       └── LoopBackScene.tsx   # Scene 7: Recap + loop
├── public/audio/               # Voice & SFX files (generated)
├── scripts/
│   ├── generate-voice.js       # ElevenLabs TTS generation
│   └── render.js               # Programmatic render
└── output/                     # Rendered video output
```

## Art Direction

- **Background**: Deep dark navy `#0d0d1a` with subtle radial glow
- **Primary**: Electric blue `#00d4ff` — center word, accents
- **CREATE**: Hot pink `#ff2d78` — energetic, playful
- **FORCE**: Yellow `#ffe600` — attention-grabbing, warning
- **EARN**: Neon green `#39ff14` — money, success
- **Typography**: Bangers (display), Inter (body), Space Grotesk (numbers)
- **Motion**: Spring physics entrances, neon pulse glow, stagger reveals

## Build Guide Phases Followed

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Project variables | ✅ |
| 1 | Role & constraints | ✅ |
| 2 | Art direction | ✅ Dark neon, 4-color meaning system |
| 3 | Story & timeline | ✅ 7 scenes, 44s total |
| 3.5 | Font loading | ✅ Bangers + Inter + Space Grotesk |
| 4 | Asset inventory | ✅ Stickman, NeonText, MeaningCard, Shockwave, AnimatedBg |
| 5 | SVG asset specs | ✅ Skeleton-based stickman, 11 poses |
| 6 | Structural primitives | ✅ Sequence-based, spring + interpolate |
| 7 | Motion primitives | ✅ Spring entrance, neon pulse, stagger reveal |
| 8 | Component architecture + Zod | ✅ Zod schema, composition registry |
| 9 | Scaffolding | ✅ All files created |
| 10 | Scene assembly | ✅ All 7 scenes composed |
| 11 | Audio & voiceover | ✅ ElevenLabs script ready |
| 12 | Render & QA | ✅ Programmatic render + QA checklist |
| 13 | Iteration loop | Ready for atomic diffs |

## Viral Optimization

This video is designed for maximum viral potential:

- **Hook in first 2 seconds** — "MAKE" neon flicker grabs attention instantly
- **Pattern of 3** — Three meanings create satisfying structure
- **Color coding** — Each meaning has a distinct neon color for quick visual parsing
- **Loop design** — Scene 7 mirrors Scene 1 for seamless TikTok/Shorts looping
- **Mini story payoff** — Using all 3 meanings in one sentence creates an "aha!" moment
- **Universal appeal** — Simple vocabulary topic accessible to learners of all levels
- **Stickman character** — Friendly, non-distracting, appeals to all ages
