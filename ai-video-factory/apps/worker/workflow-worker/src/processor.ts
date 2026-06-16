import type { Platform } from '@ai-video-factory/shared-types';
import type { AnalysisService } from '@ai-video-factory/analysis-service';
import type { ScriptService } from '@ai-video-factory/script-service';
import type { ContentService } from '@ai-video-factory/content-service';
import type { MediaService } from '@ai-video-factory/media-service';
import type { SubtitleService } from '@ai-video-factory/subtitle-service';
import type { RenderService } from '@ai-video-factory/render-service';
import type { TrendService } from '@ai-video-factory/trend-service';
import type { KnowledgeSDK } from '@ai-video-factory/knowledge-sdk';
import {
  createDb,
  insertScript,
  insertMediaAsset,
  insertRenderOutput,
  type DatabaseConfig,
} from '@ai-video-factory/db';

export type StepStatus = 'running' | 'completed' | 'failed';

export type UpdateStatusFn = (
  dbWorkflowId: string | undefined,
  step: string,
  status: StepStatus,
  error?: string,
) => Promise<void>;

export interface WorkflowDeps {
  trendService: TrendService;
  contentService: ContentService;
  analysisService: AnalysisService;
  scriptService: ScriptService;
  mediaService: MediaService;
  subtitleService: SubtitleService;
  renderService: RenderService;
  knowledgeSDK: KnowledgeSDK;
  updateStatus: UpdateStatusFn;
  insertScript: typeof insertScript;
  insertMediaAsset: typeof insertMediaAsset;
  insertRenderOutput: typeof insertRenderOutput;
  dbConfig: DatabaseConfig;
}

export interface WorkflowJobInput {
  url?: string;
  keyword?: string;
  platform?: Platform;
}

export interface WorkflowJobData {
  input: WorkflowJobInput;
  dbWorkflowId?: string;
  currentStep?: string;
}

export interface WorkflowJobResult {
  status: 'completed' | 'failed';
  videoUrl?: string;
  error?: string;
}

const STEP_NAMES = [
  'trend',
  'content',
  'analysis',
  'script',
  'media',
  'voice',
  'subtitle',
  'render',
  'done',
] as const;

/**
 * Orchestrates the full 8-step video generation pipeline:
 *   1. Trend discovery (fetch metadata if URL provided)
 *   2. Content extraction (transcribe if URL provided)
 *   3. Viral analysis (Claude 3-round pipeline + DB/Milvus persistence)
 *   4. Script generation (multi-platform rewrite with retry)
 *   5. Media generation (one image per scene)
 *   6. TTS voice (Edge-TTS or CosyVoice)
 *   7. Subtitle generation (SRT/VTT/ASS)
 *   8. Render (Remotion + FFmpeg + MinIO upload)
 *
 * Each step writes its progress to Postgres via `updateStatus` so the
 * WebSocket gateway can stream real-time updates to the UI. A failure
 * in any step records `status='failed'` plus the error message and
 * rethrows so BullMQ can retry per its own backoff policy.
 *
 * This function is pure with respect to its inputs — all collaborators
 * (services, persistence, status updates) are injected via `deps`. Tests
 * supply jest mocks for each service to validate the orchestration
 * without needing real APIs, Redis, or Postgres.
 */
export async function processWorkflowJob(
  deps: WorkflowDeps,
  jobData: WorkflowJobData,
): Promise<WorkflowJobResult> {
  const { input, dbWorkflowId } = jobData;
  const platform: Platform = input.platform || 'douyin';

  try {
    // ===== Step 1: Trend discovery =====
    await deps.updateStatus(dbWorkflowId, 'trend', 'running');
    let sourceUrl = input.url;
    let transcript = '';
    let title = '';
    let views = 0;

    if (sourceUrl) {
      const metadata = await deps.trendService.fetchVideoMetadata(sourceUrl);
      title = metadata.title;
      views = metadata.views ?? 0;
    }

    await deps.updateStatus(dbWorkflowId, 'trend', 'completed');

    // ===== Step 2: Content extraction =====
    await deps.updateStatus(dbWorkflowId, 'content', 'running');
    if (sourceUrl) {
      const result = await deps.contentService.processUrl(sourceUrl);
      transcript = result.transcript?.transcript ?? '';
      if (!title && result.metadata?.title) title = result.metadata.title;
    }
    await deps.updateStatus(dbWorkflowId, 'content', 'completed');

    // ===== Step 3: Viral analysis =====
    await deps.updateStatus(dbWorkflowId, 'analysis', 'running');
    const { db: analysisDb, pool: analysisPool } = dbWorkflowId
      ? createDb(deps.dbConfig)
      : { db: undefined as any, pool: undefined as any };

    await deps.analysisService.analyze(
      {
        platform,
        title,
        views,
        url: sourceUrl ?? '',
        transcript,
      },
      {
        persist: {
          db: analysisDb,
          workflowId: dbWorkflowId,
          knowledge: { insert: (a) => deps.knowledgeSDK.insert(a) },
        },
      },
    );

    if (analysisPool) {
      await analysisPool.end().catch(() => {});
    }
    await deps.updateStatus(dbWorkflowId, 'analysis', 'completed');

    // ===== Step 4: Script generation =====
    await deps.updateStatus(dbWorkflowId, 'script', 'running');
    const script = await deps.scriptService.generateScript({
      topic: input.keyword || title || 'untitled',
      platform,
    });

    if (dbWorkflowId) {
      try {
        const { db, pool } = createDb(deps.dbConfig);
        await deps.insertScript(db, {
          workflowId: dbWorkflowId,
          title: script.title,
          duration: script.duration,
          platform,
          scenes: script.scenes as any,
        });
        await pool.end();
      } catch (err) {
        console.error('[workflow-worker] Script DB insert failed:', err);
      }
    }
    await deps.updateStatus(dbWorkflowId, 'script', 'completed');

    // ===== Step 5: Media generation =====
    await deps.updateStatus(dbWorkflowId, 'media', 'running');
    const mediaAssets: string[] = [];
    for (const scene of script.scenes) {
      if (scene.visual) {
        const asset = await deps.mediaService.generateImage(scene.visual);
        if (dbWorkflowId) {
          try {
            const { db, pool } = createDb(deps.dbConfig);
            await deps.insertMediaAsset(db, {
              workflowId: dbWorkflowId,
              type: 'image',
              url: asset.url,
              source: 'ai_generated',
              prompt: scene.visual,
            });
            await pool.end();
          } catch (_) {
            /* swallow per-scene insert errors so the loop continues */
          }
        }
        mediaAssets.push(asset.url);
      }
    }
    await deps.updateStatus(dbWorkflowId, 'media', 'completed');

    // ===== Step 6: TTS voice =====
    await deps.updateStatus(dbWorkflowId, 'voice', 'running');
    const narrationText = script.scenes.map((s) => s.narration).join('\n');
    const ttsResult = await deps.mediaService.generateTTS(narrationText);
    await deps.updateStatus(dbWorkflowId, 'voice', 'completed');

    // ===== Step 7: Subtitles =====
    await deps.updateStatus(dbWorkflowId, 'subtitle', 'running');
    const subtitleResult = await deps.subtitleService.generateSubtitle(
      [
        {
          index: 1,
          start_time: 0,
          end_time: script.duration,
          text: narrationText,
        },
      ],
      'srt',
    );
    await deps.updateStatus(dbWorkflowId, 'subtitle', 'completed');

    // ===== Step 8: Render =====
    await deps.updateStatus(dbWorkflowId, 'render', 'running');
    const videoResult = await deps.renderService.renderFullVideo({
      script,
      audioPath: ttsResult.audio_url,
      subtitle: subtitleResult,
    });

    if (dbWorkflowId) {
      try {
        const { db, pool } = createDb(deps.dbConfig);
        await deps.insertRenderOutput(db, {
          workflowId: dbWorkflowId,
          videoUrl: videoResult.video_url,
          duration: script.duration,
          resolution: ['douyin', 'kuaishou', 'tiktok'].includes(platform)
            ? '1080x1920'
            : '1920x1080',
          fileSize: videoResult.file_size,
        });
        await pool.end();
      } catch (_) {
        /* final render output is best-effort */
      }
    }
    await deps.updateStatus(dbWorkflowId, 'render', 'completed');
    await deps.updateStatus(dbWorkflowId, 'done', 'completed');

    return { status: 'completed', videoUrl: videoResult.video_url };
  } catch (err: any) {
    await deps.updateStatus(
      dbWorkflowId,
      jobData.currentStep ?? 'trend',
      'failed',
      err?.message ?? String(err),
    );
    throw err;
  }
}

/**
 * Returns the canonical list of step names written to `current_step`
 * in the workflows table. Exported for tests and the API gateway.
 */
export function getStepNames(): readonly string[] {
  return STEP_NAMES;
}
