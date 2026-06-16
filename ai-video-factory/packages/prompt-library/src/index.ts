import * as fs from 'fs';
import * as path from 'path';

export type PromptType = 'analysis' | 'rewrite' | 'scoring';

const PROMPTS_DIR = path.resolve(__dirname, '../../../prompts');

/**
 * Load a prompt template from the prompts directory
 */
export function loadPrompt(type: PromptType, name: string): string {
  const filePath = path.join(PROMPTS_DIR, type, `${name}.md`);
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Inject variables into a prompt template
 * Variables use {{variable_name}} syntax
 */
export function injectVariables(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

/**
 * Load and prepare a prompt with variables
 */
export function preparePrompt(
  type: PromptType,
  name: string,
  variables: Record<string, string>,
): string {
  const template = loadPrompt(type, name);
  return injectVariables(template, variables);
}

/**
 * List available prompts for a given type
 */
export function listPrompts(type: PromptType): string[] {
  const dir = path.join(PROMPTS_DIR, type);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace('.md', ''));
}
