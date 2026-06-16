import { Worker } from 'bullmq';
import { RenderService } from '@ai-video-factory/render-service';
import { Script, Subtitle } from '@ai-video-factory/shared-types';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

const renderService = new RenderService();

async function main() {
  const worker = new Worker(
    'render',
    async (job) => {
      const { script, audioPath, subtitle, bgmPath } = job.data as {
        script: Script;
        audioPath: string;
        subtitle: Subtitle;
        bgmPath?: string;
      };

      console.log(`[render-worker] Processing job ${job.id}: ${script.title}`);

      const output = await renderService.renderFullVideo({
        script,
        audioPath,
        subtitle,
        bgmPath,
      });

      console.log(`[render-worker] Completed job ${job.id}: ${output.video_url}`);
      return output;
    },
    {
      connection: { host: REDIS_HOST, port: REDIS_PORT },
      concurrency: 1, // Rendering is resource-intensive
    },
  );

  worker.on('completed', (job) => {
    console.log(`[render-worker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[render-worker] Job ${job?.id} failed:`, err.message);
  });

  console.log('[render-worker] Started, waiting for jobs...');
}

main().catch(console.error);
