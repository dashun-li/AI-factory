import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { MediaService } from '@ai-video-factory/media-service';

interface GenerateImageDto {
  prompt: string;
}

interface GenerateTTSDto {
  text: string;
}

@Controller('media')
export class MediaController {
  private mediaService: MediaService;

  constructor() {
    this.mediaService = new MediaService();
  }

  /**
   * Generate an image from a text prompt via fal.ai.
   */
  @Post('image')
  async generateImage(@Body() dto: GenerateImageDto) {
    if (!dto.prompt) {
      throw new HttpException('prompt is required', HttpStatus.BAD_REQUEST);
    }
    return this.mediaService.generateImage(dto.prompt);
  }

  /**
   * Generate TTS audio from text via edge-tts.
   */
  @Post('tts')
  async generateTTS(@Body() dto: GenerateTTSDto) {
    if (!dto.text) {
      throw new HttpException('text is required', HttpStatus.BAD_REQUEST);
    }
    return this.mediaService.generateTTS(dto.text);
  }
}
