/**
 * ProgressDots.tsx — Scene progress indicator dots
 *
 * Shows which scene is active with colored expanding dot.
 * Fully generic — receives scene metadata, no hardcoded data.
 */

import React from "react";
import { useCurrentFrame } from "remotion";

export interface ProgressDotsProps {
  /** Ordered array of { durationFrames, color } for each scene */
  scenes: { durationFrames: number; color: string }[];
}

export const ProgressDots: React.FC<ProgressDotsProps> = ({ scenes }) => {
  const frame = useCurrentFrame();

  // Determine which scene is active
  let accumulated = 0;
  let activeIndex = 0;
  for (let i = 0; i < scenes.length; i++) {
    if (frame < accumulated + scenes[i].durationFrames) {
      activeIndex = i;
      break;
    }
    accumulated += scenes[i].durationFrames;
    if (i === scenes.length - 1) activeIndex = i;
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
      {scenes.map((scene, i) => {
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
                ? scene.color
                : isPast
                ? `${scene.color}80`
                : "rgba(255,255,255,0.15)",
              boxShadow: isActive ? `0 0 8px ${scene.color}` : "none",
              transition: "width 0.2s ease",
            }}
          />
        );
      })}
    </div>
  );
};
