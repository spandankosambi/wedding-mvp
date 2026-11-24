ALTER TABLE "families" ADD COLUMN IF NOT EXISTS "possible_match_family_id" uuid REFERENCES "families"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "families" ADD COLUMN IF NOT EXISTS "possible_match_by" text;
