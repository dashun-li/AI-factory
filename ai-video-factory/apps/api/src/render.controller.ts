import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { RenderService } from '@ai-video-factory/render-service';
import type { Script, Subtitle } from '@ai-video-factory/shared-types';

interface RenderFullVideoDto {
  script: Script;
  audioPath: string;
  subtitle: Subtitle;
  bgmPath?: string;
}

@Controller('render')
export class RenderController {
  private renderService: RenderService;

  constructor() {
    this.renderService = new RenderService();
  }

  /**
   * Render a full video (Remotion → burn subtitles → mix audio → mux).
   */
  @Post('video')
  async renderVideo(@Body() dto: RenderFullVideoDto) {
    if (!dto.script) {
      throw new HttpException('script is required', HttpStatus.BAD_REQUEST);
    }
    if (!dto.audioPath) {
      throw new HttpException('audioPath is required', HttpStatus.BAD_REQUEST);
    }
    if (!dto.subtitle) {
      throw new HttpException('subtitle is required', HttpStatus.BAD_REQUEST);
    }
    return this.renderService.renderFullVideo(dto);
  }
}
