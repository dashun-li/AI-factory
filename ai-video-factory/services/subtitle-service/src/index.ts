import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Subtitle, SubtitleEntry, SubtitleFormat } from '@ai-video-factory/shared-types';

export interface SubtitleServiceConfig {
  whisperxUrl: string;
}

export class SubtitleService {
  private config: SubtitleServiceConfig;

  constructor(config: SubtitleServiceConfig) {
    this.config = config;
  }

  /**
   * Align audio with text using WhisperX for word-level timestamps
   */
  async align(
    audioPath: string,
    transcript: string,
    language: string = 'zh',
  ): Promise<SubtitleEntry[]> {
    const audioBuffer = fs.readFileSync(audioPath);

    const formData = new FormData();
    formData.append('audio_file', new Blob([audioBuffer]), path.basename(audioPath));
    formData.append('text', transcript);
    formData.append('language', language);

    const response = await fetch(`${this.config.whisperxUrl}/align`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`WhisperX align error: ${response.status} ${await response.text()}`);
    }

    const result = await response.json() as WhisperXAlignResponse;

    return (result.segments || []).map((seg, index) => ({
      index: index + 1,
      start_time: seg.start,
      end_time: seg.end,
      text: seg.text.trim(),
      speaker: seg.speaker,
    }));
  }

  /**
   * Transcribe with speaker diarization using WhisperX
   */
  async transcribeWithDiarization(
    audioPath: string,
    language: string = 'zh',
    minSpeakers?: number,
    maxSpeakers?: number,
  ): Promise<SubtitleEntry[]> {
    const audioBuffer = fs.readFileSync(audioPath);

    const formData = new FormData();
    formData.append('audio_file', new Blob([audioBuffer]), path.basename(audioPath));
    formData.append('language', language);

    if (minSpeakers) formData.append('min_speakers', String(minSpeakers));
    if (maxSpeakers) formData.append('max_speakers', String(maxSpeakers));

    const response = await fetch(`${this.config.whisperxUrl}/asr`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`WhisperX ASR error: ${response.status}`);
    }

    const result = await response.json() as WhisperXASRResponse;

    return (result.segments || []).map((seg, index) => ({
      index: index + 1,
      start_time: seg.start,
      end_time: seg.end,
      text: seg.text.trim(),
      speaker: seg.speaker,
    }));
  }

  /**
   * Convert subtitle entries to SRT format string
   */
  toSRT(entries: SubtitleEntry[]): string {
    return entries
      .map((entry) => {
        const start = this.formatSRTTime(entry.start_time);
        const end = this.formatSRTTime(entry.end_time);
        return `${entry.index}\n${start} --> ${end}\n${entry.text}\n`;
      })
      .join('\n');
  }

  /**
   * Convert subtitle entries to VTT format string
   */
  toVTT(entries: SubtitleEntry[]): string {
    const lines = entries.map((entry) => {
      const start = this.formatVTTTime(entry.start_time);
      const end = this.formatVTTTime(entry.end_time);
      const speaker = entry.speaker ? `<v ${entry.speaker}>` : '';
      return `${start} --> ${end}\n${speaker}${entry.text}`;
    });
    return 'WEBVTT\n\n' + lines.join('\n\n');
  }

  /**
   * Convert subtitle entries to ASS format string (basic)
   */
  toASS(entries: SubtitleEntry[], style: ASSStyle = {}): string {
    const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${style.fontName || 'Microsoft YaHei'},${style.fontSize || 60},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,10,10,30,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

    const events = entries.map((entry) => {
      const start = this.formatASSTime(entry.start_time);
      const end = this.formatASSTime(entry.end_time);
      return `Dialogue: 0,${start},${end},Default,,0,0,0,,${entry.text}`;
    });

    return header + '\n' + events.join('\n');
  }

  /**
   * Generate subtitle file from entries
   */
  async generateSubtitle(
    entries: SubtitleEntry[],
    format: SubtitleFormat = 'srt',
    outputPath?: string,
  ): Promise<Subtitle> {
    let content: string;

    switch (format) {
      case 'srt':
        content = this.toSRT(entries);
        break;
      case 'vtt':
        content = this.toVTT(entries);
        break;
      case 'ass':
        content = this.toASS(entries);
        break;
      default:
        content = this.toSRT(entries);
    }

    if (outputPath) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, content, 'utf-8');
    }

    return {
      format,
      entries,
      content,
    };
  }

  // ===== Time formatting helpers =====

  private formatSRTTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  }

  private formatVTTTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  }

  private formatASSTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const cs = Math.round((seconds % 1) * 100);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  }
}

interface WhisperXSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

interface WhisperXAlignResponse {
  segments: WhisperXSegment[];
}

interface WhisperXASRResponse {
  segments: WhisperXSegment[];
}

interface ASSStyle {
  fontName?: string;
  fontSize?: number;
}
