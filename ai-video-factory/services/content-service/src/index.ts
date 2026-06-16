import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { Transcript, TranscriptSegment } from '@ai-video-factory/shared-types';

const execFileAsync = promisify(execFile);

export interface ContentServiceConfig {
  fasterWhisperUrl: string;
  downloadDir?: string;
}

export class ContentService {
  private config: ContentServiceConfig;

  constructor(config: ContentServiceConfig) {
    this.config = {
      downloadDir: path.join(os.tmpdir(), 'ai-video-factory'),
      ...config,
    };
  }

  /**
   * Download video from URL using yt-dlp
   */
  async downloadVideo(url: string): Promise<{ videoPath: string; metadata: VideoMetadata }> {
    const outputDir = this.config.downloadDir!;
    fs.mkdirSync(outputDir, { recursive: true });

    const outputPath = path.join(outputDir, '%(id)s.%(ext)s');

    const { stdout } = await execFileAsync('yt-dlp', [
      '--dump-json',
      '--no-download',
      url,
    ]);

    const metadata: VideoMetadata = JSON.parse(stdout);

    await execFileAsync('yt-dlp', [
      '-o', outputPath,
      '--no-playlist',
      url,
    ]);

    const ext = metadata.ext || 'mp4';
    const videoPath = path.join(outputDir, `${metadata.id}.${ext}`);

    return { videoPath, metadata };
  }

  /**
   * Extract audio from video file using FFmpeg
   */
  async extractAudio(videoPath: string): Promise<string> {
    const audioPath = videoPath.replace(/\.\w+$/, '.wav');

    await execFileAsync('ffmpeg', [
      '-i', videoPath,
      '-vn',
      '-acodec', 'pcm_s16le',
      '-ar', '16000',
      '-ac', '1',
      '-y',
      audioPath,
    ]);

    return audioPath;
  }

  /**
   * Transcribe audio using Faster-Whisper API
   */
  async transcribe(audioPath: string, language?: string): Promise<Transcript> {
    const audioBuffer = fs.readFileSync(audioPath);
    const fileName = path.basename(audioPath);

    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer]), fileName);
    formData.append('model', 'large-v3');
    formData.append('response_format', 'verbose_json');

    if (language) {
      formData.append('language', language);
    }

    const response = await fetch(`${this.config.fasterWhisperUrl}/v1/audio/transcriptions`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Whisper API error: ${response.status} ${await response.text()}`);
    }

    const result = await response.json() as WhisperResponse;

    const segments: TranscriptSegment[] = (result.segments || []).map((seg) => ({
      start: seg.start,
      end: seg.end,
      text: seg.text.trim(),
    }));

    return {
      transcript: result.text || segments.map((s) => s.text).join(' '),
      segments,
    };
  }

  /**
   * Full pipeline: download → extract audio → transcribe
   */
  async processUrl(url: string, language?: string): Promise<{
    videoPath: string;
    audioPath: string;
    metadata: VideoMetadata;
    transcript: Transcript;
  }> {
    const { videoPath, metadata } = await this.downloadVideo(url);
    const audioPath = await this.extractAudio(videoPath);
    const transcript = await this.transcribe(audioPath, language);

    return { videoPath, audioPath, metadata, transcript };
  }
}

export interface VideoMetadata {
  id: string;
  title: string;
  description?: string;
  ext?: string;
  duration?: number;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  uploader?: string;
  platform?: string;
}

interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

interface WhisperResponse {
  text: string;
  segments: WhisperSegment[];
}
