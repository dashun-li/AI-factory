import { TrendService } from '../index';

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

const { execFile } = require('child_process');

describe('TrendService', () => {
  let service: TrendService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TrendService();
  });

  describe('fetchVideoMetadata', () => {
    it('should call yt-dlp with correct parameters and return TrendItem', async () => {
      const mockData = JSON.stringify({
        title: 'Test Video',
        view_count: 100000,
        like_count: 5000,
        comment_count: 200,
      });
      execFile.mockResolvedValue({ stdout: mockData });

      const result = await service.fetchVideoMetadata('https://youtube.com/watch?v=123');

      expect(execFile).toHaveBeenCalledWith(
        'yt-dlp',
        expect.arrayContaining([
          '--dump-json',
          '--no-download',
          '--no-playlist',
          'https://youtube.com/watch?v=123',
        ]),
      );
      expect(result.title).toBe('Test Video');
      expect(result.views).toBe(100000);
      expect(result.platform).toBe('youtube');
    });

    it('should detect platform from URL correctly', async () => {
      const mockData = JSON.stringify({ title: 'T', view_count: 0 });
      execFile.mockResolvedValue({ stdout: mockData });

      const douyin = await service.fetchVideoMetadata('https://www.douyin.com/video/123');
      expect(douyin.platform).toBe('douyin');

      const bilibili = await service.fetchVideoMetadata('https://www.bilibili.com/video/BV123');
      expect(bilibili.platform).toBe('bilibili');

      const xiaohongshu = await service.fetchVideoMetadata('https://www.xiaohongshu.com/explore/123');
      expect(xiaohongshu.platform).toBe('xiaohongshu');
    });
  });

  describe('searchTrending', () => {
    it('should search with yt-dlp and return deduplicated results', async () => {
      const entries = [
        JSON.stringify({ title: 'Video 1', webpage_url: 'https://youtube.com/1', view_count: 1000 }),
        JSON.stringify({ title: 'Video 1', webpage_url: 'https://youtube.com/1', view_count: 1000 }),
        JSON.stringify({ title: 'Video 2', webpage_url: 'https://youtube.com/2', view_count: 2000 }),
      ];
      execFile.mockResolvedValue({ stdout: entries.join('\n') });

      const results = await service.searchTrending('test keyword');

      expect(execFile).toHaveBeenCalledWith(
        'yt-dlp',
        expect.arrayContaining(['ytsearch10:test keyword']),
      );
      expect(results).toHaveLength(2);
      expect(results[0].title).toBe('Video 1');
      expect(results[1].title).toBe('Video 2');
    });

    it('should return empty array on error', async () => {
      execFile.mockRejectedValue(new Error('network error'));

      const results = await service.searchTrending('failing query');
      expect(results).toEqual([]);
    });

    it('should build platform-specific search query', async () => {
      execFile.mockResolvedValue({ stdout: '' });

      await service.searchTrending('test', 'bilibili');

      expect(execFile).toHaveBeenCalledWith(
        'yt-dlp',
        expect.arrayContaining(['ytsearch10:bilibili test']),
      );
    });
  });
});
