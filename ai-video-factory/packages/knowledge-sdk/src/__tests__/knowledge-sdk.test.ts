import { KnowledgeSDK } from '../knowledge-sdk';

// Mock dependencies
const mockHasCollection = jest.fn().mockResolvedValue({ value: true });
const mockCreateCollection = jest.fn().mockResolvedValue({});
const mockCreateIndex = jest.fn().mockResolvedValue({});
const mockLoadCollection = jest.fn().mockResolvedValue({});
const mockInsert = jest.fn().mockResolvedValue({});
const mockSearch = jest.fn().mockResolvedValue({ results: [] });
const mockDelete = jest.fn().mockResolvedValue({});

jest.mock('@zilliz/milvus2-sdk-node', () => ({
  MilvusClient: jest.fn().mockImplementation(() => ({
    hasCollection: mockHasCollection,
    createCollection: mockCreateCollection,
    createIndex: mockCreateIndex,
    loadCollection: mockLoadCollection,
    insert: mockInsert,
    search: mockSearch,
    delete: mockDelete,
  })),
  DataType: {
    Int64: 'Int64',
    FloatVector: 'FloatVector',
    VarChar: 'VarChar',
  },
}));

jest.mock('openai', () => {
  const mockEmbeddingsCreate = jest.fn().mockResolvedValue({
    data: [{ embedding: new Array(1536).fill(0.1) }],
  });
  const MockOpenAI = jest.fn().mockImplementation(() => ({
    embeddings: { create: mockEmbeddingsCreate },
  }));
  return { __esModule: true, default: MockOpenAI };
});

describe('KnowledgeSDK', () => {
  let sdk: KnowledgeSDK;

  beforeEach(() => {
    jest.clearAllMocks();
    sdk = new KnowledgeSDK('localhost:19530', 'test-api-key');
  });

  const mockAnalysis = {
    id: 'test_001',
    source: {
      platform: 'douyin' as const,
      url: 'https://example.com',
      title: 'Test Video',
      views: 5000000,
    },
    structure: {
      pattern: 'Hook→痛点→方案→CTA',
      hook: { type: 'shock' as const, text: '震惊！', duration_ratio: 0.05 },
      sections: [
        { role: '痛点', duration_ratio: 0.3, emotion: '焦虑' },
        { role: '方案', duration_ratio: 0.5, emotion: '释然' },
      ],
    },
    emotions: {
      arc: '好奇→焦虑→释然',
      intensity: 8,
      triggers: ['0:03 开头'],
    },
    viral_points: {
      triggers: ['resonance' as const, 'utility' as const],
      share_motivation: '帮助别人',
      comment_triggers: ['你觉得呢？'],
    },
    style: {
      language: 'colloquial' as const,
      key_phrases: ['震惊', '快收藏'],
      cta_type: 'save' as const,
    },
  };

  describe('initCollection', () => {
    it('should skip creation if collection already exists', async () => {
      mockHasCollection.mockResolvedValue({ value: true });

      await sdk.initCollection();

      expect(mockCreateCollection).not.toHaveBeenCalled();
    });

    it('should create collection with correct schema if not exists', async () => {
      mockHasCollection.mockResolvedValue({ value: false });

      await sdk.initCollection();

      expect(mockCreateCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          collection_name: 'viral_patterns',
        }),
      );
      expect(mockCreateIndex).toHaveBeenCalled();
      expect(mockLoadCollection).toHaveBeenCalled();
    });
  });

  describe('embed', () => {
    it('should generate embedding vector of correct dimension', async () => {
      const vector = await sdk.embed('test text');

      expect(vector).toHaveLength(1536);
    });
  });

  describe('insert', () => {
    it('should embed text and insert into Milvus with correct fields', async () => {
      await sdk.insert(mockAnalysis);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          collection_name: 'viral_patterns',
          data: expect.arrayContaining([
            expect.objectContaining({
              analysis_id: 'test_001',
              platform: 'douyin',
              views_level: '100w+',
            }),
          ]),
        }),
      );
    });

    it('should classify views_level correctly', async () => {
      // 10M+ views
      const highViews = { ...mockAnalysis, source: { ...mockAnalysis.source, views: 15_000_000 } };
      await sdk.insert(highViews);
      const insertCall = mockInsert.mock.calls[0][0];
      expect(insertCall.data[0].views_level).toBe('1000w+');
    });
  });

  describe('search', () => {
    it('should search with embedding vector and return results', async () => {
      mockSearch.mockResolvedValue({
        results: [
          {
            analysis_id: 'test_001',
            full_analysis: JSON.stringify(mockAnalysis),
            views_level: '100w+',
            score: 0.95,
          },
        ],
      });

      const results = await sdk.search('test query', { topK: 3 });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('test_001');
      // Fusion score: 0.95*0.7 + 0.8*0.3 = 0.665 + 0.24 = 0.905
      expect(results[0].score).toBeCloseTo(0.905, 3);
    });

    it('should build filter from search options', async () => {
      mockSearch.mockResolvedValue({ results: [] });

      await sdk.search('test', {
        platform: 'douyin',
        hookType: 'shock',
      });

      const searchCall = mockSearch.mock.calls[0][0];
      expect(searchCall.filter).toContain('platform == "douyin"');
      expect(searchCall.filter).toContain('hook_type == "shock"');
    });

    it('should return empty array when no results', async () => {
      mockSearch.mockResolvedValue({ results: [] });

      const results = await sdk.search('nonexistent');
      expect(results).toEqual([]);
    });
  });

  describe('cosineSimilarity', () => {
    it('should compute similarity between two texts', async () => {
      // Both embeddings are identical (all 0.1), so similarity should be ~1.0
      const similarity = await sdk.cosineSimilarity('text A', 'text B');
      expect(similarity).toBeCloseTo(1.0, 5);
    });
  });

  describe('delete', () => {
    it('should delete by analysis_id filter', async () => {
      await sdk.delete('test_001');

      expect(mockDelete).toHaveBeenCalledWith({
        collection_name: 'viral_patterns',
        filter: 'analysis_id == "test_001"',
      });
    });
  });

  describe('fusionRank', () => {
    it('should rank higher-view items above lower relevance', async () => {
      mockSearch.mockResolvedValue({
        results: [
          {
            analysis_id: 'low_views',
            full_analysis: JSON.stringify({ ...mockAnalysis, id: 'low' }),
            views_level: '<1w',
            score: 0.95,
          },
          {
            analysis_id: 'high_views',
            full_analysis: JSON.stringify({ ...mockAnalysis, id: 'high' }),
            views_level: '1000w+',
            score: 0.85,
          },
        ],
      });

      const results = await sdk.search('test');

      // high_views fused: 0.85*0.7 + 1.0*0.3 = 0.595 + 0.3 = 0.895
      // low_views fused:  0.95*0.7 + 0.2*0.3 = 0.665 + 0.06 = 0.725
      expect(results[0].id).toBe('high_views');
      expect(results[1].id).toBe('low_views');
    });
  });
});
