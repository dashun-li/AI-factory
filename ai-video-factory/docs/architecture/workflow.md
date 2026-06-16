# Workflow pipeline

The workflow is an 8-stage state machine, tracked in PostgreSQL's `workflows.current_step`. Each stage writes structured data to dedicated tables (`scripts`, `analysis_results`, `media_assets`, `render_outputs`) which can be queried independently for debugging.

## Stages

### 1. `trend` — Trend discovery

**Input:** `input.url` (optional) or `input.keyword`
**Service:** `trend-service.fetchVideoMetadata`
**Output:** `title`, `views` (used as heuristics in later stages)
**Failure mode:** if the platform returns 4xx (e.g. deleted video), we mark the workflow as failed immediately and skip downstream.

### 2. `content` — Content extraction

**Input:** `input.url`
**Service:** `content-service.processUrl`
**Steps:** `yt-dlp` → `ffmpeg` audio extract → `faster-whisper` ASR
**Output:** `transcript` (string + segments)
**Failure mode:** URL is private/region-locked → fall back to empty transcript, downstream analysis will produce shallower output.

### 3. `analysis` — 3-round LLM analysis

**Input:** platform, title, views, url, transcript
**Service:** `analysis-service.analyze`
**LLM calls (3 rounds):**
  1. Structure analysis (hook, sections, pacing)
  2. Emotion analysis (arc, intensity, triggers)
  3. Viral-points analysis (triggers, share motivations)

**Side effect:** insert `analysis_result` row + push vector embedding to Milvus via `knowledge-sdk.insert`.
**Persistence:** handled inside the service via the `AnalysisPersistence` interface — caller (worker or controller) decides whether to opt in.

### 4. `script` — Script generation

**Input:** `input.keyword | title`, `platform`
**Service:** `script-service.generateScript`
**RAG:** queries Milvus for similar past scripts and inlines top-k as few-shot examples.
**Output:** `Script` (title, duration, scenes[])
**LLM calls:** 2 (outline, then scene expansion).

### 5. `media` — Media generation

**Input:** `script.scenes[*].visual` (visual prompt)
**Service:** `media-service.generateImage`
**Backend:** Fal.ai Flux.1-dev → image URL → optional MinIO upload.
**Output:** `MediaAsset[]` (one per scene, or empty if no scenes have visuals).

### 6. `voice` — TTS

**Input:** concatenated `script.scenes[*].narration`
**Service:** `media-service.generateTTS`
**Backend:** Edge-TTS (default, free, CPU) or CosyVoice2 (production, GPU).
**Output:** TTS audio file path (uploaded to MinIO if configured).

### 7. `subtitle` — Subtitles

**Input:** TTS audio + narration text
**Service:** `subtitle-service.align` (WhisperX) + `subtitle-service.generateSubtitle` (SRT/VTT/ASS)
**Output:** `Subtitle` (entries + content string)

### 8. `render` — Video render

**Input:** `script`, audio path, `subtitle`
**Service:** `render-service.renderFullVideo`
**Pipeline:** mix audio (voice + optional BGM) → Remotion render → burn subtitles → mux → MinIO upload.
**Output:** `RenderOutput` (video_url, duration, resolution, file_size).

### `done`

Worker writes final row, gateway emits WebSocket `status` event with `status='completed'`.

## Failure handling

Each stage is wrapped in:

```ts
try {
  await updateStep(id, step, 'running');
  // ... stage logic
  await updateStep(id, step, 'completed');
} catch (err) {
  await updateStep(id, step, 'failed', err.message);
  throw err;   // let BullMQ handle retry
}
```

BullMQ defaults: 3 retries with exponential backoff. After 3 failures, the job is moved to the failed queue and the workflow is permanently marked `failed`.

## Observability

- **Bull Board**: `pnpm --filter @ai-video-factory/api dev` exposes `/admin/queues` (only in dev).
- **Logs**: structured JSON to stdout, picked up by `kubectl logs` or your log aggregator.
- **WebSocket**: `ws://localhost:3000/workflow` with `{ subscribe: { workflowId } }`.
