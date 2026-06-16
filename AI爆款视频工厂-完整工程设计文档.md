# AI爆款视频自动生成平台 — 完整工程设计文档

> 最后更新：2026-06-11

## 目标

输入：
- 热门视频URL
- 热门文章URL
- 热点关键词

输出：
- 原创脚本（爆款结构改写+语义变换）
- AI配音
- 自动字幕
- 自动视频
- MP4

目标平台：**全平台**（抖音/快手/小红书/B站/YouTube/TikTok）

---

# 一、系统架构

```text
                        ┌─────────────────────┐
                        │  Frontend (Next.js)  │
                        └─────────┬───────────┘
                                  │
                        ┌─────────▼───────────┐
                        │  API Gateway (NestJS) │
                        └─────────┬───────────┘
                                  │
                    ┌─────────────▼──────────────┐
                    │   Workflow Engine (LangGraph)│
                    └─────────────┬──────────────┘
                                  │
      ┌──────────┬────────┬───────┼────────┬──────────┬──────────┐
      ▼          ▼        ▼       ▼        ▼          ▼          ▼
  Trend     Content  Analysis  Script   Media     Subtitle   Render
  Service   Service  Service   Service  Service   Service    Service
      │          │        │       │        │          │          │
      │          │        ▼       ▼        │          │          │
      │          │    ┌────────┐ ┌──────┐  │          │          │
      │          │    │ Milvus │ │改写   │  │          │          │
      │          │    │ 知识库 │ │Pipeline│ │          │          │
      │          │    └────────┘ └──────┘  │          │          │
      │          │                          │          │          │
  ┌───▼──────────▼──────────────────────────▼──────────▼──────────▼───┐
  │                     基础设施层                                      │
  │  PostgreSQL │ Redis │ BullMQ │ Milvus │ MinIO │ Docker            │
  └──────────────────────────────────────────────────────────────────┘
```

---

# 二、数据流全链路

```text
用户输入: 热门视频URL / 热门文章URL / 热点关键词
    │
    ▼
[Trend Service] MediaCrawler + yt-dlp → 发现热门内容
    │
    ▼
[Content Service] yt-dlp下载 → FFmpeg提取音频 → Faster-Whisper转写
    │
    ▼
[Analysis Service] LLM三轮分析 → 结构化AnalysisResult
    │                                   │
    │                            Embedding → Milvus知识库
    │
    ▼
[Script Service]
    │
    ├─ Milvus检索Top-K相似爆款模式
    ├─ LLM结构改写（爆款骨架+新主题）
    ├─ LLM语义变换（多维度变换）
    └─ LLM评分 + Embedding原创度检测
    │
    ▼ 输出: 原创脚本 (scenes[])
    │
    ▼
[Media Service]
    ├─ Flux.1-dev生成配图
    ├─ Kling API生成视频片段
    └─ Pexels/Unsplash检索素材
    │
    ▼
[TTS] CosyVoice2 / Edge-TTS → AI配音音频
    │
    ▼
[Subtitle Service] WhisperX对齐 → pysubs2生成SRT/ASS
    │
    ▼
[Render Service] Remotion合成 + FFmpeg编码字幕 → MP4
    │
    ▼
输出: 原创MP4视频（配音+字幕+画面）
```

---

# 三、服务划分

## 3.1 trend-service — 热点发现

负责：
- 国内平台热点抓取（抖音/快手/小红书/B站/微博）
- 海外平台热点抓取（YouTube/TikTok）
- 热点聚合去重

工具选型：

| 功能 | 工具 | 说明 |
|------|------|------|
| 国内平台热点抓取 | **MediaCrawler** | Playwright自动登录，支持关键词搜索+热门内容 |
| 海外平台热点抓取 | **yt-dlp** (metadata模式) | `--dump-json` 提取元数据，覆盖1800+站点 |
| 热点聚合 | 自研 | BullMQ定时任务抓取热搜榜，聚合去重 |

输出：
```json
{
  "title": "xxx",
  "platform": "douyin",
  "url": "https://...",
  "views": 1000000,
  "likes": 50000,
  "comments": 3000
}
```

---

## 3.2 content-service — 内容提取

负责：
- 视频下载
- 音频提取
- 语音转写

工具选型：

| 功能 | 工具 | 说明 |
|------|------|------|
| 视频下载 | **yt-dlp** | 国内+海外全平台 |
| 音频提取 | **FFmpeg** | `yt-dlp -x --audio-format wav` |
| 语音转写 | **Faster-Whisper** (large-v3) | CTranslate2加速，4x速度 |
| 中文精准转写备选 | **FunASR / Paraformer** | 阿里开源，中文ASR最优 |
| 字级时间戳备选 | **WhisperX** | 字级对齐+说话人分离 |

输出：
```json
{
  "transcript": "完整转写文本...",
  "segments": [
    { "start": 0.0, "end": 3.5, "text": "第一段..." },
    { "start": 3.5, "end": 8.2, "text": "第二段..." }
  ]
}
```

---

## 3.3 analysis-service — 爆款分析（Phase 0 核心）

负责：
- 爆款结构分析
- 情绪曲线分析
- Hook分析
- 爆点识别
- 话术风格分析
- 分析结果向量化入库

工具选型：

| 功能 | 工具 | 说明 |
|------|------|------|
| 爆款分析 | **Claude Sonnet** | 三轮Prompt，长文本理解+结构化输出 |
| 分析结果存储 | **PostgreSQL** | 结构化JSON存储 |
| 向量化 | **text-embedding-3-small** | 1536维，性价比高 |
| 向量存储 | **Milvus** | 爆款模式向量库 |

### 分析维度

对每条爆款内容提取以下结构化信息：

```text
爆款内容分析结果 (AnalysisResult)
├── 元信息
│   ├── platform: 平台来源
│   ├── content_type: 内容类型（知识/情感/争议/教程/故事）
│   ├── target_audience: 目标受众画像
│   └── performance: 播放量/点赞/评论/转发
│
├── 结构分析
│   ├── hook_type: 钩子类型（震惊/提问/痛点/反常识/故事）
│   ├── hook_text: 钩子原文
│   ├── structure_pattern: 结构模式（Hook→痛点→方案→CTA）
│   ├── pacing: 节奏（快/中/慢）
│   └── duration_breakdown: 各段时长占比
│
├── 情绪分析
│   ├── emotion_arc: 情绪曲线（好奇→焦虑→释然→行动）
│   ├── emotion_intensity: 强度 1-10
│   └── trigger_points: 情绪触发点位置
│
├── 爆点识别
│   ├── viral_triggers: 爆点标签（共鸣/争议/猎奇/实用/社交货币）
│   ├── share_motivation: 转发动机
│   └── comment_triggers: 评论诱因
│
└── 话术分析
    ├── key_phrases: 关键话术
    ├── cta_type: 行动召唤类型
    └── language_style: 语言风格（口语/专业/幽默/煽情）
```

### 三轮分析Prompt

| 轮次 | 目标 | 输入 | 输出 |
|------|------|------|------|
| 第1轮 | 粗结构提取 | 转写文本 + 元信息 | 结构骨架、分段、Hook |
| 第2轮 | 情绪曲线 | 第1轮结果 + 原文 | 情绪弧线、触发点 |
| 第3轮 | 爆点归纳 | 前两轮结果 | 爆点标签、转发动机、话术风格 |

### 平台适配策略

- **抖音/快手**: 重点分析前3秒Hook强度、完播率节奏
- **小红书**: 侧重标题党模式、种草话术
- **B站**: 侧重信息密度、弹幕互动点
- **YouTube**: 侧重开场留存、章节结构

### 输出格式

```json
{
  "id": "analysis_001",
  "source": {
    "platform": "douyin",
    "url": "...",
    "title": "...",
    "views": 1000000
  },
  "structure": {
    "pattern": "Hook→痛点放大→案例佐证→解决方案→CTA",
    "hook": {
      "type": "反常识",
      "text": "你以为XXX？其实YYY",
      "duration_ratio": 0.05
    },
    "sections": [
      { "role": "痛点放大", "duration_ratio": 0.25, "emotion": "焦虑" },
      { "role": "案例佐证", "duration_ratio": 0.30, "emotion": "好奇" },
      { "role": "解决方案", "duration_ratio": 0.30, "emotion": "释然" },
      { "role": "CTA", "duration_ratio": 0.10, "emotion": "行动" }
    ]
  },
  "emotions": {
    "arc": "好奇→焦虑→释然→行动",
    "intensity": 8,
    "triggers": ["0:03 反常识开头", "0:15 痛点共鸣", "0:45 数据冲击"]
  },
  "viral_points": {
    "triggers": ["共鸣", "实用", "社交货币"],
    "share_motivation": "帮助别人避免踩坑",
    "comment_triggers": ["你中了几条？", "评论区说说你的经历"]
  },
  "style": {
    "language": "口语化",
    "key_phrases": ["千万别...", "99%的人不知道", "记得收藏"],
    "cta_type": "收藏+关注"
  }
}
```

---

## 3.4 script-service — 脚本生成（Phase 0 核心）

负责：
- 知识库检索爆款模式
- 多爆款融合
- 双层改写（结构+语义）
- 原创脚本生成
- 分镜生成

工具选型：

| 功能 | 工具 | 说明 |
|------|------|------|
| 知识库检索 | **Milvus** (via knowledge-sdk) | 多路检索：语义+元数据过滤 |
| 结构改写 | **Claude Sonnet** | 第一层：爆款骨架+新主题 |
| 语义变换 | **GPT-4o** | 第二层：多维度表述变换 |
| 质量评分 | **GPT-4o-mini** | 轻量评分（结构/原创度/吸引力） |
| 原创度检测 | **text-embedding-3-small** | 余弦相似度 < 0.7 |

### 爆款知识库（RAG + Milvus）

架构：
```text
analysis-service 分析结果
        ↓
    向量化 (text-embedding-3-small)
        ↓
    Milvus (存储+检索)
        ↑
  script-service (检索爆款模式)
        ↓
    注入改写Prompt
```

Milvus Collection Schema：
```text
Collection: viral_patterns
├── id (INT64, 主键)
├── vector (FLOAT_VECTOR, dim=1536)
├── metadata
│   ├── platform (VARCHAR)
│   ├── content_type (VARCHAR)
│   ├── structure_pattern (VARCHAR)
│   ├── hook_type (VARCHAR)
│   ├── emotion_arc (VARCHAR)
│   ├── viral_triggers (VARCHAR, JSON数组)
│   ├── views_level (VARCHAR)  -- "10w+", "100w+", "1000w+"
│   ├── language_style (VARCHAR)
│   └── source_analysis_id (VARCHAR)
└── content
    ├── original_hook (VARCHAR)
    ├── structure_template (VARCHAR)
    ├── key_phrases (VARCHAR, JSON数组)
    └── full_analysis (VARCHAR)
```

索引：IVF_FLAT + COSINE 相似度

检索流程：
1. **意图解析**: 根据主题/关键词确定目标内容类型、情绪、平台
2. **多路检索**: 语义相似度 Top-5 + structure_pattern 元数据过滤 + platform 过滤
3. **融合排序**: 相关度 × 0.7 + 爆款表现权重 × 0.3
4. **Prompt注入**: Top-K 爆款模式作为 few-shot 示例

知识库积累策略：
- **冷启动**: 批量分析50-100条各平台爆款入库（各平台10-15条）
- **持续积累**: 每次分析新爆款自动向量化入库
- **定期清洗**: 去重 + 过时内容降权

### 双层改写策略

#### 第一层：结构级改写

提取爆款结构骨架，用新主题重新填充：

```text
原始爆款:
  Hook(反常识) → 痛点放大(焦虑) → 案例(好奇) → 方案(释然) → CTA(行动)

改写输出:
  保持结构骨架 + 情绪曲线
  替换具体内容为新主题
  可选变换Hook类型
```

#### 第二层：语义级变换

在结构改写基础上，多维度变换确保原创性：

| 维度 | 方法 | 示例 |
|------|------|------|
| 同义改写 | 同义词替换、句式变换 | "99%的人不知道" → "几乎没几个人意识到" |
| 视角切换 | 第一人称↔第三人称↔上帝视角 | "我教你" → "这三步帮你" |
| 语序调整 | 倒叙/插叙/正叙切换 | 先说结果→再说原因 |
| 信息重组 | 合并/拆分/补充信息点 | 3个要点变5个 |
| 风格迁移 | 口语↔书面↔幽默↔专业 | 添加网络用语或专业术语 |

#### 完整改写Pipeline

```text
用户输入主题/关键词
        ↓
[知识库检索] 获取Top-K相似爆款模式
        ↓
[结构改写] 爆款骨架 + 新主题 → 生成初稿
        ↓
[语义变换] 多维度变换 → 确保原创性
        ↓
[质量评分] LLM评分（结构/原创度/吸引力，各1-10）
        ↓
   均分 ≥ 7? ──否──→ 换维度重试语义变换（最多3次）
        │
       是
        ↓
   输出最终脚本
```

#### 原创度保障机制

| 检测方式 | 实现方法 | 阈值 |
|----------|----------|------|
| 结构相似度 | 与知识库已有内容 structure_pattern 对比 | 不完全一致 |
| 文本相似度 | Embedding 余弦相似度 | < 0.7 |
| LLM自评 | 模型对原创度打分 | ≥ 7/10 |

输出：
```json
{
  "title": "脚本标题",
  "duration": 60,
  "platform": "douyin",
  "scenes": [
    {
      "id": 1,
      "role": "Hook",
      "emotion": "好奇",
      "duration": 3,
      "narration": "你以为XXX？其实YYY",
      "visual": "震撼开场画面",
      "subtitle": "你以为XXX？其实YYY"
    },
    {
      "id": 2,
      "role": "痛点放大",
      "emotion": "焦虑",
      "duration": 15,
      "narration": "...",
      "visual": "...",
      "subtitle": "..."
    }
  ]
}
```

---

## 3.5 media-service — 素材生成

负责：
- AI图片生成
- AI视频片段生成
- 素材检索
- 静态素材处理

工具选型：

| 功能 | 工具 | 说明 |
|------|------|------|
| AI图片生成 | **Flux.1-dev** | 开源最强，通过fal.ai API调用 |
| AI视频片段生成 | **Kling API** | 快手，中国内容最优，支持图生视频 |
| 开源视频生成备选 | **Wan2.1** (阿里) | 开源，中文支持好，需40GB+ VRAM |
| 素材检索 | **Pexels API / Unsplash API** | 免费素材库 |
| 静态素材处理 | **Pillow / PIL** | 中文文字叠加到图片 |

---

## 3.6 subtitle-service — 字幕生成

负责：
- WhisperX字级对齐
- 说话人分离
- SRT/ASS生成

工具选型：

| 功能 | 工具 | 说明 |
|------|------|------|
| 字幕对齐 | **WhisperX** | 字级时间戳（torchaudio） |
| 说话人分离 | **pyannote** (WhisperX内置) | 多人场景识别 |
| 字幕格式转换 | **pysubs2** | SRT / ASS / VTT 互转 |
| 字幕烧录 | **FFmpeg** | `ffmpeg -vf subtitles=...` |

Pipeline：WhisperX → pysubs2 → FFmpeg

---

## 3.7 render-service — 视频合成

负责：
- Remotion模板化渲染
- FFmpeg编码
- MP4导出

工具选型：

| 功能 | 工具 | 说明 |
|------|------|------|
| 模板化视频合成 | **Remotion** | React组件式视频构建 |
| 最终编码+字幕烧录 | **FFmpeg** | 硬件加速（NVENC） |
| 音视频混合 | **FFmpeg** | 配音+BGM+画面合成 |

Remotion渲染原始帧 → FFmpeg编码输出最终MP4

---

## 3.8 TTS配音

| 功能 | 工具 | 说明 |
|------|------|------|
| 生产级中文配音 | **CosyVoice2** (阿里) | 开源最强中文TTS，零样本声音克隆 |
| 快速原型/低成本 | **Edge-TTS** | 微软免费TTS，零GPU需求 |
| 云API备选 | **Fish-Speech 1.5** | 有云API，质量接近CosyVoice |

策略：MVP阶段用 Edge-TTS 快速验证，生产阶段切换 CosyVoice2

---

# 四、AI/LLM使用策略

| 用途 | 模型 | 理由 |
|------|------|------|
| 爆款分析（3轮Prompt） | **Claude Sonnet** | 长文本理解强，结构化输出稳定 |
| 脚本结构改写 | **Claude Sonnet** | 创意+结构化兼具 |
| 语义变换 | **GPT-4o** | 表述多样性更好 |
| 质量评分 | **GPT-4o-mini** | 轻量快速，成本低 |
| Embedding | **text-embedding-3-small** | 1536维，性价比高 |
| 中文精准转写备选 | **FunASR Paraformer** | 阿里开源，中文ASR最优 |

---

# 五、技术选型总览

## Frontend

- Next.js
- Tailwind
- shadcn/ui

## Backend

- NestJS
- PostgreSQL
- Redis
- BullMQ

## AI/LLM

- Claude Sonnet（分析+改写）
- GPT-4o（语义变换）
- GPT-4o-mini（评分）
- text-embedding-3-small（Embedding）

## Media

- Faster-Whisper（转写）
- WhisperX（字幕对齐）
- CosyVoice2 / Edge-TTS（配音）
- Flux.1-dev（图片生成）
- Kling API（视频生成）

## 知识库

- Milvus（向量数据库）
- text-embedding-3-small（Embedding）

## Render

- Remotion（模板渲染）
- FFmpeg（编码+字幕烧录）

---

# 六、Monorepo目录结构

```text
ai-video-factory/
├── apps/
│   ├── web/                        # Next.js前端
│   ├── api/                        # NestJS API Gateway
│   └── worker/                     # BullMQ Workers
│       ├── analysis-worker/        # 爆款分析任务
│       ├── embedding-worker/       # 向量化入库任务
│       └── render-worker/          # 视频渲染任务
├── services/
│   ├── trend-service/              # MediaCrawler + yt-dlp
│   ├── content-service/            # 下载+转写
│   ├── analysis-service/           # 爆款分析（Phase 0 核心）
│   ├── script-service/             # RAG+改写Pipeline（Phase 0 核心）
│   ├── media-service/              # Flux + Kling + 素材
│   ├── subtitle-service/           # WhisperX + pysubs2
│   └── render-service/             # Remotion + FFmpeg
├── packages/
│   ├── shared-types/               # TypeScript类型定义
│   ├── prompt-library/             # 分析/改写/评分Prompt
│   ├── knowledge-sdk/              # Milvus检索SDK
│   └── workflow-sdk/               # LangGraph工作流SDK
├── infra/
│   ├── docker/
│   │   ├── docker-compose.yml
│   │   ├── docker-compose.gpu.yml
│   │   ├── faster-whisper/
│   │   ├── whisperx/
│   │   ├── cosyvoice/
│   │   └── milvus/
│   └── k8s/
├── prompts/                        # Prompt模板文件
│   ├── analysis/
│   │   ├── structure.md            # 结构分析Prompt
│   │   ├── emotion.md              # 情绪分析Prompt
│   │   └── viral.md                # 爆点归纳Prompt
│   ├── rewrite/
│   │   ├── structure-rewrite.md    # 结构改写Prompt
│   │   └── semantic-rewrite.md     # 语义变换Prompt
│   └── scoring/
│       └── quality-score.md        # 质量评分Prompt
└── docs/
```

---

# 七、LangGraph工作流

```text
TrendAgent        → 发现热点
    ↓
ContentAgent      → 下载+转写
    ↓
AnalysisAgent     → 爆款分析 + 知识库入库
    ↓
ScriptAgent       → RAG检索 + 双层改写 + 评分
    ↓
StoryboardAgent   → 分镜生成
    ↓
MediaAgent        → 素材生成/检索
    ↓
VoiceAgent        → TTS配音
    ↓
SubtitleAgent     → 字幕对齐
    ↓
RenderAgent       → 视频合成 + MP4导出
```

---

# 八、基础设施

## Docker Compose服务清单

```yaml
services:
  # ── 数据层 ──
  postgres:              # PostgreSQL 结构化数据
  redis:                 # Redis 缓存+队列
  milvus-standalone:     # Milvus 向量数据库
  milvus-etcd:           # Milvus 元数据
  milvus-minio:          # Milvus 内部存储
  minio:                 # 对象存储（音视频文件）

  # ── AI服务层 ──
  faster-whisper:        # 语音转写 (GPU)
  whisperx:              # 字幕对齐 (GPU)
  cosyvoice:             # TTS配音 (GPU, 生产阶段)

  # ── 应用层 ──
  api:                   # NestJS API Gateway
  worker:                # BullMQ Worker
  web:                   # Next.js Frontend
```

## 硬件需求

| 组件 | 最低配置 | 推荐配置 |
|------|----------|----------|
| CPU | 8核 | 16核 |
| 内存 | 32GB | 64GB |
| GPU | NVIDIA 8GB VRAM | NVIDIA 24GB+ VRAM (如4090) |
| 存储 | 200GB SSD | 500GB+ NVMe |

---

# 九、开发阶段规划

## Phase 0 — 爆款分析+知识库+改写基础

| 阶段 | 内容 | 工具 | 产出 |
|------|------|------|------|
| P0-1 | 项目脚手架 + Docker基础服务 | Turborepo + Docker Compose | 可运行的项目骨架 |
| P0-2 | prompt-library + 分析Prompt | Claude/GPT | 可用的分析Prompt集 |
| P0-3 | analysis-service（多轮分析模型） | Claude + PostgreSQL | 输出完整AnalysisResult |
| P0-4 | Milvus部署 + knowledge-sdk | Milvus + text-embedding | 可用的向量检索SDK |
| P0-5 | 冷启动：分析50-100条爆款入库 | 全流程 | 有数据的爆款知识库 |
| P0-6 | 双层改写Pipeline + 评分机制 | LLM + Embedding | 可用的改写流程 |

## MVP Week 1-2 — 内容提取+脚本生成

| 周次 | 内容 | 工具 |
|------|------|------|
| W1 | content-service + Faster-Whisper转写 | yt-dlp + FFmpeg + Faster-Whisper |
| W2 | script-service接入知识库+改写Pipeline | Milvus + LLM |

## MVP Week 3-4 — 配音+字幕

| 周次 | 内容 | 工具 |
|------|------|------|
| W3 | Edge-TTS快速接入 / CosyVoice2部署 | Edge-TTS / CosyVoice2 |
| W4 | WhisperX字幕对齐 + SRT生成 | WhisperX + pysubs2 |

## MVP Week 5-6 — 渲染+编排

| 周次 | 内容 | 工具 |
|------|------|------|
| W5 | Remotion模板 + FFmpeg渲染出MP4 | Remotion + FFmpeg |
| W6 | LangGraph工作流编排 + 端到端测试 | LangGraph |

## 后续增强

| 阶段 | 内容 | 工具 |
|------|------|------|
| +1 | AI图片/视频素材生成 | Flux.1 + Kling API |
| +2 | 素材自动匹配（Pexels/Unsplash） | Pexels API |
| +3 | 自动发布到各平台 | 平台API |

---

# 十、验证方式

1. **Phase 0 验证**: 输入5条爆款视频 → 分析结果完整 → 知识库检索相关 → 改写输出原创脚本
2. **MVP验证**: 输入一个热门话题 → 全自动输出带配音+字幕的MP4视频
3. **原创度验证**: 改写脚本与原始内容Embedding相似度 < 0.7
4. **质量验证**: LLM评分均分 ≥ 7/10

---

# 十一、成本估算

| 组件 | 免费方案 | 付费方案 |
|------|----------|----------|
| 热点发现 | MediaCrawler + yt-dlp | Social Blade API ($0-$100/mo) |
| 语音转写 | Faster-Whisper (自部署) | AssemblyAI/Deepgram (按量) |
| AI配音 | Edge-TTS (免费) | Fish Audio API / CosyVoice (GPU成本) |
| 爆款分析+改写 | — | Claude + GPT API (按量) |
| Embedding | — | text-embedding-3-small (按量) |
| 图片生成 | Flux (自部署) | fal.ai / Replicate (按量) |
| 视频生成 | Wan2.1 (自部署) | Kling API / Runway ($0-$100/mo) |
| 视频渲染 | Remotion + FFmpeg | 免费 |
| 字幕 | WhisperX + pysubs2 | 免费 |
| 向量数据库 | Milvus (自部署) | Zilliz Cloud (托管Milvus) |
