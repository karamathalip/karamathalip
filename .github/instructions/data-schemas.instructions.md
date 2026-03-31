---
description: "Use when working with JSON data schemas, script generation output, Remotion input props, viral scoring, batch logs, upload logs, feedback/audience/competitor insights, or any data transformation between pipeline stages."
---
# Data Schemas Reference

## Script JSON (output of `pipeline/script_agent.js`)
```typescript
{
  video_id: string,              // UUID (production) or format_topic_timestamp (root)
  video_title: string,
  format: "fail_fix_stickman_skit" | "word_explosion_visual_build" | "rule_as_superpower_metaphor",
  hook: { options: [string, string, string], selected: string },
  script: { full_text: string, sentences: string[] },
  scenes: [{
    scene_id: number,
    start: number,               // seconds
    duration: number,            // seconds
    type: "hook" | "explanation" | "example" | "payoff" | "CTA",
    text: string,
    voice_line: string,
    stickman_action: string,     // maps to Stickman pose
    stickman_emotion: string,    // maps to Stickman emotion
    visual: {
      template: "stickman" | "text_burst" | "dialogue" | "word_explosion" | "superpower",
      background_color: string,  // hex
      text_color: string,        // hex
      elements: { keywords: string[] },
    },
    animation: { in: string, out: string, emphasis: string },
    sfx_prompts: string[],       // e.g. ["whoosh_slide", "fail_boop"]
    use_image: boolean,
    visual_priority: "standard" | "high_emotion"
  }],
  audio: { voice: string, speed: number, tone: string },
  captions: { enabled: boolean, style: string },
  packaging: {
    titles: [string, string, string],
    description: string,
    tags: string[],
    thumbnail: { text: string, visual: string }
  },
  viral_triggers: string[],
  metrics: { ctr: null, retention: null, watch_time: null }
}
```

## Remotion VideoTemplate Input (Zod schema in `src/Root.tsx`)
```typescript
{
  jsonData: {
    title: string,
    voice_file: string,          // relative to public/ or absolute
    scenes: [{
      id: string,
      duration: number,
      visual: SceneVisual,       // Union: stickman | text_burst | dialogue | word_explosion | superpower
      sfx?: [{ file: string, startTime: number, volume?: number }]
    }],
    captions?: { file?: string, style?: CaptionStyle }
  }
}
```

## Viral Score Result (from `viral_prediction_agent.js`)
```typescript
{
  viral_score: number,           // 0-100
  retention_score: number,
  ctr_score: number,
  engagement_score: number,
  strengths: string[],
  weaknesses: string[],
  improvement_suggestions: string[],
  decision: "produce" | "revise" | "reject"
}
```

## Batch Run Log (`config/daily_run_log.json`)
```typescript
{
  run_id: string,
  started_at: string,            // ISO 8601
  dry_run: boolean,
  steps: [{
    step: number, name: string,
    status: "success" | "failed" | "skipped",
    duration_s: number, error?: string,
    output_summary?: { saved, failed, produced, uploaded }
  }],
  summary: { total_videos, produced, uploaded, rejected, errors: [{ video_id, error }] }
}
```

## Upload Log (`config/upload_log.json`)
```typescript
{
  video_id: string,
  youtube_id: string,
  url: string,
  scheduled_at: string,          // ISO 8601
  uploaded_at: string,
  status: "uploaded" | "failed" | "scheduled",
  title: string,
  error?: string
}
```

## Feedback Output (`config/feedback_latest.json`)
```typescript
{
  winning_patterns: string[],
  losing_patterns: string[],
  hook_feedback: string,
  pacing_recommendations: string,
  format_ranking: [{ format: string, avg_retention: number }],
  updated_script_instructions: string,  // consumed by script_agent
  updated_visual_instructions: string,
  top_performing_video_ids: string[]
}
```

## Audience Insights (`config/audience_insights.json`)
```typescript
{
  pain_points: [{ topic: string, frequency: number, example_comment: string }],
  content_opportunities: [{ idea: string, demand_score: number, suggested_format: string }],
  viral_hooks: string[],
  product_opportunities: [{ name: string, evidence: string }],
  audience_segments: string[],
  next_batch_topics: string[]
}
```

## Competitor Insights (`config/competitor_insights.json`)
```typescript
{
  winning_hook_patterns: string[],
  repeatable_formats: string[],
  thumbnail_patterns: string[],
  content_gaps: string[],
  differentiation_strategy: string[],
  recommended_topics_to_dominate: string[],
  hooks_to_use_next_batch: string[]
}
```

## File Output Paths
| Stage | Path |
|-------|------|
| Scripts | `scripts/day${DD}_vid${NN}.json` |
| Approved | `scripts/approved/{filename}.json` |
| Voice | `audio/voices/{video_id}_voice_full.mp3` |
| SFX | `audio/sfx/{video_id}_scene{N}_sfx{M}.mp3` (cache: `{md5}.mp3`) |
| Images | `images/{video_id}_scene{N}.png` |
| Thumbnails | `thumbnails/{video_id}_thumb.png` |
| Video (silent) | `videos/{video_id}.mp4` |
| Video (final) | `output/final/{video_id}_final.mp4` |
