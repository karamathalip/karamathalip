---
description: "Use when working with config files, tuning pipeline parameters, modifying topics queue, voice profiles, SFX library, competitors list, or local_config.json in english-made-fun/config/."
applyTo: "english-made-fun/config/**"
---
# Config Files Reference

## `local_config.json` — Master Configuration

**Rendering:**
- Frame rate: 60fps, Resolution: 1080×1920
- Parallel jobs: 3, Codec: H.264, CRF: 18
- Subtitles: enabled, 52pt white Arial Bold

**Audio:**
- Voice profile: "Energetic English Coach", speech rate: 1.1x
- Sample rate: 44100Hz, voice volume: 0.9, SFX volume: 0.7
- Fade-in: 30ms, fade-out: 50ms

**Images:**
- Max per video: 2, max thumbnails: 3
- Primary model: Stable Diffusion, thumbnail model: DALL·E 3 (1024×1792)
- Cache: `images/cache/`, reuse: `images/reuse_library/`

**Upload:**
- Daily shorts: 3, stagger interval: 4 hours
- Category: 27 (Education), playlist: "English Made Fun — Daily Shorts"

**Pipeline:**
- Viral thresholds: 50 (reject) / 60 (revise) / 80 (produce)
- Max revisions: 2, scripts per run: 5

**Scheduling:**
- Daily run: 06:00
- Competitor + audience: Monday
- Feedback: Sunday
- Revenue: 1st of month

---

## `topics_queue.json` — 30 Prioritized Topics

Each entry:
```json
{ "topic": string, "format_suggestion": string, "priority_score": 0-100, "category": string }
```

**Categories:** grammar_mistake, vocabulary_word, grammar_rule

**Format suggestions:** fail_fix_stickman_skit, word_explosion_visual_build, rule_as_superpower_metaphor

**Top priorities:**
- "Present Perfect tense" (96, grammar_rule → superpower)
- "I have went vs gone" (95, grammar_mistake → fail_fix)
- "SET — 4 meanings" (94, vocabulary_word → word_explosion)

---

## `voice_profiles.json` — Inworld TTS Config

**Default profile:** energetic_english_coach (Inworld character from env var)

**Base parameters:** MP3, 24kHz, rate 1.05, pitch +0.5 semitones

**Format-specific overrides:**
- `fail_fix_stickman_skit` — Dramatic fail → clear fix → energetic CTA
- `word_explosion_visual_build` — Excited hook → calm meanings → explosive payoff
- `rule_as_superpower_metaphor` — Heroic throughout → triumphant payoff

**Tone mapping:**
| Tone | Pitch | Rate |
|------|-------|------|
| energetic | +2.0 | 1.2x |
| warm | +1.0 | 1.05x |
| calm | 0.0 | 1.0x |
| serious | -1.5 | 0.95x |
| dramatic | -3.0 | 1.1x |

---

## `sfx_library.json` — 21 Sound Effect Cues

Each cue:
```json
{ "prompt": string, "duration_seconds": 0.3-22.0, "prompt_influence": 0.0-1.0, "category": string, "scene_types": string[] }
```

**Categories:** fail, success, impact, transition, power, reaction, notification

**Key cues:** trip_whoosh (0.8s), victory_chime (1.0s), magic_whoosh (0.9s), neon_flicker (0.6s), dramatic_reveal (1.2s), subscribe_bell (0.5s)

---

## `competitors.json` — 5 Competitor Channels

Each entry:
```json
{
  "channel_name": string, "youtube_id": string, "channel_url": string,
  "subscriber_tier": "mega" | "large",
  "content_style": string, "strengths": string[], "weaknesses": string[],
  "hook_patterns": string[], "avg_views_per_short": number, "posting_frequency": string
}
```

**Channels:**
1. English with Lucy — Polished British grammar (250k avg views)
2. mmmEnglish — Confidence building, adult learners (180k)
3. English Addict with Mr Steve — Idioms/slang (95k)
4. Learn English with TV Series — Pop-culture clips (320k)
5. EnglishClass101 — Structured curriculum (140k)
