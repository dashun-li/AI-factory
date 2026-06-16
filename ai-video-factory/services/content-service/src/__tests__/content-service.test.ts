import { ContentService } from '../index';

// Mock child_process
jest.mock('child_process', () => ({
  execFile: jest.fn(),
}));

// Mock promisify to return the same mock
jest.mock('util', () => {
  const actual = jest.requireActual('util');
  return {
    ...actual,
    promisify: (fn: any) => fn,
  };
});

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

jest.mock('os', () => ({
  tmpdir: jest.fn(() => '/tmp'),
}));

const { execFile } = require('child_process');
const fs = require('fs');

describe('ContentService', () => {
  let service: ContentService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ContentService({ fasterWhisperUrl: 'http://localhost:9001' });
  });

  describe('downloadVideo', () => {
    it('should call yt-dlp to get metadata then download', async () => {
      const mockMetadata = JSON.stringify({
        id: 'video123',
        title: 'Test Video',
        ext: 'mp4',
        view_count: 100000,
        like_count: 5000,
        comment_count: 200,
      });

      // First call: dump-json, Second call: download
      execFile
        .mockResolvedValueOnce({ stdout: mockMetadata }) // metadata
        .mockResolvedValueOnce({ stdout: '' }); // download

      const result = await service.downloadVideo('https://youtube.com/watch?v=123');

      expect(execFile).toHaveBeenCalledTimes(2);
      expect(result.metadata.id).toBe('video123');
      expect(result.metadata.title).toBe('Test Video');
    });
  });

  describe('extractAudio', () => {
    it('should call ffmpeg with correct parameters', async () => {
      execFile.mockResolvedValue({ stdout: '' });

      const result = await service.extractAudio('/tmp/video.mp4');

      expect(execFile).toHaveBeenCalledWith(
        'ffmpeg',
        expect.arrayContaining([
          '-i', '/tmp/video.mp4',
          '-vn',
          '-acodec', 'pcm_s16le',
          '-ar', '16000',
          '-ac', '1',
        ]),
      );
      expect(result).toBe('/tmp/video.wav');
    });
  });

  describe('transcribe', () => {
    it('should call Faster-Whisper API and return structured transcript', async () => {
      fs.readFileSync.mockReturnValue(Buffer.from('fake audio data'));

      const mockWhisperResponse = {
        text: '这是完整转写文本',
        segments: [
          { start: 0, end: 3.5, text: '这是第一段' },
          { start: 3.5, end: 8.0, text: ' 这是第二段' },
        ],
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockWhisperResponse),
      });

      const result = await service.transcribe('/tmp/audio.wav', 'zh');

      expect(result.transcript).toBe('这是完整转写文本');
      expect(result.segments).toHaveLength(2);
      expect(result.segments[0]).toEqual({
        start: 0,
        end: 3.5,
        text: '这是第一段',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:9001/v1/audio/transcriptions',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should throw on Whisper API error', async () => {
      fs.readFileSync.mockReturnValue(Buffer.from('fake'));

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: () => Promise.resolve('Service Unavailable'),
      });

      await expect(service.transcribe('/tmp/audio.wav')).rejects.toThrow(
        'Whisper API error: 503',
      );
    });
  });

  describe('processUrl', () => {
    it('should run full pipeline: download → extract → transcribe', async () => {
      const mockMetadata = JSON.stringify({
        id: 'vid1',
        title: 'Test',
        ext: 'mp4',
        view_count: 100,
      });

      execFile
        .mockResolvedValueOnce({ stdout: mockMetadata })
        .mockResolvedValueOnce({ stdout: '' })
        .mockResolvedValueOnce({ stdout: '' }); // ffmpeg

      fs.readFileSync.mockReturnValue(Buffer.from('audio'));

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ text: 'transcribed', segments: [] }),
      });

      const result = await service.processUrl('https://youtube.com/watch?v=test', 'zh');

      expect(result.metadata.title).toBe('Test');
      expect(result.transcript.transcript).toBe('transcribed');
    });
  });
});
