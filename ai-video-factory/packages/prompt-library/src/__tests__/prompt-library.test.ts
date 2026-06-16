import * as fs from 'fs';
import * as path from 'path';
import { loadPrompt, injectVariables, preparePrompt, listPrompts } from '../index';

// Mock fs to avoid needing actual prompt files in tests
jest.mock('fs');

const mockedFs = fs as jest.Mocked<typeof fs>;

describe('prompt-library', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadPrompt', () => {
    it('should load a prompt template from file', () => {
      const mockContent = 'Hello {{name}}, this is a test prompt.';
      mockedFs.readFileSync.mockReturnValue(mockContent);

      const result = loadPrompt('analysis', 'structure');

      expect(mockedFs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining(path.join('prompts', 'analysis', 'structure.md')),
        'utf-8',
      );
      expect(result).toBe(mockContent);
    });

    it('should throw if file does not exist', () => {
      mockedFs.readFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      expect(() => loadPrompt('analysis', 'nonexistent')).toThrow('ENOENT');
    });
  });

  describe('injectVariables', () => {
    it('should replace all {{variables}} with values', () => {
      const template = '{{greeting}} {{name}}! Welcome to {{place}}.';
      const result = injectVariables(template, {
        greeting: 'Hello',
        name: 'World',
        place: 'AI Factory',
      });

      expect(result).toBe('Hello World! Welcome to AI Factory.');
    });

    it('should handle missing variables gracefully (leave as-is)', () => {
      const template = 'Hello {{name}}, {{missing}}!';
      const result = injectVariables(template, { name: 'World' });

      expect(result).toBe('Hello World, {{missing}}!');
    });

    it('should handle empty variables object', () => {
      const template = 'No variables here.';
      const result = injectVariables(template, {});

      expect(result).toBe('No variables here.');
    });

    it('should handle duplicate variables', () => {
      const template = '{{x}} + {{x}} = {{result}}';
      const result = injectVariables(template, { x: '1', result: '2' });

      expect(result).toBe('1 + 1 = 2');
    });

    it('should handle variables with special characters in value', () => {
      const template = 'Content: {{content}}';
      const result = injectVariables(template, {
        content: 'Line1\nLine2\t"quoted"',
      });

      expect(result).toBe('Content: Line1\nLine2\t"quoted"');
    });
  });

  describe('preparePrompt', () => {
    it('should load template and inject variables', () => {
      const mockTemplate = 'Analyze {{platform}} video: {{title}}';
      mockedFs.readFileSync.mockReturnValue(mockTemplate);

      const result = preparePrompt('analysis', 'structure', {
        platform: 'douyin',
        title: 'Test Video',
      });

      expect(result).toBe('Analyze douyin video: Test Video');
    });
  });

  describe('listPrompts', () => {
    it('should list available prompts for a type', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readdirSync.mockReturnValue(['structure.md', 'emotion.md', 'viral.md'] as any);

      const result = listPrompts('analysis');

      expect(result).toEqual(['structure', 'emotion', 'viral']);
    });

    it('should return empty array if directory does not exist', () => {
      mockedFs.existsSync.mockReturnValue(false);

      const result = listPrompts('nonexistent' as any);

      expect(result).toEqual([]);
    });

    it('should filter only .md files', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readdirSync.mockReturnValue(['a.md', 'b.json', 'c.md', '.gitkeep'] as any);

      const result = listPrompts('analysis');

      expect(result).toEqual(['a', 'c']);
    });
  });
});
