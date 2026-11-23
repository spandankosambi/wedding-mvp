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
