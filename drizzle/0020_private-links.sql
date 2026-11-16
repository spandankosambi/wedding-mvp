ALTER TABLE "wedding_sides" ALTER COLUMN "rsvp_open" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "weddings" ALTER COLUMN "rsvp_open" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "wedding_sides" ADD COLUMN "share_key" text;--> statement-breakpoint
-- every family's shared link gets its own code
UPDATE "wedding_sides" SET "share_key" = substr(md5(random()::text || "wedding_id"::text || "side"), 1, 10) WHERE "share_key" IS NULL;
--> statement-breakpoint
-- the example wedding linked from the home page keeps a fixed code and stays open
UPDATE "wedding_sides" SET "share_key" = 'sample' WHERE "wedding_id" IN (SELECT "id" FROM "weddings" WHERE "slug" = 'ananya-weds-arjun');
--> statement-breakpoint
-- replies from people who are not on the guest list are now off unless a family turns them on
UPDATE "wedding_sides" SET "rsvp_open" = false WHERE "wedding_id" NOT IN (SELECT "id" FROM "weddings" WHERE "slug" = 'ananya-weds-arjun');
--> statement-breakpoint
UPDATE "weddings" SET "rsvp_open" = false WHERE "slug" <> 'ananya-weds-arjun';
