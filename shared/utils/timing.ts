/**
 * timing.ts — Frame/time conversion and scene offset utilities
 */

/** Convert seconds to frame count */
export function secToFrames(sec: number, fps: number): number {
  return Math.round(sec * fps);
}

/** Convert frames to seconds */
export function framesToSec(frames: number, fps: number): number {
  return frames / fps;
}

/** Compute scene duration from voice clip + buffer */
export function computeSceneDuration(
  voiceClipDurationSec: number,
  fps: number,
  bufferFrames: number = 12
): number {
  return Math.ceil(voiceClipDurationSec * fps) + bufferFrames;
}

/** Compute cumulative offsets for a sequence of scenes */
export function computeSceneOffsets(
  sceneDurations: number[]
): { from: number; duration: number }[] {
  let offset = 0;
  return sceneDurations.map((dur) => {
    const result = { from: offset, duration: dur };
    offset += dur;
    return result;
  });
}
