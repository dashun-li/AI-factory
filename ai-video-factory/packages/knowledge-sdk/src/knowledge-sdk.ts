import { MilvusClient, DataType } from '@zilliz/milvus2-sdk-node';
import OpenAI from 'openai';
import type { AnalysisResult } from '@ai-video-factory/shared-types';

export interface SearchOptions {
  topK?: number;
  platform?: string;
  hookType?: string;
  emotionArc?: string;
  viralTrigger?: string;
  languageStyle?: string;
}

export interface KnowledgeSearchResult {
  id: string;
  score: number;
  analysis: AnalysisResult;
}

export class KnowledgeSDK {
  private client: MilvusClient;
  private openai: OpenAI;
  private collectionName = 'viral_patterns';

  constructor(milvusAddress: string, openaiApiKey: string) {
    this.client = new MilvusClient({ address: milvusAddress });
    this.openai = new OpenAI({ apiKey: openaiApiKey });
  }

  async initCollection(): Promise<void> {
    const has = await this.client.hasCollection({ collection_name: this.collectionName });
    if (has.value) return;

    await this.client.createCollection({
      collection_name: this.collectionName,
      fields: [
        { name: 'id', data_type: DataType.Int64, is_primary_key: true, autoID: true },
        { name: 'vector', data_type: DataType.FloatVector, dim: 1536 },
        { name: 'analysis_id', data_type: DataType.VarChar, max_length: 64 },
        { name: 'platform', data_type: DataType.VarChar, max_length: 32 },
        { name: 'hook_type', data_type: DataType.VarChar, max_length: 32 },
        { name: 'emotion_arc', data_type: DataType.VarChar, max_length: 128 },
        { name: 'viral_trigger', data_type: DataType.VarChar, max_length: 64 },
        { name: 'language_style', data_type: DataType.VarChar, max_length: 32 },
        { name: 'views_level', data_type: DataType.VarChar, max_length: 16 },
        { name: 'full_analysis', data_type: DataType.VarChar, max_length: 8192 },
      ],
    });

    await this.client.createIndex({
      collection_name: this.collectionName,
      field_name: 'vector',
      index_type: 'IVF_FLAT',
      metric_type: 'COSINE',
      params: { nlist: 128 },
    });

    await this.client.loadCollection({ collection_name: this.collectionName });
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return response.data[0].embedding;
  }

  async insert(analysis: AnalysisResult): Promise<void> {
    const text = `${analysis.source.title} ${analysis.structure.pattern} ${analysis.emotions.arc} ${analysis.viral_points.triggers.join(' ')} ${analysis.style.key_phrases.join(' ')}`;
    const vector = await this.embed(text);

    const viewsLevel = this.classifyViews(analysis.source.views);

    await this.client.insert({
      collection_name: this.collectionName,
      data: [
        {
          vector,
          analysis_id: analysis.id,
          platform: analysis.source.platform,
          hook_type: analysis.structure.hook.type,
          emotion_arc: analysis.emotions.arc,
          viral_trigger: analysis.viral_points.triggers[0] ?? '',
          language_style: analysis.style.language,
          views_level: viewsLevel,
          full_analysis: JSON.stringify(analysis),
        },
      ],
    });
  }

  async search(query: string, options: SearchOptions = {}): Promise<KnowledgeSearchResult[]> {
    const vector = await this.embed(query);
    const filter = this.buildFilter(options);

    const result = await this.client.search({
      collection_name: this.collectionName,
      vector,
      filter,
      limit: options.topK ?? 5,
      output_fields: ['analysis_id', 'full_analysis', 'views_level'],
    });

    const raw = (result.results ?? []).map((r: any) => ({
      id: r.analysis_id as string,
      score: r.score as number,
      analysis: JSON.parse(r.full_analysis) as AnalysisResult,
      viewsLevel: r.views_level as string,
    }));

    return this.fusionRank(raw);
  }

  async delete(analysisId: string): Promise<void> {
    await this.client.delete({
      collection_name: this.collectionName,
      filter: `analysis_id == "${analysisId}"`,
    });
  }

  async cosineSimilarity(textA: string, textB: string): Promise<number> {
    const [vecA, vecB] = await Promise.all([this.embed(textA), this.embed(textB)]);
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private classifyViews(views: number): string {
    if (views >= 10_000_000) return '1000w+';
    if (views >= 1_000_000) return '100w+';
    if (views >= 100_000) return '10w+';
    if (views >= 10_000) return '1w+';
    return '<1w';
  }

  private fusionRank(
    items: { id: string; score: number; analysis: AnalysisResult; viewsLevel: string }[],
  ): KnowledgeSearchResult[] {
    const viewsWeight: Record<string, number> = {
      '1000w+': 1.0,
      '100w+': 0.8,
      '10w+': 0.6,
      '1w+': 0.4,
      '<1w': 0.2,
    };

    return items
      .map((item) => {
        const relevanceScore = item.score;
        const performanceScore = viewsWeight[item.viewsLevel] ?? 0.2;
        const fused = relevanceScore * 0.7 + performanceScore * 0.3;
        return { id: item.id, score: fused, analysis: item.analysis };
      })
      .sort((a, b) => b.score - a.score);
  }

  private buildFilter(options: SearchOptions): string | undefined {
    const parts: string[] = [];
    if (options.platform) parts.push(`platform == "${options.platform}"`);
    if (options.hookType) parts.push(`hook_type == "${options.hookType}"`);
    if (options.emotionArc) parts.push(`emotion_arc == "${options.emotionArc}"`);
    if (options.viralTrigger) parts.push(`viral_trigger == "${options.viralTrigger}"`);
    if (options.languageStyle) parts.push(`language_style == "${options.languageStyle}"`);
    return parts.length > 0 ? parts.join(' && ') : undefined;
  }
}
