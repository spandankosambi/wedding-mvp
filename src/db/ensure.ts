import { sql } from "drizzle-orm";
import { db } from "./client";

/*
 * Columns added since the live database was last migrated by hand. Each is
 * added only if it's missing, with a default, so this is safe to run on every
 * start and never touches existing rows. Mirrors drizzle/0021 onwards.
 */
export async function ensureColumns() {
  await db.execute(sql`ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "duration_minutes" integer DEFAULT 180 NOT NULL`);
  await db.execute(sql`ALTER TABLE "families" ADD COLUMN IF NOT EXISTS "stay_sent" jsonb`);
  await db.execute(sql`ALTER TABLE "families" ADD COLUMN IF NOT EXISTS "possible_match_family_id" uuid REFERENCES "families"("id") ON DELETE SET NULL`);
  await db.execute(sql`ALTER TABLE "families" ADD COLUMN IF NOT EXISTS "possible_match_by" text`);
  await db.execute(sql`ALTER TABLE "outbox" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'recorded' NOT NULL`);
  await db.execute(sql`ALTER TABLE "outbox" ADD COLUMN IF NOT EXISTS "sent_at" timestamp with time zone`);
  await db.execute(sql`ALTER TABLE "outbox" ADD COLUMN IF NOT EXISTS "payload" jsonb`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "outbox_sent_at" ON "outbox" ("sent_at")`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS "rate_limits" ("key" text PRIMARY KEY NOT NULL, "window_start" timestamp with time zone NOT NULL, "count" integer NOT NULL)`);
  // Plan: tasks and meeting notes (added, nothing else changes)
  await db.execute(sql`CREATE TABLE IF NOT EXISTS "plan_meetings" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "wedding_id" uuid NOT NULL REFERENCES "weddings"("id") ON DELETE CASCADE, "side" text, "meeting_date" date NOT NULL, "title" text NOT NULL, "type" text DEFAULT 'family' NOT NULL, "attendees" text, "notes" text, "decisions" text, "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL, "created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "plan_meetings_wedding" ON "plan_meetings" ("wedding_id")`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS "plan_tasks" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "wedding_id" uuid NOT NULL REFERENCES "weddings"("id") ON DELETE CASCADE, "side" text, "title" text NOT NULL, "owner_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL, "owner_name" text, "due_date" date, "done" boolean DEFAULT false NOT NULL, "done_at" timestamp with time zone, "meeting_id" uuid REFERENCES "plan_meetings"("id") ON DELETE SET NULL, "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL, "created_at" timestamp with time zone DEFAULT now() NOT NULL, "updated_at" timestamp with time zone DEFAULT now() NOT NULL)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "plan_tasks_wedding" ON "plan_tasks" ("wedding_id")`);
  await db.execute(sql`ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "time_zone" text DEFAULT 'Asia/Kolkata' NOT NULL`);
  await db.execute(sql`ALTER TABLE "wedding_sides" ADD COLUMN IF NOT EXISTS "print_text" jsonb`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS "machine_text" ("lang" text NOT NULL, "kind" text NOT NULL, "src" text NOT NULL, "out" text NOT NULL, "created_at" timestamp with time zone DEFAULT now() NOT NULL, CONSTRAINT "machine_text_lang_kind_src_pk" PRIMARY KEY("lang","kind","src"))`);
}

/*
 * The example wedding (ananya-weds-arjun) once listed a real person's number
 * as its RSVP contact. Replace it, in any format, wherever it appears in that
 * wedding's own rows: the wedding, both families' settings (contacts, card
 * wording), events, households, guests and the email log. Other weddings are
 * never touched; once the number is gone this finds nothing to change.
 */
export async function scrubSamplePhone() {
  await db.execute(sql.raw(`DO $scrub$
DECLARE
  wid uuid;
  col record;
  scope text;
  pat constant text := '(\\+?91[[:space:]-]*)?98200[[:space:]-]*00000';
  sub constant text := '+91 XXXXX XXXXX';
  n integer;
BEGIN
  SELECT id INTO wid FROM weddings WHERE slug = 'ananya-weds-arjun';
  IF wid IS NULL THEN RETURN; END IF;
  FOR col IN
    SELECT table_name, column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('weddings', 'wedding_sides', 'events', 'families', 'guests', 'email_log')
      AND data_type IN ('text', 'jsonb', 'character varying')
  LOOP
    scope := CASE col.table_name
      WHEN 'weddings' THEN format('id = %L', wid)
      WHEN 'guests' THEN format('family_id IN (SELECT id FROM families WHERE wedding_id = %L)', wid)
      WHEN 'email_log' THEN format('family_id IN (SELECT id FROM families WHERE wedding_id = %L)', wid)
      ELSE format('wedding_id = %L', wid)
    END;
    EXECUTE format(
      'UPDATE %I SET %I = regexp_replace(%I::text, %L, %L, %L)::%s WHERE %s AND %I::text ~ %L',
      col.table_name, col.column_name, col.column_name, pat, sub, 'g',
      CASE WHEN col.data_type = 'jsonb' THEN 'jsonb' ELSE 'text' END,
      scope, col.column_name, pat);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN RAISE NOTICE 'scrubbed % row(s) in %.%', n, col.table_name, col.column_name; END IF;
  END LOOP;
END
$scrub$;`));
}
