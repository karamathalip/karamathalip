/**
 * MakeVideo.tsx — v2.3 Main composition with hard cuts & progress dots
 *
 * Voice-driven timeline — scene durations match Sam's voice clips.
 * Each voice clip starts VOICE_DELAY_FRAMES (0.2s) into its scene.
 * Frame-exact: SCENE_FRAMES integers, total 3075 frames (~51.25s @ 60fps).
 */

import React from "react";
import {
  useCurrentFrame,
  Sequence,
  AbsoluteFill,
  Audio,
  staticFile,
} from "remotion";

import { HookScene } from "./scenes/HookScene";
import { MeaningScene } from "./scenes/MeaningScene";
import { ExplosionScene } from "./scenes/ExplosionScene";
import { MiniStoryScene } from "./scenes/MiniStoryScene";
import { LoopBackScene } from "./scenes/LoopBackScene";
import { MEANINGS, SCENE_FRAMES, FPS, COLORS, SFX_CUES, VOICE_DELAY_FRAMES } from "./constants";

// ─── Voice file mapping per scene ─────────────────────────────────────────────
const VOICE_FILES: Record<string, string> = {
  hook: "audio/voice/01_hook.mp3",
  meaning_1: "audio/voice/02_meaning_1.mp3",
  meaning_2: "audio/voice/03_meaning_2.mp3",
  meaning_3: "audio/voice/04_meaning_3.mp3",
  explosion_reveal: "audio/voice/05_explosion.mp3",
  mini_story: "audio/voice/06_mini_story.mp3",
  loop_back: "audio/voice/07_loop_back.mp3",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MakeVideoProps {}

// ─── Progress Dots ────────────────────────────────────────────────────────────

const SCENE_KEYS = Object.keys(SCENE_FRAMES) as (keyof typeof SCENE_FRAMES)[];

const SCENE_COLORS = [
  COLORS.primary,  // hook
  COLORS.create,   // meaning_1
  COLORS.force,    // meaning_2
  COLORS.earn,     // meaning_3
  COLORS.primary,  // explosion_reveal
  "#6644aa",       // mini_story
  COLORS.primary,  // loop_back
];

const ProgressDots: React.FC = () => {
  const frame = useCurrentFrame();

  // Determine which scene is active
  let accumulated = 0;
  let activeIndex = 0;
  for (let i = 0; i < SCENE_KEYS.length; i++) {
    const sceneDur = SCENE_FRAMES[SCENE_KEYS[i]];
    if (frame < accumulated + sceneDur) {
      activeIndex = i;
      break;
    }
    accumulated += sceneDur;
    if (i === SCENE_KEYS.length - 1) activeIndex = i;
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 28,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        gap: 12,
        zIndex: 80,
        pointerEvents: "none",
      }}
    >
      {SCENE_KEYS.map((_, i) => {
        const isActive = i === activeIndex;
        const isPast = i < activeIndex;
        return (
          <div
            key={i}
            style={{
              width: isActive ? 28 : 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: isActive
                ? SCENE_COLORS[i]
                : isPast
                ? `${SCENE_COLORS[i]}80`
                : "rgba(255,255,255,0.15)",
              boxShadow: isActive ? `0 0 8px ${SCENE_COLORS[i]}` : "none",
            }}
          />
        );
      })}
    </div>
  );
};

// ─── Main Composition ─────────────────────────────────────────────────────────

export const MakeVideo: React.FC<MakeVideoProps> = () => {
  // Frame counts per scene (integer-exact from SCENE_FRAMES)
  const hookFrames = SCENE_FRAMES.hook;
  const m1Frames = SCENE_FRAMES.meaning_1;
  const m2Frames = SCENE_FRAMES.meaning_2;
  const m3Frames = SCENE_FRAMES.meaning_3;
  const explFrames = SCENE_FRAMES.explosion_reveal;
  const storyFrames = SCENE_FRAMES.mini_story;
  const loopFrames = SCENE_FRAMES.loop_back;

  let offset = 0;

  const scenes = [
    {
      id: "hook",
      from: (offset = 0, offset),
      dur: hookFrames,
      component: <HookScene />,
    },
    {
      id: "meaning_1",
      from: (offset += hookFrames),
      dur: m1Frames,
      component: (
        <MeaningScene meaning={MEANINGS[0]} stickmanPose="painting" stickmanEmotion="happy" />
      ),
    },
    {
      id: "meaning_2",
      from: (offset += m1Frames),
      dur: m2Frames,
      component: (
        <MeaningScene meaning={MEANINGS[1]} stickmanPose="shoving" stickmanEmotion="excited" />
      ),
    },
    {
      id: "meaning_3",
      from: (offset += m2Frames),
      dur: m3Frames,
      component: (
        <MeaningScene meaning={MEANINGS[2]} stickmanPose="cash" stickmanEmotion="victorious" />
      ),
    },
    {
      id: "explosion_reveal",
      from: (offset += m3Frames),
      dur: explFrames,
      component: <ExplosionScene />,
    },
    {
      id: "mini_story",
      from: (offset += explFrames),
      dur: storyFrames,
      component: <MiniStoryScene />,
    },
    {
      id: "loop_back",
      from: (offset += storyFrames),
      dur: loopFrames,
      component: <LoopBackScene />,
    },
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
      {/* Scene sequences — hard cuts, no fade transitions */}
      {scenes.map((scene) => (
        <Sequence
          key={scene.id}
          from={scene.from}
          durationInFrames={scene.dur}
          name={scene.id}
        >
          {scene.component}
        </Sequence>
      ))}

      {/* Per-scene voice audio — starts VOICE_DELAY_FRAMES into each scene,
          bounded by scene duration so clips NEVER bleed into the next scene */}
      {scenes.map((scene) => {
        const voicePath = VOICE_FILES[scene.id];
        if (!voicePath) return null;
        return (
          <Sequence
            key={`voice-${scene.id}`}
            from={scene.from + VOICE_DELAY_FRAMES}
            durationInFrames={scene.dur - VOICE_DELAY_FRAMES}
            name={`voice-${scene.id}`}
          >
            <Audio src={staticFile(voicePath)} volume={0.92} />
          </Sequence>
        );
      })}

      {/* Per-scene SFX — multiple cues per scene, offset from scene start,
          bounded by 2 seconds max to prevent overlap */}
      {scenes.map((scene) => {
        const cues = SFX_CUES[scene.id];
        if (!cues || cues.length === 0) return null;
        return cues.map((entry) => {
          const sfxOffsetFrames = Math.round(entry.offsetSec * FPS);
          return (
            <Sequence
              key={`sfx-${scene.id}-${entry.cue}`}
              from={scene.from + sfxOffsetFrames}
              durationInFrames={Math.max(1, Math.min(120, scene.dur - sfxOffsetFrames))}
              name={`sfx-${scene.id}-${entry.cue}`}
            >
              <Audio src={staticFile(`audio/sfx/${entry.cue}.mp3`)} volume={0.28} />
            </Sequence>
          );
        });
      })}

      {/* Progress dots — always on top */}
      <ProgressDots />
    </AbsoluteFill>
  );
};
