/**
 * VideoTemplate.tsx
 * Top-level composition renderer.
 *
 * Responsibilities:
 *   1. Maps jsonData.scenes → Remotion <Sequence> blocks (with premountFor)
 *   2. Plays voice audio track via <Audio> from @remotion/media
 *   3. Plays per-scene SFX cues each wrapped in a <Sequence> for exact timing
 *   4. Renders a caption overlay at the bottom, styled from jsonData.captions.style
 *
 * Dependencies (install if missing):
 *   npx remotion add @remotion/media
 *   npx remotion add @remotion/captions
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  useCurrentFrame,
  useVideoConfig,
  AbsoluteFill,
  Sequence,
  staticFile,
  useDelayRender,
  continueRender,
  cancelRender,
} from 'remotion';
import { Audio } from '@remotion/media';
import type { Caption } from '@remotion/captions';
import { createTikTokStyleCaptions } from '@remotion/captions';

import { Scene } from './Scene';
import type { SceneData } from './Scene';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CaptionStyle {
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
  /** 'bottom' | 'middle' | 'top' */
  position?: 'bottom' | 'middle' | 'top';
  fontWeight?: number | string;
}

export interface VideoData {
  title: string;
  /**
   * Path to the voice audio file relative to public/
   * e.g. "audio/voices/ep001_narrator.mp3"
   */
  voice_file: string;
  scenes: SceneData[];
  captions?: {
    /**
     * Optional: path to a captions JSON file (array of Caption objects)
     * relative to public/. If omitted, scene text is shown instead.
     * e.g. "scripts/ep001_captions.json"
     */
    file?: string;
    style?: CaptionStyle;
  };
}

export interface VideoTemplateProps {
  jsonData: VideoData;
}

// ─── Caption Overlay ──────────────────────────────────────────────────────────
// If a captions file is provided, fetches it (holding render until loaded) and
// uses createTikTokStyleCaptions for word-level timing with active word highlight.
// If no file, falls back to showing the currently active scene's text.

const SWITCH_CAPTIONS_EVERY_MS = 1800;
const DEFAULT_CAPTION_STYLE: Required<CaptionStyle> = {
  fontSize: 52,
  color: '#ffffff',
  backgroundColor: 'rgba(0,0,0,0.65)',
  position: 'bottom',
  fontWeight: 800,
};

// ── Async caption loader ───────────────────────────────────────────────────

const CaptionFileOverlay: React.FC<{
  captionFile: string;
  style: Required<CaptionStyle>;
}> = ({ captionFile, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [captions, setCaptions] = useState<Caption[] | null>(null);
  const [handle] = useState(() => useDelayRender('caption-load'));

  const fetchCaptions = useCallback(async () => {
    try {
      const src = captionFile.startsWith('http')
        ? captionFile
        : staticFile(captionFile);
      const res = await fetch(src);
      const data: Caption[] = await res.json();
      setCaptions(data);
      continueRender(handle);
    } catch (e) {
      cancelRender(e as Error);
    }
  }, [captionFile, handle]);

  useEffect(() => {
    fetchCaptions();
  }, [fetchCaptions]);

  if (!captions) return null;

  // Group captions into TikTok-style pages for word highlighting
  const { pages } = createTikTokStyleCaptions({
    captions,
    combineTokensWithinMilliseconds: SWITCH_CAPTIONS_EVERY_MS,
  });

  const currentMs = (frame / fps) * 1000;

  // Find the page that covers the current timestamp
  const activePage = pages.find(
    (page, i) => {
      const nextStart = pages[i + 1]?.startMs ?? Infinity;
      return page.startMs <= currentMs && currentMs < nextStart;
    }
  );

  if (!activePage) return null;

  const positionStyle = captionPositionStyle(style.position);

  return (
    <div style={{ position: 'absolute', ...positionStyle, left: 0, right: 0, padding: '16px 48px' }}>
      <div
        style={{
          backgroundColor: style.backgroundColor,
          borderRadius: 12,
          padding: '14px 28px',
          display: 'inline-block',
          maxWidth: '90%',
          margin: '0 auto',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: style.fontSize,
            fontFamily: 'sans-serif',
            fontWeight: style.fontWeight,
            whiteSpace: 'pre-wrap',
            textAlign: 'center',
            lineHeight: 1.35,
          }}
        >
          {activePage.tokens.map((token) => {
            const isActive =
              token.fromMs <= currentMs && token.toMs > currentMs;
            return (
              <span
                key={token.fromMs}
                style={{
                  color: isActive ? '#FFD700' : style.color,
                }}
              >
                {token.text}
              </span>
            );
          })}
        </p>
      </div>
    </div>
  );
};

// ── Fallback: show active scene text as caption ────────────────────────────

const SceneTextOverlay: React.FC<{
  scenes: SceneData[];
  style: Required<CaptionStyle>;
}> = ({ scenes, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Find which scene is currently playing
  let accFrames = 0;
  let activeText = '';
  for (const scene of scenes) {
    const dur = Math.round(scene.duration * fps);
    if (frame >= accFrames && frame < accFrames + dur) {
      activeText = scene.visual.text ?? '';
      break;
    }
    accFrames += dur;
  }

  if (!activeText) return null;

  const positionStyle = captionPositionStyle(style.position);

  return (
    <div
      style={{
        position: 'absolute',
        ...positionStyle,
        left: 0,
        right: 0,
        padding: '0 48px 48px',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          backgroundColor: style.backgroundColor,
          borderRadius: 14,
          padding: '16px 32px',
          maxWidth: '88%',
        }}
      >
        <p
          style={{
            margin: 0,
            color: style.color,
            fontSize: style.fontSize,
            fontFamily: 'sans-serif',
            fontWeight: style.fontWeight,
            textAlign: 'center',
            lineHeight: 1.3,
          }}
        >
          {activeText}
        </p>
      </div>
    </div>
  );
};

// ── Helpers ────────────────────────────────────────────────────────────────

function captionPositionStyle(position: CaptionStyle['position']) {
  switch (position) {
    case 'top':    return { top: 60 };
    case 'middle': return { top: '40%' };
    case 'bottom':
    default:       return { bottom: 60 };
  }
}

function mergeCaptionStyle(partial?: CaptionStyle): Required<CaptionStyle> {
  return { ...DEFAULT_CAPTION_STYLE, ...partial };
}

// ─── SFX Layer ────────────────────────────────────────────────────────────────
// Collects all SFX cues from all scenes, converts to absolute start frames,
// then renders each one inside a <Sequence> for precise timing.

interface AbsoluteSfxCue {
  file: string;
  startFrame: number;
  volume: number;
}

function buildSfxCues(scenes: SceneData[], fps: number): AbsoluteSfxCue[] {
  const cues: AbsoluteSfxCue[] = [];
  let accFrames = 0;
  for (const scene of scenes) {
    const sceneDur = Math.round(scene.duration * fps);
    if (scene.sfx) {
      for (const sfx of scene.sfx) {
        cues.push({
          file: sfx.file,
          startFrame: accFrames + Math.round(sfx.startTime * fps),
          volume: sfx.volume ?? 1,
        });
      }
    }
    accFrames += sceneDur;
  }
  return cues;
}

// ─── Scene Sequence Blocks ────────────────────────────────────────────────────
// Converts scenes array into {scene, from, durationInFrames} tuples.

interface FramedScene {
  scene: SceneData;
  from: number;
  durationInFrames: number;
}

function buildFramedScenes(scenes: SceneData[], fps: number): FramedScene[] {
  let acc = 0;
  return scenes.map((scene) => {
    const dur = Math.max(1, Math.round(scene.duration * fps));
    const entry: FramedScene = { scene, from: acc, durationInFrames: dur };
    acc += dur;
    return entry;
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────

export const VideoTemplate: React.FC<VideoTemplateProps> = ({ jsonData }) => {
  const { fps } = useVideoConfig();

  const { voice_file, scenes, captions } = jsonData;
  const captionStyle = mergeCaptionStyle(captions?.style);

  // Pre-compute scene frame ranges and SFX cues (pure derivations — stable per render)
  const framedScenes = buildFramedScenes(scenes, fps);
  const sfxCues = buildSfxCues(scenes, fps);

  // Voice src: use staticFile() for relative paths, pass through for URLs
  const voiceSrc = voice_file.startsWith('http')
    ? voice_file
    : staticFile(voice_file);

  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>

      {/* ── VOICE AUDIO ──────────────────────────────────────────────────── */}
      {/* Starts at frame 0, plays the full voice track for the composition */}
      <Audio src={voiceSrc} volume={1} />

      {/* ── SFX AUDIO CUES ───────────────────────────────────────────────── */}
      {/* Each SFX is wrapped in a Sequence so it starts at the right frame  */}
      {sfxCues.map((cue, i) => (
        <Sequence
          key={`sfx-${i}`}
          from={cue.startFrame}
          layout="none"
          premountFor={fps}
        >
          <Audio
            src={cue.file.startsWith('http') ? cue.file : staticFile(cue.file)}
            volume={cue.volume}
          />
        </Sequence>
      ))}

      {/* ── SCENE SEQUENCES ──────────────────────────────────────────────── */}
      {/* Each scene gets its own Sequence — useCurrentFrame() resets to 0   */}
      {/* inside each Sequence, so entrance springs restart per scene.        */}
      {framedScenes.map(({ scene, from, durationInFrames }) => (
        <Sequence
          key={scene.id}
          from={from}
          durationInFrames={durationInFrames}
          premountFor={fps} // preload 1 second ahead for smooth transitions
        >
          <Scene scene={scene} />
        </Sequence>
      ))}

      {/* ── CAPTION OVERLAY ──────────────────────────────────────────────── */}
      {/* Only shown when a timed captions JSON file is provided.            */}
      {/* Scene components (StickmanScene, TextBurstScene, etc.) render      */}
      {/* their own text at the TOP — SceneTextOverlay is NOT used as        */}
      {/* fallback to avoid double-text on every scene.                      */}
      {captions?.file && (
        <CaptionFileOverlay
          captionFile={captions.file}
          style={captionStyle}
        />
      )}

    </AbsoluteFill>
  );
};

export default VideoTemplate;
