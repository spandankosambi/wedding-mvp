ALTER TABLE "wedding_sides" ADD COLUMN "rsvp_open" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "wedding_sides" ADD COLUMN "rsvp_deadline" timestamp with time zone;--> statement-breakpoint
-- each family starts with the wedding's current RSVP settings
UPDATE "wedding_sides" s SET "rsvp_open" = w."rsvp_open", "rsvp_deadline" = w."rsvp_deadline"
FROM "weddings" w WHERE w."id" = s."wedding_id";
