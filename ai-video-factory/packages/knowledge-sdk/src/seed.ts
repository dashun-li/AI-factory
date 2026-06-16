/**
 * Cold-start knowledge base seed script.
 *
 * Inserts ~20 hand-crafted, representative viral analyses into the Milvus
 * `viral_patterns` collection so that:
 *
 *   1. The RAG path in `script-service` returns useful results on day 1.
 *   2. Filter coverage (platform × hook × emotion × viral_trigger × style) is
 *      exercised end-to-end.
 *   3. We can demonstrate quality without needing real viral data.
 *
 * Usage:
 *   pnpm --filter @ai-video-factory/knowledge-sdk seed
 *
 * Env:
 *   MILVUS_HOST   (default: localhost)
 *   MILVUS_PORT   (default: 19530)
 *   OPENAI_API_KEY (required)
 *   WIPE=1        (default: 0)  if set, drops the collection first
 *
 * Idempotency: re-running upserts on the same analysis_id (delete + insert).
 */

import 'dotenv/config';
import { MilvusClient, DataType } from '@zilliz/milvus2-sdk-node';
import OpenAI from 'openai';
import type { AnalysisResult, Platform, HookType, EmotionType, ViralTrigger, LanguageStyle } from '@ai-video-factory/shared-types';

const MILVUS_HOST = process.env.MILVUS_HOST || 'localhost';
const MILVUS_PORT = Number(process.env.MILVUS_PORT || 19530);
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const WIPE = process.env.WIPE === '1';

const COLLECTION = 'viral_patterns';
const DIM = 1536;

if (!OPENAI_KEY) {
  console.error('OPENAI_API_KEY is required. Set it in .env or the environment.');
  process.exit(1);
}

const client = new MilvusClient({ address: `${MILVUS_HOST}:${MILVUS_PORT}` });
const openai = new OpenAI({ apiKey: OPENAI_KEY });

interface SeedEntry {
  analysis: AnalysisResult;
}

const seeds: SeedEntry[] = [
  // ---- 抖音 (Douyin) ----
  {
    analysis: {
      id: 'seed-dy-001',
      source: { platform: 'douyin', url: 'https://www.douyin.com/video/seed-001', title: '90%的人不知道的小技巧', views: 12_000_000 },
      structure: {
        pattern: 'pain_point + solution',
        hook: { type: 'shock', text: '90%的人都不知道这个功能', duration_ratio: 0.1 },
        sections: [
          { role: 'hook', duration_ratio: 0.1, emotion: 'curiosity' },
          { role: 'body', duration_ratio: 0.7, emotion: 'relief' },
          { role: 'cta', duration_ratio: 0.2, emotion: 'action' },
        ],
      },
      emotions: { arc: 'curiosity → relief → satisfaction', intensity: 0.78, triggers: ['novelty', 'utility'] },
      viral_points: {
        triggers: ['utility', 'social_currency'],
        share_motivation: '用来帮助朋友和家人',
        comment_triggers: ['我之前都不知道', '太有用了'],
      },
      style: { language: 'colloquial', key_phrases: ['90%', '小技巧', '你不知道'], cta_type: 'save' },
    },
  },
  {
    analysis: {
      id: 'seed-dy-002',
      source: { platform: 'douyin', url: 'https://www.douyin.com/video/seed-002', title: '三分钟看完一部电影', views: 8_500_000 },
      structure: {
        pattern: 'hook + condensed narrative',
        hook: { type: 'question', text: '你看过这部电影吗？', duration_ratio: 0.08 },
        sections: [
          { role: 'hook', duration_ratio: 0.08, emotion: 'curiosity' },
          { role: 'body', duration_ratio: 0.85, emotion: 'surprise' },
          { role: 'cta', duration_ratio: 0.07, emotion: 'action' },
        ],
      },
      emotions: { arc: 'curiosity → engagement → surprise', intensity: 0.82, triggers: ['novelty', 'controversy'] },
      viral_points: {
        triggers: ['social_currency', 'novelty'],
        share_motivation: '和朋友讨论剧情',
        comment_triggers: ['结局猜到了', '这个系列还有别的吗'],
      },
      style: { language: 'humorous', key_phrases: ['三分钟', '你看过吗', '结局'], cta_type: 'comment' },
    },
  },
  {
    analysis: {
      id: 'seed-dy-003',
      source: { platform: 'douyin', url: 'https://www.douyin.com/video/seed-003', title: '普通人逆袭的真实故事', views: 5_200_000 },
      structure: {
        pattern: 'story arc',
        hook: { type: 'story', text: '他曾经月薪3000，现在...', duration_ratio: 0.12 },
        sections: [
          { role: 'hook', duration_ratio: 0.12, emotion: 'empathy' },
          { role: 'body', duration_ratio: 0.78, emotion: 'curiosity' },
          { role: 'cta', duration_ratio: 0.1, emotion: 'action' },
        ],
      },
      emotions: { arc: 'empathy → curiosity → inspiration', intensity: 0.88, triggers: ['resonance', 'social_currency'] },
      viral_points: {
        triggers: ['resonance', 'social_currency'],
        share_motivation: '激励自己和朋友',
        comment_triggers: ['感同身受', '我也想试试'],
      },
      style: { language: 'emotional', key_phrases: ['逆袭', '真实故事', '月薪'], cta_type: 'like' },
    },
  },
  {
    analysis: {
      id: 'seed-dy-004',
      source: { platform: 'douyin', url: 'https://www.douyin.com/video/seed-004', title: '这就是我不建议你去Costco的原因', views: 3_800_000 },
      structure: {
        pattern: 'counter-intuitive + reasoning',
        hook: { type: 'counter_intuitive', text: 'Costco其实不适合大部分人', duration_ratio: 0.1 },
        sections: [
          { role: 'hook', duration_ratio: 0.1, emotion: 'curiosity' },
          { role: 'body', duration_ratio: 0.8, emotion: 'anxiety' },
          { role: 'cta', duration_ratio: 0.1, emotion: 'action' },
        ],
      },
      emotions: { arc: 'curiosity → anxiety → relief', intensity: 0.7, triggers: ['controversy', 'utility'] },
      viral_points: {
        triggers: ['controversy', 'utility'],
        share_motivation: '避免朋友踩坑',
        comment_triggers: ['确实是这样', '但是我觉得挺好'],
      },
      style: { language: 'professional', key_phrases: ['不建议', '其实', '大部分人'], cta_type: 'comment' },
    },
  },
  {
    analysis: {
      id: 'seed-dy-005',
      source: { platform: 'douyin', url: 'https://www.douyin.com/video/seed-005', title: '挑战30天早起', views: 2_100_000 },
      structure: {
        pattern: 'challenge + progress',
        hook: { type: 'pain_point', text: '每天起床困难？', duration_ratio: 0.08 },
        sections: [
          { role: 'hook', duration_ratio: 0.08, emotion: 'anxiety' },
          { role: 'body', duration_ratio: 0.82, emotion: 'curiosity' },
          { role: 'cta', duration_ratio: 0.1, emotion: 'action' },
        ],
      },
      emotions: { arc: 'anxiety → curiosity → inspiration', intensity: 0.75, triggers: ['resonance', 'utility'] },
      viral_points: {
        triggers: ['resonance', 'utility'],
        share_motivation: '和伙伴一起打卡',
        comment_triggers: ['我也想挑战', '坚持下去'],
      },
      style: { language: 'emotional', key_phrases: ['早起', '挑战', '30天'], cta_type: 'follow' },
    },
  },

  // ---- 小红书 (Xiaohongshu) ----
  {
    analysis: {
      id: 'seed-xhs-001',
      source: { platform: 'xiaohongshu', url: 'https://www.xiaohongshu.com/explore/seed-001', title: '均价50的早秋穿搭', views: 1_500_000 },
      structure: {
        pattern: 'listicle',
        hook: { type: 'pain_point', text: '秋装太贵？这5套不到500', duration_ratio: 0.1 },
        sections: [
          { role: 'hook', duration_ratio: 0.1, emotion: 'curiosity' },
          { role: 'body', duration_ratio: 0.8, emotion: 'relief' },
          { role: 'cta', duration_ratio: 0.1, emotion: 'action' },
        ],
      },
      emotions: { arc: 'curiosity → relief → satisfaction', intensity: 0.72, triggers: ['utility', 'social_currency'] },
      viral_points: {
        triggers: ['utility', 'social_currency'],
        share_motivation: '朋友也在找平价搭配',
        comment_triggers: ['链接呢', '求店铺名'],
      },
      style: { language: 'colloquial', key_phrases: ['均价', '早秋', '穿搭'], cta_type: 'save' },
    },
  },
  {
    analysis: {
      id: 'seed-xhs-002',
      source: { platform: 'xiaohongshu', url: 'https://www.xiaohongshu.com/explore/seed-002', title: '上海小众咖啡馆合集', views: 980_000 },
      structure: {
        pattern: 'listicle + visuals',
        hook: { type: 'question', text: '上海哪里的咖啡最好喝？', duration_ratio: 0.08 },
        sections: [
          { role: 'hook', duration_ratio: 0.08, emotion: 'curiosity' },
          { role: 'body', duration_ratio: 0.85, emotion: 'relief' },
          { role: 'cta', duration_ratio: 0.07, emotion: 'action' },
        ],
      },
      emotions: { arc: 'curiosity → engagement → satisfaction', intensity: 0.65, triggers: ['novelty', 'social_currency'] },
      viral_points: {
        triggers: ['novelty', 'social_currency'],
        share_motivation: '收藏备用',
        comment_triggers: ['已收藏', '下个周末去'],
      },
      style: { language: 'colloquial', key_phrases: ['小众', '合集', '咖啡'], cta_type: 'save' },
    },
  },
  {
    analysis: {
      id: 'seed-xhs-003',
      source: { platform: 'xiaohongshu', url: 'https://www.xiaohongshu.com/explore/seed-003', title: '敏感肌救星！这罐乳液真的有用', views: 750_000 },
      structure: {
        pattern: 'review + before/after',
        hook: { type: 'pain_point', text: '烂脸3年的我终于找到了', duration_ratio: 0.12 },
        sections: [
          { role: 'hook', duration_ratio: 0.12, emotion: 'empathy' },
          { role: 'body', duration_ratio: 0.78, emotion: 'relief' },
          { role: 'cta', duration_ratio: 0.1, emotion: 'action' },
        ],
      },
      emotions: { arc: 'empathy → relief → trust', intensity: 0.8, triggers: ['resonance', 'utility'] },
      viral_points: {
        triggers: ['resonance', 'utility'],
        share_motivation: '分享给敏感肌朋友',
        comment_triggers: ['求链接', '我也想买'],
      },
      style: { language: 'emotional', key_phrases: ['敏感肌', '救星', '真的有用'], cta_type: 'save' },
    },
  },

  // ---- B站 (Bilibili) ----
  {
    analysis: {
      id: 'seed-bili-001',
      source: { platform: 'bilibili', url: 'https://www.bilibili.com/video/seed-001', title: '深度解析：为什么这个游戏突然火了', views: 4_500_000 },
      structure: {
        pattern: 'analysis + evidence',
        hook: { type: 'question', text: '一个5年前的老游戏为什么突然爆火？', duration_ratio: 0.05 },
        sections: [
          { role: 'hook', duration_ratio: 0.05, emotion: 'curiosity' },
          { role: 'body', duration_ratio: 0.9, emotion: 'engagement' },
          { role: 'cta', duration_ratio: 0.05, emotion: 'action' },
        ],
      },
      emotions: { arc: 'curiosity → engagement → satisfaction', intensity: 0.85, triggers: ['novelty', 'utility'] },
      viral_points: {
        triggers: ['novelty', 'utility'],
        share_motivation: '深度内容值得二刷',
        comment_triggers: ['分析到位', '我之前没想到'],
      },
      style: { language: 'professional', key_phrases: ['深度解析', '为什么', '突然火'], cta_type: 'like' },
    },
  },
  {
    analysis: {
      id: 'seed-bili-002',
      source: { platform: 'bilibili', url: 'https://www.bilibili.com/video/seed-002', title: '一键三连！这部番剧我等了三年', views: 2_800_000 },
      structure: {
        pattern: 'enthusiasm + review',
        hook: { type: 'shock', text: '这部神作终于回归了', duration_ratio: 0.08 },
        sections: [
          { role: 'hook', duration_ratio: 0.08, emotion: 'surprise' },
          { role: 'body', duration_ratio: 0.85, emotion: 'empathy' },
          { role: 'cta', duration_ratio: 0.07, emotion: 'action' },
        ],
      },
      emotions: { arc: 'surprise → engagement → inspiration', intensity: 0.9, triggers: ['resonance', 'social_currency'] },
      viral_points: {
        triggers: ['resonance', 'social_currency'],
        share_motivation: '和小伙伴讨论剧情',
        comment_triggers: ['神作', '催更'],
      },
      style: { language: 'humorous', key_phrases: ['一键三连', '等了三年', '神作'], cta_type: 'like' },
    },
  },

  // ---- YouTube (longer-form) ----
  {
    analysis: {
      id: 'seed-yt-001',
      source: { platform: 'youtube', url: 'https://www.youtube.com/watch?v=seed-001', title: '我把特斯拉卖了，买了这辆车', views: 7_200_000 },
      structure: {
        pattern: 'comparison + reasoning',
        hook: { type: 'shock', text: '我把特斯拉Model Y卖了', duration_ratio: 0.05 },
        sections: [
          { role: 'hook', duration_ratio: 0.05, emotion: 'curiosity' },
          { role: 'body', duration_ratio: 0.9, emotion: 'engagement' },
          { role: 'cta', duration_ratio: 0.05, emotion: 'action' },
        ],
      },
      emotions: { arc: 'curiosity → engagement → relief', intensity: 0.78, triggers: ['controversy', 'utility'] },
      viral_points: {
        triggers: ['controversy', 'utility'],
        share_motivation: '准备买车的朋友会感兴趣',
        comment_triggers: ['同意', '不同意你的观点'],
      },
      style: { language: 'professional', key_phrases: ['特斯拉', '卖了', '买了'], cta_type: 'comment' },
    },
  },
  {
    analysis: {
      id: 'seed-yt-002',
      source: { platform: 'youtube', url: 'https://www.youtube.com/watch?v=seed-002', title: '如何在30天内学会任何新技能', views: 1_900_000 },
      structure: {
        pattern: 'framework + examples',
        hook: { type: 'counter_intuitive', text: '大部分学习方法都是错的', duration_ratio: 0.06 },
        sections: [
          { role: 'hook', duration_ratio: 0.06, emotion: 'curiosity' },
          { role: 'body', duration_ratio: 0.88, emotion: 'relief' },
          { role: 'cta', duration_ratio: 0.06, emotion: 'action' },
        ],
      },
      emotions: { arc: 'curiosity → engagement → inspiration', intensity: 0.82, triggers: ['utility', 'novelty'] },
      viral_points: {
        triggers: ['utility', 'novelty'],
        share_motivation: '实用框架可以马上用',
        comment_triggers: ['收藏了', '亲测有效'],
      },
      style: { language: 'professional', key_phrases: ['30天', '任何技能', '方法'], cta_type: 'save' },
    },
  },

  // ---- TikTok ----
  {
    analysis: {
      id: 'seed-tt-001',
      source: { platform: 'tiktok', url: 'https://www.tiktok.com/@user/video/seed-001', title: 'POV: When the beat drops', views: 22_000_000 },
      structure: {
        pattern: 'trending audio + visual sync',
        hook: { type: 'shock', text: 'Wait for it...', duration_ratio: 0.15 },
        sections: [
          { role: 'hook', duration_ratio: 0.15, emotion: 'curiosity' },
          { role: 'body', duration_ratio: 0.75, emotion: 'surprise' },
          { role: 'cta', duration_ratio: 0.1, emotion: 'action' },
        ],
      },
      emotions: { arc: 'curiosity → surprise → satisfaction', intensity: 0.92, triggers: ['novelty', 'social_currency'] },
      viral_points: {
        triggers: ['novelty', 'social_currency'],
        share_motivation: '舞蹈/特效特别有传播性',
        comment_triggers: ['太会拍了', '等下一首'],
      },
      style: { language: 'humorous', key_phrases: ['POV', 'beat drops', 'wait for it'], cta_type: 'share' },
    },
  },
  {
    analysis: {
      id: 'seed-tt-002',
      source: { platform: 'tiktok', url: 'https://www.tiktok.com/@user/video/seed-002', title: 'The cleaning hack everyone needs', views: 15_000_000 },
      structure: {
        pattern: 'transformative before/after',
        hook: { type: 'pain_point', text: 'Stop wasting time cleaning', duration_ratio: 0.1 },
        sections: [
          { role: 'hook', duration_ratio: 0.1, emotion: 'anxiety' },
          { role: 'body', duration_ratio: 0.8, emotion: 'relief' },
          { role: 'cta', duration_ratio: 0.1, emotion: 'action' },
        ],
      },
      emotions: { arc: 'anxiety → relief → satisfaction', intensity: 0.78, triggers: ['utility', 'novelty'] },
      viral_points: {
        triggers: ['utility', 'novelty'],
        share_motivation: '立刻能用上',
        comment_triggers: ['Trying this', 'Game changer'],
      },
      style: { language: 'colloquial', key_phrases: ['hack', 'cleaning', 'needs'], cta_type: 'save' },
    },
  },

  // ---- 快手 (Kuaishou) ----
  {
    analysis: {
      id: 'seed-ks-001',
      source: { platform: 'kuaishou', url: 'https://www.kuaishou.com/short-video/seed-001', title: '农村小伙做了一件事，全村都感动了', views: 6_300_000 },
      structure: {
        pattern: 'story + emotional climax',
        hook: { type: 'story', text: '他做的这件事让全村人哭了', duration_ratio: 0.1 },
        sections: [
          { role: 'hook', duration_ratio: 0.1, emotion: 'curiosity' },
          { role: 'body', duration_ratio: 0.8, emotion: 'empathy' },
          { role: 'cta', duration_ratio: 0.1, emotion: 'action' },
        ],
      },
      emotions: { arc: 'curiosity → empathy → inspiration', intensity: 0.95, triggers: ['resonance', 'social_currency'] },
      viral_points: {
        triggers: ['resonance', 'social_currency'],
        share_motivation: '真实故事打动人',
        comment_triggers: ['看哭了', '好人一生平安'],
      },
      style: { language: 'emotional', key_phrases: ['农村', '全村', '感动'], cta_type: 'like' },
    },
  },
  {
    analysis: {
      id: 'seed-ks-002',
      source: { platform: 'kuaishou', url: 'https://www.kuaishou.com/short-video/seed-002', title: '一道菜让丈母娘笑开颜', views: 4_100_000 },
      structure: {
        pattern: 'cooking + relationship',
        hook: { type: 'question', text: '丈母娘第一次来我家，我做了...', duration_ratio: 0.08 },
        sections: [
          { role: 'hook', duration_ratio: 0.08, emotion: 'curiosity' },
          { role: 'body', duration_ratio: 0.82, emotion: 'relief' },
          { role: 'cta', duration_ratio: 0.1, emotion: 'action' },
        ],
      },
      emotions: { arc: 'curiosity → relief → satisfaction', intensity: 0.7, triggers: ['resonance', 'social_currency'] },
      viral_points: {
        triggers: ['resonance', 'social_currency'],
        share_motivation: '婆媳关系是永恒话题',
        comment_triggers: ['求菜谱', '你丈母娘真好'],
      },
      style: { language: 'colloquial', key_phrases: ['丈母娘', '一道菜', '笑开颜'], cta_type: 'comment' },
    },
  },

  // ---- 微博 (Weibo) ----
  {
    analysis: {
      id: 'seed-wb-001',
      source: { platform: 'weibo', url: 'https://weibo.com/seed-001', title: '热搜第一：这件事终于被曝光了', views: 9_500_000 },
      structure: {
        pattern: 'breaking news + analysis',
        hook: { type: 'shock', text: '这背后的真相太可怕了', duration_ratio: 0.08 },
        sections: [
          { role: 'hook', duration_ratio: 0.08, emotion: 'curiosity' },
          { role: 'body', duration_ratio: 0.85, emotion: 'anxiety' },
          { role: 'cta', duration_ratio: 0.07, emotion: 'action' },
        ],
      },
      emotions: { arc: 'curiosity → anxiety → action', intensity: 0.85, triggers: ['controversy', 'novelty'] },
      viral_points: {
        triggers: ['controversy', 'novelty'],
        share_motivation: '让更多人知道',
        comment_triggers: ['必须查清楚', '不敢相信'],
      },
      style: { language: 'emotional', key_phrases: ['热搜', '曝光', '真相'], cta_type: 'share' },
    },
  },
  {
    analysis: {
      id: 'seed-wb-002',
      source: { platform: 'weibo', url: 'https://weibo.com/seed-002', title: '明星夫妻离婚内幕', views: 11_000_000 },
      structure: {
        pattern: 'gossip + speculation',
        hook: { type: 'shock', text: '他们居然已经离婚了', duration_ratio: 0.06 },
        sections: [
          { role: 'hook', duration_ratio: 0.06, emotion: 'surprise' },
          { role: 'body', duration_ratio: 0.9, emotion: 'curiosity' },
          { role: 'cta', duration_ratio: 0.04, emotion: 'action' },
        ],
      },
      emotions: { arc: 'surprise → curiosity → engagement', intensity: 0.9, triggers: ['controversy', 'novelty'] },
      viral_points: {
        triggers: ['controversy', 'social_currency'],
        share_motivation: '八卦是人类本性',
        comment_triggers: ['早就猜到了', '吃瓜'],
      },
      style: { language: 'colloquial', key_phrases: ['明星', '离婚', '内幕'], cta_type: 'comment' },
    },
  },

  // ============ Phase 1 Expansion (2026-06-16) ============
  // Goal: widen coverage so each platform has ≥5 entries and the filter
  // matrix (hook × emotion × trigger × style) has more variants.

  // ---- 抖音 (Douyin) additional ----
  {
    analysis: {
      id: 'seed-dy-006',
      source: { platform: 'douyin', url: 'https://www.douyin.com/video/seed-dy-006', title: '一个月瘦10斤的真相', views: 6_700_000 },
      structure: {
        pattern: 'myth_bust + method',
        hook: { type: 'counter_intuitive', text: '少吃并不会瘦，这才是关键', duration_ratio: 0.1 },
        sections: [
          { role: 'hook', duration_ratio: 0.1, emotion: 'surprise' },
          { role: 'body', duration_ratio: 0.7, emotion: 'relief' },
          { role: 'cta', duration_ratio: 0.2, emotion: 'action' },
        ],
      },
      emotions: { arc: 'surprise → curiosity → relief', intensity: 0.82, triggers: ['novelty', 'utility'] },
      viral_points: {
        triggers: ['utility', 'controversy'],
        share_motivation: '颠覆减肥常识',
        comment_triggers: ['原来我一直都错了', '收藏了'],
      },
      style: { language: 'professional', key_phrases: ['一个月', '瘦10斤', '代谢'], cta_type: 'save' },
    },
  },
  {
    analysis: {
      id: 'seed-dy-007',
      source: { platform: 'douyin', url: 'https://www.douyin.com/video/seed-dy-007', title: '凌晨三点失眠想明白的事', views: 9_300_000 },
      structure: {
        pattern: 'reflection + insight',
        hook: { type: 'story', text: '昨晚失眠到三点，我想通了三件事', duration_ratio: 0.12 },
        sections: [
          { role: 'hook', duration_ratio: 0.12, emotion: 'empathy' },
          { role: 'body', duration_ratio: 0.75, emotion: 'empathy' },
          { role: 'cta', duration_ratio: 0.13, emotion: 'action' },
        ],
      },
      emotions: { arc: 'empathy → catharsis → resolve', intensity: 0.91, triggers: ['resonance'] },
      viral_points: {
        triggers: ['resonance', 'social_currency'],
        share_motivation: '深夜失眠的人都懂',
        comment_triggers: ['写到我心里了', '默默收藏'],
      },
      style: { language: 'emotional', key_phrases: ['失眠', '三点', '想明白'], cta_type: 'save' },
    },
  },

  // ---- 小红书 (Xiaohongshu) additional ----
  {
    analysis: {
      id: 'seed-xhs-004',
      source: { platform: 'xiaohongshu', url: 'https://www.xiaohongshu.com/explore/seed-xhs-004', title: '0元改造出租屋｜ins风卧室', views: 320_000 },
      structure: {
        pattern: 'before_after + checklist',
        hook: { type: 'shock', text: '0元把出租屋改成了ins风', duration_ratio: 0.08 },
        sections: [
          { role: 'hook', duration_ratio: 0.08, emotion: 'surprise' },
          { role: 'body', duration_ratio: 0.82, emotion: 'curiosity' },
          { role: 'cta', duration_ratio: 0.1, emotion: 'action' },
        ],
      },
      emotions: { arc: 'surprise → curiosity → satisfaction', intensity: 0.8, triggers: ['utility', 'novelty'] },
      viral_points: {
        triggers: ['utility', 'social_currency'],
        share_motivation: '出租党必备改造清单',
        comment_triggers: ['求购物车', '我也要抄作业'],
      },
      style: { language: 'colloquial', key_phrases: ['0元', 'ins风', '出租屋'], cta_type: 'save' },
    },
  },
  {
    analysis: {
      id: 'seed-xhs-005',
      source: { platform: 'xiaohongshu', url: 'https://www.xiaohongshu.com/explore/seed-xhs-005', title: '上班族一周备餐｜健康又省钱', views: 280_000 },
      structure: {
        pattern: 'routine + listicle',
        hook: { type: 'question', text: '上班族怎么吃才不胖又不贵？', duration_ratio: 0.1 },
        sections: [
          { role: 'hook', duration_ratio: 0.1, emotion: 'curiosity' },
          { role: 'body', duration_ratio: 0.78, emotion: 'relief' },
          { role: 'cta', duration_ratio: 0.12, emotion: 'action' },
        ],
      },
      emotions: { arc: 'curiosity → relief → satisfaction', intensity: 0.7, triggers: ['utility', 'resonance'] },
      viral_points: {
        triggers: ['utility', 'resonance'],
        share_motivation: '打工人备餐抄作业',
        comment_triggers: ['求食谱', '太需要了'],
      },
      style: { language: 'professional', key_phrases: ['备餐', '健康', '省钱'], cta_type: 'save' },
    },
  },

  // ---- B站 (Bilibili) additional ----
  {
    analysis: {
      id: 'seed-bili-003',
      source: { platform: 'bilibili', url: 'https://www.bilibili.com/video/seed-bili-003', title: '十分钟搞懂量子计算原理', views: 1_500_000 },
      structure: {
        pattern: 'tutorial + analogy',
        hook: { type: 'counter_intuitive', text: '你以为量子计算只是更快？其实它颠覆了计算本身', duration_ratio: 0.06 },
        sections: [
          { role: 'hook', duration_ratio: 0.06, emotion: 'curiosity' },
          { role: 'body', duration_ratio: 0.9, emotion: 'surprise' },
          { role: 'cta', duration_ratio: 0.04, emotion: 'action' },
        ],
      },
      emotions: { arc: 'curiosity → surprise → insight', intensity: 0.76, triggers: ['novelty', 'utility'] },
      viral_points: {
        triggers: ['novelty', 'social_currency'],
        share_motivation: '硬核科普，看完秒懂',
        comment_triggers: ['一键三连', '老师讲得真好'],
      },
      style: { language: 'professional', key_phrases: ['量子计算', '十分钟', '原理'], cta_type: 'save' },
    },
  },
  {
    analysis: {
      id: 'seed-bili-004',
      source: { platform: 'bilibili', url: 'https://www.bilibili.com/video/seed-bili-004', title: '我把童年动画都做成了混剪', views: 2_300_000 },
      structure: {
        pattern: 'nostalgia + montage',
        hook: { type: 'story', text: '这些动画你看过几部？', duration_ratio: 0.08 },
        sections: [
          { role: 'hook', duration_ratio: 0.08, emotion: 'empathy' },
          { role: 'body', duration_ratio: 0.85, emotion: 'empathy' },
          { role: 'cta', duration_ratio: 0.07, emotion: 'action' },
        ],
      },
      emotions: { arc: 'nostalgia → peak emotion → catharsis', intensity: 0.94, triggers: ['resonance', 'social_currency'] },
      viral_points: {
        triggers: ['resonance', 'social_currency'],
        share_motivation: '童年回忆杀',
        comment_triggers: ['泪目了', '童年回来了'],
      },
      style: { language: 'emotional', key_phrases: ['童年', '动画', '混剪'], cta_type: 'save' },
    },
  },

  // ---- YouTube additional ----
  {
    analysis: {
      id: 'seed-yt-003',
      source: { platform: 'youtube', url: 'https://youtube.com/watch=seed-yt-003', title: 'I Built My Own PC From Scratch', views: 850_000 },
      structure: {
        pattern: 'project_log + lessons',
        hook: { type: 'counter_intuitive', text: 'Building a PC is easier than you think', duration_ratio: 0.05 },
        sections: [
          { role: 'hook', duration_ratio: 0.05, emotion: 'curiosity' },
          { role: 'body', duration_ratio: 0.9, emotion: 'surprise' },
          { role: 'cta', duration_ratio: 0.05, emotion: 'action' },
        ],
      },
      emotions: { arc: 'curiosity → surprise → accomplishment', intensity: 0.72, triggers: ['novelty', 'utility'] },
      viral_points: {
        triggers: ['utility', 'novelty'],
        share_motivation: 'Step-by-step build guide',
        comment_triggers: ['First build done!', 'Saved me hours'],
      },
      style: { language: 'professional', key_phrases: ['PC build', 'from scratch', 'lessons'], cta_type: 'save' },
    },
  },
  {
    analysis: {
      id: 'seed-yt-004',
      source: { platform: 'youtube', url: 'https://youtube.com/watch=seed-yt-004', title: 'The Truth About Passive Income', views: 1_400_000 },
      structure: {
        pattern: 'myth_bust + framework',
        hook: { type: 'counter_intuitive', text: 'Passive income is a lie — here is the truth', duration_ratio: 0.07 },
        sections: [
          { role: 'hook', duration_ratio: 0.07, emotion: 'surprise' },
          { role: 'body', duration_ratio: 0.85, emotion: 'curiosity' },
          { role: 'cta', duration_ratio: 0.08, emotion: 'action' },
        ],
      },
      emotions: { arc: 'surprise → skepticism → clarity', intensity: 0.8, triggers: ['controversy', 'utility'] },
      viral_points: {
        triggers: ['controversy', 'utility'],
        share_motivation: 'Anti-hype take worth saving',
        comment_triggers: ['Finally someone said it', 'Bookmarked'],
      },
      style: { language: 'professional', key_phrases: ['passive income', 'truth', 'framework'], cta_type: 'save' },
    },
  },

  // ---- TikTok additional ----
  {
    analysis: {
      id: 'seed-tt-003',
      source: { platform: 'tiktok', url: 'https://tiktok.com/@seed/video/003', title: 'POV: you finally graduate', views: 4_200_000 },
      structure: {
        pattern: 'pov + emotion',
        hook: { type: 'story', text: 'POV: 4 years of stress in 15 seconds', duration_ratio: 0.15 },
        sections: [
          { role: 'hook', duration_ratio: 0.15, emotion: 'empathy' },
          { role: 'body', duration_ratio: 0.75, emotion: 'empathy' },
          { role: 'cta', duration_ratio: 0.1, emotion: 'action' },
        ],
      },
      emotions: { arc: 'stress → catharsis → pride', intensity: 0.88, triggers: ['resonance', 'social_currency'] },
      viral_points: {
        triggers: ['resonance', 'social_currency'],
        share_motivation: 'Every student feels this',
        comment_triggers: ['This is literally me', 'Crying'],
      },
      style: { language: 'emotional', key_phrases: ['POV', 'graduate', '4 years'], cta_type: 'comment' },
    },
  },
  {
    analysis: {
      id: 'seed-tt-004',
      source: { platform: 'tiktok', url: 'https://tiktok.com/@seed/video/004', title: '5 things I wish I knew at 20', views: 8_900_000 },
      structure: {
        pattern: 'listicle + reflection',
        hook: { type: 'counter_intuitive', text: 'These 5 things would have saved me 10 years', duration_ratio: 0.08 },
        sections: [
          { role: 'hook', duration_ratio: 0.08, emotion: 'curiosity' },
          { role: 'body', duration_ratio: 0.85, emotion: 'empathy' },
          { role: 'cta', duration_ratio: 0.07, emotion: 'action' },
        ],
      },
      emotions: { arc: 'curiosity → reflection → resolve', intensity: 0.83, triggers: ['resonance', 'utility'] },
      viral_points: {
        triggers: ['resonance', 'utility'],
        share_motivation: 'Life advice worth saving',
        comment_triggers: ['Wish I saw this earlier', 'Saved'],
      },
      style: { language: 'professional', key_phrases: ['wish I knew', 'at 20', '5 things'], cta_type: 'save' },
    },
  },

  // ---- 快手 (Kuaishou) additional ----
  {
    analysis: {
      id: 'seed-ks-003',
      source: { platform: 'kuaishou', url: 'https://www.kuaishou.com/short-video/seed-ks-003', title: '农村爷爷做的传统年糕', views: 5_600_000 },
      structure: {
        pattern: 'craft + heritage',
        hook: { type: 'story', text: '爷爷做了50年的年糕配方', duration_ratio: 0.1 },
        sections: [
          { role: 'hook', duration_ratio: 0.1, emotion: 'empathy' },
          { role: 'body', duration_ratio: 0.8, emotion: 'curiosity' },
          { role: 'cta', duration_ratio: 0.1, emotion: 'action' },
        ],
      },
      emotions: { arc: 'nostalgia → warmth → gratitude', intensity: 0.85, triggers: ['resonance', 'social_currency'] },
      viral_points: {
        triggers: ['resonance', 'social_currency'],
        share_motivation: '传统手艺的传承',
        comment_triggers: ['想我爷爷了', '求配方'],
      },
      style: { language: 'emotional', key_phrases: ['爷爷', '年糕', '50年'], cta_type: 'comment' },
    },
  },
  {
    analysis: {
      id: 'seed-ks-004',
      source: { platform: 'kuaishou', url: 'https://www.kuaishou.com/short-video/seed-ks-004', title: '工地午餐vs白领午餐对比', views: 3_400_000 },
      structure: {
        pattern: 'comparison + insight',
        hook: { type: 'counter_intuitive', text: '工地的午餐居然比白领的好吃？', duration_ratio: 0.1 },
        sections: [
          { role: 'hook', duration_ratio: 0.1, emotion: 'surprise' },
          { role: 'body', duration_ratio: 0.8, emotion: 'empathy' },
          { role: 'cta', duration_ratio: 0.1, emotion: 'action' },
        ],
      },
      emotions: { arc: 'surprise → empathy → reflection', intensity: 0.78, triggers: ['resonance', 'controversy'] },
      viral_points: {
        triggers: ['resonance', 'controversy'],
        share_motivation: '不同职业的真实对比',
        comment_triggers: ['都不容易', '互相尊重'],
      },
      style: { language: 'colloquial', key_phrases: ['工地', '白领', '午餐'], cta_type: 'comment' },
    },
  },

  // ---- 微博 (Weibo) additional ----
  {
    analysis: {
      id: 'seed-wb-003',
      source: { platform: 'weibo', url: 'https://weibo.com/seed-003', title: '90后人均负债真相', views: 7_800_000 },
      structure: {
        pattern: 'data + interpretation',
        hook: { type: 'shock', text: '90后平均负债12万，问题出在哪？', duration_ratio: 0.08 },
        sections: [
          { role: 'hook', duration_ratio: 0.08, emotion: 'anxiety' },
          { role: 'body', duration_ratio: 0.82, emotion: 'curiosity' },
          { role: 'cta', duration_ratio: 0.1, emotion: 'action' },
        ],
      },
      emotions: { arc: 'anxiety → understanding → resolve', intensity: 0.86, triggers: ['resonance', 'controversy'] },
      viral_points: {
        triggers: ['resonance', 'controversy'],
        share_motivation: '戳中一代人焦虑',
        comment_triggers: ['我也是', '太真实了'],
      },
      style: { language: 'professional', key_phrases: ['90后', '负债', '真相'], cta_type: 'comment' },
    },
  },
  {
    analysis: {
      id: 'seed-wb-004',
      source: { platform: 'weibo', url: 'https://weibo.com/seed-004', title: '小镇做题家逆袭故事', views: 12_500_000 },
      structure: {
        pattern: 'underdog + triumph',
        hook: { type: 'story', text: '从大山到硅谷，他用了8年', duration_ratio: 0.07 },
        sections: [
          { role: 'hook', duration_ratio: 0.07, emotion: 'empathy' },
          { role: 'body', duration_ratio: 0.85, emotion: 'empathy' },
          { role: 'cta', duration_ratio: 0.08, emotion: 'action' },
        ],
      },
      emotions: { arc: 'empathy → inspiration → resolve', intensity: 0.92, triggers: ['resonance', 'social_currency'] },
      viral_points: {
        triggers: ['resonance', 'social_currency'],
        share_motivation: '励志故事激发共鸣',
        comment_triggers: ['励志', '努力的意义'],
      },
      style: { language: 'emotional', key_phrases: ['小镇做题家', '逆袭', '硅谷'], cta_type: 'save' },
    },
  },
];

async function ensureCollection(): Promise<void> {
  if (WIPE) {
    const has = await client.hasCollection({ collection_name: COLLECTION });
    if (has.value) {
      console.log(`Dropping existing collection "${COLLECTION}" (WIPE=1)`);
      await client.dropCollection({ collection_name: COLLECTION });
    }
  }

  const has = await client.hasCollection({ collection_name: COLLECTION });
  if (!has.value) {
    console.log(`Creating collection "${COLLECTION}"`);
    await client.createCollection({
      collection_name: COLLECTION,
      fields: [
        { name: 'id', data_type: DataType.Int64, is_primary_key: true, autoID: true },
        { name: 'vector', data_type: DataType.FloatVector, dim: DIM },
        { name: 'analysis_id', data_type: DataType.VarChar, max_length: 64 },
        { name: 'platform', data_type: DataType.VarChar, max_length: 32 },
        { name: 'hook_type', data_type: DataType.VarChar, max_length: 32 },
        { name: 'emotion_arc', data_type: DataType.VarChar, max_length: 128 },
        { name: 'viral_trigger', data_type: DataType.VarChar, max_length: 64 },
        { name: 'language_style', data_type: DataType.VarChar, max_length: 32 },
        { name: 'views_level', data_type: DataType.VarChar, max_length: 16 },
        { name: 'full_analysis', data_type: DataType.VarChar, max_length: 8192 },
      ],
    });
    await client.createIndex({
      collection_name: COLLECTION,
      field_name: 'vector',
      index_type: 'IVF_FLAT',
      metric_type: 'COSINE',
      params: { nlist: 128 },
    });
  } else {
    console.log(`Collection "${COLLECTION}" already exists`);
  }

  await client.loadCollection({ collection_name: COLLECTION });
}

function classifyViews(views: number): string {
  if (views >= 10_000_000) return '1000w+';
  if (views >= 1_000_000) return '100w+';
  if (views >= 100_000) return '10w+';
  if (views >= 10_000) return '1w+';
  return '<1w';
}

function buildText(analysis: AnalysisResult): string {
  return [
    analysis.source.title,
    analysis.structure.pattern,
    analysis.structure.hook.text,
    analysis.emotions.arc,
    analysis.viral_points.triggers.join(' '),
    analysis.style.key_phrases.join(' '),
  ].join(' ');
}

async function embed(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return res.data[0].embedding;
}

async function seed(): Promise<void> {
  console.log(`Connecting to Milvus at ${MILVUS_HOST}:${MILVUS_PORT}`);
  await ensureCollection();

  let inserted = 0;
  let skipped = 0;

  for (const { analysis } of seeds) {
    try {
      // Idempotency: remove any existing row with the same analysis_id
      await client
        .delete({ collection_name: COLLECTION, filter: `analysis_id == "${analysis.id}"` })
        .catch(() => {});

      const text = buildText(analysis);
      const vector = await embed(text);

      await client.insert({
        collection_name: COLLECTION,
        data: [
          {
            vector,
            analysis_id: analysis.id,
            platform: analysis.source.platform,
            hook_type: analysis.structure.hook.type,
            emotion_arc: analysis.emotions.arc,
            viral_trigger: analysis.viral_points.triggers[0] ?? '',
            language_style: analysis.style.language,
            views_level: classifyViews(analysis.source.views),
            full_analysis: JSON.stringify(analysis),
          },
        ],
      });

      inserted += 1;
      console.log(`  ✓ ${analysis.id} (${analysis.source.platform} | ${analysis.structure.hook.type})`);
    } catch (err) {
      skipped += 1;
      console.error(`  ✗ ${analysis.id}:`, (err as Error).message);
    }
  }

  console.log('');
  console.log(`Done. Inserted: ${inserted}, Skipped: ${skipped}, Total seeds: ${seeds.length}`);
  console.log('Platforms covered:');

  const platforms = new Set(seeds.map((s) => s.analysis.source.platform));
  for (const p of platforms) {
    const count = seeds.filter((s) => s.analysis.source.platform === p).length;
    console.log(`  ${p}: ${count}`);
  }
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
