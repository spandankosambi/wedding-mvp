import { describe, it, expect, beforeAll } from "vitest";
import { sql } from "drizzle-orm";

// a fresh in-memory database with every migration applied
process.env.PGLITE_EPHEMERAL = "1";
const { db, migrateDb } = await import("@/db/client");
const { scrubSamplePhone } = await import("@/db/ensure");
const { weddings, weddingSides, families, guests } = await import("@/db/schema");

const rows = async (q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: Record<string, unknown>[] }).rows;

describe("removing the real number from the example wedding", () => {
  let sampleId = "", otherId = "", famId = "";
  beforeAll(async () => {
    await migrateDb();
    const [s] = await db.insert(weddings).values({ slug: "ananya-weds-arjun", brideName: "Ananya", groomName: "Arjun", weddingDate: new Date("2026-11-20"), contactPhone: "+91 98200 00000 (Rohit)" } as never).returning();
    const [o] = await db.insert(weddings).values({ slug: "someone-else", brideName: "A", groomName: "B", weddingDate: new Date("2027-01-01"), contactPhone: "+91 98200 00000" } as never).returning();
    sampleId = s.id; otherId = o.id;
    await db.insert(weddingSides).values({ weddingId: sampleId, side: "groom", contactPhone: "9820000000", rsvpPeople: [{ name: "Rohit", phone: "+919820000000", whatsapp: true }] } as never);
    const [f] = await db.insert(families).values({ weddingId: sampleId, name: "Chachu & Family", side: "groom", email: "chachu@example.com", phone: "+91-98200-00000" } as never).returning();
    famId = f.id;
    await db.insert(guests).values({ familyId: famId, fullName: "Rohit Mehta", phone: "98200 00000" } as never);
  }, 60_000);

  it("replaces it everywhere in the sample, in every format, and leaves other weddings alone", async () => {
    await scrubSamplePhone();
    const dump = JSON.stringify([
      await rows(sql`select * from weddings where id = ${sampleId}`),
      await rows(sql`select * from wedding_sides where wedding_id = ${sampleId}`),
      await rows(sql`select * from families where wedding_id = ${sampleId}`),
      await rows(sql`select * from guests where family_id = ${famId}`),
    ]);
    expect(dump.replace(/\D/g, " ")).not.toMatch(/98200\s*00000|9820000000/);
    expect((dump.match(/\+91 XXXXX XXXXX/g) ?? []).length).toBe(5);
    expect(dump).toContain("+91 XXXXX XXXXX (Rohit)");
    const [other] = await rows(sql`select contact_phone from weddings where id = ${otherId}`);
    expect(other.contact_phone).toBe("+91 98200 00000");
    // running again changes nothing
    await scrubSamplePhone();
  });
});
