import { pgTable, uuid, varchar, integer, text, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core';
import type { Platform, WorkflowStatus, SubtitleFormat, LanguageStyle, CTAType } from '@ai-video-factory/shared-types';

// Enums
export const platformEnum = pgEnum('platform', ['douyin', 'kuaishou', 'xiaohongshu', 'bilibili', 'weibo', 'youtube', 'tiktok']);
export const workflowStatusEnum = pgEnum('workflow_status', ['pending', 'running', 'completed', 'failed']);

// ===== Workflows =====
export const workflows = pgTable('workflows', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: workflowStatusEnum('status').notNull().default('pending'),
  currentStep: varchar('current_step', { length: 32 }).notNull().default('trend'),
  inputUrl: text('input_url'),
  inputKeyword: varchar('input_keyword', { length: 256 }),
  inputPlatform: platformEnum('input_platform'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ===== Analysis Results =====
export const analysisResults = pgTable('analysis_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowId: uuid('workflow_id').references(() => workflows.id),
  sourcePlatform: platformEnum('source_platform').notNull(),
  sourceUrl: text('source_url').notNull(),
  sourceTitle: text('source_title').notNull(),
  sourceViews: integer('source_views').notNull().default(0),
  structurePattern: varchar('structure_pattern', { length: 256 }),
  hookType: varchar('hook_type', { length: 32 }),
  emotionArc: varchar('emotion_arc', { length: 128 }),
  emotionIntensity: integer('emotion_intensity'),
  viralTriggers: text('viral_triggers'),
  shareMotivation: text('share_motivation'),
  languageStyle: varchar('language_style', { length: 32 }),
  keyPhrases: text('key_phrases'),
  ctaType: varchar('cta_type', { length: 32 }),
  fullAnalysis: jsonb('full_analysis').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ===== Scripts =====
export const scripts = pgTable('scripts', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowId: uuid('workflow_id').references(() => workflows.id),
  analysisId: uuid('analysis_id').references(() => analysisResults.id),
  title: varchar('title', { length: 256 }).notNull(),
  duration: integer('duration').notNull(),
  platform: platformEnum('platform').notNull(),
  scenes: jsonb('scenes').notNull(),
  qualityScore: jsonb('quality_score'),
  originalityScore: integer('originality_score'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ===== Media Assets =====
export const mediaAssets = pgTable('media_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowId: uuid('workflow_id').references(() => workflows.id),
  type: varchar('type', { length: 16 }).notNull(), // image | video | audio
  url: text('url').notNull(),
  localPath: text('local_path'),
  duration: integer('duration'),
  source: varchar('source', { length: 16 }).notNull(), // ai_generated | stock | uploaded
  prompt: text('prompt'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ===== Render Outputs =====
export const renderOutputs = pgTable('render_outputs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowId: uuid('workflow_id').references(() => workflows.id),
  videoUrl: text('video_url').notNull(),
  duration: integer('duration').notNull(),
  resolution: varchar('resolution', { length: 16 }).notNull(),
  fileSize: integer('file_size').notNull(),
  format: varchar('format', { length: 8 }).notNull().default('mp4'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
