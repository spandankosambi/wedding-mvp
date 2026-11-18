ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "duration_minutes" integer DEFAULT 180 NOT NULL;--> statement-breakpoint
ALTER TABLE "families" ADD COLUMN IF NOT EXISTS "stay_sent" jsonb;