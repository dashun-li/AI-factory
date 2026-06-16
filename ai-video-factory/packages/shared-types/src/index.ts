// ===== 热点发现 =====

export type Platform = 'douyin' | 'kuaishou' | 'xiaohongshu' | 'bilibili' | 'weibo' | 'youtube' | 'tiktok';

export interface TrendItem {
  title: string;
  platform: Platform;
  url: string;
  views: number;
  likes: number;
  comments: number;
}

// ===== 内容提取 =====

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface Transcript {
  transcript: string;
  segments: TranscriptSegment[];
}

// ===== 爆款分析 =====

export type ContentType = 'knowledge' | 'emotion' | 'controversy' | 'tutorial' | 'story';
export type HookType = 'shock' | 'question' | 'pain_point' | 'counter_intuitive' | 'story';
export type EmotionType = 'curiosity' | 'anxiety' | 'relief' | 'action' | 'surprise' | 'empathy';
export type ViralTrigger = 'resonance' | 'controversy' | 'novelty' | 'utility' | 'social_currency';
export type LanguageStyle = 'colloquial' | 'professional' | 'humorous' | 'emotional';
export type CTAType = 'save' | 'follow' | 'like' | 'comment' | 'share';
export type Pacing = 'fast' | 'medium' | 'slow';

export interface HookAnalysis {
  type: HookType;
  text: string;
  duration_ratio: number;
}

export interface SectionAnalysis {
  role: string;
  duration_ratio: number;
  emotion: string;
}

export interface StructureAnalysis {
  pattern: string;
  hook: HookAnalysis;
  sections: SectionAnalysis[];
}

export interface EmotionAnalysis {
  arc: string;
  intensity: number;
  triggers: string[];
}

export interface ViralPoints {
  triggers: ViralTrigger[];
  share_motivation: string;
  comment_triggers: string[];
}

export interface StyleAnalysis {
  language: LanguageStyle;
  key_phrases: string[];
  cta_type: CTAType;
}

export interface AnalysisSource {
  platform: Platform;
  url: string;
  title: string;
  views: number;
}

export interface AnalysisResult {
  id: string;
  source: AnalysisSource;
  structure: StructureAnalysis;
  emotions: EmotionAnalysis;
  viral_points: ViralPoints;
  style: StyleAnalysis;
}

// ===== 脚本 =====

export interface Scene {
  id: number;
  role: string;
  emotion: string;
  duration: number;
  narration: string;
  visual: string;
  subtitle: string;
}

export interface Script {
  title: string;
  duration: number;
  platform: Platform;
  scenes: Scene[];
}

export interface QualityScore {
  structure: number;
  originality: number;
  attractiveness: number;
  average: number;
}

// ===== 媒体素材 =====

export interface MediaAsset {
  type: 'image' | 'video' | 'audio';
  url: string;
  local_path?: string;
  duration?: number;
  source: 'ai_generated' | 'stock' | 'uploaded';
  prompt?: string;
}

// ===== 字幕 =====

export type SubtitleFormat = 'srt' | 'ass' | 'vtt';

export interface SubtitleEntry {
  index: number;
  start_time: number;
  end_time: number;
  text: string;
  speaker?: string;
}

export interface Subtitle {
  format: SubtitleFormat;
  entries: SubtitleEntry[];
  content: string;
}

// ===== TTS配音 =====

export interface TTSAudio {
  audio_url: string;
  duration: number;
  voice: string;
  text: string;
}

// ===== 渲染输出 =====

export interface RenderOutput {
  video_url: string;
  duration: number;
  resolution: string;
  file_size: number;
}

// ===== 工作流 =====

export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface WorkflowState {
  id: string;
  status: WorkflowStatus;
  current_step: string;
  input: {
    url?: string;
    keyword?: string;
    platform?: Platform;
  };
  trend_result?: TrendItem;
  transcript?: Transcript;
  analysis?: AnalysisResult;
  script?: Script;
  media_assets?: MediaAsset[];
  tts_audio?: TTSAudio;
  subtitle?: Subtitle;
  render_output?: RenderOutput;
  error?: string;
  created_at: string;
  updated_at: string;
}
