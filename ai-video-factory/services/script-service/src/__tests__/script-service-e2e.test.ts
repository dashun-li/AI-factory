/**
 * End-to-end test suite for ScriptService.
 *
 * Covers the full rewrite pipeline across multiple platforms, edge cases
 * (no patterns, repeated low scores, originality failures), and the public
 * API contract: platforms, scene shapes, retry budget.
 */

// ===== Mock setup =====

const mockClaudeCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => {
  const MockAnthropic = jest.fn().mockImplementation(() => ({
    messages: { create: mockClaudeCreate },
  }));
  return { __esModule: true, default: MockAnthropic };
});

const mockGPTCreate = jest.fn();
jest.mock('openai', () => {
  const MockOpenAI = jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockGPTCreate } },
    embeddings: {
      create: jest.fn().mockResolvedValue({
        data: [{ embedding: new Array(1536).fill(0.1) }],
      }),
    },
  }));
  return { __esModule: true, default: MockOpenAI };
});

const mockSearch = jest.fn();
const mockCosineSimilarity = jest.fn();
const mockPreparePrompt = jest.fn();
jest.mock('@ai-video-factory/knowledge-sdk', () => ({
  KnowledgeSDK: jest.fn().mockImplementation(() => ({
    initCollection: jest.fn().mockResolvedValue(undefined),
    search: mockSearch,
    cosineSimilarity: mockCosineSimilarity,
  })),
}));

jest.mock('@ai-video-factory/prompt-library', () => ({
  preparePrompt: mockPreparePrompt,
}));

mockPreparePrompt.mockImplementation((category: string, name: string) =>
  `mocked:${category}:${name}`,
);

import { ScriptService } from '../index';
import type { Platform, Script } from '@ai-video-factory/shared-types';

// ===== Helpers =====

function makeMockScript(overrides: Partial<Script> = {}): Script {
  return {
    title: '测试脚本',
    duration: 30,
    platform: 'douyin',
    scenes: [
      {
        id: 1,
        role: 'hook',
        emotion: 'curiosity',
        duration: 3,
        narration: '开场白',
        visual: '紫渐变',
        subtitle: '你看到这个会停下来吗？',
      },
      {
        id: 2,
        role: 'body',
        emotion: 'surprise',
        duration: 20,
        narration: '核心内容',
        visual: '蓝渐变',
        subtitle: '关键信息',
      },
      {
        id: 3,
        role: 'cta',
        emotion: 'action',
        duration: 7,
        narration: '关注我',
        visual: '绿渐变',
        subtitle: '关注我',
      },
    ],
    ...overrides,
  };
}

function mockClaude(text: string) {
  mockClaudeCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text }],
  });
}

function mockClaudeJson(data: unknown) {
  mockClaude(JSON.stringify(data));
}

function mockGPT(text: string) {
  mockGPTCreate.mockResolvedValueOnce({
    choices: [{ message: { content: text } }],
  });
}

function mockGPTJson(data: unknown) {
  mockGPT(JSON.stringify(data));
}

function highScore() {
  return { structure: 8, originality: 8, attractiveness: 8, average: 8 };
}

function lowScore() {
  return { structure: 5, originality: 5, attractiveness: 5, average: 5 };
}

// ===== Tests =====

describe('ScriptService e2e', () => {
  let service: ScriptService;

  beforeEach(() => {
    // Clear call history AND any queued mockResolvedValueOnce from previous tests.
    // mockReset() is needed because clearAllMocks() doesn't drop queued returns.
    mockClaudeCreate.mockReset();
    mockGPTCreate.mockReset();
    mockSearch.mockReset();
    mockCosineSimilarity.mockReset();
    mockPreparePrompt.mockReset();
    // Re-establish the default returns
    mockPreparePrompt.mockImplementation((category: string, name: string) =>
      `mocked:${category}:${name}`,
    );
    mockSearch.mockResolvedValue([]);
    mockCosineSimilarity.mockResolvedValue(0.3);
    service = new ScriptService('claude-key', 'openai-key', 'localhost:19530');
  });

  // -------- happy path --------

  it('returns a high-quality, original script on first attempt', async () => {
    mockClaudeJson(makeMockScript());
    mockGPTJson(makeMockScript({ title: '改写后' }));
    mockGPTJson(highScore());

    const result = await service.generateScript({
      topic: '健康饮食',
      platform: 'douyin',
    });

    expect(result.title).toBe('改写后');
    expect(result.scenes).toHaveLength(3);
    expect(result.platform).toBe('douyin');
    expect(mockClaudeCreate).toHaveBeenCalledTimes(1);
    // transform + score = 2 GPT calls
    expect(mockGPTCreate).toHaveBeenCalledTimes(2);
  });

  it('respects platform filter in knowledge search', async () => {
    mockSearch.mockResolvedValue([]);
    mockClaudeJson(makeMockScript({ platform: 'bilibili' }));
    mockGPTJson(makeMockScript({ platform: 'bilibili' }));
    mockGPTJson(highScore());

    await service.generateScript({ topic: 'AI 工具', platform: 'bilibili' });

    expect(mockSearch).toHaveBeenCalledWith('AI 工具', expect.objectContaining({ platform: 'bilibili' }));
  });

  // -------- all platforms --------

  const platforms: Platform[] = [
    'douyin',
    'kuaishou',
    'xiaohongshu',
    'bilibili',
    'weibo',
    'youtube',
    'tiktok',
  ];

  it.each(platforms)('handles platform=%s end-to-end', async (platform) => {
    mockSearch.mockResolvedValue([]);
    mockClaudeJson(makeMockScript({ platform }));
    mockGPTJson(makeMockScript({ platform, title: `${platform}版` }));
    mockGPTJson(highScore());

    const result = await service.generateScript({ topic: `topic for ${platform}`, platform });

    expect(result.platform).toBe(platform);
    expect(result.title).toBe(`${platform}版`);
  });

  // -------- retry path --------

  it('retries when quality score is below threshold', async () => {
    mockClaudeJson(makeMockScript());
    // Attempt 1: low score
    mockGPTJson(makeMockScript({ title: 'v1' }));
    mockGPTJson(lowScore());
    // Attempt 2: passing score + original
    mockGPTJson(makeMockScript({ title: 'v2' }));
    mockGPTJson(highScore());

    const result = await service.generateScript({ topic: '运动', platform: 'douyin' });

    expect(result.title).toBe('v2');
    // 2 transforms + 2 scores = 4 GPT calls
    expect(mockGPTCreate).toHaveBeenCalledTimes(4);
  });

  it('retries when originality check fails', async () => {
    mockClaudeJson(makeMockScript());
    // Knowledge search: first call (in RAG step) returns no patterns,
    // subsequent calls (during originality check) return one pattern.
    mockSearch
      .mockResolvedValueOnce([]) // RAG step at start
      .mockResolvedValue([
        // Subsequent search() calls (inside checkOriginality) return a pattern
        {
          id: 'p1',
          score: 0.9,
          analysis: {
            structure: {
              pattern: 'listicle',
              hook: { type: 'question', text: 'test hook', duration_ratio: 0.1 },
              sections: [],
            },
            emotions: { arc: 'curiosity' },
            style: { language: 'colloquial', key_phrases: ['key1'], cta_type: 'save' },
          },
        },
      ]);
    mockCosineSimilarity
      .mockResolvedValueOnce(0.9) // attempt 1: too similar → retry
      .mockResolvedValueOnce(0.3); // attempt 2: original → return

    // Attempt 1
    mockGPTJson(makeMockScript({ title: 'v1' }));
    mockGPTJson(highScore());
    // Attempt 2
    mockGPTJson(makeMockScript({ title: 'v2' }));
    mockGPTJson(highScore());

    const result = await service.generateScript({ topic: '副业', platform: 'douyin' });

    expect(result.title).toBe('v2');
  });

  it('returns the best-scoring script after exhausting all retries', async () => {
    mockClaudeJson(makeMockScript());
    // All 3 attempts: ascending scores so the last one wins as best
    mockGPTJson(makeMockScript({ title: 'low' }));
    mockGPTJson({ ...lowScore(), average: 4.5 });
    mockGPTJson(makeMockScript({ title: 'mid' }));
    mockGPTJson({ ...lowScore(), average: 5.5 });
    mockGPTJson(makeMockScript({ title: 'high' }));
    mockGPTJson({ ...lowScore(), average: 6.5 });

    const result = await service.generateScript({ topic: '学习', platform: 'youtube' });

    // Best of the three is the last one (avg 6.5)
    expect(result.title).toBe('high');
  });

  // -------- knowledge search --------

  it('uses viral patterns from knowledge base in structure rewrite prompt', async () => {
    const viralPatterns = [
      {
        id: 'p1',
        score: 0.92,
        analysis: {
          structure: {
            pattern: 'pain_point + solution',
            hook: { type: 'pain_point', text: '90%都不知道', duration_ratio: 0.1 },
            sections: [],
          },
          emotions: { arc: 'curiosity → relief' },
          style: { language: 'colloquial', key_phrases: ['90%'], cta_type: 'save' },
        },
      },
      {
        id: 'p2',
        score: 0.85,
        analysis: {
          structure: {
            pattern: 'story arc',
            hook: { type: 'story', text: '他曾经...', duration_ratio: 0.12 },
            sections: [],
          },
          emotions: { arc: 'empathy → inspiration' },
          style: { language: 'emotional', key_phrases: ['逆袭'], cta_type: 'like' },
        },
      },
    ];
    mockSearch.mockResolvedValue(viralPatterns);

    mockClaudeJson(makeMockScript());
    mockGPTJson(makeMockScript({ title: '基于模式生成' }));
    mockGPTJson(highScore());

    await service.generateScript({ topic: '健身', platform: 'douyin' });

    // preparePrompt should be called with the serialized patterns
    expect(mockPreparePrompt).toHaveBeenCalledWith(
      'rewrite',
      'structure-rewrite',
      expect.objectContaining({
        topic: '健身',
        platform: 'douyin',
        viral_patterns: expect.stringContaining('pain_point + solution'),
      }),
    );
  });

  it('handles empty knowledge base gracefully', async () => {
    mockSearch.mockResolvedValue([]);
    mockClaudeJson(makeMockScript());
    mockGPTJson(makeMockScript({ title: '无参考' }));
    mockGPTJson(highScore());

    const result = await service.generateScript({ topic: '通用主题', platform: 'kuaishou' });

    expect(result.title).toBe('无参考');
  });

  // -------- output validation --------

  it('preserves scene count and structure from Claude draft', async () => {
    const draft = makeMockScript();
    mockClaudeJson(draft);
    mockGPTJson(draft);
    mockGPTJson(highScore());

    const result = await service.generateScript({ topic: '测试', platform: 'tiktok' });

    expect(result.scenes).toHaveLength(3);
    expect(result.scenes[0].role).toBe('hook');
    expect(result.scenes[1].role).toBe('body');
    expect(result.scenes[2].role).toBe('cta');
  });

  it('respects MAX_RETRIES=3 budget', async () => {
    mockClaudeJson(makeMockScript());
    for (let i = 0; i < 3; i++) {
      mockGPTJson(makeMockScript({ title: `r${i}` }));
      mockGPTJson(lowScore());
    }

    await service.generateScript({ topic: 't', platform: 'weibo' });

    // 3 transforms + 3 scores = 6 GPT calls, no more
    expect(mockGPTCreate).toHaveBeenCalledTimes(6);
  });

  it('uses different transform dimensions across retries', async () => {
    mockClaudeJson(makeMockScript());
    for (let i = 0; i < 3; i++) {
      mockGPTJson(makeMockScript({ title: `r${i}` }));
      mockGPTJson(lowScore());
    }

    await service.generateScript({ topic: 't', platform: 'douyin' });

    // Find the three transform calls (script + transform_dimensions)
    const transformCalls = mockPreparePrompt.mock.calls.filter(
      (c) => c[0] === 'rewrite' && c[1] === 'semantic-rewrite',
    );
    expect(transformCalls).toHaveLength(3);

    const dims = transformCalls.map((c) => c[2].transform_dimensions);
    expect(new Set(dims).size).toBeGreaterThanOrEqual(2); // at least 2 different
  });

  // -------- failure modes --------

  it('throws when Claude returns invalid JSON', async () => {
    mockClaude('not valid json {{');
    await expect(
      service.generateScript({ topic: 't', platform: 'douyin' }),
    ).rejects.toThrow();
  });

  it('propagates JSON parse errors when LLM returns malformed output', async () => {
    mockClaudeJson(makeMockScript());
    // First transform: malformed JSON → propagates out of generateScript
    mockGPT('not valid json {{');

    await expect(
      service.generateScript({ topic: 't', platform: 'douyin' }),
    ).rejects.toThrow();
  });
});
