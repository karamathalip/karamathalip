---
description: "Use when working on Remotion components, scene templates, stickman animations, video rendering, or any TSX files in english-made-fun/components/ or english-made-fun/src/. Covers all scene types, props, animations, and visual effects."
applyTo: "english-made-fun/components/**, english-made-fun/src/**"
---
# Remotion Components Reference

## Composition Registry (`src/Root.tsx`)
- **VideoTemplate** — Primary. 60fps, 1080×1920, Zod-validated, dynamic duration via `calculateMetadata()`
- **StickmanDemo** — Dev test reel. 30fps, 17 poses × 90 frames
- Zod schemas: `SfxCueSchema`, `SceneVisualSchema` (union of 5 templates), `SceneDataSchema`, `CaptionStyleSchema`, `VideoTemplateSchema`

## Central Export Hub (`components/index.ts`)
```typescript
export { Stickman, StickmanDemoCompositions, StickmanDemoScene }
export type { StickmanProps, Pose, Emotion }
export { TextBurstScene, StickmanScene, DialogueScene, WordExplosionScene, SuperpowerScene }
export type { TextBurstSceneProps, StickmanSceneProps, DialogueSceneProps,
              WordExplosionSceneProps, SuperpowerSceneProps, TextBurstEmphasis }
export { Scene }
export type { SceneProps, SceneData, SceneVisual, SceneTemplate, SfxCue }
export { VideoTemplate }
export type { VideoData, VideoTemplateProps, CaptionStyle }
```

## Scene Router (`components/Scene.tsx` — ~140 lines)
Routes `visual.template` to the correct component:
| Template | Component |
|----------|-----------|
| `stickman` (default) | `StickmanScene` |
| `text_burst` | `TextBurstScene` |
| `dialogue` | `DialogueScene` |
| `word_explosion` | `WordExplosionScene` |
| `superpower` | `SuperpowerScene` |

## VideoTemplate (`components/VideoTemplate.tsx` — ~380 lines)
Main composition. Sequences all scenes + audio.

**Key sub-functions:**
- `buildSfxCues()` — Per-scene SFX → absolute frame positions
- `buildFramedScenes()` — Scenes → frame ranges
- `CaptionFileOverlay()` — Async TikTok-style captions via `@remotion/captions`
- `SceneTextOverlay()` — Fallback caption display
- `QuizCountdown()` — 3→2→1 spring animation
- `GlobalBackground()` — Animated radial gradient behind all scenes

**Dependencies:** `@remotion/media` (`<Audio>`), `@remotion/captions` (`createTikTokStyleCaptions()`)

---

## Stickman (`components/Stickman.tsx` — ~700 lines)

**15 poses:** standing, falling, jumping, flying, hero_pose, facepalm, victory_pose, winking, thumbs_up, pointing, celebrate, trip, sword_glow, fly_off, cameo_wave, shocked, epic_win

**7 emotions:** happy, sad, shocked, victorious, confused, excited, neutral

**Props:**
```typescript
{ pose?: Pose, emotion?: Emotion, scale?: number, color?: string }
```

**SVG:** viewBox 0 0 80 140. Head r=14, body from hip, arms at y=55, legs at y=90.

**Animations:**
- Entrance: spring scale 0→1 (damping 16, stiffness 80)
- Idle bob: `sin((frame/fps) * π * 2) * 4px`
- Pose-specific springs: jump, fall, trip, shock, celebrate, point

## StickmanScene (`components/StickmanScene.tsx` — ~300 lines)
Stickman + text + particles + animated gradient background.

**Sub-components:**
- `Particle` — ✓ or ✗ symbol, spring entry, 8 deterministic slots
- `TextOverlay` — Upper-area caption, ALL_CAPS words (3+ chars) → golden highlight + glow

**Features:** Animated radial gradient bg, vignette overlay, `effect: 'correct' | 'wrong'` particles

## DialogueScene (`components/DialogueScene.tsx` — ~300 lines)
Chat bubble with typewriter animation.

**Sub-components:**
- `SpeakerLabel` — Name above bubble, spring slide-down
- `ChatBubble` — Typewriter reveal (28 chars/sec), cursor blink every 8 frames, glow pulse
- `BubbleTail` — SVG pointer toward stickman

## TextBurstScene (`components/TextBurstScene.tsx` — ~340 lines)
Text bursts with emphasis effects.

**Emphasis modes:**
- `zoom` — Slow continuous scale-up, radial light burst
- `shake` — Horizontal oscillation (sine wave)
- `highlight` — Pulsing underline bar
- `pop` — Per-word spring stagger, radial starburst lines

**Sub-components:** `Word` (kinetic bounce on keywords, yellow bg + glow), `AnimatedBackground` (gradient + vignette)

## WordExplosionScene (`components/WordExplosionScene.tsx` — ~360 lines)
Word explodes then meanings fade in.

**Phases:**
- Phase 1 (0→shrinkAfter): `BigWord` scales 0→1
- Phase 2 (shrinkAfter→): Word compresses to 96pt header, moves up

**Sub-components:**
- `MeaningCard` — Icon + text + neon border, stagger 0.4s
- `Shockwave` — Expanding ring on explosion
- Corner accent dots pulse, radial gradient glow

## SuperpowerScene (`components/SuperpowerScene.tsx` — ~340 lines)
Grammar rule as heroic power.

**Sub-components:**
- `RuleWeapon` — Rule text box slides in from right with spring, scale-pulse "charge"
- `WorldColorShift` — CSS filter desaturate → saturate transition
- `PowerBurst` — 12 radial energy rays from stickman
- `SuperpowerBadge` — "SUPERPOWER UNLOCKED" drops from top with spring

---

## Color System
- Wrong/Fail: `#FF3B30` (red)
- Correct/Win: `#34C759` (green)
- Neutral/Stickman: `#1F8EF1` (blue)
- Hero: `#f7c948` (gold)
- Dark neon bg: `#0D0D0D`

## Rendering Config
- Production: 60fps, 1080×1920, H.264, CRF 18
- remotion.config.ts: concurrency 4, SVG via @svgr/webpack
- tsconfig aliases: `@components/*`, `@templates/*`, `@config/*`, `@assets/*`
