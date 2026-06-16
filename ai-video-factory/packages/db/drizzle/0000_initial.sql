-- Custom types
DO $$ BEGIN
    CREATE TYPE "public"."platform" AS ENUM('douyin', 'kuaishou', 'xiaohongshu', 'bilibili', 'weibo', 'youtube', 'tiktok');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "public"."workflow_status" AS ENUM('pending', 'running', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Workflows
CREATE TABLE IF NOT EXISTS "workflows" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "status" "workflow_status" NOT NULL DEFAULT 'pending',
    "current_step" varchar(32) NOT NULL DEFAULT 'trend',
    "input_url" text,
    "input_keyword" varchar(256),
    "input_platform" "platform",
    "error" text,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Analysis Results
CREATE TABLE IF NOT EXISTS "analysis_results" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "workflow_id" uuid REFERENCES "workflows"("id"),
    "source_platform" "platform" NOT NULL,
    "source_url" text NOT NULL,
    "source_title" text NOT NULL,
    "source_views" integer NOT NULL DEFAULT 0,
    "structure_pattern" varchar(256),
    "hook_type" varchar(32),
    "emotion_arc" varchar(128),
    "emotion_intensity" integer,
    "viral_triggers" text,
    "share_motivation" text,
    "language_style" varchar(32),
    "key_phrases" text,
    "cta_type" varchar(32),
    "full_analysis" jsonb NOT NULL,
    "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Scripts
CREATE TABLE IF NOT EXISTS "scripts" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "workflow_id" uuid REFERENCES "workflows"("id"),
    "analysis_id" uuid REFERENCES "analysis_results"("id"),
    "title" varchar(256) NOT NULL,
    "duration" integer NOT NULL,
    "platform" "platform" NOT NULL,
    "scenes" jsonb NOT NULL,
    "quality_score" jsonb,
    "originality_score" integer,
    "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Media Assets
CREATE TABLE IF NOT EXISTS "media_assets" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "workflow_id" uuid REFERENCES "workflows"("id"),
    "type" varchar(16) NOT NULL,
    "url" text NOT NULL,
    "local_path" text,
    "duration" integer,
    "source" varchar(16) NOT NULL,
    "prompt" text,
    "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Render Outputs
CREATE TABLE IF NOT EXISTS "render_outputs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "workflow_id" uuid REFERENCES "workflows"("id"),
    "video_url" text NOT NULL,
    "duration" integer NOT NULL,
    "resolution" varchar(16) NOT NULL,
    "file_size" integer NOT NULL,
    "format" varchar(8) NOT NULL DEFAULT 'mp4',
    "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS "idx_workflows_status" ON "workflows" ("status");
CREATE INDEX IF NOT EXISTS "idx_workflows_created_at" ON "workflows" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_analysis_results_workflow_id" ON "analysis_results" ("workflow_id");
CREATE INDEX IF NOT EXISTS "idx_scripts_workflow_id" ON "scripts" ("workflow_id");
CREATE INDEX IF NOT EXISTS "idx_media_assets_workflow_id" ON "media_assets" ("workflow_id");
CREATE INDEX IF NOT EXISTS "idx_render_outputs_workflow_id" ON "render_outputs" ("workflow_id");
