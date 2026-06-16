import React from 'react';
import { registerRoot, Composition } from 'remotion';
import { VideoComposition } from './VideoComposition';
import {
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  VIDEO_FPS,
  totalDurationFrames,
} from './types';
import type { Script } from '@ai-video-factory/shared-types';
import type { VideoCompositionProps } from './types';

// Re-export template primitives so render-service / external consumers
// can pick from a single entry point.
export * from './animations';
export * from './transitions';
export * from './danmaku';

const fallbackScript: Script = {
  title: 'Template Preview',
  duration: 15,
  platform: 'douyin',
  scenes: [
    {
      id: 1,
      role: 'hook',
      emotion: 'curiosity',
      duration: 5,
      narration: '开场白',
      visual: '紫色渐变背景',
      subtitle: '你看到这个会停下来吗？',
    },
    {
      id: 2,
      role: 'body',
      emotion: 'surprise',
      duration: 5,
      narration: '核心内容展示',
      visual: '蓝色渐变背景',
      subtitle: '关键信息在这里',
    },
    {
      id: 3,
      role: 'cta',
      emotion: 'action',
      duration: 5,
      narration: '行动号召',
      visual: '绿色渐变背景',
      subtitle: '关注我了解更多',
    },
  ],
};

const defaultProps: VideoCompositionProps = {
  script: fallbackScript,
  mediaAssets: [],
};

const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="VideoComposition"
      component={VideoComposition}
      durationInFrames={totalDurationFrames(fallbackScript)}
      fps={VIDEO_FPS}
      width={VIDEO_WIDTH}
      height={VIDEO_HEIGHT}
      defaultProps={defaultProps}
    />
  );
};

registerRoot(RemotionRoot);
