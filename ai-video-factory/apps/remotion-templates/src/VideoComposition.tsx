import React from 'react';
import {
  AbsoluteFill,
  Img,
  staticFile,
  useCurrentFrame,
  interpolate,
  Easing,
} from 'remotion';
import type { VideoCompositionProps } from './types';

interface SceneProps {
  narration: string;
  subtitle?: string;
  visual: string;
  assetUrl?: string;
  index: number;
}

const Scene: React.FC<SceneProps> = ({ narration, subtitle, assetUrl, index }) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });
  const fadeOut = interpolate(frame, [120, 150], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.quad),
  });
  const opacity = Math.min(fadeIn, fadeOut);
  const slide = interpolate(frame, [0, 15], [40, 0], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ opacity, backgroundColor: '#000' }}>
      {assetUrl ? (
        <AbsoluteFill>
          <Img
            src={assetUrl}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: `translateY(${slide}px) scale(1.02)`,
            }}
          />
          <AbsoluteFill
            style={{
              background:
                'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.0) 35%, rgba(0,0,0,0.65) 100%)',
            }}
          />
        </AbsoluteFill>
      ) : (
        <AbsoluteFill
          style={{
            background: `linear-gradient(135deg, hsl(${index * 47 % 360}, 60%, 28%) 0%, hsl(${(index * 47 + 40) % 360}, 60%, 18%) 100%)`,
          }}
        />
      )}

      <AbsoluteFill
        style={{
          justifyContent: 'flex-end',
          alignItems: 'center',
          paddingBottom: 200,
          textAlign: 'center',
          fontFamily: 'system-ui, -apple-system, "Microsoft YaHei", sans-serif',
        }}
      >
        <div
          style={{
            color: '#fff',
            fontSize: 56,
            fontWeight: 700,
            lineHeight: 1.3,
            textShadow: '0 2px 12px rgba(0,0,0,0.9)',
            maxWidth: '90%',
          }}
        >
          {subtitle || narration}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const VideoComposition: React.FC<VideoCompositionProps> = ({
  script,
  mediaAssets,
}) => {
  const frame = useCurrentFrame();

  // Determine current scene based on cumulative duration
  let elapsedSeconds = 0;
  let currentSceneIndex = 0;
  for (let i = 0; i < script.scenes.length; i++) {
    const next = elapsedSeconds + script.scenes[i].duration;
    if (frame / 30 < next) {
      currentSceneIndex = i;
      break;
    }
    elapsedSeconds = next;
    currentSceneIndex = Math.min(i + 1, script.scenes.length - 1);
  }

  const scene = script.scenes[currentSceneIndex];
  if (!scene) {
    return (
      <AbsoluteFill style={{ backgroundColor: '#000' }}>
        <AbsoluteFill
          style={{
            justifyContent: 'center',
            alignItems: 'center',
            color: '#888',
            fontFamily: 'system-ui, sans-serif',
            fontSize: 36,
          }}
        >
          No scene data
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  const assetUrl =
    mediaAssets && mediaAssets.length > 0
      ? mediaAssets[currentSceneIndex % mediaAssets.length]
      : undefined;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <Scene
        narration={scene.narration}
        subtitle={scene.subtitle}
        visual={scene.visual}
        assetUrl={assetUrl}
        index={currentSceneIndex}
      />
    </AbsoluteFill>
  );
};
