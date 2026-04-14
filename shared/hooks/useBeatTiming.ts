/**
 * useBeatTiming.ts — Convert seconds-based beat sheet to frame numbers
 *
 * Scenes define beats in seconds (e.g. "typewriter_end: 4.5s").
 * This hook converts them to frame numbers and provides lookup.
 */

import { useVideoConfig } from "remotion";
import type { BeatMark } from "../types/video-config";

export interface BeatTimingResult {
  /** Get frame number for a named beat */
  getFrame: (beatId: string) => number;
  /** Get seconds for a named beat */
  getSec: (beatId: string) => number;
  /** All beats as { id, frame } array */
  beats: { id: string; frame: number }[];
}

export function useBeatTiming(
  beatMarks: BeatMark[] | undefined,
  /** Fallback values in seconds if beat not found in config */
  defaults: Record<string, number> = {}
): BeatTimingResult {
  const { fps } = useVideoConfig();

  // Merge config beats with defaults
  const beatMap = new Map<string, number>();

  // Set defaults first
  for (const [id, sec] of Object.entries(defaults)) {
    beatMap.set(id, Math.round(sec * fps));
  }

  // Override with config beats
  if (beatMarks) {
    for (const beat of beatMarks) {
      beatMap.set(beat.id, Math.round(beat.timeSec * fps));
    }
  }

  const getFrame = (beatId: string): number => {
    return beatMap.get(beatId) ?? 0;
  };

  const getSec = (beatId: string): number => {
    return (beatMap.get(beatId) ?? 0) / fps;
  };

  const beats = Array.from(beatMap.entries()).map(([id, frame]) => ({
    id,
    frame,
  }));

  return { getFrame, getSec, beats };
}
