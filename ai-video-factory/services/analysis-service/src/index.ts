import {
  AnalysisResult,
  AnalysisSource,
  StructureAnalysis,
  EmotionAnalysis,
  ViralPoints,
  StyleAnalysis,
  Platform,
} from '@ai-video-factory/shared-types';
import { preparePrompt } from '@ai-video-factory/prompt-library';
import Anthropic from '@anthropic-ai/sdk';
import type { DbClient } from '@ai-video-factory/db';
import { insertAnalysis } from '@ai-video-factory/db';

/** Optional sinks for persisting an analysis result. Both are optional; when omitted the service is pure. */
export interface AnalysisPersistence {
  /** Postgres client (from createDb). When provided, the full AnalysisResult + flat fields are written to analysis_results. */
  db?: DbClient;
  /** When provided, the workflow_id foreign key is attached to the inserted row. */
  workflowId?: string;
  /** When provided, the result is also inserted into the Milvus viral_patterns collection. */
  knowledge?: { insert: (a: AnalysisResult) => Promise<void> };
}

export class AnalysisService {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Run the full 3-round analysis pipeline.
   * When `options.persist` is provided, the result is written to Postgres and/or Milvus before returning.
   */
  async analyze(
    params: {
      platform: Platform;
      title: string;
      views: number;
      url: string;
      transcript: string;
    },
    options: { persist?: AnalysisPersistence } = {},
  ): Promise<AnalysisResult> {
    const analysisId = `analysis_${Date.now()}`;

    // Round 1: Structure analysis
    const structure = await this.analyzeStructure(
      params.platform,
      params.title,
      params.views,
      params.transcript,
    );

    // Round 2: Emotion analysis
    const emotions = await this.analyzeEmotion(
      JSON.stringify(structure),
      params.transcript,
    );

    // Round 3: Viral points analysis
    const { viral_points, style } = await this.analyzeViral(
      JSON.stringify(structure),
      JSON.stringify(emotions),
      params.transcript,
    );

    const source: AnalysisSource = {
      platform: params.platform,
      url: params.url,
      title: params.title,
      views: params.views,
    };

    const result: AnalysisResult = {
      id: analysisId,
      source,
      structure,
      emotions,
      viral_points,
      style,
    };

    const { persist } = options;
    if (persist) {
      if (persist.db) {
        await insertAnalysis(persist.db, {
          workflowId: persist.workflowId,
          sourcePlatform: params.platform,
          sourceUrl: params.url,
          sourceTitle: params.title,
          sourceViews: params.views,
          structurePattern: structure.pattern,
          hookType: structure.hook.type,
          emotionArc: emotions.arc,
          emotionIntensity: emotions.intensity,
          viralTriggers: viral_points.triggers.join(','),
          shareMotivation: viral_points.share_motivation,
          languageStyle: style.language,
          keyPhrases: style.key_phrases.join(','),
          ctaType: style.cta_type,
          fullAnalysis: result as unknown as Record<string, unknown>,
        });
      }
      if (persist.knowledge) {
        await persist.knowledge.insert(result);
      }
    }

    return result;
  }

  private async analyzeStructure(
    platform: string,
    title: string,
    views: number,
    transcript: string,
  ): Promise<StructureAnalysis> {
    const prompt = preparePrompt('analysis', 'structure', {
      platform,
      title,
      views: String(views),
      transcript,
    });

    const result = await this.callLLM(prompt);
    return JSON.parse(result) as StructureAnalysis;
  }

  private async analyzeEmotion(
    structureAnalysis: string,
    transcript: string,
  ): Promise<EmotionAnalysis> {
    const prompt = preparePrompt('analysis', 'emotion', {
      structure_analysis: structureAnalysis,
      transcript,
    });

    const result = await this.callLLM(prompt);
    return JSON.parse(result) as EmotionAnalysis;
  }

  private async analyzeViral(
    structureAnalysis: string,
    emotionAnalysis: string,
    transcript: string,
  ): Promise<{ viral_points: ViralPoints; style: StyleAnalysis }> {
    const prompt = preparePrompt('analysis', 'viral', {
      structure_analysis: structureAnalysis,
      emotion_analysis: emotionAnalysis,
      transcript,
    });

    const result = await this.callLLM(prompt);
    return JSON.parse(result) as { viral_points: ViralPoints; style: StyleAnalysis };
  }

  private async callLLM(prompt: string): Promise<string> {
    const message = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = message.content[0];
    if (textBlock.type !== 'text') {
      throw new Error('Unexpected response type from LLM');
    }
    return textBlock.text;
  }
}
