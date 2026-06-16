# AI Video Factory

AI爆款视频自动生成平台 — 从热门内容输入到原创MP4视频输出的全自动化系统。

## Architecture

```
Monorepo (Turborepo + pnpm)
├── apps/
│   ├── api/          NestJS API Gateway (port 3000)
│   ├── web/          Next.js 15 + React 19 Frontend
│   └── worker/       BullMQ Workers
│       ├── analysis-worker/
│       ├── embedding-worker/
│       ├── render-worker/
│       └── workflow-worker/   8-step full pipeline
├── services/
│   ├── analysis-service/   多轮爆款分析 (Claude Sonnet)
│   ├── content-service/    视频下载 + Faster-Whisper 转写
│   ├── media-service/      TTS + 图片/视频素材生成
│   ├── render-service/     FFmpeg + Remotion 渲染
│   ├── script-service/     双层改写 Pipeline (Claude + GPT-4o)
│   ├── subtitle-service/   WhisperX 字幕对齐
│   └── trend-service/      yt-dlp 热点发现
├── packages/
│   ├── db/              Drizzle ORM + PostgreSQL
│   ├── knowledge-sdk/   Milvus 向量知识库
│   ├── prompt-library/  Prompt 模板管理
│   ├── shared-types/    TypeScript 类型定义
│   ├── storage-sdk/     MinIO 文件存储
│   └── workflow-sdk/    LangGraph 工作流编排
├── infra/docker/        Docker Compose (PostgreSQL + Redis + MinIO + Milvus)
└── prompts/             LLM Prompt 模板
```

## Pipeline

```
输入(URL/关键词)
  → trend (热点发现)
  → content (视频下载+转写)
  → analysis (三轮分析: 结构→情绪→爆点)
  → script (知识库检索→结构改写→语义变换→质量评分)
  → media (AI图片/视频生成)
  → voice (Edge-TTS / CosyVoice2 配音)
  → subtitle (WhisperX 字幕对齐)
  → render (FFmpeg渲染 → MP4)
输出(MP4 + 字幕 + 配音)
```

## Quick Start

### Prerequisites

- Node.js >= 18
- pnpm >= 8
- Docker & Docker Compose

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start infrastructure services

```bash
cd infra/docker
docker compose up -d
```

This starts: PostgreSQL 16, Redis 7, MinIO, Milvus 2.5 (with etcd).

For GPU services (Faster-Whisper, WhisperX, CosyVoice2):

```bash
docker compose -f docker-compose.gpu.yml up -d
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env with your API keys
```

Required keys:
- `ANTHROPIC_API_KEY` — Claude API
- `OPENAI_API_KEY` — GPT-4o + Embeddings
- `FAL_API_KEY` — Flux.1 image generation (optional)
- `PEXELS_API_KEY` — Stock footage (optional)

### 4. Run development

```bash
# Start all services
pnpm dev

# Or individually:
pnpm --filter @ai-video-factory/api dev
pnpm --filter @ai-video-factory/web dev
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/workflow` | Create workflow (URL or keyword) |
| GET | `/workflow` | List recent workflows |
| GET | `/workflow/:id` | Get workflow status |
| POST | `/script/generate` | Generate script from topic |
| GET | `/trend/search` | Search trending content |
| GET | `/trend/metadata` | Get video metadata |

## Testing

```bash
# Run all tests
npx jest

# Run specific package
npx jest packages/db/
npx jest services/analysis-service/
```

102 tests across 13 test suites.

## Tech Stack

- **Runtime**: Node.js, TypeScript
- **API**: NestJS 11
- **Frontend**: Next.js 15, React 19, Tailwind CSS 4
- **Database**: PostgreSQL 16, Drizzle ORM
- **Queue**: BullMQ + Redis 7
- **Vector DB**: Milvus 2.5
- **Storage**: MinIO
- **LLM**: Claude Sonnet 4 (analysis/rewrite), GPT-4o (semantic transform/scoring)
- **TTS**: Edge-TTS (MVP), CosyVoice2 (production)
- **STT**: Faster-Whisper (large-v3), WhisperX (alignment)
- **Image**: Flux.1 via fal.ai
- **Video**: Kling API
- **Render**: FFmpeg, Remotion
- **Workflow**: LangGraph
