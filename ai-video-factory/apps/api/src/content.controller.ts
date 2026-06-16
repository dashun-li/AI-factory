import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { ContentService } from '@ai-video-factory/content-service';

interface ProcessUrlDto {
  url: string;
}

@Controller('content')
export class ContentController {
  private contentService: ContentService;

  constructor() {
    this.contentService = new ContentService({
      fasterWhisperUrl: process.env.FASTER_WHISPER_URL || 'http://localhost:9001',
    });
  }

  /**
   * Download a video from URL, extract audio, and transcribe.
   */
  @Post('process')
  async process(@Body() dto: ProcessUrlDto) {
    if (!dto.url) {
      throw new HttpException('url is required', HttpStatus.BAD_REQUEST);
    }
    return this.contentService.processUrl(dto.url);
  }
}
