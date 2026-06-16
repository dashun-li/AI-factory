import { createDb, schema } from '../index';

// Mock pg Pool
const mockQuery = jest.fn();
jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: mockQuery,
    end: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('Database', () => {
  describe('createDb', () => {
    it('should create drizzle instance with correct pool config', () => {
      const { db, pool } = createDb({
        host: 'localhost',
        port: 5432,
        user: 'test',
        password: 'testpass',
        database: 'testdb',
      });

      expect(db).toBeDefined();
      expect(pool).toBeDefined();
    });
  });

  describe('schema', () => {
    it('should export all required tables', () => {
      expect(schema.workflows).toBeDefined();
      expect(schema.analysisResults).toBeDefined();
      expect(schema.scripts).toBeDefined();
      expect(schema.mediaAssets).toBeDefined();
      expect(schema.renderOutputs).toBeDefined();
    });

    it('should export enums', () => {
      expect(schema.platformEnum).toBeDefined();
      expect(schema.workflowStatusEnum).toBeDefined();
    });
  });
});
