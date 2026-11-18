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
}
