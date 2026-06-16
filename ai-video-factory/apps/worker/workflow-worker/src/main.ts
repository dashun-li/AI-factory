import { Worker, Queue } from 'bullmq';
import { AnalysisService } from '@ai-video-factory/analysis-service';
import { KnowledgeSDK } from '@ai-video-factory/knowledge-sdk';
import { ScriptService } from '@ai-video-factory/script-service';
import { ContentService } from '@ai-video-factory/content-service';
import { MediaService } from '@ai-video-factory/media-service';
import { SubtitleService } from '@ai-video-factory/subtitle-service';
import { RenderService } from '@ai-video-factory/render-service';
import { TrendService } from '@ai-video-factory/trend-service';
import {
  createDb,
  updateWorkflowStatus,
  insertScript,
  insertMediaAsset,
  insertRenderOutput,
  type DatabaseConfig,
} from '@ai-video-factory/db';
import type { Platform } from '@ai-video-factory/shared-types';
import { processWorkflowJob, type WorkflowDeps } from './processor';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const MILVUS_ADDRESS = `${process.env.MILVUS_HOST || 'localhost'}:${process.env.MILVUS_PORT || '19530'}`;

const dbConfig: DatabaseConfig = {
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER ?? 'aifactory',
  password: process.env.POSTGRES_PASSWORD ?? 'aifactory_dev',
  database: process.env.POSTGRES_DB ?? 'ai_video_factory',
};

const analysisService = new AnalysisService(ANTHROPIC_KEY);
const knowledgeSDK = new KnowledgeSDK(MILVUS_ADDRESS, OPENAI_KEY);
const scriptService = new ScriptService(ANTHROPIC_KEY, OPENAI_KEY, MILVUS_ADDRESS);
const contentService = new ContentService({
  fasterWhisperUrl: process.env.FASTER_WHISPER_URL || 'http://localhost:9001',
});
const mediaService = new MediaService({
  falApiKey: process.env.FAL_API_KEY,
  klingApiKey: process.env.KLING_API_KEY,
  pexelsApiKey: process.env.PEXELS_API_KEY,
  unsplashAccessKey: process.env.UNSPLASH_ACCESS_KEY,
  minioEndpoint: process.env.MINIO_ENDPOINT,
  minioBucket: process.env.MINIO_BUCKET,
});
const subtitleService = new SubtitleService({
  whisperxUrl: process.env.WHISPERX_URL || 'http://localhost:9002',
});
const renderService = new RenderService({
  remotionProjectPath: process.env.REMOTION_PROJECT_PATH,
  outputDir: process.env.RENDER_OUTPUT_DIR,
  minioEndpoint: process.env.MINIO_ENDPOINT,
  minioBucket: process.env.MINIO_BUCKET,
});
const trendService = new TrendService();

async function updateStep(
  dbWorkflowId: string | undefined,
  step: string,
  status: 'running' | 'completed' | 'failed',
  error?: string,
) {
  if (!dbWorkflowId) return;
  try {
    const { db, pool } = createDb(dbConfig);
    await updateWorkflowStatus(db, dbWorkflowId, status, {
      currentStep: step,
      error,
    });
    await pool.end();
  } catch (err) {
    console.error(`[workflow-worker] DB update failed:`, err);
  }
}

async function main() {
  await knowledgeSDK.initCollection();

  const deps: WorkflowDeps = {
    trendService,
    contentService,
    analysisService,
    scriptService,
    mediaService,
    subtitleService,
    renderService,
    knowledgeSDK,
    updateStatus: updateStep,
    insertScript,
    insertMediaAsset,
    insertRenderOutput,
    dbConfig,
  };

  const workflowQueue = new Queue('workflow', {
    connection: { host: REDIS_HOST, port: REDIS_PORT },
  });

  const worker = new Worker(
    'workflow',
    async (job) => {
      return processWorkflowJob(deps, job.data);
    },
    {
      connection: { host: REDIS_HOST, port: REDIS_PORT },
      concurrency: 1,
    },
  );

  worker.on('completed', (job) => {
    console.log(`[workflow-worker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[workflow-worker] Job ${job?.id} failed:`, err.message);
  });

  console.log('[workflow-worker] Started, waiting for jobs...');
  // Touch the queue so it's not flagged unused while the worker actually uses it
  void workflowQueue;
}

main().catch(console.error);
