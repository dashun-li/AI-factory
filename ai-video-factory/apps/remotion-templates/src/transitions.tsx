/**
 * Scene-transition wrappers for Remotion.
 *
 * Each transition wraps two scenes and blends them across `duration` frames
 * at the boundary. They are pure presentational components — all motion
 * derives from `useCurrentFrame()` inside a `Sequence`.
 */
import React from 'react';
import { AbsoluteFill, interpolate, Easing } from 'remotion';
import { EASINGS } from './animations';

interface TransitionProps {
  /** Current scene content. */
  children: React.ReactNode;
  /** Local frame within the Sequence (from useCurrentFrame). */
  frame: number;
  /** Total frames of the scene Sequence. */
  totalFrames: number;
  /** Transition duration in frames (in + out). */
  duration?: number;
}

/** Cross-fade between scenes: fade in at start, fade out at end. */
export const CrossFade: React.FC<TransitionProps> = ({
  children,
  frame,
  totalFrames,
  duration = 8,
}) => {
  const fadeInV = interpolate(frame, [0, duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const fadeOutV = interpolate(
    frame,
    [totalFrames - duration, totalFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  return (
    <AbsoluteFill style={{ opacity: Math.min(fadeInV, fadeOutV) }}>
      {children}
    </AbsoluteFill>
  );
};

/** Slide in from the right, slide out to the left. */
export const SlideTransition: React.FC<TransitionProps> = ({
  children,
  frame,
  totalFrames,
  duration = 12,
}) => {
  const slideInV = interpolate(frame, [0, duration], [80, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(EASINGS.smooth),
  });
  const slideOutV = interpolate(
    frame,
    [totalFrames - duration, totalFrames],
    [0, -80],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.in(EASINGS.smooth),
    },
  );
  const x = frame < totalFrames - duration ? slideInV : slideOutV;
  return (
    <AbsoluteFill style={{ transform: `translateX(${x}px)` }}>
      {children}
    </AbsoluteFill>
  );
};

/** Zoom in on enter, zoom out on exit. */
export const ZoomTransition: React.FC<TransitionProps> = ({
  children,
  frame,
  totalFrames,
  duration = 10,
}) => {
  const scaleInV = interpolate(frame, [0, duration], [0.85, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASINGS.overshoot,
  });
  const scaleOutV = interpolate(
    frame,
    [totalFrames - duration, totalFrames],
    [1, 1.15],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const scale = frame < totalFrames - duration ? scaleInV : scaleOutV;
  return (
    <AbsoluteFill style={{ transform: `scale(${scale})` }}>
      {children}
    </AbsoluteFill>
  );
};

/** Fade + slight upward drift on exit, common for narration cuts. */
export const DriftTransition: React.FC<TransitionProps> = ({
  children,
  frame,
  totalFrames,
  duration = 10,
}) => {
  const opacity = Math.min(
    interpolate(frame, [0, duration], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
    interpolate(frame, [totalFrames - duration, totalFrames], [1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );
  const y = interpolate(
    frame,
    [totalFrames - duration, totalFrames],
    [0, -30],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.in(EASINGS.smooth),
    },
  );
  return (
    <AbsoluteFill style={{ opacity, transform: `translateY(${y}px)` }}>
      {children}
    </AbsoluteFill>
  );
};

export type TransitionName =
  | 'cross-fade'
  | 'slide'
  | 'zoom'
  | 'drift';

const TRANSITIONS: Record<
  TransitionName,
  React.FC<TransitionProps>
> = {
  'cross-fade': CrossFade,
  slide: SlideTransition,
  zoom: ZoomTransition,
  drift: DriftTransition,
};

/**
 * Pick a transition by name. Falls back to CrossFade for unknown names
 * so a bad prop never crashes rendering.
 */
export function pickTransition(
  name: TransitionName | string | undefined,
): React.FC<TransitionProps> {
  if (name && name in TRANSITIONS) {
    return TRANSITIONS[name as TransitionName];
  }
  return CrossFade;
}
