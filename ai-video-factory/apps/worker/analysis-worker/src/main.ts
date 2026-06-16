import { Worker } from 'bullmq';
import { AnalysisService } from '@ai-video-factory/analysis-service';
import { KnowledgeSDK } from '@ai-video-factory/knowledge-sdk';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const MILVUS_ADDRESS = `${process.env.MILVUS_HOST || 'localhost'}:${process.env.MILVUS_PORT || '19530'}`;

const analysisService = new AnalysisService(ANTHROPIC_KEY);
const knowledgeSDK = new KnowledgeSDK(MILVUS_ADDRESS, OPENAI_KEY);

async function main() {
  await knowledgeSDK.initCollection();

  const worker = new Worker(
    'analysis',
    async (job) => {
      const { transcript, platform, title, views, url } = job.data;

      console.log(`[analysis-worker] Processing job ${job.id}: ${title}`);

      // Run 3-round analysis
      const analysisResult = await analysisService.analyze({
        platform,
        title,
        views,
        url,
        transcript,
      });

      // Insert into knowledge base
      await knowledgeSDK.insert(analysisResult);

      console.log(`[analysis-worker] Completed job ${job.id}`);

      return { analysisId: analysisResult.id, status: 'completed' };
    },
    {
      connection: { host: REDIS_HOST, port: REDIS_PORT },
      concurrency: 2,
    },
  );

  worker.on('completed', (job) => {
    console.log(`[analysis-worker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[analysis-worker] Job ${job?.id} failed:`, err.message);
  });

  console.log('[analysis-worker] Started, waiting for jobs...');
}

main().catch(console.error);
