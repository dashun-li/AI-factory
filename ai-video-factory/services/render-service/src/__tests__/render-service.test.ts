import { RenderService } from '../index';
import * as fs from 'fs';

// Mock child_process - promisify returns the mock directly
jest.mock('child_process', () => ({
  execFile: jest.fn(),
}));

jest.mock('util', () => {
  const actual = jest.requireActual('util');
  return {
    ...actual,
    promisify: (fn: any) => fn,
  };
});

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  mkdirSync: jest.fn(),
  statSync: jest.fn(),
  existsSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

const { execFile } = require('child_process');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('RenderService', () => {
  let service: RenderService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RenderService({ outputDir: '/tmp/output' });
  });

  const mockScript = {
    title: '测试视频',
    duration: 60,
    platform: 'douyin' as const,
    scenes: [
      {
        id: 1,
        role: 'Hook',
        emotion: '好奇',
        duration: 3,
        narration: '测试旁白',
        visual: '测试画面',
        subtitle: '测试字幕',
      },
    ],
  };

  const mockSubtitle = {
    format: 'srt' as const,
    entries: [
      { index: 1, start_time: 0, end_time: 3, text: '测试字幕' },
    ],
    content: '1\n00:00:00,000 --> 00:00:03,000\n测试字幕\n',
  };

  describe('mixAudio', () => {
    it('should return voice path when no BGM provided', async () => {
      const result = await service.mixAudio('/tmp/voice.wav');
      expect(result).toBe('/tmp/voice.wav');
    });

    it('should call ffmpeg to mix voice and BGM', async () => {
      execFile.mockResolvedValue({ stdout: '' });

      const result = await service.mixAudio('/tmp/voice.wav', '/tmp/bgm.mp3', 0.2);

      expect(execFile).toHaveBeenCalledWith(
        'ffmpeg',
        expect.arrayContaining([
          '-i', '/tmp/voice.wav',
          '-i', '/tmp/bgm.mp3',
          expect.stringContaining('amix'),
        ]),
      );
      expect(result).toContain('_mixed');
    });
  });

  describe('burnSubtitles', () => {
    it('should call ffmpeg with subtitle filter', async () => {
      execFile.mockResolvedValue({ stdout: '' });

      const result = await service.burnSubtitles('/tmp/video.mp4', '/tmp/sub.srt');

      expect(execFile).toHaveBeenCalledWith(
        'ffmpeg',
        expect.arrayContaining([
          '-i', '/tmp/video.mp4',
          '-vf', 'subtitles=/tmp/sub.srt',
        ]),
      );
      expect(result).toContain('_subtitled');
    });
  });

  describe('muxAudioVideo', () => {
    it('should combine video and audio streams', async () => {
      execFile.mockResolvedValue({ stdout: '' });

      const result = await service.muxAudioVideo('/tmp/video.mp4', '/tmp/audio.wav');

      expect(execFile).toHaveBeenCalledWith(
        'ffmpeg',
        expect.arrayContaining([
          '-i', '/tmp/video.mp4',
          '-i', '/tmp/audio.wav',
          '-map', '0:v:0',
          '-map', '1:a:0',
          '-shortest',
        ]),
      );
      expect(result).toContain('_final');
    });
  });

  describe('renderFullVideo', () => {
    it('should run full pipeline for vertical platform', async () => {
      // No Remotion project - use static fallback
      mockFs.existsSync.mockReturnValue(false);
      execFile.mockResolvedValue({ stdout: '' });
      mockFs.statSync.mockReturnValue({ size: 1024000 } as any);

      const result = await service.renderFullVideo({
        script: mockScript,
        audioPath: '/tmp/voice.wav',
        subtitle: mockSubtitle,
      });

      // Should create static video (black bg + audio) since no Remotion
      expect(execFile).toHaveBeenCalledWith(
        'ffmpeg',
        expect.arrayContaining([
          expect.stringContaining('color=c=black:s=1080x1920'),
        ]),
      );

      expect(result.resolution).toBe('1080x1920'); // vertical for douyin
      expect(result.file_size).toBe(1024000);
    });

    it('should use 16:9 for horizontal platforms', async () => {
      mockFs.existsSync.mockReturnValue(false);
      execFile.mockResolvedValue({ stdout: '' });
      mockFs.statSync.mockReturnValue({ size: 2048000 } as any);

      const result = await service.renderFullVideo({
        script: { ...mockScript, platform: 'youtube' },
        audioPath: '/tmp/voice.wav',
        subtitle: mockSubtitle,
      });

      expect(result.resolution).toBe('1920x1080');
    });
  });
});
