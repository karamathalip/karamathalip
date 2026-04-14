# Remotion Motion Graphics Build Guide — v2

A reusable, atomic, phase-gated prompt chain for building design-forward motion graphics explainers in Remotion. Replace `{{TOPIC}}` and `{{AUDIENCE}}` at the top and the rest flows through.

---

## Phase 0 — Project Variables

```
TOPIC: Mars
AUDIENCE: general adult viewers, science-curious
ASPECT_RATIO: 9:16
FPS: 30
DURATION_TARGET: 60–90 seconds
STYLE: clean, minimal, kinetic, flat + abstract, no realism, no stock footage
```

---

## Phase 1 — Role & Constraints (system prompt)

> You are a senior motion designer and senior Remotion engineer. You think in systems, timelines, and reusable components. You do **not** jump ahead. You work atomically and stop after each phase to wait for confirmation.
>
> **Project:** A design-forward motion graphics explainer about `{{TOPIC}}` for `{{AUDIENCE}}`, built entirely in Remotion.
>
> **Technical constraints:**
> - Remotion (React + TypeScript)
> - SVG-first assets, no raster
> - Reusable components, one responsibility each
> - Aspect ratio `{{ASPECT_RATIO}}`, `{{FPS}}` fps
> - TailwindCSS for layout, no other animation libraries
> - Zod schemas for all composition props
> - Durations derived via `calculateMetadata`, never hardcoded magic numbers
>
> **Workflow rule:** One phase at a time. Stop. Wait. Do not proceed until I say "next."

---

## Phase 2 — Art Direction (no code)

Color palette, typography (specify exact Google Fonts), shape language, icon rules, background treatment, motion principles. Sections with bullets.

## Phase 3 — Story & Timeline (no code)

Numbered scenes with title, purpose, key visual, on-screen text, duration in seconds + frames at FPS. Modular, removable, escalating complexity.

## Phase 3.5 — Font Loading

Generate `@remotion/google-fonts` import module for the typography from Phase 2. Code only.

## Phase 4 — Asset Inventory (no code)

Checklist grouped by category. Reusable by default; scene-local is fine if an asset has no variants and appears once.

## Phase 5 — SVG Asset Specs (atomic, one category per turn)

- 5A Hero object
- 5B Icons
- 5C Landmarks / feature callouts
- 5D Timeline & progress elements
- 5E Data callouts & numbers

Each: description, layer structure, naming. No React yet.

## Phase 6 — Structural Primitives (rules, no code)

How to use `<Sequence>`, `<Series>`, `<TransitionSeries>`. `interpolate` vs `spring` decision rule. Frame vs second conventions. Root composition strategy.

## Phase 7 — Motion Primitives (specs, no code)

FadeSlideIn, ScaleIn, OrbitMotion, TimelineReveal, CountUp, etc. Name, parameters, when to use.

## Phase 8 — Component Architecture & Zod

Component tree, Zod schemas per composition, `calculateMetadata` strategy that derives total duration from the Phase 3 scene list.

## Phase 9 — Scaffolding (atomic)

- 9A Root composition
- 9B Motion primitives implementation
- 9C Layout components
- 9D SVG asset components
- 9E Empty scene shells

Code only, one layer per turn.

## Phase 10 — Scene Assembly

One scene per turn. Compose only — no new primitives, no new assets. If something is missing, stop and report.

## Phase 11 — Audio & Voiceover

VO script aligned to storyboard, ElevenLabs production, `<Audio>` at Root, sync via `calculateMetadata` updates.

## Phase 12 — Render & QA

Preview pass, `npx remotion render`, QA checklist: legibility, motion feel, scene length sanity, audio sync, brand consistency.

## Phase 13 — Iteration Loop

Atomic diffs only. One diff per turn. No wholesale rewrites.

---

## How to use

Paste Phase 1 as the system prompt. Send each subsequent phase as its own message and wait for completion before the next. Fix issues before moving on — later phases compound earlier decisions.
