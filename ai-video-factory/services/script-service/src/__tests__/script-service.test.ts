import { ScriptService } from '../index';

// Mock Anthropic
const mockClaudeCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => {
  const MockAnthropic = jest.fn().mockImplementation(() => ({
    messages: { create: mockClaudeCreate },
  }));
  return { __esModule: true, default: MockAnthropic };
});

// Mock OpenAI
const mockGPTCreate = jest.fn();
jest.mock('openai', () => {
  const MockOpenAI = jest.fn().mockImplementation(() => ({
    chat: {
      completions: { create: mockGPTCreate },
    },
    embeddings: {
      create: jest.fn().mockResolvedValue({
        data: [{ embedding: new Array(1536).fill(0.1) }],
      }),
    },
  }));
  return { __esModule: true, default: MockOpenAI };
});

// Mock KnowledgeSDK
const mockSearch = jest.fn();
const mockCosineSimilarity = jest.fn();
jest.mock('@ai-video-factory/knowledge-sdk', () => ({
  KnowledgeSDK: jest.fn().mockImplementation(() => ({
    initCollection: jest.fn().mockResolvedValue(undefined),
    search: mockSearch,
    cosineSimilarity: mockCosineSimilarity,
  })),
}));

// Mock prompt-library
jest.mock('@ai-video-factory/prompt-library', () => ({
  preparePrompt: jest.fn().mockReturnValue('mocked prompt'),
}));

const mockScript = {
  title: '测试脚本',
  duration: 60,
  platform: 'douyin',
  scenes: [
    {
      id: 1,
      role: 'Hook',
      emotion: '好奇',
      duration: 3,
      narration: '你知道吗？',
      visual: '震撼画面',
      subtitle: '你知道吗？',
    },
    {
      id: 2,
      role: '痛点',
      emotion: '焦虑',
      duration: 15,
      narration: '很多人都有这个问题',
      visual: '场景画面',
      subtitle: '很多人都有这个问题',
    },
  ],
};

describe('ScriptService', () => {
  let service: ScriptService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ScriptService('claude-key', 'openai-key', 'localhost:19530');
  });

  function mockClaudeResponse(data: unknown) {
    mockClaudeCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(data) }],
    });
  }

  function mockGPTResponse(data: unknown) {
    mockGPTCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(data) } }],
    });
  }

  describe('generateScript', () => {
    it('should complete full pipeline with passing score on first try', async () => {
      // Knowledge search returns patterns
      mockSearch.mockResolvedValue([
        { id: 'p1', score: 0.9, analysis: { structure: { pattern: 'Hook→CTA', hook: { type: 'shock', text: 'test', duration_ratio: 0.05 }, sections: [] }, emotions: { arc: '好奇→行动' }, style: { language: 'colloquial', key_phrases: [], cta_type: 'save' } } },
      ]);

      // Structure rewrite (Claude)
      mockClaudeResponse(mockScript);

      // Semantic transform (GPT-4o) - returns slightly modified script
      const transformedScript = {
        ...mockScript,
        scenes: mockScript.scenes.map((s) => ({
          ...s,
          narration: s.narration + '（改写后）',
          subtitle: s.subtitle + '（改写后）',
        })),
      };
      mockGPTResponse(transformedScript);

      // Quality score (GPT-4o-mini) - high score
      mockGPTResponse({ structure: 8, originality: 8, attractiveness: 8, average: 8 });

      // Cosine similarity < 0.7 = original
      mockCosineSimilarity.mockResolvedValue(0.3);

      const result = await service.generateScript({
        topic: '健康饮食',
        platform: 'douyin',
      });

      expect(result).toBeDefined();
      expect(result.title).toBe('测试脚本');
      expect(result.scenes).toHaveLength(2);
      expect(mockClaudeCreate).toHaveBeenCalledTimes(1); // 1 structure rewrite
    });

    it('should retry with different dimensions when score is below threshold', async () => {
      mockSearch.mockResolvedValue([]);

      // Structure rewrite
      mockClaudeResponse(mockScript);

      // First semantic transform - low score
      mockGPTResponse({ ...mockScript, scenes: mockScript.scenes.map((s) => ({ ...s, narration: 'v1' })) });
      // First quality score - too low
      mockGPTResponse({ structure: 5, originality: 4, attractiveness: 5, average: 4.67 });

      // Second semantic transform - high score
      mockGPTResponse({ ...mockScript, scenes: mockScript.scenes.map((s) => ({ ...s, narration: 'v2' })) });
      // Second quality score - passing
      mockGPTResponse({ structure: 8, originality: 8, attractiveness: 8, average: 8 });

      // Originality check passes
      mockCosineSimilarity.mockResolvedValue(0.3);

      const result = await service.generateScript({
        topic: '运动健身',
        platform: 'youtube',
      });

      expect(result).toBeDefined();
      // Should have called GPT more times (transforms + scores)
      expect(mockGPTCreate.mock.calls.length).toBeGreaterThanOrEqual(4);
    });

    it('should return best script after exhausting retries', async () => {
      mockSearch.mockResolvedValue([]);

      mockClaudeResponse(mockScript);

      // All 3 retries produce low scores
      for (let i = 0; i < 3; i++) {
        mockGPTResponse({ ...mockScript, title: `Attempt ${i}` });
        mockGPTResponse({ structure: 5, originality: 5, attractiveness: 5, average: 5 });
      }

      const result = await service.generateScript({
        topic: '学习技巧',
        platform: 'bilibili',
      });

      expect(result).toBeDefined();
      expect(result.title).toContain('Attempt');
    });
  });
});
