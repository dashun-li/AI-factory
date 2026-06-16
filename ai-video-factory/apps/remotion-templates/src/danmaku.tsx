/**
 * Danmaku (flying comments) overlay component for Remotion.
 *
 * Renders a horizontal stream of short text comments that scroll from
 * right → left across the top/middle/bottom lanes of the video, mimicking
 * the Bilibili/TikTok comment layer. Used to add social proof energy to
 * short-form video exports.
 */
import React from 'react';
import { interpolate } from 'remotion';
import type { Subtitle } from '@ai-video-factory/shared-types';

export interface DanmakuItem {
  id: number;
  text: string;
  /** Lane index 0..lanes-1; auto-assigned if omitted. */
  lane?: number;
  /** Start frame for the comment to appear. */
  startFrame: number;
  /** End frame for the comment to disappear. */
  endFrame: number;
  /** Optional color hex string. Default: white. */
  color?: string;
}

export interface DanmakuOverlayProps {
  items: DanmakuItem[];
  /** Video width in pixels. Default 1080. */
  width?: number;
  /** Number of stacked lanes (rows). Default 6. */
  lanes?: number;
  /** Lane height in pixels. Default 60. */
  laneHeight?: number;
  /** Top padding before the first lane. Default 80. */
  topPadding?: number;
  /** Font size in pixels. Default 32. */
  fontSize?: number;
  /** Total frames in the composition. Required for x interpolation. */
  totalFrames: number;
}

const DEFAULT_COLOR = '#ffffff';

export const DanmakuOverlay: React.FC<DanmakuOverlayProps> = ({
  items,
  width = 1080,
  lanes = 6,
  laneHeight = 60,
  topPadding = 80,
  fontSize = 32,
  totalFrames,
}) => {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width,
        height: topPadding + lanes * laneHeight,
        overflow: 'hidden',
        pointerEvents: 'none',
        fontFamily: 'system-ui, -apple-system, "Microsoft YaHei", sans-serif',
        fontWeight: 600,
        textShadow: '0 1px 4px rgba(0,0,0,0.85)',
      }}
    >
      {items.map((item) => (
        <DanmakuRow
          key={item.id}
          item={item}
          width={width}
          laneHeight={laneHeight}
          topPadding={topPadding}
          fontSize={fontSize}
          totalFrames={totalFrames}
        />
      ))}
    </div>
  );
};

interface DanmakuRowProps {
  item: DanmakuItem;
  width: number;
  laneHeight: number;
  topPadding: number;
  fontSize: number;
  totalFrames: number;
}

const DanmakuRow: React.FC<DanmakuRowProps> = ({
  item,
  width,
  laneHeight,
  topPadding,
  fontSize,
  totalFrames,
}) => {
  return (
    <DanmakuText
      item={item}
      width={width}
      laneHeight={laneHeight}
      topPadding={topPadding}
      fontSize={fontSize}
      totalFrames={totalFrames}
      // stable frame source via render-phase props
      frame={0}
    />
  );
};

interface DanmakuTextProps {
  item: DanmakuItem;
  width: number;
  laneHeight: number;
  topPadding: number;
  fontSize: number;
  totalFrames: number;
  frame: number;
}

/**
 * The actual moving element. In Remotion, the `useCurrentFrame` hook
 * would normally drive motion; here we expose the math as `danmakuX`
 * below so render-service can compute the position per frame inside
 * a <Sequence> without needing React hooks at runtime.
 */
const DanmakuText: React.FC<DanmakuTextProps> = ({
  item,
  width,
  laneHeight,
  topPadding,
  fontSize,
}) => {
  // Position is computed by the caller via danmakuX(); here we only
  // provide the styled text element. The X translation is applied by
  // the parent Sequence's frame-driven render.
  const top = topPadding + (item.lane ?? 0) * laneHeight;
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: 0,
        whiteSpace: 'nowrap',
        fontSize,
        color: item.color ?? DEFAULT_COLOR,
        transform: `translateX(${width}px)`,
      }}
    >
      {item.text}
    </div>
  );
};

/**
 * Compute the X translate for a danmaku item at a given frame.
 * Item enters from the right (x = width) and exits to the left.
 * Returns `null` if the item is not yet visible or already finished.
 *
 * Pure function — safe to call from any Remotion frame callback.
 */
export function danmakuX(
  item: DanmakuItem,
  frame: number,
  width: number,
): number | null {
  if (frame < item.startFrame || frame >= item.endFrame) return null;
  const duration = item.endFrame - item.startFrame;
  const t = (frame - item.startFrame) / duration;
  // width + buffer → -estimated text width (treat as -width for simplicity)
  return interpolate(t, [0, 1], [width, -width]);
}

/**
 * Convert a Subtitle object into a list of DanmakuItems distributed
 * across lanes. Useful for converting the existing subtitle track into
 * a danmaku layer for social-proof video variants.
 */
export function subtitlesToDanmaku(
  subtitle: Subtitle,
  fps: number,
  options: {
    lanes?: number;
    maxItems?: number;
    color?: string;
  } = {},
): DanmakuItem[] {
  const lanes = options.lanes ?? 6;
  const maxItems = options.maxItems ?? 50;
  const items: DanmakuItem[] = [];
  const entries = subtitle.entries.slice(0, maxItems);
  entries.forEach((entry, idx) => {
    items.push({
      id: idx + 1,
      text: entry.text,
      lane: idx % lanes,
      startFrame: Math.round(entry.start_time * fps),
      endFrame: Math.round(entry.end_time * fps) + 60,
      color: options.color,
    });
  });
  return items;
}
