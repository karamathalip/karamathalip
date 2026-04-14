/**
 * WordExplosionTemplate.tsx — Config-driven video orchestrator
 *
 * Reads a WordVideoConfig and renders the complete video:
 *   - Maps scenes[] to Remotion <Sequence> blocks
 *   - Wires per-scene voice audio with delay
 *   - Wires per-scene SFX cues
 *   - Renders progress dots overlay
 *
 * Viral optimization baked in:
 *   - Word-by-word text via useTypewriter (never instant)
 *   - Progress dots create completion desire
 *   - Emotion mirroring via stickman transitions
 *   - Open-loop ending via LoopBackScene challenge
 *   - Color psychology enforced by config schema
 */

import React from "react";
import {
  useCurrentFrame,
  Sequence,
  AbsoluteFill,
  Audio,
  staticFile,
} from "remotion";
import { HookScene } from "../scenes/HookScene";
import { MeaningScene } from "../scenes/MeaningScene";
import { ExplosionRevealScene } from "../scenes/ExplosionRevealScene";
import { MiniStoryScene } from "../scenes/MiniStoryScene";
import { LoopBackScene } from "../scenes/LoopBackScene";
import { ProgressDots } from "../components/ProgressDots";
import type {
  WordVideoConfig,
  SceneConfig,
  HookSceneData,
  MeaningSceneData,
  ExplosionSceneData,
  MiniStorySceneData,
  LoopBackSceneData,
} from "../types/video-config";

export interface WordExplosionTemplateProps {
  config: WordVideoConfig;
}

// ─── Scene Router ────────────────────────────────────────────────────────────

function renderScene(scene: SceneConfig, config: WordVideoConfig): React.ReactNode {
  const bgColor = config.colors.bg;

  switch (scene.data.type) {
    case "hook":
      return (
        <HookScene
          data={scene.data as HookSceneData}
          defaultTextColor={config.colors.text}
          bgColor={bgColor}
        />
      );
    case "meaning":
      return (
        <MeaningScene
          data={scene.data as MeaningSceneData}
          primaryColor={config.colors.primary}
          textDimColor={config.colors.textDim}
          bgColor={bgColor}
        />
      );
    case "explosion_reveal":
      return (
        <ExplosionRevealScene
          data={scene.data as ExplosionSceneData}
          bgColor={bgColor}
        />
      );
    case "mini_story":
      return (
        <MiniStoryScene
          data={scene.data as MiniStorySceneData}
          defaultTextColor={config.colors.text}
          bgColor={bgColor}
        />
      );
    case "loop_back":
      return (
        <LoopBackScene
          data={scene.data as LoopBackSceneData}
          defaultTextColor={config.colors.text}
          bgColor={bgColor}
        />
      );
    default:
      return null;
  }
}

// ─── Main Template ───────────────────────────────────────────────────────────

export const WordExplosionTemplate: React.FC<WordExplosionTemplateProps> = ({
  config,
}) => {
  const { scenes, colors, voiceDelayFrames, fps } = config;

  // Compute scene offsets
  const sceneOffsets: { from: number; duration: number }[] = [];
  let offset = 0;
  for (const scene of scenes) {
    sceneOffsets.push({ from: offset, duration: scene.durationFrames });
    offset += scene.durationFrames;
  }

  // Progress dots data
  const progressScenes = scenes.map((scene, i) => {
    // Determine color for each scene
    let dotColor = colors.primary;
    if (scene.data.type === "meaning") {
      const meaningData = scene.data as MeaningSceneData;
      dotColor = meaningData.meaning.color;
    } else if (scene.data.type === "mini_story") {
      const storyData = scene.data as MiniStorySceneData;
      dotColor = storyData.bgAccent;
    }
    return { durationFrames: scene.durationFrames, color: dotColor };
  });

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg }}>
      {/* Scene sequences — hard cuts */}
      {scenes.map((scene, i) => (
        <Sequence
          key={scene.id}
          from={sceneOffsets[i].from}
          durationInFrames={sceneOffsets[i].duration}
          name={scene.id}
        >
          {renderScene(scene, config)}
        </Sequence>
      ))}

      {/* Per-scene voice audio */}
      {scenes.map((scene, i) => {
        if (!scene.voiceLine?.audioFile) return null;
        return (
          <Sequence
            key={`voice-${scene.id}`}
            from={sceneOffsets[i].from + voiceDelayFrames}
            durationInFrames={sceneOffsets[i].duration - voiceDelayFrames}
            name={`voice-${scene.id}`}
          >
            <Audio src={staticFile(scene.voiceLine.audioFile)} volume={0.92} />
          </Sequence>
        );
      })}

      {/* Per-scene SFX cues */}
      {scenes.map((scene, i) => {
        if (!scene.sfxCues?.length) return null;
        return scene.sfxCues.map((entry) => {
          const sfxOffsetFrames = Math.round(entry.offsetSec * fps);
          return (
            <Sequence
              key={`sfx-${scene.id}-${entry.cue}-${entry.offsetSec}`}
              from={sceneOffsets[i].from + sfxOffsetFrames}
              durationInFrames={Math.max(1, Math.min(120, sceneOffsets[i].duration - sfxOffsetFrames))}
              name={`sfx-${scene.id}-${entry.cue}`}
            >
              <Audio src={staticFile(`audio/sfx/${entry.cue}.mp3`)} volume={0.28} />
            </Sequence>
          );
        });
      })}

      {/* Progress dots — always on top */}
      <ProgressDots scenes={progressScenes} />
    </AbsoluteFill>
  );
};
