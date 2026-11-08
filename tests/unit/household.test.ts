import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, migrateDb } from "@/db/client";
import { weddings, events, families, guests, eventInvites, rsvps } from "@/db/schema";
import {
  deleteFamily, recordRsvpForFamily, bulkFamilyRsvp, setGuestRsvp, pruneAttendees,
  addGuestColumn, removeGuestColumn, setGuestDetail, guestAnswer, attendeesFromCount,
} from "@/lib/household";

let n = 0;
let weddingId: string, otherWeddingId: string, familyId: string, sangeet: string, pheras: string, a: string, b: string;

beforeAll(async () => { await migrateDb(); });
beforeEach(async () => {
  n++;
  const [w] = await db.insert(weddings).values({ slug: `hh-${n}`, brideName: "A", groomName: "B", weddingDate: new Date("2027-01-29") }).returning();
  const [w2] = await db.insert(weddings).values({ slug: `hh-other-${n}`, brideName: "C", groomName: "D", weddingDate: new Date("2027-02-14") }).returning();
  weddingId = w.id; otherWeddingId = w2.id;
  const [e1] = await db.insert(events).values({ weddingId, name: "Sangeet", startsAt: new Date(), venueName: "V", address: "X", sortOrder: 0 }).returning();
  const [e2] = await db.insert(events).values({ weddingId, name: "Pheras", startsAt: new Date(), venueName: "V", address: "X", sortOrder: 1 }).returning();
  sangeet = e1.id; pheras = e2.id;
  const [f] = await db.insert(families).values({ weddingId, name: "Joshi Family", side: "groom", email: "" }).returning();
  familyId = f.id;
  const [g1, g2] = await db.insert(guests).values([{ familyId, fullName: "R Joshi" }, { familyId, fullName: "S Joshi" }]).returning();
  a = g1.id; b = g2.id;
  await db.insert(eventInvites).values([{ eventId: sangeet, familyId }]); // Sangeet only
});

const row = async (eventId = sangeet) => (await db.select().from(rsvps).where(and(eq(rsvps.familyId, familyId), eq(rsvps.eventId, eventId))))[0];
const record = (responses: unknown[], addGuests: unknown[] = []) => recordRsvpForFamily(weddingId, { familyId, addGuests, responses });

describe("recordRsvpForFamily — by name", () => {
  it("records exactly who is coming; headcount is the number of names", async () => {
    expect(await record([{ eventId: sangeet, status: "attending", guestIds: [a] }])).toEqual({ ok: true });
    expect(await row()).toMatchObject({ status: "attending", headcount: 1, guestIds: [a] });
  });
  it("can't count more people than the household: extras must be added by name", async () => {
    expect(await record([{ eventId: sangeet, status: "attending", guestIds: [a, b, "new:0"] }])).toEqual({ ok: false, error: "unknown guest" });
    expect(await record([{ eventId: sangeet, status: "attending", guestIds: [a, b, "new:0"] }], [{ fullName: "T Joshi", ageGroup: "child" }])).toEqual({ ok: true });
    const members = await db.select().from(guests).where(eq(guests.familyId, familyId));
    expect(members.map((m) => m.fullName).sort()).toEqual(["R Joshi", "S Joshi", "T Joshi"]);
    expect((await row()).headcount).toBe(3);
  });
  it("attending with nobody ticked is refused", async () => {
    expect(await record([{ eventId: sangeet, status: "attending", guestIds: [] }])).toEqual({ ok: false, error: "tick who is coming" });
  });
  it("declined and 'no reply'", async () => {
    await record([{ eventId: sangeet, status: "declined" }]);
    expect(await row()).toMatchObject({ status: "declined", headcount: 0 });
    await record([{ eventId: sangeet, status: "none" }]);
    expect(await row()).toBeUndefined();
  });
  it("keeps a guest's own note", async () => {
    await db.insert(rsvps).values({ eventId: sangeet, familyId, status: "attending", headcount: 2, note: "running late" });
    await record([{ eventId: sangeet, status: "attending", guestIds: [b] }]);
    expect(await row()).toMatchObject({ guestIds: [b], note: "running late" });
  });
  it("refuses events the family isn't invited to, and other weddings' families", async () => {
    expect((await record([{ eventId: pheras, status: "attending", guestIds: [a] }])).ok).toBe(false);
    expect(await recordRsvpForFamily(otherWeddingId, { familyId, responses: [{ eventId: sangeet, status: "declined" }] }))
      .toEqual({ ok: false, error: "family not found" });
  });
});

describe("bulkFamilyRsvp", () => {
  it("marks every member of each family, only for events they're invited to", async () => {
    const r = await bulkFamilyRsvp(weddingId, { familyIds: [familyId], eventIds: [sangeet, pheras], answer: "attending" });
    expect(r).toEqual({ ok: true, updated: 1 });
    expect(await row()).toMatchObject({ status: "attending", headcount: 2 });
    expect(await row(pheras)).toBeUndefined();
    await bulkFamilyRsvp(weddingId, { familyIds: [familyId], eventIds: [sangeet], answer: "none" });
    expect(await row()).toBeUndefined();
  });
  it("won't touch another wedding's families", async () => {
    expect((await bulkFamilyRsvp(otherWeddingId, { familyIds: [familyId], eventIds: [sangeet], answer: "declined" })).ok).toBe(false);
  });
});

describe("setGuestRsvp — one person at a time", () => {
  it("adds and removes individuals", async () => {
    await setGuestRsvp(weddingId, { guestIds: [a], eventIds: [sangeet], answer: "yes" });
    expect(await row()).toMatchObject({ status: "attending", guestIds: [a], headcount: 1 });
    await setGuestRsvp(weddingId, { guestIds: [b], eventIds: [sangeet], answer: "yes" });
    expect((await row()).headcount).toBe(2);
    await setGuestRsvp(weddingId, { guestIds: [a], eventIds: [sangeet], answer: "no" });
    expect(await row()).toMatchObject({ status: "attending", guestIds: [b] });
    await setGuestRsvp(weddingId, { guestIds: [b], eventIds: [sangeet], answer: "no" });
    expect(await row()).toMatchObject({ status: "declined", headcount: 0 });
  });
  it("clearing the last answer goes back to no reply", async () => {
    await setGuestRsvp(weddingId, { guestIds: [a], eventIds: [sangeet], answer: "yes" });
    await setGuestRsvp(weddingId, { guestIds: [a], eventIds: [sangeet], answer: "none" });
    expect(await row()).toBeUndefined();
  });
  it("skips events the family isn't invited to", async () => {
    expect(await setGuestRsvp(weddingId, { guestIds: [a], eventIds: [pheras], answer: "yes" })).toEqual({ ok: true, updated: 0 });
  });
});

describe("answers per guest", () => {
  it("reads yes / no / no reply / unknown", () => {
    expect(guestAnswer(undefined, a, 2)).toBe("none");
    expect(guestAnswer({ status: "declined", headcount: 0, guestIds: [] }, a, 2)).toBe("no");
    expect(guestAnswer({ status: "attending", headcount: 1, guestIds: [a] }, a, 2)).toBe("yes");
    expect(guestAnswer({ status: "attending", headcount: 1, guestIds: [a] }, b, 2)).toBe("no");
    expect(guestAnswer({ status: "attending", headcount: 1, guestIds: null }, a, 2)).toBe("unknown");
    expect(guestAnswer({ status: "attending", headcount: 2, guestIds: null }, a, 2)).toBe("yes");
  });
  it("a bare number from the family's own form names everyone only when it covers them all", () => {
    expect(attendeesFromCount(2, [a, b])).toEqual([a, b]);
    expect(attendeesFromCount(1, [a, b])).toBeNull();
  });
  it("removing a guest from the family drops them from answers", async () => {
    await record([{ eventId: sangeet, status: "attending", guestIds: [a, b] }]);
    await db.delete(guests).where(eq(guests.id, b));
    await pruneAttendees(familyId);
    expect(await row()).toMatchObject({ guestIds: [a], headcount: 1 });
  });
});

describe("custom guest columns", () => {
  it("add, fill, and remove a column (its values go too)", async () => {
    const c = await addGuestColumn(weddingId, "Room no.");
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect((await addGuestColumn(weddingId, "room NO.")).ok).toBe(false); // no duplicates
    expect(await setGuestDetail(weddingId, a, c.column.id, " 204 ")).toEqual({ ok: true });
    expect((await db.select().from(guests).where(eq(guests.id, a)))[0].details).toEqual({ [c.column.id]: "204" });
    expect((await setGuestDetail(otherWeddingId, a, c.column.id, "x")).ok).toBe(false);
    await removeGuestColumn(weddingId, c.column.id);
    expect((await db.select().from(guests).where(eq(guests.id, a)))[0].details).toEqual({});
  });
});

describe("deleteFamily", () => {
  it("won't delete another wedding's family", async () => {
    expect(await deleteFamily(otherWeddingId, familyId)).toEqual({ ok: false, error: "family not found" });
  });
  it("removes the family with its guests, invitations and replies", async () => {
    await record([{ eventId: sangeet, status: "attending", guestIds: [a] }]);
    expect(await deleteFamily(weddingId, familyId)).toEqual({ ok: true });
    expect(await db.select().from(guests).where(eq(guests.familyId, familyId))).toHaveLength(0);
    expect(await db.select().from(rsvps).where(eq(rsvps.familyId, familyId))).toHaveLength(0);
  });
});
