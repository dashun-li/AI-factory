import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { AnalysisService } from '@ai-video-factory/analysis-service';
import { Platform } from '@ai-video-factory/shared-types';

interface AnalyzeDto {
  platform: Platform;
  title: string;
  views: number;
  url: string;
  transcript: string;
  workflowId?: string;
}

@Controller('analysis')
export class AnalysisController {
  private analysisService: AnalysisService;

  constructor() {
    const anthropicKey = process.env.ANTHROPIC_API_KEY ?? '';
    this.analysisService = new AnalysisService(anthropicKey);
  }

  /**
   * Run 3-round analysis on a transcript.
   */
  @Post('analyze')
  async analyze(@Body() dto: AnalyzeDto) {
    if (!dto.transcript) {
      throw new HttpException('transcript is required', HttpStatus.BAD_REQUEST);
    }
    const result = await this.analysisService.analyze({
      platform: dto.platform || 'douyin',
      title: dto.title ?? '',
      views: dto.views ?? 0,
      url: dto.url ?? '',
      transcript: dto.transcript,
    });
    return result;
  }
}
