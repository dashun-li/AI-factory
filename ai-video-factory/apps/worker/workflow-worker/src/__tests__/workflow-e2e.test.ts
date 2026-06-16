/**
 * End-to-end orchestration tests for the workflow worker.
 *
 * Validates the 8-step pipeline drives all collaborators in the right order,
 * records status transitions correctly, and handles failure modes by
 * recording `failed` + error message before rethrowing.
 *
 * All seven downstream services + the DB layer are injected via the
 * `WorkflowDeps` interface, so these tests exercise the processor without
 * any real API, Redis, or Postgres connection.
 */

// ===== Mocks =====

const mockCreateDb = jest.fn();
jest.mock('@ai-video-factory/db', () => {
  const actual = jest.requireActual('@ai-video-factory/db');
  return {
    ...actual,
    createDb: (...args: unknown[]) => mockCreateDb(...args),
  };
});

import {
  processWorkflowJob,
  getStepNames,
  type WorkflowDeps,
  type WorkflowJobData,
} from '../processor';
import type { Script, Platform, MediaAsset, Subtitle, RenderOutput, TTSAudio, TrendItem, Transcript } from '@ai-video-factory/shared-types';

// ===== Helpers =====

const fakeScript: Script = {
  title: '测试脚本',
  duration: 30,
  platform: 'douyin',
  scenes: [
    { id: 1, role: 'hook', emotion: 'curiosity', duration: 3, narration: '开场', visual: '紫渐变', subtitle: '开场' },
    { id: 2, role: 'body', emotion: 'surprise', duration: 20, narration: '正文', visual: '蓝渐变', subtitle: '正文' },
    { id: 3, role: 'cta',   emotion: 'action',    duration: 7, narration: 'CTA',  visual: '绿渐变', subtitle: 'CTA' },
  ],
};

const fakeImage = (prompt: string): MediaAsset => ({
  type: 'image',
  url: `https://cdn.test/${encodeURIComponent(prompt)}.png`,
  source: 'ai_generated',
  prompt,
});

const fakeTTS = (text: string): TTSAudio => ({
  audio_url: 'https://cdn.test/voice.mp3',
  duration: 30,
  voice: 'zh-CN-YunxiNeural',
  text,
});

const fakeSubtitle: Subtitle = {
  format: 'srt',
  entries: [{ index: 1, start_time: 0, end_time: 30, text: 'all' }],
  content: '1\n00:00:00,000 --> 00:00:30,000\nall\n',
};

const fakeRender: RenderOutput = {
  video_url: 'https://cdn.test/output.mp4',
  duration: 30,
  resolution: '1080x1920',
  file_size: 1024 * 1024,
};

function makeDeps(overrides: Partial<WorkflowDeps> = {}): WorkflowDeps {
  return {
    trendService: {
      fetchVideoMetadata: jest.fn(async (url: string): Promise<TrendItem> => ({
        title: '原视频标题',
        platform: 'douyin',
        url,
        views: 12345,
        likes: 0,
        comments: 0,
      })),
    } as any,
    contentService: {
      processUrl: jest.fn(async (_url: string) => ({
        videoPath: '/tmp/v.mp4',
        audioPath: '/tmp/v.wav',
        metadata: { id: 'v', title: '原视频标题' },
        transcript: { transcript: '原始转录文本', segments: [] } as Transcript,
      })),
    } as any,
    analysisService: {
      analyze: jest.fn(async () => ({
        id: 'analysis_1',
        source: { platform: 'douyin', url: '', title: '', views: 0 },
        structure: { pattern: 'pain_point + solution', hook: { type: 'pain_point' as any, text: '', duration_ratio: 0.1 }, sections: [] },
        emotions: { arc: 'curiosity → relief', intensity: 7, triggers: [] },
        viral_points: { triggers: ['resonance'], share_motivation: '', comment_triggers: [] },
        style: { language: 'colloquial' as any, key_phrases: [], cta_type: 'save' as any },
      })),
    } as any,
    scriptService: {
      generateScript: jest.fn(async () => fakeScript),
    } as any,
    mediaService: {
      generateImage: jest.fn(async (prompt: string) => fakeImage(prompt)),
      generateTTS: jest.fn(async (text: string) => fakeTTS(text)),
    } as any,
    subtitleService: {
      generateSubtitle: jest.fn(async () => fakeSubtitle),
    } as any,
    renderService: {
      renderFullVideo: jest.fn(async () => fakeRender),
    } as any,
    knowledgeSDK: {
      insert: jest.fn(async () => undefined),
    } as any,
    updateStatus: jest.fn(async () => undefined),
    insertScript: jest.fn(async () => ({ id: 's1' })) as any,
    insertMediaAsset: jest.fn(async () => ({ id: 'm1' })) as any,
    insertRenderOutput: jest.fn(async () => ({ id: 'r1' })) as any,
    dbConfig: {
      host: 'localhost',
      port: 5432,
      user: 'test',
      password: 'test',
      database: 'test',
    },
    ...overrides,
  };
}

function makeJob(overrides: Partial<WorkflowJobData> = {}): WorkflowJobData {
  return {
    input: { url: 'https://douyin.com/video/123', keyword: '健身', platform: 'douyin' },
    dbWorkflowId: 'wf-123',
    currentStep: 'trend',
    ...overrides,
  };
}

// ===== Tests =====

describe('workflow-worker processWorkflowJob', () => {
  beforeEach(() => {
    mockCreateDb.mockReset();
    // Default: createDb returns a stub db whose insert/update are no-ops,
    // and pool.end() resolves. The processor only uses it for the optional
    // dbWorkflowId paths; tests that exercise those inspect insertScript etc.
    mockCreateDb.mockReturnValue({
      db: {
        insert: jest.fn().mockReturnValue({ values: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([{ id: 'x' }]) }) }),
        update: jest.fn().mockReturnValue({ set: jest.fn().mockReturnValue({ where: jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([{}]) }) }) }),
        select: jest.fn().mockReturnValue({ from: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([]) }) }),
      },
      pool: { end: jest.fn().mockResolvedValue(undefined) },
    });
  });

  // -------- happy path --------

  it('runs all 8 steps in order and returns completed', async () => {
    const deps = makeDeps();
    const result = await processWorkflowJob(deps, makeJob());

    expect(result.status).toBe('completed');
    expect(result.videoUrl).toBe(fakeRender.video_url);

    const updateCalls = (deps.updateStatus as jest.Mock).mock.calls;
    const steps = updateCalls.map((c) => `${c[1]}:${c[2]}`);
    // Each step emits (running, completed) pairs, plus final 'done' → 'completed'.
    expect(steps).toEqual([
      'trend:running',    'trend:completed',
      'content:running',  'content:completed',
      'analysis:running', 'analysis:completed',
      'script:running',   'script:completed',
      'media:running',    'media:completed',
      'voice:running',    'voice:completed',
      'subtitle:running', 'subtitle:completed',
      'render:running',   'render:completed',
      'done:completed',
    ]);
  });

  it('invokes every downstream service exactly once on the happy path', async () => {
    const deps = makeDeps();
    await processWorkflowJob(deps, makeJob());

    expect(deps.trendService.fetchVideoMetadata).toHaveBeenCalledTimes(1);
    expect(deps.contentService.processUrl).toHaveBeenCalledTimes(1);
    expect(deps.analysisService.analyze).toHaveBeenCalledTimes(1);
    expect(deps.scriptService.generateScript).toHaveBeenCalledTimes(1);
    expect(deps.mediaService.generateImage).toHaveBeenCalledTimes(3); // 3 scenes
    expect(deps.mediaService.generateTTS).toHaveBeenCalledTimes(1);
    expect(deps.subtitleService.generateSubtitle).toHaveBeenCalledTimes(1);
    expect(deps.renderService.renderFullVideo).toHaveBeenCalledTimes(1);
  });

  it('generates one image per scene with the scene visual as prompt', async () => {
    const deps = makeDeps();
    await processWorkflowJob(deps, makeJob());

    const prompts = (deps.mediaService.generateImage as jest.Mock).mock.calls.map((c) => c[0]);
    expect(prompts).toEqual(['紫渐变', '蓝渐变', '绿渐变']);
  });

  it('concatenates scene narrations with newlines for TTS input', async () => {
    const deps = makeDeps();
    await processWorkflowJob(deps, makeJob());

    const ttsText = (deps.mediaService.generateTTS as jest.Mock).mock.calls[0][0];
    expect(ttsText).toBe('开场\n正文\nCTA');
  });

  // -------- input shapes --------

  it('skips trend + content extraction when only a keyword is provided', async () => {
    const deps = makeDeps();
    await processWorkflowJob(deps, makeJob({
      input: { keyword: '健康饮食', platform: 'douyin' },
    }));

    expect(deps.trendService.fetchVideoMetadata).not.toHaveBeenCalled();
    expect(deps.contentService.processUrl).not.toHaveBeenCalled();
    expect(deps.scriptService.generateScript).toHaveBeenCalledWith({
      topic: '健康饮食',
      platform: 'douyin',
    });
  });

  it('uses title from metadata as fallback topic when keyword is missing', async () => {
    const deps = makeDeps();
    await processWorkflowJob(deps, makeJob({
      input: { url: 'https://douyin.com/video/123', platform: 'douyin' },
    }));

    expect(deps.scriptService.generateScript).toHaveBeenCalledWith({
      topic: '原视频标题',
      platform: 'douyin',
    });
  });

  it('defaults platform to douyin when not specified', async () => {
    const deps = makeDeps();
    await processWorkflowJob(deps, makeJob({
      input: { keyword: '健身' },
    }));

    expect(deps.scriptService.generateScript).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'douyin' }),
    );
  });

  // -------- platform → resolution mapping --------

  const verticalPlatforms: Platform[] = ['douyin', 'kuaishou', 'tiktok'];
  const horizontalPlatforms: Platform[] = ['youtube', 'bilibili', 'xiaohongshu', 'weibo'];

  it.each(verticalPlatforms)('uses 1080x1920 for vertical platform=%s', async (platform) => {
    const deps = makeDeps();
    await processWorkflowJob(deps, makeJob({ input: { keyword: 't', platform } }));

    expect(deps.insertRenderOutput).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ resolution: '1080x1920' }),
    );
  });

  it.each(horizontalPlatforms)('uses 1920x1080 for horizontal platform=%s', async (platform) => {
    const deps = makeDeps();
    await processWorkflowJob(deps, makeJob({ input: { keyword: 't', platform } }));

    expect(deps.insertRenderOutput).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ resolution: '1920x1080' }),
    );
  });

  // -------- persistence wiring --------

  it('passes the workflow id into analysis persistence sink', async () => {
    const deps = makeDeps();
    await processWorkflowJob(deps, makeJob({ dbWorkflowId: 'wf-abc' }));

    expect(deps.analysisService.analyze).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        persist: expect.objectContaining({ workflowId: 'wf-abc' }),
      }),
    );
  });

  it('persists the script to the workflow', async () => {
    const deps = makeDeps();
    await processWorkflowJob(deps, makeJob({ dbWorkflowId: 'wf-xyz' }));

    expect(deps.insertScript).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        workflowId: 'wf-xyz',
        title: fakeScript.title,
        duration: fakeScript.duration,
        platform: 'douyin',
      }),
    );
  });

  it('persists one media asset row per generated image', async () => {
    const deps = makeDeps();
    await processWorkflowJob(deps, makeJob({ dbWorkflowId: 'wf-1' }));

    expect(deps.insertMediaAsset).toHaveBeenCalledTimes(3);
    expect(deps.insertMediaAsset).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({ workflowId: 'wf-1', type: 'image', source: 'ai_generated', prompt: '紫渐变' }),
    );
  });

  it('persists the final render output', async () => {
    const deps = makeDeps();
    await processWorkflowJob(deps, makeJob({ dbWorkflowId: 'wf-1' }));

    expect(deps.insertRenderOutput).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        workflowId: 'wf-1',
        videoUrl: fakeRender.video_url,
        duration: fakeScript.duration,
        fileSize: fakeRender.file_size,
      }),
    );
  });

  it('skips DB inserts entirely when dbWorkflowId is absent', async () => {
    const deps = makeDeps();
    await processWorkflowJob(deps, makeJob({ dbWorkflowId: undefined }));

    expect(deps.insertScript).not.toHaveBeenCalled();
    expect(deps.insertMediaAsset).not.toHaveBeenCalled();
    expect(deps.insertRenderOutput).not.toHaveBeenCalled();
    // updateStatus still receives step transitions, but no DB writes happen
    expect(deps.updateStatus).toHaveBeenCalled();
  });

  it('does not abort the pipeline when script insert fails', async () => {
    const deps = makeDeps();
    (deps.insertScript as jest.Mock).mockRejectedValueOnce(new Error('pg: connection refused'));

    const result = await processWorkflowJob(deps, makeJob());
    expect(result.status).toBe('completed');
    // Render still ran
    expect(deps.renderService.renderFullVideo).toHaveBeenCalledTimes(1);
  });

  it('aborts the pipeline when an image generation fails', async () => {
    const deps = makeDeps();
    let count = 0;
    (deps.mediaService.generateImage as jest.Mock).mockImplementation(async (_prompt: string) => {
      count++;
      if (count === 2) throw new Error('fal: rate limited');
      return fakeImage(_prompt);
    });

    await expect(processWorkflowJob(deps, makeJob())).rejects.toThrow('fal: rate limited');

    // Only two scenes were attempted (second one threw)
    expect(deps.mediaService.generateImage).toHaveBeenCalledTimes(2);
    // Pipeline aborted before TTS / render
    expect(deps.mediaService.generateTTS).not.toHaveBeenCalled();
    expect(deps.renderService.renderFullVideo).not.toHaveBeenCalled();

    const updateCalls = (deps.updateStatus as jest.Mock).mock.calls;
    const lastCall = updateCalls[updateCalls.length - 1];
    expect(lastCall[2]).toBe('failed');
    expect(lastCall[3]).toBe('fal: rate limited');
  });

  // -------- failure modes --------

  it('records failed status with error message and rethrows when script step throws', async () => {
    const deps = makeDeps();
    (deps.scriptService.generateScript as jest.Mock).mockRejectedValueOnce(
      new Error('Claude API 503'),
    );

    await expect(processWorkflowJob(deps, makeJob())).rejects.toThrow('Claude API 503');

    const updateCalls = (deps.updateStatus as jest.Mock).mock.calls;
    const lastCall = updateCalls[updateCalls.length - 1];
    expect(lastCall).toEqual(['wf-123', 'trend', 'failed', 'Claude API 503']);

    // Later services were never invoked
    expect(deps.mediaService.generateImage).not.toHaveBeenCalled();
    expect(deps.mediaService.generateTTS).not.toHaveBeenCalled();
    expect(deps.renderService.renderFullVideo).not.toHaveBeenCalled();
  });

  it('records failed status when render step throws', async () => {
    const deps = makeDeps();
    (deps.renderService.renderFullVideo as jest.Mock).mockRejectedValueOnce(
      new Error('ffmpeg: out of memory'),
    );

    await expect(processWorkflowJob(deps, makeJob())).rejects.toThrow('ffmpeg: out of memory');

    const updateCalls = (deps.updateStatus as jest.Mock).mock.calls;
    const lastCall = updateCalls[updateCalls.length - 1];
    expect(lastCall[1]).toBe('trend'); // default currentStep from job data
    expect(lastCall[2]).toBe('failed');
    expect(lastCall[3]).toBe('ffmpeg: out of memory');
  });

  it('uses currentStep from job data when present in the failure record', async () => {
    const deps = makeDeps();
    (deps.scriptService.generateScript as jest.Mock).mockRejectedValueOnce(new Error('boom'));

    await expect(
      processWorkflowJob(deps, makeJob({ currentStep: 'script' })),
    ).rejects.toThrow('boom');

    const updateCalls = (deps.updateStatus as jest.Mock).mock.calls;
    const lastCall = updateCalls[updateCalls.length - 1];
    expect(lastCall[1]).toBe('script');
  });

  it('handles non-Error throws gracefully (records stringified message)', async () => {
    const deps = makeDeps();
    (deps.scriptService.generateScript as jest.Mock).mockRejectedValueOnce('plain string error');

    await expect(processWorkflowJob(deps, makeJob())).rejects.toBe('plain string error');

    const updateCalls = (deps.updateStatus as jest.Mock).mock.calls;
    const lastCall = updateCalls[updateCalls.length - 1];
    expect(lastCall[3]).toBe('plain string error');
  });

  it('does not invoke render or media steps when trend extraction fails', async () => {
    const deps = makeDeps();
    (deps.trendService.fetchVideoMetadata as jest.Mock).mockRejectedValueOnce(
      new Error('yt-dlp: network unreachable'),
    );

    await expect(processWorkflowJob(deps, makeJob())).rejects.toThrow();

    expect(deps.contentService.processUrl).not.toHaveBeenCalled();
    expect(deps.analysisService.analyze).not.toHaveBeenCalled();
    expect(deps.renderService.renderFullVideo).not.toHaveBeenCalled();
  });

  // -------- knowledge base wiring --------

  it('wires the knowledge SDK into the analysis persistence sink', async () => {
    const deps = makeDeps();
    await processWorkflowJob(deps, makeJob());

    // Capture the persist sink the processor handed to analysisService.analyze
    const callArgs = (deps.analysisService.analyze as jest.Mock).mock.calls[0];
    const persist = callArgs[1].persist;
    expect(persist.knowledge.insert).toBeDefined();

    // Inserting via the sink delegates to deps.knowledgeSDK.insert
    const fakeResult = { id: 'a', source: {} as any, structure: {} as any, emotions: {} as any, viral_points: {} as any, style: {} as any };
    await persist.knowledge.insert(fakeResult);
    expect(deps.knowledgeSDK.insert).toHaveBeenCalledWith(fakeResult);
  });

  // -------- step name catalog --------

  it('exposes the canonical step names', () => {
    const names = getStepNames();
    expect(names).toContain('trend');
    expect(names).toContain('analysis');
    expect(names).toContain('script');
    expect(names).toContain('render');
    expect(names).toContain('done');
    expect(names[0]).toBe('trend');
    expect(names[names.length - 1]).toBe('done');
  });
});
