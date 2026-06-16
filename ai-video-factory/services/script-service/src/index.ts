import {
  Script,
  Scene,
  QualityScore,
  Platform,
} from '@ai-video-factory/shared-types';
import { preparePrompt } from '@ai-video-factory/prompt-library';
import { KnowledgeSDK } from '@ai-video-factory/knowledge-sdk';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

const MAX_RETRIES = 3;
const QUALITY_THRESHOLD = 7;

const TRANSFORM_DIMENSIONS = [
  ['同义改写', '视角切换', '语序调整'],
  ['同义改写', '信息重组', '风格迁移'],
  ['视角切换', '语序调整', '风格迁移'],
];

export class ScriptService {
  private anthropic: Anthropic;
  private openai: OpenAI;
  private knowledge: KnowledgeSDK;

  constructor(
    anthropicKey: string,
    openaiKey: string,
    milvusAddress: string,
  ) {
    this.anthropic = new Anthropic({ apiKey: anthropicKey });
    this.openai = new OpenAI({ apiKey: openaiKey });
    this.knowledge = new KnowledgeSDK(milvusAddress, openaiKey);
  }

  /**
   * Full rewrite pipeline: search → structure rewrite → semantic transform → score
   */
  async generateScript(params: {
    topic: string;
    platform: Platform;
  }): Promise<Script> {
    // Step 1: Search knowledge base for similar viral patterns
    const patterns = await this.knowledge.search(params.topic, {
      topK: 3,
      platform: params.platform,
    });

    const viralPatterns = JSON.stringify(
      patterns.map((p) => ({
        pattern: p.analysis.structure.pattern,
        hook: p.analysis.structure.hook,
        emotion_arc: p.analysis.emotions.arc,
        style: p.analysis.style,
      })),
    );

    // Step 2: Structure-level rewrite (Claude Sonnet)
    const draftScript = await this.structureRewrite(
      viralPatterns,
      params.topic,
      params.platform,
    );

    // Step 3: Semantic transform with quality scoring loop
    let bestScript = draftScript;
    let bestScore = 0;

    for (let i = 0; i < MAX_RETRIES; i++) {
      const dimensions = TRANSFORM_DIMENSIONS[i % TRANSFORM_DIMENSIONS.length];
      const transformed = await this.semanticTransform(
        JSON.stringify(bestScript),
        dimensions.join('、'),
      );

      const score = await this.scoreQuality(JSON.stringify(transformed));

      if (score.average >= QUALITY_THRESHOLD) {
        // Check originality
        const originality = await this.checkOriginality(transformed);
        if (originality) {
          return transformed;
        }
      }

      if (score.average > bestScore) {
        bestScore = score.average;
        bestScript = transformed;
      }
    }

    return bestScript;
  }

  /**
   * First layer: Structure-level rewrite
   */
  private async structureRewrite(
    viralPatterns: string,
    topic: string,
    platform: string,
  ): Promise<Script> {
    const prompt = preparePrompt('rewrite', 'structure-rewrite', {
      viral_patterns: viralPatterns,
      topic,
      platform,
    });

    const result = await this.callClaude(prompt);
    return JSON.parse(result) as Script;
  }

  /**
   * Second layer: Semantic-level transform
   */
  private async semanticTransform(
    scriptJson: string,
    dimensions: string,
  ): Promise<Script> {
    const prompt = preparePrompt('rewrite', 'semantic-rewrite', {
      script: scriptJson,
      transform_dimensions: dimensions,
    });

    const result = await this.callGPT(prompt);
    return JSON.parse(result) as Script;
  }

  /**
   * Quality scoring
   */
  private async scoreQuality(scriptJson: string): Promise<QualityScore> {
    const prompt = preparePrompt('scoring', 'quality-score', {
      script: scriptJson,
    });

    const result = await this.callGPT(prompt);
    return JSON.parse(result) as QualityScore;
  }

  /**
   * Check originality via embedding cosine similarity
   */
  private async checkOriginality(script: Script): Promise<boolean> {
    const text = script.scenes.map((s) => s.narration).join(' ');
    const patterns = await this.knowledge.search(text, { topK: 3 });

    // If no similar patterns found, it's original
    if (patterns.length === 0) return true;

    // Check cosine similarity with top result
    const similarity = await this.knowledge.cosineSimilarity(
      text,
      patterns[0].analysis.structure.hook.text +
        ' ' +
        patterns[0].analysis.style.key_phrases.join(' '),
    );

    return similarity < 0.7;
  }

  private async callClaude(prompt: string): Promise<string> {
    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const block = message.content[0];
    if (block.type !== 'text') throw new Error('Unexpected response from Claude');
    return block.text;
  }

  private async callGPT(prompt: string): Promise<string> {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    return response.choices[0]?.message?.content ?? '';
  }
}
