/**
 * colors.ts — Color manipulation utilities for neon/glow effects
 */

/** Triple-layer neon text shadow */
export function neonShadow(color: string, intensity: number): string {
  return [
    `0 0 ${intensity}px ${color}`,
    `0 0 ${intensity * 2}px ${color}`,
    `0 0 ${intensity * 4}px ${color}`,
  ].join(", ");
}

/** 5-layer enhanced glow for maximum neon impact */
export function buildGlow(color: string, intensity: number): string {
  return [
    `0 0 ${intensity * 0.5}px ${color}`,
    `0 0 ${intensity}px ${color}`,
    `0 0 ${intensity * 2}px ${color}`,
    `0 0 ${intensity * 3.5}px ${color}80`,
    `0 0 ${intensity * 6}px ${color}40`,
  ].join(", ");
}

/** Darken a hex color by subtracting from each channel */
export function darkenHex(hex: string, amount: number): string {
  const c = hex.replace("#", "");
  if (c.length !== 6) return hex;
  const r = Math.max(0, parseInt(c.substring(0, 2), 16) - amount);
  const g = Math.max(0, parseInt(c.substring(2, 4), 16) - amount);
  const b = Math.max(0, parseInt(c.substring(4, 6), 16) - amount);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/** Convert opacity (0–1) to 2-digit hex alpha suffix */
export function alphaHex(opacity: number): string {
  return Math.round(Math.max(0, Math.min(1, opacity)) * 255)
    .toString(16)
    .padStart(2, "0");
}
