import { MediaService } from '../index';

// Mock child_process
jest.mock('child_process', () => ({
  execFile: jest.fn(),
}));

// Mock util promisify to bypass wrapper
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
  writeFileSync: jest.fn(),
}));

jest.mock('os', () => ({
  tmpdir: jest.fn(() => '/tmp'),
}));

const { execFile } = require('child_process');
const fs = require('fs');

describe('MediaService', () => {
  let service: MediaService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MediaService({
      cosyvoiceUrl: 'http://localhost:9003',
      falApiKey: 'fal-test-key',
      klingApiKey: 'kling-test-key',
      pexelsApiKey: 'pexels-test-key',
      unsplashAccessKey: 'unsplash-test-key',
    });
  });

  describe('generateTTS', () => {
    it('should call edge-tts with correct parameters', async () => {
      execFile.mockResolvedValue({ stdout: '' });
      (fs.statSync as jest.Mock).mockReturnValue({ size: 1024 });

      const result = await service.generateTTS('测试文本');

      expect(execFile).toHaveBeenCalledWith(
        'edge-tts',
        expect.arrayContaining([
          '--voice', 'zh-CN-YunxiNeural',
          '--text', '测试文本',
          '--write-media', expect.stringContaining('tts_'),
        ]),
      );
      expect(result.audio_url).toContain('tts_');
      expect(result.voice).toBe('zh-CN-YunxiNeural');
      expect(result.text).toBe('测试文本');
    });

    it('should use custom voice when provided', async () => {
      execFile.mockResolvedValue({ stdout: '' });
      (fs.statSync as jest.Mock).mockReturnValue({ size: 2048 });

      const result = await service.generateTTS('Hello', 'en-US-JennyNeural');

      expect(execFile).toHaveBeenCalledWith(
        'edge-tts',
        expect.arrayContaining(['--voice', 'en-US-JennyNeural']),
      );
      expect(result.voice).toBe('en-US-JennyNeural');
    });
  });

  describe('generateTTSProduction', () => {
    it('should call CosyVoice API and save audio file', async () => {
      const audioBuffer = Buffer.from('fake audio data');
      (global.fetch as any) = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(audioBuffer),
      });

      const result = await service.generateTTSProduction('测试文本', 'zh-CN-female');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:9003/v1/tts',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(result.audio_url).toContain('tts_');
    });

    it('should throw if CosyVoice URL not configured', async () => {
      const noUrlService = new MediaService();
      await expect(
        noUrlService.generateTTSProduction('test', 'voice'),
      ).rejects.toThrow('CosyVoice URL not configured');
    });

    it('should throw on CosyVoice API error', async () => {
      (global.fetch as any) = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(
        service.generateTTSProduction('test', 'voice'),
      ).rejects.toThrow('CosyVoice API error: 500');
    });
  });

  describe('generateImage', () => {
    it('should call Flux API and return MediaAsset', async () => {
      (global.fetch as any) = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ images: [{ url: 'https://fal.ai/image1.png' }] }),
      });

      const result = await service.generateImage('a beautiful sunset');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://fal.run/fal-ai/flux/dev',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Key fal-test-key',
          }),
        }),
      );
      expect(result.type).toBe('image');
      expect(result.url).toBe('https://fal.ai/image1.png');
      expect(result.source).toBe('ai_generated');
    });

    it('should throw if FAL API key not configured', async () => {
      const noKeyService = new MediaService();
      await expect(noKeyService.generateImage('test')).rejects.toThrow('FAL API key not configured');
    });
  });

  describe('generateVideo', () => {
    it('should call Kling API and return MediaAsset', async () => {
      (global.fetch as any) = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: { video_url: 'https://kling.ai/video1.mp4', task_id: 'task123' },
        }),
      });

      const result = await service.generateVideo('a cat walking', 'https://img.jpg', 5);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.klingai.com/v1/videos/image2video',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer kling-test-key',
          }),
        }),
      );
      expect(result.type).toBe('video');
      expect(result.url).toBe('https://kling.ai/video1.mp4');
    });

    it('should throw if Kling API key not configured', async () => {
      const noKeyService = new MediaService();
      await expect(noKeyService.generateVideo('test')).rejects.toThrow('Kling API key not configured');
    });
  });

  describe('searchPexels', () => {
    it('should search Pexels API and return image assets', async () => {
      (global.fetch as any) = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          photos: [
            { src: { original: 'https://pexels.com/1.jpg' } },
            { src: { original: 'https://pexels.com/2.jpg' } },
          ],
        }),
      });

      const results = await service.searchPexels('nature');

      expect(results).toHaveLength(2);
      expect(results[0].type).toBe('image');
      expect(results[0].source).toBe('stock');
      expect(results[0].url).toBe('https://pexels.com/1.jpg');
    });

    it('should return empty array when no API key', async () => {
      const noKeyService = new MediaService();
      const results = await noKeyService.searchPexels('test');
      expect(results).toEqual([]);
    });
  });

  describe('searchUnsplash', () => {
    it('should search Unsplash API and return image assets', async () => {
      (global.fetch as any) = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          results: [
            { urls: { raw: 'https://unsplash.com/1.jpg' } },
          ],
        }),
      });

      const results = await service.searchUnsplash('ocean');

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('image');
      expect(results[0].source).toBe('stock');
    });

    it('should return empty array when no API key', async () => {
      const noKeyService = new MediaService();
      const results = await noKeyService.searchUnsplash('test');
      expect(results).toEqual([]);
    });
  });
});
