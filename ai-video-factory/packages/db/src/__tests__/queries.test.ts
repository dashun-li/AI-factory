// Mock drizzle-orm operators
jest.mock('drizzle-orm', () => {
  const actual = jest.requireActual('drizzle-orm');
  return {
    ...actual,
    eq: jest.fn((col, val) => ({ col, val, op: 'eq' })),
    desc: jest.fn((col) => ({ col, op: 'desc' })),
  };
});

// Build a chainable mock that resolves to rows
function chainable(resolvedValue: any = []) {
  const handler: any = jest.fn(() => resolvedValue);
  const chain = () => resolvedValue;
  // Make handler callable and also have chain methods
  const proxy = new Proxy(handler, {
    get(target, prop) {
      if (prop === 'then') return (resolve: any, reject: any) => Promise.resolve(resolvedValue).then(resolve, reject);
      return (..._args: any[]) => proxy; // chainable
    },
    apply(target, thisArg, args) {
      return resolvedValue;
    },
  });
  return proxy;
}

// Track calls
const insertCalls: any[] = [];
const updateCalls: any[] = [];

function makeDb(resolvedRows: any[] = [{ id: 'test-id' }]) {
  const selectChain = chainable(resolvedRows);
  const insertChain = chainable(resolvedRows);
  const updateChain = chainable(resolvedRows);

  return {
    _selectChain: selectChain,
    _insertChain: insertChain,
    _updateChain: updateChain,
    select: jest.fn(() => selectChain),
    insert: jest.fn(() => insertChain),
    update: jest.fn(() => updateChain),
  };
}

import {
  createWorkflow,
  getWorkflow,
  listWorkflows,
  updateWorkflowStatus,
  insertAnalysis,
  insertScript,
  insertMediaAsset,
  insertRenderOutput,
} from '../queries';

describe('DB Queries', () => {
  let db: ReturnType<typeof makeDb>;

  beforeEach(() => {
    db = makeDb();
  });

  describe('Workflow queries', () => {
    it('should create a workflow', async () => {
      const data = { inputUrl: 'https://example.com/video', inputPlatform: 'douyin' as const };
      const result = await createWorkflow(db as any, data);
      expect(db.insert).toHaveBeenCalled();
      expect(result).toEqual({ id: 'test-id' });
    });

    it('should get a workflow by id', async () => {
      const result = await getWorkflow(db as any, 'test-id');
      expect(db.select).toHaveBeenCalled();
      expect(result).toEqual({ id: 'test-id' });
    });

    it('should return null when workflow not found', async () => {
      db = makeDb([]);
      const result = await getWorkflow(db as any, 'nonexistent');
      expect(result).toBeNull();
    });

    it('should list workflows with pagination', async () => {
      db = makeDb([{ id: 'w1' }, { id: 'w2' }]);
      const result = await listWorkflows(db as any, 10, 0);
      expect(result).toHaveLength(2);
    });

    it('should update workflow status', async () => {
      const result = await updateWorkflowStatus(db as any, 'test-id', 'running', {
        currentStep: 'analysis',
      });
      expect(db.update).toHaveBeenCalled();
      expect(result).toEqual({ id: 'test-id' });
    });

    it('should update workflow to failed with error', async () => {
      const result = await updateWorkflowStatus(db as any, 'test-id', 'failed', {
        error: 'Something went wrong',
      });
      expect(db.update).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('Analysis queries', () => {
    it('should insert an analysis result', async () => {
      const data = {
        workflowId: 'w1',
        sourcePlatform: 'douyin' as const,
        sourceUrl: 'https://example.com',
        sourceTitle: 'Test',
        fullAnalysis: { patterns: [] },
      };
      const result = await insertAnalysis(db as any, data);
      expect(db.insert).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('Script queries', () => {
    it('should insert a script', async () => {
      const data = {
        workflowId: 'w1',
        title: 'Test Script',
        duration: 60,
        platform: 'douyin' as const,
        scenes: [],
      };
      const result = await insertScript(db as any, data);
      expect(db.insert).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('Media Asset queries', () => {
    it('should insert a media asset', async () => {
      const data = {
        workflowId: 'w1',
        type: 'image',
        url: 'https://example.com/img.png',
        source: 'ai_generated',
      };
      const result = await insertMediaAsset(db as any, data);
      expect(db.insert).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('Render Output queries', () => {
    it('should insert a render output', async () => {
      const data = {
        workflowId: 'w1',
        videoUrl: 'https://example.com/video.mp4',
        duration: 60,
        resolution: '1080x1920',
        fileSize: 1024000,
      };
      const result = await insertRenderOutput(db as any, data);
      expect(db.insert).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });
});
