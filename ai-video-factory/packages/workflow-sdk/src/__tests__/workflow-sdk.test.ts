import { createWorkflow, createInitialWorkflowState } from '../index';
import type { AgentHandlers } from '../index';

// Mock @langchain/langgraph
const mockCompiledGraph = {
  invoke: jest.fn(),
};

const mockAddNode = jest.fn().mockReturnThis();
const mockAddEdge = jest.fn().mockReturnThis();

jest.mock('@langchain/langgraph', () => ({
  StateGraph: jest.fn().mockImplementation(() => ({
    addNode: mockAddNode,
    addEdge: mockAddEdge,
    compile: jest.fn().mockReturnValue(mockCompiledGraph),
  })),
  Annotation: {
    Root: (schema: any) => schema,
  },
  START: '__start__',
  END: '__end__',
}));

describe('workflow-sdk', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createMockHandlers = (): AgentHandlers => ({
    trendAgent: jest.fn().mockResolvedValue({ trendResult: { title: 'Trend', platform: 'douyin', url: 'https://test.com', views: 0, likes: 0, comments: 0 } }),
    contentAgent: jest.fn().mockResolvedValue({ transcript: { transcript: 'text', segments: [] } }),
    analysisAgent: jest.fn().mockResolvedValue({ analysis: { id: 'a1', source: { platform: 'douyin', url: '', title: '', views: 0 }, structure: { pattern: '', hook: { type: 'shock', text: '', duration_ratio: 0 }, sections: [] }, emotions: { arc: '', intensity: 0, triggers: [] }, viral_points: { triggers: [], share_motivation: '', comment_triggers: [] }, style: { language: 'colloquial', key_phrases: [], cta_type: 'save' } } }),
    scriptAgent: jest.fn().mockResolvedValue({ script: { title: 'Script', duration: 60, platform: 'douyin', scenes: [] } }),
    mediaAgent: jest.fn().mockResolvedValue({ mediaAssets: [] }),
    voiceAgent: jest.fn().mockResolvedValue({ ttsAudio: { audio_url: '/tmp/tts.mp3', duration: 10, voice: 'test', text: 'test' } }),
    subtitleAgent: jest.fn().mockResolvedValue({ subtitle: { format: 'srt', entries: [], content: '' } }),
    renderAgent: jest.fn().mockResolvedValue({ renderOutput: { video_url: '/tmp/video.mp4', duration: 60, resolution: '1080x1920', file_size: 1000, format: 'mp4' } }),
  });

  describe('createWorkflow', () => {
    it('should create graph with 8 nodes connected in linear chain', () => {
      const handlers = createMockHandlers();
      const workflow = createWorkflow(handlers);

      // Verify 8 nodes registered
      expect(mockAddNode).toHaveBeenCalledTimes(8);
      expect(mockAddNode).toHaveBeenCalledWith('trend', expect.any(Function));
      expect(mockAddNode).toHaveBeenCalledWith('content', expect.any(Function));
      expect(mockAddNode).toHaveBeenCalledWith('analysis', expect.any(Function));
      expect(mockAddNode).toHaveBeenCalledWith('script', expect.any(Function));
      expect(mockAddNode).toHaveBeenCalledWith('media', expect.any(Function));
      expect(mockAddNode).toHaveBeenCalledWith('voice', expect.any(Function));
      expect(mockAddNode).toHaveBeenCalledWith('subtitle', expect.any(Function));
      expect(mockAddNode).toHaveBeenCalledWith('render', expect.any(Function));

      // Verify edges: START→trend + 7 inter-node edges + render→END = 9 edges
      expect(mockAddEdge).toHaveBeenCalledTimes(9);

      // Verify chain order
      const edgeCalls = mockAddEdge.mock.calls.map((c: any[]) => `${c[0]}→${c[1]}`);
      expect(edgeCalls[0]).toBe('__start__→trend');
      expect(edgeCalls[1]).toBe('trend→content');
      expect(edgeCalls[8]).toBe('render→__end__');
    });

    it('should handle node success: advance currentStep and set status running', async () => {
      const handlers = createMockHandlers();
      createWorkflow(handlers);

      // Extract the 'trend' node handler
      const trendNodeFn = mockAddNode.mock.calls.find((c: any[]) => c[0] === 'trend')![1];
      const result = await trendNodeFn({ input: {}, status: 'pending' });

      expect(result.currentStep).toBe('content');
      expect(result.status).toBe('running');
      expect(handlers.trendAgent).toHaveBeenCalled();
    });

    it('should handle node failure: set status failed and error message', async () => {
      const handlers = createMockHandlers();
      (handlers.scriptAgent as jest.Mock).mockRejectedValue(new Error('Script generation failed'));
      createWorkflow(handlers);

      const scriptNodeFn = mockAddNode.mock.calls.find((c: any[]) => c[0] === 'script')![1];
      const result = await scriptNodeFn({ input: {}, status: 'running' });

      expect(result.currentStep).toBe('script');
      expect(result.status).toBe('failed');
      expect(result.error).toContain('Script generation failed');
    });

    it('should set status completed and currentStep done on render success', async () => {
      const handlers = createMockHandlers();
      createWorkflow(handlers);

      const renderNodeFn = mockAddNode.mock.calls.find((c: any[]) => c[0] === 'render')![1];
      const result = await renderNodeFn({ input: {}, status: 'running' });

      expect(result.currentStep).toBe('done');
      expect(result.status).toBe('completed');
    });
  });

  describe('createInitialWorkflowState', () => {
    it('should create state with all fields initialized', () => {
      const state = createInitialWorkflowState({
        url: 'https://youtube.com/watch?v=test',
        platform: 'youtube',
      });

      expect(state.input.url).toBe('https://youtube.com/watch?v=test');
      expect(state.input.platform).toBe('youtube');
      expect(state.status).toBe('pending');
      expect(state.currentStep).toBe('trend');
      expect(state.error).toBeUndefined();
      expect(state.trendResult).toBeUndefined();
      expect(state.transcript).toBeUndefined();
      expect(state.analysis).toBeUndefined();
      expect(state.script).toBeUndefined();
      expect(state.mediaAssets).toBeUndefined();
      expect(state.ttsAudio).toBeUndefined();
      expect(state.subtitle).toBeUndefined();
      expect(state.renderOutput).toBeUndefined();
    });

    it('should accept keyword input', () => {
      const state = createInitialWorkflowState({
        keyword: '健康饮食',
        platform: 'douyin',
      });

      expect(state.input.keyword).toBe('健康饮食');
      expect(state.input.platform).toBe('douyin');
    });
  });
});
