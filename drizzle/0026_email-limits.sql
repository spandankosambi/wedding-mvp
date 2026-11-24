CREATE TABLE IF NOT EXISTS "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outbox" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'recorded' NOT NULL;--> statement-breakpoint
ALTER TABLE "outbox" ADD COLUMN IF NOT EXISTS "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outbox" ADD COLUMN IF NOT EXISTS "payload" jsonb;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbox_sent_at" ON "outbox" USING btree ("sent_at");
