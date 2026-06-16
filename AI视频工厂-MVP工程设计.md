# AI爆款视频自动生成平台（MVP）工程设计

## 目标

输入：
- 热门视频URL
- 热门文章URL
- 热点关键词

输出：
- 原创脚本
- AI配音
- 自动字幕
- 自动视频
- MP4

---

# 架构

```text
Frontend (Next.js)
    |
API Gateway (NestJS)
    |
+------------------------+
| Workflow Service       |
+------------------------+
    |
    +--> Trend Service
    +--> Content Service
    +--> Analysis Service
    +--> Script Service
    +--> Media Service
    +--> Subtitle Service
    +--> Render Service
```

---

# 服务划分

## trend-service

负责：
- 抓取热点
- 热门视频发现
- 热门文章发现

输出：
```json
{
  "title":"xxx",
  "platform":"youtube",
  "views":1000000
}
```

## content-service

负责：
- 视频下载
- 音频提取
- Faster-Whisper转写

输出：
```json
{
  "transcript":"..."
}
```

## analysis-service

负责：
- 爆款结构分析
- 情绪分析
- Hook分析

输出：
```json
{
  "hook":"震惊",
  "emotion":"好奇"
}
```

## script-service

负责：
- 多爆款融合
- 原创脚本生成
- 分镜生成

输出：
```json
{
  "scenes":[]
}
```

## media-service

负责：
- 图片生成
- 视频生成
- 素材检索

## subtitle-service

负责：
- WhisperX对齐
- SRT生成

## render-service

负责：
- Remotion渲染
- MP4导出

---

# 技术选型

## Frontend

- Next.js
- Tailwind
- shadcn/ui

## Backend

- NestJS
- PostgreSQL
- Redis
- BullMQ

## AI

- GPT
- Claude
- Gemini

## Media

- Faster-Whisper
- WhisperX
- CosyVoice
- Flux
- Kling

## Render

- Remotion
- FFmpeg

---

# Monorepo目录

```text
ai-video-factory/
├── apps/
│   ├── web/
│   ├── api/
│   └── worker/
├── services/
│   ├── trend-service/
│   ├── content-service/
│   ├── analysis-service/
│   ├── script-service/
│   ├── media-service/
│   ├── subtitle-service/
│   └── render-service/
├── packages/
│   ├── shared-types/
│   ├── prompt-library/
│   └── workflow-sdk/
├── infra/
│   ├── docker/
│   └── k8s/
└── docs/
```

---

# LangGraph工作流

```text
TrendAgent
    ↓
ContentAgent
    ↓
AnalysisAgent
    ↓
ScriptAgent
    ↓
StoryboardAgent
    ↓
MediaAgent
    ↓
SubtitleAgent
    ↓
RenderAgent
```

---

# MVP开发顺序

第一周
- Content Service
- Faster-Whisper

第二周
- Script Service
- GPT生成脚本

第三周
- CosyVoice
- Subtitle

第四周
- Remotion渲染

第五周
- LangGraph自动编排

第六周
- 自动发布
