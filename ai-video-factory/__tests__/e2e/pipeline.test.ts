/**
 * End-to-end integration test for the full pipeline.
 * All external services (LLM, Milvus, FFmpeg, etc.) are mocked.
 * Tests that the pipeline flows correctly from trend → render with proper state transitions.
 */

// ===== Mock all external dependencies =====

// Anthropic SDK
const mockAnthropicCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => {
  const MockAnthropic = jest.fn().mockImplementation(() => ({
    messages: { create: mockAnthropicCreate },
  }));
  return { __esModule: true, default: MockAnthropic };
});

// OpenAI SDK
const mockOpenAICreate = jest.fn();
const mockOpenAIEmbed = jest.fn();
jest.mock('openai', () => {
  const MockOpenAI = jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockOpenAICreate } },
    embeddings: { create: mockOpenAIEmbed },
  }));
  return { __esModule: true, default: MockOpenAI };
});

// Milvus SDK
const mockMilvusInsert = jest.fn();
const mockMilvusSearch = jest.fn();
const mockMilvusDelete = jest.fn();
const mockMilvusLoad = jest.fn();
const mockMilvusCreate = jest.fn();
const mockMilvusIndex = jest.fn();
jest.mock('@zilliz/milvus2-sdk-node', () => ({
  __esModule: true,
  MilvusClient: jest.fn().mockImplementation(() => ({
    createCollection: mockMilvusCreate.mockResolvedValue({}),
    createIndex: mockMilvusIndex.mockResolvedValue({}),
    loadCollection: mockMilvusLoad.mockResolvedValue({}),
    hasCollection: jest.fn().mockResolvedValue({ value: false }),
    insert: mockMilvusInsert.mockResolvedValue({ succ_count: 1 }),
    search: mockMilvusSearch.mockResolvedValue({ results: [] }),
    delete: mockMilvusDelete.mockResolvedValue({}),
  })),
}));

// MinIO SDK
jest.mock('minio', () => ({
  __esModule: true,
  Client: jest.fn().mockImplementation(() => ({
    bucketExists: jest.fn().mockResolvedValue(true),
    makeBucket: jest.fn().mockResolvedValue(undefined),
    fPutObject: jest.fn().mockResolvedValue({}),
    presignedGetObject: jest.fn().mockResolvedValue('http://minio:9000/bucket/file'),
    removeObject: jest.fn().mockResolvedValue(undefined),
    listObjects: jest.fn().mockReturnValue({
      on: jest.fn(),
      destroy: jest.fn(),
    }),
  })),
}));

// pg
jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: jest.fn(),
    end: jest.fn().mockResolvedValue(undefined),
  })),
}));

// child_process (for FFmpeg, yt-dlp, edge-tts)
const mockExecFile = jest.fn();
jest.mock('util', () => {
  const actual = jest.requireActual('util');
  return { ...actual, promisify: (fn: any) => fn };
});
jest.mock('child_process', () => ({
  execFile: mockExecFile,
}));

// fs — allow writeFileSync for subtitle output but mock others
jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    readFileSync: jest.fn((filePath: string) => {
      // Return a valid prompt template for prompt-library loads
      if (typeof filePath === 'string' && filePath.endsWith('.md')) {
        return '{{platform}} {{title}} {{views}} {{transcript}} {{structure_analysis}} {{emotion_analysis}} {{script}} {{transform_dimensions}} {{viral_patterns}} {{topic}}';
      }
      return Buffer.from('fake-audio-data');
    }),
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
    statSync: jest.fn(() => ({ size: 1024 })),
    existsSync: jest.fn(() => false),
  };
});

// global.fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// ===== Import services =====
import { AnalysisService } from '@ai-video-factory/analysis-service';
import { ScriptService } from '@ai-video-factory/script-service';
import { ContentService } from '@ai-video-factory/content-service';
import { MediaService } from '@ai-video-factory/media-service';
import { SubtitleService } from '@ai-video-factory/subtitle-service';
import { RenderService } from '@ai-video-factory/render-service';
import { TrendService } from '@ai-video-factory/trend-service';
import { KnowledgeSDK } from '@ai-video-factory/knowledge-sdk';
import type { AnalysisResult, Script, Subtitle } from '@ai-video-factory/shared-types';

// Helper: configure mock responses for each pipeline step
function setupPipelineMocks() {
  // Step 1: Trend / Content / Media / Render — execFile (promisified, returns { stdout })
  mockExecFile.mockImplementation((_cmd: string, args: string[]) => {
    const argStr = args.join(' ');
    if (argStr.includes('--dump-json') || argStr.includes('--print')) {
      return Promise.resolve({
        stdout: JSON.stringify({
          id: 'test123',
          title: '爆款测试视频标题',
          view_count: 500000,
          uploader: 'test_user',
          webpage_url: 'https://www.douyin.com/video/test123',
          ext: 'mp4',
        }),
      });
    }
    // ffmpeg, edge-tts, npx remotion — just succeed
    return Promise.resolve({ stdout: '' });
  });

  // Step 2: Content — Whisper transcription + WhisperX align
  mockFetch.mockImplementation((url: string) => {
    const urlStr = url.toString();
    if (urlStr.includes('faster-whisper') || (urlStr.includes('whisper') && urlStr.includes('transcriptions'))) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          text: '完整转写文本',
          segments: [
            { start: 0, end: 5, text: '这是第一段' },
            { start: 5, end: 10, text: '这是第二段' },
          ],
        }),
      });
    }
    if (urlStr.includes('whisperx') && urlStr.includes('/align')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          segments: [
            { start: 0, end: 5, text: '这是第一段', speaker: 'SPEAKER_00' },
            { start: 5, end: 10, text: '这是第二段', speaker: 'SPEAKER_00' },
          ],
        }),
      });
    }
    if (urlStr.includes('fal.run') || urlStr.includes('fal.ai')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          images: [{ url: 'https://fal.ai/generated-image.png' }],
        }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });

  // Step 3: Analysis — 3-round Claude responses
  mockAnthropicCreate
    .mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({
        pattern: '问题引入→案例展示→解决方案',
        hook: { type: 'question', text: '你是否也有这个问题？', duration_ratio: 0.1 },
        sections: [
          { role: 'problem', duration_ratio: 0.3, emotion: 'curiosity' },
          { role: 'solution', duration_ratio: 0.5, emotion: 'satisfaction' },
        ],
      }) }],
    })
    .mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({
        arc: 'curiosity→surprise→satisfaction',
        intensity: 8,
        triggers: ['relatable', 'unexpected'],
      }) }],
    })
    .mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({
        viral_points: {
          triggers: ['resonance', 'novelty'],
          share_motivation: 'helpful',
          comment_triggers: ['agree', 'disagree'],
        },
        style: {
          language: 'colloquial' as const,
          key_phrases: ['你不知道的', '关键点'],
          cta_type: 'save' as const,
        },
      }) }],
    })
    // Additional calls for script rewrite (structure-rewrite)
    .mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({
        title: '改写后的脚本',
        duration: 30,
        platform: 'douyin',
        scenes: [
          { id: 1, role: 'hook', emotion: 'curiosity', duration: 10, narration: '开场白', visual: '一个年轻人在思考', subtitle: '你有没有想过这个问题？' },
          { id: 2, role: 'body', emotion: 'surprise', duration: 10, narration: '核心内容', visual: '展示解决方案', subtitle: '关键在这里' },
          { id: 3, role: 'cta', emotion: 'action', duration: 10, narration: '总结CTA', visual: '行动号召画面', subtitle: '关注我了解更多' },
        ],
      }) }],
    });

  // Step 4: Script — GPT-4o semantic transform + scoring
  mockOpenAICreate
    .mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({
        title: '语义变换后的脚本',
        duration: 30,
        platform: 'douyin',
        scenes: [
          { id: 1, role: 'hook', emotion: 'curiosity', duration: 10, narration: '全新开场白', visual: '创意画面', subtitle: '全新开头' },
          { id: 2, role: 'body', emotion: 'surprise', duration: 10, narration: '全新核心内容', visual: '解决方案展示', subtitle: '核心内容' },
          { id: 3, role: 'cta', emotion: 'action', duration: 10, narration: '全新总结', visual: 'CTA画面', subtitle: '总结' },
        ],
      }) } }],
    })
    .mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({
        structure: 8, originality: 9, attractiveness: 8, average: 8.3,
      }) } }],
    });

  // Embeddings
  mockOpenAIEmbed.mockResolvedValue({
    data: [{ embedding: new Array(1536).fill(0.1) }],
  });

  // Milvus search returns empty (no similar patterns → high originality)
  mockMilvusSearch.mockResolvedValue({ results: [] });
}

describe('End-to-End Pipeline', () => {
  let analysisService: AnalysisService;
  let scriptService: ScriptService;
  let contentService: ContentService;
  let mediaService: MediaService;
  let subtitleService: SubtitleService;
  let renderService: RenderService;
  let trendService: TrendService;
  let knowledgeSDK: KnowledgeSDK;

  beforeEach(() => {
    jest.clearAllMocks();
    setupPipelineMocks();

    analysisService = new AnalysisService('test-key');
    scriptService = new ScriptService('test-key', 'test-key', 'localhost:19530');
    contentService = new ContentService({ fasterWhisperUrl: 'http://localhost:9001' });
    mediaService = new MediaService({ falApiKey: 'test-fal-key' });
    subtitleService = new SubtitleService({ whisperxUrl: 'http://localhost:9002' });
    renderService = new RenderService();
    trendService = new TrendService();
    knowledgeSDK = new KnowledgeSDK('localhost:19530', 'test-key');
  });

  it('should complete full pipeline: trend → content → analysis → script → media → voice → subtitle → render', async () => {
    // Step 1: Trend discovery
    const trendResult = await trendService.fetchVideoMetadata('https://www.douyin.com/video/test123');
    expect(trendResult.title).toBeDefined();
    expect(trendResult.platform).toBe('douyin');

    // Step 2: Content extraction (download → extract audio → transcribe)
    const contentResult = await contentService.processUrl('https://www.douyin.com/video/test123');
    expect(contentResult.transcript).toBeDefined();
    expect(contentResult.transcript.transcript).toBeDefined();
    expect(contentResult.transcript.segments).toBeDefined();

    // Step 3: Analysis (3-round)
    const analysisResult = await analysisService.analyze({
      platform: 'douyin',
      title: trendResult.title,
      views: 500000,
      url: 'https://www.douyin.com/video/test123',
      transcript: contentResult.transcript.transcript,
    });
    expect(analysisResult).toBeDefined();
    expect(analysisResult.structure).toBeDefined();
    expect(analysisResult.emotions).toBeDefined();
    expect(analysisResult.viral_points).toBeDefined();

    // Step 3b: Insert into knowledge base
    await knowledgeSDK.insert(analysisResult);
    expect(mockMilvusInsert).toHaveBeenCalled();

    // Step 4: Script generation (knowledge search → rewrite → transform → score)
    const script = await scriptService.generateScript({
      topic: trendResult.title,
      platform: 'douyin',
    });
    expect(script).toBeDefined();
    expect(script.scenes).toBeDefined();
    expect(script.scenes.length).toBeGreaterThan(0);

    // Step 5: Media generation — image via fal.ai
    const imageAsset = await mediaService.generateImage('创意画面');
    expect(imageAsset).toBeDefined();
    expect(imageAsset.url).toBeDefined();

    // Step 6: TTS voice — edge-tts
    const ttsResult = await mediaService.generateTTS('这是配音内容');
    expect(ttsResult).toBeDefined();
    expect(ttsResult.audio_url).toBeDefined();

    // Step 7: Subtitles — generate subtitle from entries
    const subtitleOutput = await subtitleService.generateSubtitle(
      [
        { index: 1, start_time: 0, end_time: 10, text: '开场白' },
        { index: 2, start_time: 10, end_time: 20, text: '核心内容' },
        { index: 3, start_time: 20, end_time: 30, text: '总结CTA' },
      ],
      'srt',
    );
    expect(subtitleOutput).toBeDefined();
    expect(subtitleOutput.format).toBe('srt');
    expect(subtitleOutput.content).toContain('1');
    expect(subtitleOutput.entries).toHaveLength(3);

    // Step 8: Render — full video with script, audio, subtitle
    const videoResult = await renderService.renderFullVideo({
      script,
      audioPath: ttsResult.audio_url,
      subtitle: subtitleOutput,
    });
    expect(videoResult).toBeDefined();
    expect(videoResult.video_url).toBeDefined();
    expect(videoResult.resolution).toBeDefined();

    // Verify the full pipeline executed
    expect(mockExecFile).toHaveBeenCalled(); // yt-dlp, ffmpeg, edge-tts
    expect(mockAnthropicCreate).toHaveBeenCalled(); // Claude analysis + rewrite
    expect(mockOpenAICreate).toHaveBeenCalled(); // GPT-4o transform + scoring
    expect(mockMilvusInsert).toHaveBeenCalled(); // Knowledge base insert
  }, 30000);

  it('should handle pipeline failure gracefully at analysis step', async () => {
    // Reset mock and make Claude fail on first call
    mockAnthropicCreate.mockReset();
    mockAnthropicCreate.mockRejectedValueOnce(new Error('API rate limit exceeded'));

    await expect(
      analysisService.analyze({
        platform: 'douyin',
        title: '测试',
        views: 100,
        url: 'https://example.com',
        transcript: '测试内容',
      }),
    ).rejects.toThrow('API rate limit exceeded');
  });
});
