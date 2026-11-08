ALTER TABLE "guests" ADD COLUMN "details" jsonb;--> statement-breakpoint
ALTER TABLE "rsvps" ADD COLUMN "guest_ids" jsonb;--> statement-breakpoint
ALTER TABLE "weddings" ADD COLUMN "guest_columns" jsonb;