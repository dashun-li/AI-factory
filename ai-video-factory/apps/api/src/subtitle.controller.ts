import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { SubtitleService } from '@ai-video-factory/subtitle-service';

interface SubtitleEntryDto {
  index: number;
  start_time: number;
  end_time: number;
  text: string;
}

interface GenerateSubtitleDto {
  entries: SubtitleEntryDto[];
  format?: 'srt' | 'vtt' | 'ass';
}

@Controller('subtitle')
export class SubtitleController {
  private subtitleService: SubtitleService;

  constructor() {
    this.subtitleService = new SubtitleService({
      whisperxUrl: process.env.WHISPERX_URL || 'http://localhost:9002',
    });
  }

  /**
   * Generate subtitle file (SRT/VTT/ASS) from entries.
   */
  @Post('generate')
  async generate(@Body() dto: GenerateSubtitleDto) {
    if (!dto.entries || dto.entries.length === 0) {
      throw new HttpException('entries is required and must be non-empty', HttpStatus.BAD_REQUEST);
    }
    return this.subtitleService.generateSubtitle(dto.entries, dto.format ?? 'srt');
  }
}
