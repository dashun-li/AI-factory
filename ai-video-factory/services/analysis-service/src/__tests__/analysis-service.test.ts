import { AnalysisService } from '../index';

// Mock Anthropic SDK
const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => {
  const MockAnthropic = jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
  return { __esModule: true, default: MockAnthropic };
});

// Mock prompt-library
jest.mock('@ai-video-factory/prompt-library', () => ({
  preparePrompt: jest.fn().mockReturnValue('mocked prompt'),
}));

// Mock db package — insertAnalysis + DbClient type
jest.mock('@ai-video-factory/db', () => ({
  insertAnalysis: jest.fn().mockResolvedValue({ id: 'row-1' }),
}));
const mockInsertAnalysis = require('@ai-video-factory/db').insertAnalysis as jest.Mock;

const mockStructureResult = {
  pattern: 'Hook→痛点→方案→CTA',
  hook: { type: 'shock', text: '震惊！99%不知道', duration_ratio: 0.05 },
  sections: [
    { role: '痛点', duration_ratio: 0.3, emotion: '焦虑' },
    { role: '方案', duration_ratio: 0.5, emotion: '释然' },
    { role: 'CTA', duration_ratio: 0.15, emotion: '行动' },
  ],
};

const mockEmotionResult = {
  arc: '好奇→焦虑→释然→行动',
  intensity: 8,
  triggers: ['0:03 开头', '0:15 痛点'],
};

const mockViralResult = {
  viral_points: {
    triggers: ['resonance', 'utility'],
    share_motivation: '帮助别人',
    comment_triggers: ['你中了吗？'],
  },
  style: {
    language: 'colloquial',
    key_phrases: ['震惊', '快收藏'],
    cta_type: 'save',
  },
};

describe('AnalysisService', () => {
  let service: AnalysisService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AnalysisService('test-api-key');
  });

  function mockLLMResponse(data: unknown) {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(data) }],
    });
  }

  describe('analyze', () => {
    it('should run 3-round pipeline and return complete AnalysisResult', async () => {
      mockLLMResponse(mockStructureResult);   // Round 1
      mockLLMResponse(mockEmotionResult);     // Round 2
      mockLLMResponse(mockViralResult);       // Round 3

      const result = await service.analyze({
        platform: 'douyin',
        title: 'Test Video',
        views: 1000000,
        url: 'https://example.com/video',
        transcript: '这是测试转写文本...',
      });

      // Verify 3 LLM calls
      expect(mockCreate).toHaveBeenCalledTimes(3);

      // Verify structure
      expect(result.id).toMatch(/^analysis_\d+$/);
      expect(result.source.platform).toBe('douyin');
      expect(result.source.title).toBe('Test Video');
      expect(result.source.views).toBe(1000000);

      // Verify analysis results
      expect(result.structure.pattern).toBe('Hook→痛点→方案→CTA');
      expect(result.emotions.intensity).toBe(8);
      expect(result.viral_points.triggers).toEqual(['resonance', 'utility']);
      expect(result.style.language).toBe('colloquial');
    });

    it('should pass correct model config to Claude', async () => {
      mockLLMResponse(mockStructureResult);
      mockLLMResponse(mockEmotionResult);
      mockLLMResponse(mockViralResult);

      await service.analyze({
        platform: 'youtube',
        title: 'Test',
        views: 100,
        url: 'https://youtube.com/test',
        transcript: 'text',
      });

      for (const call of mockCreate.mock.calls) {
        expect(call[0].model).toBe('claude-sonnet-4-20250514');
        expect(call[0].max_tokens).toBe(4096);
      }
    });

    it('should throw if LLM returns non-text content', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'image', data: 'binary' }],
      });

      await expect(
        service.analyze({
          platform: 'douyin',
          title: 'T',
          views: 0,
          url: '',
          transcript: 't',
        }),
      ).rejects.toThrow('Unexpected response type from LLM');
    });

    it('should throw if LLM returns invalid JSON', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'not valid json' }],
      });

      await expect(
        service.analyze({
          platform: 'douyin',
          title: 'T',
          views: 0,
          url: '',
          transcript: 't',
        }),
      ).rejects.toThrow();
    });

    it('should call prompts with correct type for each round', async () => {
      mockLLMResponse(mockStructureResult);
      mockLLMResponse(mockEmotionResult);
      mockLLMResponse(mockViralResult);

      const { preparePrompt } = require('@ai-video-factory/prompt-library');

      await service.analyze({
        platform: 'douyin',
        title: 'Test',
        views: 0,
        url: '',
        transcript: 'text',
      });

      const promptCalls = preparePrompt.mock.calls;
      expect(promptCalls[0][0]).toBe('analysis');
      expect(promptCalls[0][1]).toBe('structure');
      expect(promptCalls[1][0]).toBe('analysis');
      expect(promptCalls[1][1]).toBe('emotion');
      expect(promptCalls[2][0]).toBe('analysis');
      expect(promptCalls[2][1]).toBe('viral');
    });
  });

  describe('analyze with persistence', () => {
    function mockAllRounds() {
      mockLLMResponse(mockStructureResult);
      mockLLMResponse(mockEmotionResult);
      mockLLMResponse(mockViralResult);
    }

    it('should skip persistence when no options.persist given', async () => {
      mockAllRounds();
      await service.analyze({
        platform: 'douyin',
        title: 'T', views: 0, url: '', transcript: 't',
      });
      expect(mockInsertAnalysis).not.toHaveBeenCalled();
    });

    it('should insert into DB with flat fields when persist.db given', async () => {
      mockAllRounds();
      const fakeDb = {} as never;
      await service.analyze(
        {
          platform: 'douyin',
          title: 'T', views: 1000, url: 'https://x.com', transcript: 't',
        },
        { persist: { db: fakeDb, workflowId: 'wf-123' } },
      );

      expect(mockInsertAnalysis).toHaveBeenCalledTimes(1);
      const args = mockInsertAnalysis.mock.calls[0];
      expect(args[0]).toBe(fakeDb);
      expect(args[1].workflowId).toBe('wf-123');
      expect(args[1].sourcePlatform).toBe('douyin');
      expect(args[1].sourceUrl).toBe('https://x.com');
      expect(args[1].sourceViews).toBe(1000);
      expect(args[1].structurePattern).toBe('Hook→痛点→方案→CTA');
      expect(args[1].hookType).toBe('shock');
      expect(args[1].emotionArc).toBe('好奇→焦虑→释然→行动');
      expect(args[1].emotionIntensity).toBe(8);
      expect(args[1].viralTriggers).toBe('resonance,utility');
      expect(args[1].shareMotivation).toBe('帮助别人');
      expect(args[1].languageStyle).toBe('colloquial');
      expect(args[1].keyPhrases).toBe('震惊,快收藏');
      expect(args[1].ctaType).toBe('save');
      expect(args[1].fullAnalysis).toBeDefined();
    });

    it('should call knowledge.insert when persist.knowledge given', async () => {
      mockAllRounds();
      const mockKnowledgeInsert = jest.fn().mockResolvedValue(undefined);
      await service.analyze(
        {
          platform: 'douyin',
          title: 'T', views: 0, url: '', transcript: 't',
        },
        { persist: { knowledge: { insert: mockKnowledgeInsert } } },
      );

      expect(mockKnowledgeInsert).toHaveBeenCalledTimes(1);
      const inserted = mockKnowledgeInsert.mock.calls[0][0];
      expect(inserted.structure.pattern).toBe('Hook→痛点→方案→CTA');
      expect(inserted.viral_points.triggers).toEqual(['resonance', 'utility']);
    });

    it('should persist to both DB and knowledge when both given', async () => {
      mockAllRounds();
      const mockKnowledgeInsert = jest.fn().mockResolvedValue(undefined);
      await service.analyze(
        {
          platform: 'douyin',
          title: 'T', views: 5, url: 'u', transcript: 't',
        },
        {
          persist: {
            db: {} as never,
            workflowId: 'wf-456',
            knowledge: { insert: mockKnowledgeInsert },
          },
        },
      );

      expect(mockInsertAnalysis).toHaveBeenCalled();
      expect(mockKnowledgeInsert).toHaveBeenCalled();
    });
  });
});
