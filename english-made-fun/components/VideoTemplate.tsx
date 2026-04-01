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
  spring,
  interpolate,
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
  fontFamily?: string;
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
  render_embedded_audio?: boolean;
  scenes: SceneData[];
  /**
   * Optional path to combined word-level captions JSON produced by voice_agent.
   * e.g. "scripts/vid_001_captions.json"
   */
  captions_file?: string;
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
const SUBTITLE_FONT_STACK = '"Arial Black", "Trebuchet MS", "Segoe UI", "Segoe UI Emoji", sans-serif';
const MOBILE_SAFE_SUBTITLE_BOTTOM = 210;
const MOBILE_SUBTITLE_SIDE_PADDING = 56;
const MOBILE_SUBTITLE_MAX_WIDTH = 900;

const DEFAULT_CAPTION_STYLE: Required<CaptionStyle> = {
  fontSize: 60,
  color: '#ffffff',
  backgroundColor: 'rgba(8,10,24,0.82)',
  fontFamily: SUBTITLE_FONT_STACK,
  position: 'bottom',
  fontWeight: 900,
};

type SubtitleTheme = {
  accent: string;
  accentSoft: string;
  glow: string;
  emoji: string;
  badge: string;
};

type SubtitleLayout = {
  mode: 'compact' | 'full';
  bottom: number;
  sidePadding: number;
  maxWidth: number;
  cardPadding: string;
  borderRadius: number;
  gap: number;
  iconSize: number;
  iconFontSize: number;
  fontSize: number;
  lineHeight: number;
  badgeVisible: boolean;
  badgeFontSize: number;
  badgeMarginBottom: number;
  combineWindowMs: number;
};

type SubtitlePart = {
  text: string;
  isActive?: boolean;
};

function getActiveSceneAtFrame(scenes: SceneData[], fps: number, frame: number): SceneData | null {
  let accFrames = 0;

  for (const scene of scenes) {
    const dur = Math.max(1, Math.round(scene.duration * fps));
    if (frame >= accFrames && frame < accFrames + dur) {
      return scene;
    }
    accFrames += dur;
  }

  return scenes[scenes.length - 1] ?? null;
}

function getSubtitleTheme(scene: SceneData | null, text: string): SubtitleTheme {
  const source = `${scene?.id ?? ''} ${scene?.visual.text ?? ''} ${text}`.toLowerCase();

  if (/damage|shatter|cup|arm|smash/.test(source)) {
    return {
      accent: '#ff5f7a',
      accentSoft: '#ffb347',
      glow: 'rgba(255, 95, 122, 0.45)',
      emoji: '💥',
      badge: 'Damage Meaning',
    };
  }

  if (/rest|coffee|lunch|pause|relax/.test(source)) {
    return {
      accent: '#ffd84d',
      accentSoft: '#7ef7c7',
      glow: 'rgba(255, 216, 77, 0.42)',
      emoji: '☕',
      badge: 'Rest Meaning',
    };
  }

  if (/violate|rule|rules|law|promise/.test(source)) {
    return {
      accent: '#ff8a3d',
      accentSoft: '#ffd166',
      glow: 'rgba(255, 138, 61, 0.40)',
      emoji: '🚫',
      badge: 'Rule Meaning',
    };
  }

  if (/opportunity|chance|director|noticed|big break/.test(source)) {
    return {
      accent: '#39ff88',
      accentSoft: '#fff176',
      glow: 'rgba(57, 255, 136, 0.38)',
      emoji: '🌟',
      badge: 'Chance Meaning',
    };
  }

  if (/worlds|vocabulary|level up|superpower|unlocked/.test(source)) {
    return {
      accent: '#8b5cf6',
      accentSoft: '#f472b6',
      glow: 'rgba(139, 92, 246, 0.40)',
      emoji: '🚀',
      badge: 'Level Up',
    };
  }

  if (/four meanings|one word|only knew one|hook/.test(source)) {
    return {
      accent: '#00d4ff',
      accentSoft: '#8cf7ff',
      glow: 'rgba(0, 212, 255, 0.40)',
      emoji: '🤯',
      badge: 'Word Alert',
    };
  }

  return {
    accent: '#60a5fa',
    accentSoft: '#facc15',
    glow: 'rgba(96, 165, 250, 0.38)',
    emoji: '📚',
    badge: 'English Boost',
  };
}

function getSubtitleLayout(scene: SceneData | null, text: string): SubtitleLayout {
  const template = scene?.visual.template ?? 'stickman';
  const sceneType = (scene as { type?: string } | null)?.type ?? '';
  const isCompactScene = template === 'text_burst' || sceneType === 'hook';
  const isDenseCopy = text.replace(/\s+/g, ' ').trim().length > 58;

  if (isCompactScene || isDenseCopy) {
    return {
      mode: 'compact',
      bottom: 132,
      sidePadding: 40,
      maxWidth: 760,
      cardPadding: '12px 18px 14px',
      borderRadius: 22,
      gap: 12,
      iconSize: 44,
      iconFontSize: 26,
      fontSize: 44,
      lineHeight: 1.02,
      badgeVisible: false,
      badgeFontSize: 16,
      badgeMarginBottom: 0,
      combineWindowMs: 1050,
    };
  }

  return {
    mode: 'full',
    bottom: MOBILE_SAFE_SUBTITLE_BOTTOM,
    sidePadding: MOBILE_SUBTITLE_SIDE_PADDING,
    maxWidth: MOBILE_SUBTITLE_MAX_WIDTH,
    cardPadding: '18px 22px 20px',
    borderRadius: 28,
    gap: 18,
    iconSize: 64,
    iconFontSize: 36,
    fontSize: stylelessFontSize(scene),
    lineHeight: 1.08,
    badgeVisible: true,
    badgeFontSize: 22,
    badgeMarginBottom: 8,
    combineWindowMs: SWITCH_CAPTIONS_EVERY_MS,
  };
}

function stylelessFontSize(scene: SceneData | null) {
  const template = scene?.visual.template ?? 'stickman';
  if (template === 'superpower') return 56;
  return 60;
}

function subtitleTokenColor(rawText: string, isActive: boolean, theme: SubtitleTheme, style: Required<CaptionStyle>) {
  const token = rawText.toLowerCase().replace(/[^a-z0-9']/g, '');

  if (!token) return style.color;
  if (isActive) return theme.accent;
  if (/break|broke/.test(token)) return '#ffe66d';
  if (/damage|rest|violate|opportunity|rules|worlds|chance|coffee|law/.test(token)) return theme.accentSoft;
  return style.color;
}

const SubtitleLine: React.FC<{
  parts: SubtitlePart[];
  style: Required<CaptionStyle>;
  theme: SubtitleTheme;
  layout: SubtitleLayout;
}> = ({ parts, style, theme, layout }) => (
  <p
    style={{
      margin: 0,
      fontSize: layout.fontSize,
      fontFamily: style.fontFamily,
      fontWeight: style.fontWeight,
      whiteSpace: 'pre-wrap',
      textAlign: 'left',
      lineHeight: layout.lineHeight,
      letterSpacing: 0.3,
      textShadow: '0 6px 18px rgba(0,0,0,0.45)',
      WebkitTextStroke: '1.2px rgba(3,6,18,0.72)',
    }}
  >
    {parts.map((part, index) => (
      <span
        key={`${index}-${part.text}`}
        style={{
          color: subtitleTokenColor(part.text, Boolean(part.isActive), theme, style),
        }}
      >
        {part.text}
      </span>
    ))}
  </p>
);

const SubtitleCard: React.FC<{
  style: Required<CaptionStyle>;
  theme: SubtitleTheme;
  layout: SubtitleLayout;
  children: React.ReactNode;
}> = ({ style, theme, layout, children }) => {
  const positionStyle = captionPositionStyle(style.position, layout);

  return (
    <div
      style={{
        position: 'absolute',
        ...positionStyle,
        left: 0,
        right: 0,
        padding: `0 ${layout.sidePadding}px`,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 60,
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: layout.maxWidth,
          borderRadius: layout.borderRadius,
          padding: layout.cardPadding,
          background: `linear-gradient(135deg, ${theme.accent}22 0%, ${style.backgroundColor} 46%, rgba(255,255,255,0.05) 100%)`,
          border: `2px solid ${theme.accentSoft}`,
          boxShadow: `0 18px 42px rgba(0,0,0,0.45), 0 0 28px ${theme.glow}`,
          backdropFilter: 'blur(12px)',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          gap: layout.gap,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 18,
            right: 18,
            top: 0,
            height: 6,
            borderRadius: 999,
            background: `linear-gradient(90deg, ${theme.accent}, ${theme.accentSoft})`,
          }}
        />

        <div
          style={{
            position: 'relative',
            zIndex: 2,
            minWidth: layout.iconSize,
            width: layout.iconSize,
            height: layout.iconSize,
            borderRadius: '50%',
            background: `radial-gradient(circle at 30% 30%, ${theme.accentSoft}, ${theme.accent})`,
            boxShadow: `0 0 22px ${theme.glow}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: layout.iconFontSize,
            flexShrink: 0,
          }}
        >
          <span style={{ fontFamily: '"Segoe UI Emoji", "Apple Color Emoji", sans-serif' }}>{theme.emoji}</span>
        </div>

        <div style={{ position: 'relative', zIndex: 2, flex: 1, minWidth: 0 }}>
          {layout.badgeVisible ? (
            <div
              style={{
                marginBottom: layout.badgeMarginBottom,
                color: theme.accentSoft,
                fontSize: layout.badgeFontSize,
                fontFamily: style.fontFamily,
                fontWeight: 900,
                letterSpacing: 2.2,
                textTransform: 'uppercase',
                textShadow: `0 0 14px ${theme.glow}`,
              }}
            >
              {theme.badge}
            </div>
          ) : null}
          {children}
        </div>
      </div>
    </div>
  );
};

// ── Async caption loader ───────────────────────────────────────────────────

const CaptionFileOverlay: React.FC<{
  captionFile: string;
  scenes: SceneData[];
  style: Required<CaptionStyle>;
}> = ({ captionFile, scenes, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [captions, setCaptions] = useState<Caption[] | null>(null);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => delayRender('caption-load'));

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

  const activeScene = getActiveSceneAtFrame(scenes, fps, frame);
  const defaultPages = createTikTokStyleCaptions({
    captions,
    combineTokensWithinMilliseconds: SWITCH_CAPTIONS_EVERY_MS,
  }).pages;

  const compactPages = createTikTokStyleCaptions({
    captions,
    combineTokensWithinMilliseconds: 1050,
  }).pages;

  const currentMs = (frame / fps) * 1000;
  const initialPage = defaultPages.find((page, index) => {
    const nextStart = defaultPages[index + 1]?.startMs ?? Infinity;
    return page.startMs <= currentMs && currentMs < nextStart;
  });

  const layout = getSubtitleLayout(
    activeScene,
    initialPage?.tokens.map((token) => token.text).join('') ?? activeScene?.visual.text ?? ''
  );
  const pages = layout.mode === 'compact' ? compactPages : defaultPages;

  const activePage = pages.find((page, index) => {
    const nextStart = pages[index + 1]?.startMs ?? Infinity;
    return page.startMs <= currentMs && currentMs < nextStart;
  });

  if (!activePage) return null;

  const pageText = activePage.tokens.map((token) => token.text).join('');
  const theme = getSubtitleTheme(activeScene, pageText);

  return (
    <SubtitleCard style={style} theme={theme} layout={layout}>
      <SubtitleLine
        parts={activePage.tokens.map((token) => ({
          text: token.text,
          isActive: token.fromMs <= currentMs && token.toMs > currentMs,
        }))}
        style={style}
        theme={theme}
        layout={layout}
      />
    </SubtitleCard>
  );
};

// ── Fallback: show active scene text as caption ────────────────────────────

const SceneTextOverlay: React.FC<{
  scenes: SceneData[];
  style: Required<CaptionStyle>;
}> = ({ scenes, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const activeScene = getActiveSceneAtFrame(scenes, fps, frame);
  const activeText = activeScene?.visual.text ?? '';

  if (!activeText) return null;

  const theme = getSubtitleTheme(activeScene, activeText);
  const layout = getSubtitleLayout(activeScene, activeText);

  return (
    <SubtitleCard style={style} theme={theme} layout={layout}>
      <SubtitleLine
        parts={activeText.split(/(\s+)/).filter(Boolean).map((part) => ({ text: part }))}
        style={style}
        theme={theme}
        layout={layout}
      />
    </SubtitleCard>
  );
};

// ── Helpers ────────────────────────────────────────────────────────────────

function captionPositionStyle(position: CaptionStyle['position'], layout: SubtitleLayout) {
  switch (position) {
    case 'top':
      return { top: 96 };
    case 'middle':
      return { top: '58%', transform: 'translateY(-50%)' };
    case 'bottom':
    default:
      return { bottom: layout.bottom };
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
  previousPose: string;
}

function buildFramedScenes(scenes: SceneData[], fps: number): FramedScene[] {
  let acc = 0;
  let lastPose = 'standing';
  return scenes.map((scene) => {
    const dur = Math.max(1, Math.round(scene.duration * fps));
    const entry: FramedScene = { scene, from: acc, durationInFrames: dur, previousPose: lastPose };
    if (scene.visual.stickman_action) lastPose = scene.visual.stickman_action;
    acc += dur;
    return entry;
  });
}

// ─── Quiz Countdown Overlay ──────────────────────────────────────────────────
// Renders a 3 → 2 → 1 countdown with spring-animated scale.
// Duration is always 1.5 seconds (90 frames @ 60fps).

const QuizCountdown: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const totalFrames = Math.round(1.5 * fps);       // 90 frames
  const perNumber = Math.floor(totalFrames / 3);    // 30 frames each
  const numbers = [3, 2, 1];
  const idx = Math.min(Math.floor(frame / perNumber), 2);
  const localFrame = frame - idx * perNumber;

  const s = spring({
    frame: localFrame,
    fps,
    config: { damping: 10, stiffness: 200, mass: 0.7 },
    durationInFrames: perNumber,
  });
  const scale = interpolate(s, [0, 1], [2.5, 1]);
  const opacity = interpolate(
    localFrame,
    [0, 4, perNumber - 4, perNumber],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Pulsing ring behind the number
  const ringScale = interpolate(s, [0, 1], [0.4, 1.2]);
  const ringOpacity = interpolate(s, [0, 1], [0.6, 0]);

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', zIndex: 50 }}>
      {/* Glow ring */}
      <div
        style={{
          position: 'absolute',
          width: 260,
          height: 260,
          borderRadius: '50%',
          border: '4px solid #FFD700',
          transform: `scale(${ringScale})`,
          opacity: ringOpacity,
        }}
      />
      {/* Number */}
      <div
        style={{
          fontSize: 200,
          fontWeight: 900,
          color: '#FFD700',
          fontFamily: 'sans-serif',
          transform: `scale(${scale})`,
          opacity,
          textShadow: '0 0 40px rgba(255,215,0,0.6), 0 4px 20px rgba(0,0,0,0.8)',
          lineHeight: 1,
        }}
      >
        {numbers[idx]}
      </div>
    </AbsoluteFill>
  );
};

// ─── Global Animated Background ──────────────────────────────────────────────
// Provides a continuous gradient pan across the entire composition so that
// the video never feels like a static PowerPoint slide.

const GlobalBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Slow-moving radial gradient center
  const cx = interpolate(frame, [0, durationInFrames], [35, 65], { extrapolateRight: 'clamp' });
  const cy = interpolate(frame, [0, durationInFrames], [40, 60], { extrapolateRight: 'clamp' });

  // Subtle hue / warmth shift over the full video duration
  // Start: cool dark blue → Mid: slightly warmer → End: hint of indigo
  const progress = frame / durationInFrames;
  const r = Math.round(interpolate(progress, [0, 0.22, 0.5, 1], [10, 12, 18, 14]));
  const g = Math.round(interpolate(progress, [0, 0.22, 0.5, 1], [16, 20, 30, 22]));
  const b = Math.round(interpolate(progress, [0, 0.22, 0.5, 1], [38, 42, 52, 46]));
  const bgMain = `rgb(${r},${g},${b})`;
  const bgDark = `rgb(${Math.max(0, r - 6)},${Math.max(0, g - 8)},${Math.max(0, b - 12)})`;

  // Gentle breathing vignette
  const vignetteOpacity = interpolate(
    Math.sin((frame / fps) * Math.PI * 0.25),
    [-1, 1],
    [0.3, 0.5]
  );

  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at ${cx}% ${cy}%, ${bgMain} 0%, ${bgDark} 100%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at 50% 50%, transparent 50%, rgba(0,0,0,${vignetteOpacity}) 100%)`,
        }}
      />
    </>
  );
};

// ─── Progress Bar ─────────────────────────────────────────────────────────────
// Thin bar at the very bottom showing how far through the video we are.

const ProgressBar: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const pct = (frame / durationInFrames) * 100;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 4,
        zIndex: 90,
        backgroundColor: 'rgba(255,255,255,0.15)',
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          backgroundColor: '#FFD700',
          borderRadius: '0 2px 2px 0',
        }}
      />
    </div>
  );
};

// ─── Pattern Interrupt ─────────────────────────────────────────────────────────
// Quick flash + scale pulse at a specific frame to re-grab wandering attention.
// Rendered inside a short Sequence (~12 frames / 0.2s).

const PatternInterrupt: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const totalFrames = Math.round(0.2 * fps); // 12 frames at 60fps
  const progress = frame / totalFrames;

  const flashOpacity = interpolate(progress, [0, 0.3, 1], [0.6, 0.15, 0], {
    extrapolateRight: 'clamp',
  });
  const scale = interpolate(progress, [0, 0.3, 1], [1.04, 1.01, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ zIndex: 80 }}>
      {/* Brief white flash */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: `rgba(255,255,255,${flashOpacity})`,
          transform: `scale(${scale})`,
        }}
      />
    </AbsoluteFill>
  );
};

// ─── Scene Transition Wrapper ─────────────────────────────────────────────────
// Adds a quick 3-frame fade-in at the start and fade-out at the end of each scene.

const SceneTransition: React.FC<{
  children: React.ReactNode;
  durationInFrames: number;
}> = ({ children, durationInFrames }) => {
  const frame = useCurrentFrame();
  const FADE_FRAMES = 3;

  const opacity = interpolate(
    frame,
    [0, FADE_FRAMES, durationInFrames - FADE_FRAMES, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return <div style={{ opacity, width: '100%', height: '100%' }}>{children}</div>;
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const VideoTemplate: React.FC<VideoTemplateProps> = ({ jsonData }) => {
  const { fps, durationInFrames } = useVideoConfig();

  const { voice_file, scenes, captions, render_embedded_audio, captions_file } = jsonData;
  const captionStyle = mergeCaptionStyle(captions?.style);
  const shouldRenderEmbeddedAudio = render_embedded_audio !== false;

  // Resolve caption file: prefer top-level captions_file (from voice_agent),
  // then fall back to captions.file (legacy)
  const resolvedCaptionFile = captions_file || captions?.file || null;

  // Pre-compute scene frame ranges and SFX cues (pure derivations — stable per render)
  const framedScenes = buildFramedScenes(scenes, fps);
  const sfxCues = buildSfxCues(scenes, fps);

  // Pattern interrupt at ~18s mark (re-grab attention before typical drop-off)
  const interruptFrame = Math.round(18 * fps);
  const interruptDuration = Math.round(0.2 * fps);

  // Voice src: use staticFile() for relative paths, pass through for URLs
  const voiceSrc = voice_file.startsWith('http')
    ? voice_file
    : staticFile(voice_file);

  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>

      {/* ── GLOBAL ANIMATED BACKGROUND ───────────────────────────────────── */}
      <GlobalBackground />

      {/* ── VOICE AUDIO ──────────────────────────────────────────────────── */}
      {shouldRenderEmbeddedAudio && <Audio src={voiceSrc} volume={1} />}

      {/* ── SFX AUDIO CUES ───────────────────────────────────────────────── */}
      {shouldRenderEmbeddedAudio && sfxCues.map((cue, i) => (
        <Sequence
          key={`sfx-${i}`}
          from={cue.startFrame}
          layout="none"
        >
          <Audio
            src={cue.file.startsWith('http') ? cue.file : staticFile(cue.file)}
            volume={cue.volume}
          />
        </Sequence>
      ))}

      {/* ── SCENE SEQUENCES (with micro-transitions) ─────────────────────── */}
      {framedScenes.map(({ scene, from, durationInFrames: dur, previousPose }) => (
        <Sequence
          key={scene.id}
          from={from}
          durationInFrames={dur}
        >
          <SceneTransition durationInFrames={dur}>
            <Scene scene={scene} previousPose={previousPose} />
          </SceneTransition>
        </Sequence>
      ))}

      {/* ── QUIZ COUNTDOWN OVERLAYS ──────────────────────────────────────── */}
      {framedScenes
        .filter(({ scene }) => scene.visual.quizCountdown != null)
        .map(({ scene, from }) => {
          const countdownStart = from + Math.round((scene.visual.quizCountdown ?? 0) * fps);
          const countdownDuration = Math.round(1.5 * fps);
          return (
            <Sequence
              key={`countdown-${scene.id}`}
              from={countdownStart}
              durationInFrames={countdownDuration}
            >
              <QuizCountdown />
            </Sequence>
          );
        })}

      {/* ── PATTERN INTERRUPT (~18s) ─────────────────────────────────────── */}
      {interruptFrame + interruptDuration < durationInFrames && (
        <Sequence from={interruptFrame} durationInFrames={interruptDuration}>
          <PatternInterrupt />
        </Sequence>
      )}

      {/* ── CAPTION OVERLAY ──────────────────────────────────────────────── */}
      {resolvedCaptionFile ? (
        <CaptionFileOverlay
          captionFile={resolvedCaptionFile}
          scenes={scenes}
          style={captionStyle}
        />
      ) : (
        <SceneTextOverlay scenes={scenes} style={captionStyle} />
      )}

      {/* ── PROGRESS BAR ─────────────────────────────────────────────────── */}
      <ProgressBar />

    </AbsoluteFill>
  );
};

export default VideoTemplate;
