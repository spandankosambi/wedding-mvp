CREATE TABLE "wedding_sides" (
	"wedding_id" uuid NOT NULL,
	"side" "side" NOT NULL,
	"theme" "theme" DEFAULT 'ivory-editorial' NOT NULL,
	"hero_tagline" text,
	"story" text,
	"hashtag" text,
	"contact_phone" text,
	"travel" jsonb,
	"gallery" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wedding_sides_wedding_id_side_pk" PRIMARY KEY("wedding_id","side")
);
--> statement-breakpoint
ALTER TABLE "wedding_sides" ADD CONSTRAINT "wedding_sides_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- both families start from the site as it is today
INSERT INTO "wedding_sides" ("wedding_id", "side", "theme", "hero_tagline", "story", "hashtag", "contact_phone", "travel", "gallery")
SELECT w."id", s."side"::"side", w."theme", w."hero_tagline", w."story", w."hashtag", w."contact_phone", w."travel", w."gallery"
FROM "weddings" w CROSS JOIN (VALUES ('bride'), ('groom')) AS s("side")
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- every household now belongs to the bride's family or the groom's
UPDATE "families" SET "side" = 'bride' WHERE "side" = 'both';
