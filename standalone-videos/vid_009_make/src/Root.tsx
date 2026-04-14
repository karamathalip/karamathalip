/**
 * Root.tsx — Remotion composition registry
 *
 * Registers:
 *   "MakeVideo" — Main composition, 1080×1920 @ 60fps, ~51.25 seconds (v2.3)
 *   Per-scene audio wired directly in MakeVideo.tsx (no combined voice prop).
 */

import React from "react";
import { Composition } from "remotion";
import { z } from "zod";
import { MakeVideo } from "./MakeVideo";
import { FPS, WIDTH, HEIGHT, TOTAL_FRAMES, SCENE_FRAMES } from "./constants";

// ─── Zod Schema ───────────────────────────────────────────────────────────────

const MakeVideoSchema = z.object({});

// ─── Root ─────────────────────────────────────────────────────────────────────

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="MakeVideo"
        component={MakeVideo}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        schema={MakeVideoSchema}
        defaultProps={{}}
      />

      {/* Individual scene previews for development */}
      <Composition
        id="HookPreview"
        component={React.lazy(() =>
          import("./scenes/HookScene").then((m) => ({ default: m.HookScene }))
        )}
        durationInFrames={SCENE_FRAMES.hook}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />

      <Composition
        id="ExplosionPreview"
        component={React.lazy(() =>
          import("./scenes/ExplosionScene").then((m) => ({
            default: m.ExplosionScene,
          }))
        )}
        durationInFrames={SCENE_FRAMES.explosion_reveal}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />

      <Composition
        id="MiniStoryPreview"
        component={React.lazy(() =>
          import("./scenes/MiniStoryScene").then((m) => ({
            default: m.MiniStoryScene,
          }))
        )}
        durationInFrames={SCENE_FRAMES.mini_story}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />

      <Composition
        id="LoopBackPreview"
        component={React.lazy(() =>
          import("./scenes/LoopBackScene").then((m) => ({
            default: m.LoopBackScene,
          }))
        )}
        durationInFrames={SCENE_FRAMES.loop_back}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
    </>
  );
};
