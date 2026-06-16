import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MediaAsset, TTSAudio } from '@ai-video-factory/shared-types';
import { StorageSDK } from '@ai-video-factory/storage-sdk';

const execFileAsync = promisify(execFile);

export interface MediaServiceConfig {
  edgeTtsCommand?: string;
  cosyvoiceUrl?: string;
  falApiKey?: string;
  falBaseUrl?: string;
  klingApiKey?: string;
  pexelsApiKey?: string;
  unsplashAccessKey?: string;
  minioEndpoint?: string;
  minioBucket?: string;
}

export class MediaService {
  private config: MediaServiceConfig;
  private storage?: StorageSDK;

  constructor(config: MediaServiceConfig = {}) {
    this.config = config;
    if (config.minioEndpoint && config.minioBucket) {
      this.storage = new StorageSDK({
        endPoint: config.minioEndpoint,
        accessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
        secretKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
        bucket: config.minioBucket,
      });
    }
  }

  private async uploadToStorage(filePath: string, contentType?: string): Promise<string> {
    if (!this.storage) return filePath;
    const result = await this.storage.uploadFile(filePath, undefined, contentType);
    return result.url;
  }

  // ========== TTS ==========

  /**
   * Generate TTS audio using Edge-TTS (free, no GPU)
   */
  async generateTTS(text: string, voice: string = 'zh-CN-YunxiNeural'): Promise<TTSAudio> {
    const outputDir = path.join(os.tmpdir(), 'ai-video-factory', 'tts');
    fs.mkdirSync(outputDir, { recursive: true });

    const outputFile = path.join(outputDir, `tts_${Date.now()}.mp3`);

    await execFileAsync('edge-tts', [
      '--voice', voice,
      '--text', text,
      '--write-media', outputFile,
    ]);

    const stats = fs.statSync(outputFile);

    return {
      audio_url: await this.uploadToStorage(outputFile),
      duration: 0, // Will be calculated during subtitle alignment
      voice,
      text,
    };
  }

  /**
   * Generate TTS audio using CosyVoice2 (production, GPU required)
   */
  async generateTTSProduction(text: string, voice: string, referenceAudio?: string): Promise<TTSAudio> {
    if (!this.config.cosyvoiceUrl) {
      throw new Error('CosyVoice URL not configured');
    }

    const response = await fetch(`${this.config.cosyvoiceUrl}/v1/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice,
        reference_audio: referenceAudio,
      }),
    });

    if (!response.ok) {
      throw new Error(`CosyVoice API error: ${response.status}`);
    }

    const outputDir = path.join(os.tmpdir(), 'ai-video-factory', 'tts');
    fs.mkdirSync(outputDir, { recursive: true });
    const outputFile = path.join(outputDir, `tts_${Date.now()}.wav`);

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(outputFile, buffer);

    return {
      audio_url: await this.uploadToStorage(outputFile),
      duration: 0,
      voice,
      text,
    };
  }

  // ========== Image Generation ==========

  /**
   * Generate image using Flux.1-dev via fal.ai
   */
  async generateImage(prompt: string): Promise<MediaAsset> {
    if (!this.config.falApiKey) {
      throw new Error('FAL API key not configured');
    }

    const response = await fetch('https://fal.run/fal-ai/flux/dev', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${this.config.falApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        image_size: 'landscape_16_9',
        num_inference_steps: 28,
      }),
    });

    if (!response.ok) {
      throw new Error(`Flux API error: ${response.status}`);
    }

    const result = await response.json() as { images: { url: string }[] };

    return {
      type: 'image',
      url: result.images[0]?.url || '',
      source: 'ai_generated',
      prompt,
    };
  }

  // ========== Video Generation ==========

  /**
   * Generate video clip using Kling API
   */
  async generateVideo(prompt: string, imageUrl?: string, duration: number = 5): Promise<MediaAsset> {
    if (!this.config.klingApiKey) {
      throw new Error('Kling API key not configured');
    }

    const body: Record<string, unknown> = {
      prompt,
      duration,
      mode: 'std',
    };

    if (imageUrl) {
      body.image_url = imageUrl;
      body.image_reference = 'last_frame';
    }

    const response = await fetch('https://api.klingai.com/v1/videos/image2video', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.klingApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Kling API error: ${response.status}`);
    }

    const result = await response.json() as { data: { video_url: string; task_id: string } };

    return {
      type: 'video',
      url: result.data.video_url,
      duration,
      source: 'ai_generated',
      prompt,
    };
  }

  // ========== Stock Footage ==========

  /**
   * Search stock images/videos from Pexels
   */
  async searchPexels(query: string, perPage: number = 5): Promise<MediaAsset[]> {
    if (!this.config.pexelsApiKey) return [];

    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}`,
      { headers: { 'Authorization': this.config.pexelsApiKey } },
    );

    if (!response.ok) return [];

    const result = await response.json() as { photos: { src: { original: string } }[] };

    return result.photos.map((photo) => ({
      type: 'image' as const,
      url: photo.src.original,
      source: 'stock' as const,
    }));
  }

  /**
   * Search stock images from Unsplash
   */
  async searchUnsplash(query: string, perPage: number = 5): Promise<MediaAsset[]> {
    if (!this.config.unsplashAccessKey) return [];

    const response = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${perPage}`,
      { headers: { 'Authorization': `Client-ID ${this.config.unsplashAccessKey}` } },
    );

    if (!response.ok) return [];

    const result = await response.json() as { results: { urls: { raw: string } }[] };

    return result.results.map((photo) => ({
      type: 'image' as const,
      url: photo.urls.raw,
      source: 'stock' as const,
    }));
  }
}
