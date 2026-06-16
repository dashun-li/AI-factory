import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { RenderOutput, Script, Subtitle, TTSAudio } from '@ai-video-factory/shared-types';
import { StorageSDK } from '@ai-video-factory/storage-sdk';

const execFileAsync = promisify(execFile);

export interface RenderServiceConfig {
  remotionProjectPath?: string;
  outputDir?: string;
  minioEndpoint?: string;
  minioBucket?: string;
}

export class RenderService {
  private config: Required<Pick<RenderServiceConfig, 'remotionProjectPath' | 'outputDir'>>;
  private storage?: StorageSDK;

  constructor(config: RenderServiceConfig = {}) {
    this.config = {
      remotionProjectPath: config.remotionProjectPath || path.join(process.cwd(), 'remotion'),
      outputDir: config.outputDir || path.join(os.tmpdir(), 'ai-video-factory', 'output'),
    };
    fs.mkdirSync(this.config.outputDir, { recursive: true });

    if (config.minioEndpoint && config.minioBucket) {
      this.storage = new StorageSDK({
        endPoint: config.minioEndpoint,
        accessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
        secretKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
        bucket: config.minioBucket,
      });
    }
  }

  /**
   * Render video using Remotion
   * Assumes a Remotion project exists with template components
   */
  async renderWithRemotion(
    script: Script,
    audioPath: string,
    subtitlePath: string,
    resolution: { width: number; height: number } = { width: 1080, height: 1920 },
  ): Promise<string> {
    const outputPath = path.join(this.config.outputDir, `render_${Date.now()}.mp4`);
    const inputProps = JSON.stringify({
      script,
      audioPath,
      subtitlePath,
    });

    await execFileAsync('npx', [
      'remotion',
      'render',
      `src/index.tsx#VideoComposition`,
      outputPath,
      '--props', inputProps,
      '--width', String(resolution.width),
      '--height', String(resolution.height),
      '--codec', 'h264',
    ], {
      cwd: this.config.remotionProjectPath,
    });

    return outputPath;
  }

  /**
   * Burn subtitles into video using FFmpeg
   */
  async burnSubtitles(
    videoPath: string,
    subtitlePath: string,
    outputSuffix: string = '_subtitled',
  ): Promise<string> {
    const dir = path.dirname(videoPath);
    const ext = path.extname(videoPath);
    const base = path.basename(videoPath, ext);
    const outputPath = path.join(dir, `${base}${outputSuffix}${ext}`);

    await execFileAsync('ffmpeg', [
      '-i', videoPath,
      '-vf', `subtitles=${subtitlePath}`,
      '-c:a', 'copy',
      '-y',
      outputPath,
    ]);

    return outputPath;
  }

  /**
   * Combine audio tracks (voice + BGM) using FFmpeg
   */
  async mixAudio(
    voicePath: string,
    bgmPath?: string,
    bgmVolume: number = 0.2,
    outputSuffix: string = '_mixed',
  ): Promise<string> {
    const dir = path.dirname(voicePath);
    const ext = path.extname(voicePath);
    const base = path.basename(voicePath, ext);
    const outputPath = path.join(dir, `${base}${outputSuffix}.wav`);

    if (!bgmPath) {
      // No BGM, just return voice path
      return voicePath;
    }

    await execFileAsync('ffmpeg', [
      '-i', voicePath,
      '-i', bgmPath,
      '-filter_complex', `[1:a]volume=${bgmVolume}[bgm];[0:a][bgm]amix=inputs=2:duration=longest[aout]`,
      '-map', '[aout]',
      '-y',
      outputPath,
    ]);

    return outputPath;
  }

  /**
   * Combine video + audio using FFmpeg
   */
  async muxAudioVideo(
    videoPath: string,
    audioPath: string,
    outputSuffix: string = '_final',
  ): Promise<string> {
    const dir = path.dirname(videoPath);
    const ext = path.extname(videoPath);
    const base = path.basename(videoPath, ext);
    const outputPath = path.join(dir, `${base}${outputSuffix}.mp4`);

    await execFileAsync('ffmpeg', [
      '-i', videoPath,
      '-i', audioPath,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-shortest',
      '-y',
      outputPath,
    ]);

    return outputPath;
  }

  /**
   * Full render pipeline: audio mix → Remotion render → subtitle burn → final MP4
   */
  async renderFullVideo(params: {
    script: Script;
    audioPath: string;
    subtitle: Subtitle;
    bgmPath?: string;
  }): Promise<RenderOutput> {
    const { script, audioPath, subtitle, bgmPath } = params;

    // Step 1: Mix audio (voice + BGM)
    const mixedAudio = await this.mixAudio(audioPath, bgmPath);

    // Step 2: Write subtitle to temp file
    const subtitleDir = path.join(this.config.outputDir, 'subtitles');
    fs.mkdirSync(subtitleDir, { recursive: true });
    const subtitleFile = path.join(subtitleDir, `sub_${Date.now()}.${subtitle.format}`);
    fs.writeFileSync(subtitleFile, subtitle.content, 'utf-8');

    // Step 3: Determine resolution based on platform
    const isVertical = ['douyin', 'kuaishou', 'tiktok'].includes(script.platform);
    const resolution = isVertical
      ? { width: 1080, height: 1920 }  // 9:16
      : { width: 1920, height: 1080 }; // 16:9

    // Step 4: Render with Remotion (or skip if using FFmpeg-only pipeline)
    let videoPath: string;

    if (fs.existsSync(this.config.remotionProjectPath)) {
      videoPath = await this.renderWithRemotion(script, mixedAudio, subtitleFile, resolution);
    } else {
      // Fallback: create video from static image + audio
      videoPath = await this.createStaticVideo(mixedAudio, resolution);
    }

    // Step 5: Burn subtitles
    const finalPath = await this.burnSubtitles(videoPath, subtitleFile);

    // Get file info
    const stats = fs.statSync(finalPath);

    // Upload to MinIO if configured
    let videoUrl = finalPath;
    if (this.storage) {
      const uploadResult = await this.storage.uploadFile(finalPath, undefined, 'video/mp4');
      videoUrl = uploadResult.url;
    }

    return {
      video_url: videoUrl,
      duration: script.duration,
      resolution: `${resolution.width}x${resolution.height}`,
      file_size: stats.size,
    };
  }

  /**
   * Fallback: create video from a static black background + audio
   * Used when Remotion project is not set up
   */
  private async createStaticVideo(
    audioPath: string,
    resolution: { width: number; height: number },
  ): Promise<string> {
    const outputPath = path.join(this.config.outputDir, `static_${Date.now()}.mp4`);

    await execFileAsync('ffmpeg', [
      '-f', 'lavfi',
      '-i', `color=c=black:s=${resolution.width}x${resolution.height}:d=300`,
      '-i', audioPath,
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-shortest',
      '-y',
      outputPath,
    ]);

    return outputPath;
  }
}
