import { execFile } from 'child_process';
import { promisify } from 'util';
import { TrendItem, Platform } from '@ai-video-factory/shared-types';

const execFileAsync = promisify(execFile);

export class TrendService {
  /**
   * Fetch video metadata from a URL using yt-dlp
   */
  async fetchVideoMetadata(url: string): Promise<TrendItem> {
    const { stdout } = await execFileAsync('yt-dlp', [
      '--dump-json',
      '--no-download',
      '--no-playlist',
      url,
    ]);

    const data = JSON.parse(stdout);

    return {
      title: data.title || '',
      platform: this.detectPlatform(url),
      url,
      views: data.view_count || 0,
      likes: data.like_count || 0,
      comments: data.comment_count || 0,
    };
  }

  /**
   * Search for trending content by keyword
   */
  async searchTrending(keyword: string, platform?: Platform): Promise<TrendItem[]> {
    const searchQuery = platform
      ? this.buildSearchQuery(keyword, platform)
      : keyword;

    try {
      const { stdout } = await execFileAsync('yt-dlp', [
        '--dump-json',
        '--no-download',
        '--flat-playlist',
        `ytsearch10:${searchQuery}`,
      ]);

      const lines = stdout.trim().split('\n').filter(Boolean);
      const results: TrendItem[] = [];

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          results.push({
            title: data.title || '',
            platform: platform || 'youtube',
            url: data.webpage_url || data.url || '',
            views: data.view_count || 0,
            likes: data.like_count || 0,
            comments: data.comment_count || 0,
          });
        } catch {
          // Skip malformed entries
        }
      }

      return this.deduplicate(results);
    } catch {
      return [];
    }
  }

  /**
   * Detect platform from URL
   */
  private detectPlatform(url: string): Platform {
    if (url.includes('douyin.com') || url.includes('iesdouyin.com')) return 'douyin';
    if (url.includes('kuaishou.com')) return 'kuaishou';
    if (url.includes('xiaohongshu.com') || url.includes('xhslink.com')) return 'xiaohongshu';
    if (url.includes('bilibili.com') || url.includes('b23.tv')) return 'bilibili';
    if (url.includes('weibo.com')) return 'weibo';
    if (url.includes('tiktok.com')) return 'tiktok';
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
    return 'youtube';
  }

  /**
   * Build platform-specific search query
   */
  private buildSearchQuery(keyword: string, platform: Platform): string {
    const prefixes: Record<string, string> = {
      youtube: '',
      bilibili: 'bilibili',
      douyin: 'douyin',
    };
    const prefix = prefixes[platform] || '';
    return prefix ? `${prefix} ${keyword}` : keyword;
  }

  /**
   * Deduplicate results by title similarity
   */
  private deduplicate(items: TrendItem[]): TrendItem[] {
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = item.title.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
