import { Worker } from 'bullmq';
import { KnowledgeSDK } from '@ai-video-factory/knowledge-sdk';
import { AnalysisResult } from '@ai-video-factory/shared-types';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const MILVUS_ADDRESS = `${process.env.MILVUS_HOST || 'localhost'}:${process.env.MILVUS_PORT || '19530'}`;

const knowledgeSDK = new KnowledgeSDK(MILVUS_ADDRESS, OPENAI_KEY);

async function main() {
  await knowledgeSDK.initCollection();

  const worker = new Worker(
    'embedding',
    async (job) => {
      const analysis: AnalysisResult = job.data.analysis;

      console.log(`[embedding-worker] Processing job ${job.id}: ${analysis.id}`);

      await knowledgeSDK.insert(analysis);

      console.log(`[embedding-worker] Completed job ${job.id}`);
      return { analysisId: analysis.id, status: 'embedded' };
    },
    {
      connection: { host: REDIS_HOST, port: REDIS_PORT },
      concurrency: 4,
    },
  );

  worker.on('completed', (job) => {
    console.log(`[embedding-worker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[embedding-worker] Job ${job?.id} failed:`, err.message);
  });

  console.log('[embedding-worker] Started, waiting for jobs...');
}

main().catch(console.error);
