import { Controller, Post, Get, Body, Query, HttpException, HttpStatus } from '@nestjs/common';
import { ScriptService } from '@ai-video-factory/script-service';
import { Platform } from '@ai-video-factory/shared-types';

interface GenerateScriptDto {
  topic: string;
  platform: Platform;
}

@Controller('script')
export class ScriptController {
  private scriptService: ScriptService;

  constructor() {
    const anthropicKey = process.env.ANTHROPIC_API_KEY ?? '';
    const openaiKey = process.env.OPENAI_API_KEY ?? '';
    const milvusAddress = `${process.env.MILVUS_HOST || 'localhost'}:${process.env.MILVUS_PORT || '19530'}`;
    this.scriptService = new ScriptService(anthropicKey, openaiKey, milvusAddress);
  }

  /**
   * Generate a script from topic + platform
   */
  @Post('generate')
  async generate(@Body() dto: GenerateScriptDto) {
    if (!dto.topic) {
      throw new HttpException('topic is required', HttpStatus.BAD_REQUEST);
    }
    const script = await this.scriptService.generateScript({
      topic: dto.topic,
      platform: dto.platform || 'douyin',
    });
    return script;
  }
}
