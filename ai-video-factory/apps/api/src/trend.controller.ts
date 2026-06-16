import { Controller, Get, Query } from '@nestjs/common';
import { TrendService } from '@ai-video-factory/trend-service';

@Controller('trend')
export class TrendController {
  private trendService: TrendService;

  constructor() {
    this.trendService = new TrendService();
  }

  /**
   * Search for trending content
   */
  @Get('search')
  async search(@Query('keyword') keyword: string, @Query('platform') platform?: string) {
    return this.trendService.searchTrending(keyword, platform as any);
  }

  /**
   * Get metadata for a specific URL
   */
  @Get('metadata')
  async getMetadata(@Query('url') url: string) {
    return this.trendService.fetchVideoMetadata(url);
  }
}
