import { Controller, Post, Get, Body, Param, Query, HttpException, HttpStatus } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Platform } from '@ai-video-factory/shared-types';
import { createDb, createWorkflow, getWorkflow, listWorkflows, updateWorkflowStatus } from '@ai-video-factory/db';
import type { DatabaseConfig } from '@ai-video-factory/db';

interface CreateWorkflowDto {
  url?: string;
  keyword?: string;
  platform?: Platform;
}

@Controller('workflow')
export class WorkflowController {
  private dbConfig: DatabaseConfig;
  private dbReady = false;

  constructor(
    @InjectQueue('workflow') private workflowQueue: Queue,
    @InjectQueue('render') private renderQueue: Queue,
  ) {
    this.dbConfig = {
      host: process.env.POSTGRES_HOST ?? 'localhost',
      port: Number(process.env.POSTGRES_PORT ?? 5432),
      user: process.env.POSTGRES_USER ?? 'aifactory',
      password: process.env.POSTGRES_PASSWORD ?? 'aifactory_dev',
      database: process.env.POSTGRES_DB ?? 'ai_video_factory',
    };
    this.dbReady = !!(process.env.POSTGRES_HOST || process.env.DATABASE_URL);
  }

  /**
   * Create a new workflow job
   */
  @Post()
  async create(@Body() dto: CreateWorkflowDto) {
    // Persist to DB if configured
    let dbWorkflowId: string | undefined;
    if (this.dbReady) {
      try {
        const { db, pool } = createDb(this.dbConfig);
        const row = await createWorkflow(db, {
          inputUrl: dto.url,
          inputKeyword: dto.keyword,
          inputPlatform: dto.platform,
        });
        dbWorkflowId = row.id;
        await pool.end();
      } catch (err) {
        console.error('DB write failed, falling back to queue only:', err);
      }
    }

    const job = await this.workflowQueue.add('workflow', {
      input: dto,
      dbWorkflowId,
      status: 'pending',
      currentStep: 'trend',
      createdAt: new Date().toISOString(),
    });

    return {
      workflowId: dbWorkflowId ?? job.id,
      queueJobId: job.id,
      status: 'pending',
      input: dto,
    };
  }

  /**
   * Get workflow status
   */
  @Get(':id')
  async getStatus(@Param('id') id: string) {
    // Try DB first
    if (this.dbReady) {
      try {
        const { db, pool } = createDb(this.dbConfig);
        const row = await getWorkflow(db, id);
        await pool.end();
        if (row) {
          return {
            workflowId: row.id,
            status: row.status,
            currentStep: row.currentStep,
            error: row.error,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          };
        }
      } catch (err) {
        console.error('DB read failed, falling back to queue:', err);
      }
    }

    // Fallback to BullMQ
    const [workflowJob, renderJob] = await Promise.all([
      this.workflowQueue.getJob(id),
      this.renderQueue.getJob(id),
    ]);

    const job = workflowJob || renderJob;
    if (!job) {
      throw new HttpException('Workflow not found', HttpStatus.NOT_FOUND);
    }

    const state = await job.getState();
    return {
      workflowId: id,
      status: state,
      progress: job.progress,
      data: job.data,
    };
  }

  /**
   * List recent workflows
   */
  @Get()
  async list(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    const lim = Math.min(Number(limit) || 20, 100);
    const off = Number(offset) || 0;

    // Try DB first
    if (this.dbReady) {
      try {
        const { db, pool } = createDb(this.dbConfig);
        const rows = await listWorkflows(db, lim, off);
        await pool.end();
        return rows.map((row) => ({
          workflowId: row.id,
          status: row.status,
          currentStep: row.currentStep,
          inputUrl: row.inputUrl,
          inputKeyword: row.inputKeyword,
          createdAt: row.createdAt,
        }));
      } catch (err) {
        console.error('DB read failed, falling back to queue:', err);
      }
    }

    // Fallback to BullMQ
    const [workflowJobs, renderJobs] = await Promise.all([
      this.workflowQueue.getJobs(['completed', 'active', 'waiting', 'failed'], 0, lim),
      this.renderQueue.getJobs(['completed', 'active', 'waiting', 'failed'], 0, lim),
    ]);

    const jobs = [...workflowJobs, ...renderJobs].slice(0, lim);
    return Promise.all(jobs.map(async (job) => ({
      workflowId: job.id,
      status: await job.getState(),
      currentStep: job.data?.currentStep,
      createdAt: job.data?.createdAt,
    })));
  }
}
