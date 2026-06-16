/**
 * Reusable easing curves and animation helpers for Remotion templates.
 *
 * Exported so render-service and downstream templates can compose motion
 * without redefining magic numbers. All functions are pure — they only
 * depend on the current `frame` and produce a numeric value.
 */
import { Easing, type EasingFunction } from 'remotion';

// ===== Easing presets =====

export const EASINGS = {
  /** Smooth ease in + out, default for most transitions. */
  smooth: Easing.bezier(0.4, 0, 0.2, 1),
  /** Quick acceleration, slow deceleration (Apple-style). */
  decelerate: Easing.bezier(0, 0, 0.2, 1),
  /** Slow acceleration, quick exit (slide out). */
  accelerate: Easing.bezier(0.4, 0, 1, 1),
  /** Playful overshoot used for pop-in effects. */
  overshoot: Easing.bezier(0.34, 1.56, 0.64, 1),
  /** Gentle spring-like settle. */
  spring: Easing.bezier(0.5, 1.5, 0.5, 1),
} as const;

export type EasingName = keyof typeof EASINGS;

// ===== Single-shot animations =====

/**
 * Fade in from 0 to 1 over `duration` frames starting at `start`.
 */
export function fadeIn(
  frame: number,
  start = 0,
  duration = 8,
): number {
  if (frame < start) return 0;
  if (frame >= start + duration) return 1;
  const t = (frame - start) / duration;
  return t * t * (3 - 2 * t);
}

/**
 * Fade out from 1 to 0 over `duration` frames ending at `end` (frame).
 */
export function fadeOut(
  frame: number,
  end: number,
  duration = 8,
): number {
  const start = end - duration;
  if (frame < start) return 1;
  if (frame >= end) return 0;
  const t = (frame - start) / duration;
  return 1 - t * t * (3 - 2 * t);
}

/**
 * Slide-in from offset to 0 using the given easing.
 * Returns a translate (px) value to apply to transform.
 */
export function slideIn(
  frame: number,
  from: number,
  start = 0,
  duration = 12,
  easing: EasingFunction = EASINGS.smooth,
): number {
  if (frame < start) return from;
  if (frame >= start + duration) return 0;
  const t = easing((frame - start) / duration);
  return from * (1 - t);
}

/**
 * Scale-in from `from` (e.g. 0.8) to 1 with easing.
 */
export function scaleIn(
  frame: number,
  from: number,
  start = 0,
  duration = 10,
  easing: EasingFunction = EASINGS.overshoot,
): number {
  if (frame < start) return from;
  if (frame >= start + duration) return 1;
  const t = easing((frame - start) / duration);
  return from + (1 - from) * t;
}

/**
 * Slow zoom ("Ken Burns") from 1.0 to `to` over `duration` frames.
 */
export function kenBurns(
  frame: number,
  to = 1.08,
  duration = 150,
): number {
  if (duration <= 0) return 1;
  const t = Math.min(frame / duration, 1);
  return 1 + (to - 1) * t;
}
