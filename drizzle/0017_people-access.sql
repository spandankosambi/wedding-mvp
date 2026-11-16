ALTER TABLE "users" ADD COLUMN "is_owner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "side" text DEFAULT 'both' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "access" jsonb;--> statement-breakpoint
-- every existing wedding gets an owner: the couple login that has signed in, else any couple login
UPDATE "users" SET "is_owner" = true WHERE "id" IN (
  SELECT DISTINCT ON ("wedding_id") "id" FROM "users"
  WHERE "role" = 'couple' AND "wedding_id" IS NOT NULL
  ORDER BY "wedding_id", "email_verified" NULLS LAST, "email"
);
