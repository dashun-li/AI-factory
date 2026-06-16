import { SubtitleService } from '../index';
import { SubtitleEntry } from '@ai-video-factory/shared-types';

// Mock fetch for WhisperX calls
global.fetch = jest.fn();

describe('SubtitleService', () => {
  let service: SubtitleService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SubtitleService({ whisperxUrl: 'http://localhost:9002' });
  });

  const mockEntries: SubtitleEntry[] = [
    { index: 1, start_time: 0, end_time: 3.5, text: '第一段字幕' },
    { index: 2, start_time: 3.5, end_time: 8.2, text: '第二段字幕' },
    { index: 3, start_time: 8.2, end_time: 12.0, text: '第三段字幕' },
  ];

  describe('toSRT', () => {
    it('should format entries as SRT', () => {
      const result = service.toSRT(mockEntries);

      expect(result).toContain('1\n00:00:00,000 --> 00:00:03,500\n第一段字幕');
      expect(result).toContain('2\n00:00:03,500 --> 00:00:08,200\n第二段字幕');
      expect(result).toContain('3\n00:00:08,200 --> 00:00:12,000\n第三段字幕');
    });

    it('should handle zero start time', () => {
      const entries: SubtitleEntry[] = [
        { index: 1, start_time: 0, end_time: 1.5, text: 'Start' },
      ];
      const result = service.toSRT(entries);
      expect(result).toContain('00:00:00,000');
    });

    it('should handle hours correctly', () => {
      const entries: SubtitleEntry[] = [
        { index: 1, start_time: 3661.5, end_time: 3665.0, text: 'Over an hour' },
      ];
      const result = service.toSRT(entries);
      expect(result).toContain('01:01:01,500 --> 01:01:05,000');
    });
  });

  describe('toVTT', () => {
    it('should format entries as WebVTT', () => {
      const result = service.toVTT(mockEntries);

      expect(result).toContain('WEBVTT');
      expect(result).toContain('00:00:00.000 --> 00:00:03.500\n第一段字幕');
      // VTT uses . instead of ,
      expect(result).not.toMatch(/\d{2}:\d{2}:\d{2},\d{3}/);
    });

    it('should include speaker tags when present', () => {
      const entries: SubtitleEntry[] = [
        { index: 1, start_time: 0, end_time: 3, text: 'Hello', speaker: 'SPEAKER_00' },
      ];
      const result = service.toVTT(entries);
      expect(result).toContain('<v SPEAKER_00>Hello');
    });
  });

  describe('toASS', () => {
    it('should format entries as ASS with header', () => {
      const result = service.toASS(mockEntries);

      expect(result).toContain('[Script Info]');
      expect(result).toContain('[V4+ Styles]');
      expect(result).toContain('[Events]');
      expect(result).toContain('Dialogue: 0,0:00:00.00,0:00:03.50,Default,,0,0,0,,第一段字幕');
    });

    it('should use default font settings', () => {
      const result = service.toASS(mockEntries);
      expect(result).toContain('Microsoft YaHei');
      expect(result).toContain('60');
    });

    it('should accept custom style options', () => {
      const result = service.toASS(mockEntries, { fontName: 'SimHei', fontSize: 48 });
      expect(result).toContain('SimHei');
      expect(result).toContain('48');
    });
  });

  describe('generateSubtitle', () => {
    it('should generate SRT by default', async () => {
      const subtitle = await service.generateSubtitle(mockEntries);

      expect(subtitle.format).toBe('srt');
      expect(subtitle.content).toContain('00:00:00,000');
      expect(subtitle.entries).toEqual(mockEntries);
    });

    it('should generate VTT when requested', async () => {
      const subtitle = await service.generateSubtitle(mockEntries, 'vtt');

      expect(subtitle.format).toBe('vtt');
      expect(subtitle.content).toContain('WEBVTT');
    });

    it('should generate ASS when requested', async () => {
      const subtitle = await service.generateSubtitle(mockEntries, 'ass');

      expect(subtitle.format).toBe('ass');
      expect(subtitle.content).toContain('[Script Info]');
    });
  });

  describe('align', () => {
    it('should call WhisperX align endpoint and return entries', async () => {
      const mockResponse = {
        segments: [
          { start: 0, end: 3.5, text: '第一段' },
          { start: 3.5, end: 8.0, text: '第二段' },
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      // Need a real file for readFileSync - mock it
      const fs = require('fs');
      jest.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('fake audio'));

      const entries = await service.align('/fake/audio.wav', '测试文本', 'zh');

      expect(entries).toHaveLength(2);
      expect(entries[0].text).toBe('第一段');
      expect(entries[0].start_time).toBe(0);
      expect(entries[1].start_time).toBe(3.5);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:9002/align',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should throw on non-OK response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Server error'),
      });

      const fs = require('fs');
      jest.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('fake'));

      await expect(service.align('/fake/audio.wav', 'text')).rejects.toThrow(
        'WhisperX align error: 500',
      );
    });
  });
});
