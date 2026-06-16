/**
 * Pure-function tests for the animation + transition + danmaku helpers.
 *
 * These verify the math used by every Remotion template without booting
 * the React runtime — fast and deterministic.
 */
import {
  EASINGS,
  fadeIn,
  fadeOut,
  slideIn,
  scaleIn,
  kenBurns,
} from '../animations';
import { pickTransition, CrossFade } from '../transitions';
import {
  danmakuX,
  subtitlesToDanmaku,
  type DanmakuItem,
} from '../danmaku';

describe('animations', () => {
  it('exposes the canonical easing presets', () => {
    expect(typeof EASINGS.smooth).toBe('function');
    expect(typeof EASINGS.overshoot).toBe('function');
    expect(typeof EASINGS.spring).toBe('function');
    // Each easing maps t in [0,1] to roughly the same range
    expect(EASINGS.smooth(0)).toBeCloseTo(0, 5);
    expect(EASINGS.smooth(1)).toBeCloseTo(1, 5);
  });

  it('fadeIn ramps 0 → 1 across the duration and clamps outside', () => {
    expect(fadeIn(0)).toBe(0);
    expect(fadeIn(4, 0, 8)).toBeCloseTo(0.5, 2);
    expect(fadeIn(8)).toBe(1);
    expect(fadeIn(20)).toBe(1);
    // Before start
    expect(fadeIn(2, 5, 8)).toBe(0);
  });

  it('fadeOut ramps 1 → 0 ending at `end` and clamps outside', () => {
    expect(fadeOut(0, 10, 8)).toBe(1);
    expect(fadeOut(6, 10, 8)).toBeCloseTo(0.5, 2);
    expect(fadeOut(10, 10, 8)).toBe(0);
    expect(fadeOut(20, 10, 8)).toBe(0);
  });

  it('slideIn returns the start offset before start, 0 after duration', () => {
    expect(slideIn(0, 80)).toBe(80);
    expect(slideIn(12, 80)).toBe(0);
    expect(slideIn(50, 80)).toBe(0);
    // Mid-progress: somewhere between 80 and 0
    const mid = slideIn(6, 80);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(80);
  });

  it('scaleIn returns the from scale before start, 1 after duration', () => {
    expect(scaleIn(0, 0.85)).toBeCloseTo(0.85, 5);
    expect(scaleIn(10, 0.85)).toBe(1);
    expect(scaleIn(50, 0.85)).toBe(1);
  });

  it('kenBurns grows monotonically toward the target scale', () => {
    expect(kenBurns(0, 1.08, 150)).toBe(1);
    const v50 = kenBurns(50, 1.08, 150);
    const v100 = kenBurns(100, 1.08, 150);
    const v150 = kenBurns(150, 1.08, 150);
    expect(v50).toBeGreaterThan(1);
    expect(v100).toBeGreaterThan(v50);
    expect(v150).toBeCloseTo(1.08, 4);
    // Clamps past end
    expect(kenBurns(1000, 1.08, 150)).toBeCloseTo(1.08, 4);
  });

  it('kenBurns returns 1 when duration is non-positive', () => {
    expect(kenBurns(5, 1.08, 0)).toBe(1);
  });
});

describe('transitions', () => {
  it('pickTransition returns CrossFade for unknown names', () => {
    expect(pickTransition('nope')).toBe(CrossFade);
    expect(pickTransition(undefined)).toBe(CrossFade);
  });

  it('pickTransition returns the matching transition for known names', () => {
    expect(pickTransition('cross-fade')).toBe(CrossFade);
    expect(pickTransition('slide')).not.toBe(CrossFade);
    expect(pickTransition('zoom')).not.toBe(CrossFade);
    expect(pickTransition('drift')).not.toBe(CrossFade);
  });
});

describe('danmaku', () => {
  const baseItem: DanmakuItem = {
    id: 1,
    text: 'hello',
    lane: 2,
    startFrame: 0,
    endFrame: 60,
  };

  it('danmakuX returns null outside the item window', () => {
    expect(danmakuX(baseItem, -1, 1080)).toBeNull();
    expect(danmakuX(baseItem, 60, 1080)).toBeNull();
  });

  it('danmakuX returns the width at startFrame and a negative value at endFrame', () => {
    const width = 1080;
    expect(danmakuX(baseItem, 0, width)).toBeCloseTo(width, 0);
    // At the last frame inside the window (endFrame - 1) we get a negative x.
    const endX = danmakuX(baseItem, 59, width);
    expect(endX).not.toBeNull();
    expect(endX as number).toBeLessThanOrEqual(0);
  });

  it('subtitlesToDanmaku maps subtitle entries into danmaku items', () => {
    const items = subtitlesToDanmaku(
      {
        format: 'srt',
        entries: [
          { index: 1, start_time: 0, end_time: 2, text: 'a' },
          { index: 2, start_time: 2, end_time: 4, text: 'b' },
        ],
        content: '',
      },
      30,
      { lanes: 3 },
    );
    expect(items).toHaveLength(2);
    expect(items[0].lane).toBe(0);
    expect(items[1].lane).toBe(1);
    expect(items[0].startFrame).toBe(0);
    expect(items[0].endFrame).toBeCloseTo(2 * 30 + 60, 0);
  });

  it('subtitlesToDanmaku caps the result at maxItems', () => {
    const entries = Array.from({ length: 100 }, (_, i) => ({
      index: i + 1,
      start_time: i,
      end_time: i + 1,
      text: `t${i}`,
    }));
    const items = subtitlesToDanmaku(
      { format: 'srt', entries, content: '' },
      30,
      { maxItems: 5 },
    );
    expect(items).toHaveLength(5);
  });
});
