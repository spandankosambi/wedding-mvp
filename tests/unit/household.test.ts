import { describe, it, expect, beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, migrateDb } from "@/db/client";
import { weddings, events, families, guests, eventInvites, rsvps } from "@/db/schema";
import { deleteFamily, recordRsvpForFamily } from "@/lib/household";

let weddingId: string, otherWeddingId: string, familyId: string, sangeet: string, pheras: string;

beforeAll(async () => {
  await migrateDb();
  const [w] = await db.insert(weddings).values({ slug: "hh1", brideName: "A", groomName: "B", weddingDate: new Date("2027-01-29") }).returning();
  const [w2] = await db.insert(weddings).values({ slug: "hh2", brideName: "C", groomName: "D", weddingDate: new Date("2027-02-14") }).returning();
  weddingId = w.id; otherWeddingId = w2.id;
  const [e1] = await db.insert(events).values({ weddingId, name: "Sangeet", startsAt: new Date(), venueName: "V", address: "X", sortOrder: 0 }).returning();
  const [e2] = await db.insert(events).values({ weddingId, name: "Pheras", startsAt: new Date(), venueName: "V", address: "X", sortOrder: 1 }).returning();
  sangeet = e1.id; pheras = e2.id;
  const [f] = await db.insert(families).values({ weddingId, name: "Joshi Family", side: "groom", email: "joshi@example.com" }).returning();
  familyId = f.id;
  await db.insert(guests).values([{ familyId, fullName: "R Joshi" }, { familyId, fullName: "S Joshi" }]);
  await db.insert(eventInvites).values([{ eventId: sangeet, familyId }]); // Sangeet only
});

const answer = (id: string) => db.select().from(rsvps).where(and(eq(rsvps.familyId, familyId), eq(rsvps.eventId, id)));

describe("recordRsvpForFamily", () => {
  it("records an attending reply with a headcount", async () => {
    expect(await recordRsvpForFamily(weddingId, { familyId, responses: [{ eventId: sangeet, status: "attending", headcount: 2 }] }))
      .toEqual({ ok: true });
    expect((await answer(sangeet))[0]).toMatchObject({ status: "attending", headcount: 2 });
  });
  it("switches to declined and zeroes the headcount, keeping a guest's note", async () => {
    await db.update(rsvps).set({ note: "running late" }).where(eq(rsvps.familyId, familyId));
    await recordRsvpForFamily(weddingId, { familyId, responses: [{ eventId: sangeet, status: "declined", headcount: 2 }] });
    expect((await answer(sangeet))[0]).toMatchObject({ status: "declined", headcount: 0, note: "running late" });
  });
  it("'none' clears the answer", async () => {
    await recordRsvpForFamily(weddingId, { familyId, responses: [{ eventId: sangeet, status: "none", headcount: 0 }] });
    expect(await answer(sangeet)).toHaveLength(0);
  });
  it("refuses events the family isn't invited to", async () => {
    expect(await recordRsvpForFamily(weddingId, { familyId, responses: [{ eventId: pheras, status: "attending", headcount: 1 }] }))
      .toEqual({ ok: false, error: "not invited to that event" });
  });
  it("refuses a headcount beyond household + 2", async () => {
    const r = await recordRsvpForFamily(weddingId, { familyId, responses: [{ eventId: sangeet, status: "attending", headcount: 5 }] });
    expect(r.ok).toBe(false);
  });
  it("won't touch another wedding's family", async () => {
    expect(await recordRsvpForFamily(otherWeddingId, { familyId, responses: [{ eventId: sangeet, status: "attending", headcount: 1 }] }))
      .toEqual({ ok: false, error: "family not found" });
  });
});

describe("deleteFamily", () => {
  it("won't delete another wedding's family", async () => {
    expect(await deleteFamily(otherWeddingId, familyId)).toEqual({ ok: false, error: "family not found" });
  });
  it("removes the family with its guests, invitations and replies", async () => {
    await recordRsvpForFamily(weddingId, { familyId, responses: [{ eventId: sangeet, status: "attending", headcount: 1 }] });
    expect(await deleteFamily(weddingId, familyId)).toEqual({ ok: true });
    expect(await db.select().from(families).where(eq(families.id, familyId))).toHaveLength(0);
    expect(await db.select().from(guests).where(eq(guests.familyId, familyId))).toHaveLength(0);
    expect(await db.select().from(eventInvites).where(eq(eventInvites.familyId, familyId))).toHaveLength(0);
    expect(await db.select().from(rsvps).where(eq(rsvps.familyId, familyId))).toHaveLength(0);
  });
});
