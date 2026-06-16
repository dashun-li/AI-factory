import type { Script, Subtitle } from '@ai-video-factory/shared-types';

/**
 * Input props passed by render-service via `--props`.
 * `audioPath` is an absolute path on the renderer host.
 * `subtitle` is the parsed subtitle object (preferred over `subtitlePath`).
 * `mediaAssets` is a list of absolute paths or URLs to per-scene images.
 */
export type VideoCompositionProps = Record<string, unknown> & {
  script: Script;
  audioPath?: string;
  subtitlePath?: string;
  subtitle?: Subtitle;
  mediaAssets?: string[];
};

export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
export const VIDEO_FPS = 30;

/** Seconds → frame index at VIDEO_FPS. */
export function secondsToFrames(seconds: number): number {
  return Math.round(seconds * VIDEO_FPS);
}

/** Total duration in frames derived from the script duration (seconds). */
export function totalDurationFrames(script: Script): number {
  return Math.max(secondsToFrames(script.duration), VIDEO_FPS);
}

/** Cumulative start frame for each scene. */
export function sceneStartFrames(script: Script): number[] {
  let acc = 0;
  const starts: number[] = [];
  for (const scene of script.scenes) {
    starts.push(acc);
    acc += secondsToFrames(scene.duration);
  }
  return starts;
}

/**
 * Pick an asset URL/path for a scene by index, or fall back to undefined.
 */
export function pickAssetForScene(
  mediaAssets: string[] | undefined,
  sceneIndex: number,
): string | undefined {
  if (!mediaAssets || mediaAssets.length === 0) return undefined;
  return mediaAssets[sceneIndex % mediaAssets.length];
}
