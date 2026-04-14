/**
 * ConfigDrivenRoot.tsx — Reusable Remotion Root for any word video
 *
 * Usage: Import this Root, pass your config JSON, and render.
 * No word-specific code needed — just swap the config file.
 *
 * To use for a new word:
 *   1. Generate a WordVideoConfig JSON (via pipeline or manually)
 *   2. Import this Root in your project's Root.tsx
 *   3. Pass the config as defaultProps
 */

import React from "react";
import { Composition } from "remotion";
import { z } from "zod";
import { WordExplosionTemplate } from "./WordExplosionTemplate";
import type { WordVideoConfig } from "../types/video-config";

// ─── Zod schema for Remotion Studio validation ──────────────────────────────

const WordVideoConfigSchema = z.object({
  videoId: z.string(),
  format: z.string(),
  targetWord: z.string(),
  topic: z.string(),
  level: z.string(),
  fps: z.number(),
  width: z.number(),
  height: z.number(),
  voiceDelayFrames: z.number(),
  colors: z.object({
    bg: z.string(),
    bgLight: z.string(),
    primary: z.string(),
    text: z.string(),
    textDim: z.string(),
    hero: z.string(),
    stickman: z.string(),
    meanings: z.array(z.string()),
  }),
  meanings: z.array(z.any()),
  scenes: z.array(z.any()),
  youtube: z.object({
    title: z.string(),
    description: z.string(),
    tags: z.array(z.string()),
  }),
}).passthrough();

// ─── Root Factory ────────────────────────────────────────────────────────────

export function createWordVideoRoot(config: WordVideoConfig): React.FC {
  const totalFrames = config.scenes.reduce(
    (sum, s) => sum + s.durationFrames,
    0
  );

  const Root: React.FC = () => (
    <>
      <Composition
        id={config.videoId}
        component={WordExplosionTemplate}
        durationInFrames={totalFrames}
        fps={config.fps}
        width={config.width}
        height={config.height}
        schema={WordVideoConfigSchema}
        defaultProps={{ config }}
      />

      {/* Individual scene previews for development */}
      {config.scenes.map((scene, i) => {
        const offset = config.scenes
          .slice(0, i)
          .reduce((sum, s) => sum + s.durationFrames, 0);
        return (
          <Composition
            key={`preview-${scene.id}`}
            id={`${scene.id}_preview`}
            component={WordExplosionTemplate}
            durationInFrames={scene.durationFrames}
            fps={config.fps}
            width={config.width}
            height={config.height}
            defaultProps={{
              config: {
                ...config,
                scenes: [scene],
              },
            }}
          />
        );
      })}
    </>
  );

  return Root;
}
