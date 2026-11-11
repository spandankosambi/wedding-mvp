import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, migrateDb } from "@/db/client";
import { weddings, events } from "@/db/schema";
import { getLook } from "@/lib/looks";
import { adoptCardWording, updateWording, updateDetails, updateWords, updateRsvpSettings, updateTravel, upsertEvent, setEventPublished, deleteEvent, moveEvent, istParts, sortEventsByTime } from "@/lib/editor";
import { getPublicWedding } from "@/lib/open-rsvp";

let weddingId: string, other: string;
beforeAll(async () => {
  await migrateDb();
  const [w] = await db.insert(weddings).values({ slug: "ed1", brideName: "A", groomName: "B", weddingDate: new Date("2027-01-10T04:30:00Z") }).returning();
  const [o] = await db.insert(weddings).values({ slug: "ed2", brideName: "C", groomName: "D", weddingDate: new Date("2027-01-10T04:30:00Z") }).returning();
  weddingId = w.id; other = o.id;
});

describe("editor", () => {
  it("updates the shared details incl. parents", async () => {
    const r = await updateDetails(weddingId, { brideName: "Ananya", groomName: "Arjun", weddingDate: "2027-02-01", city: "Pune", brideParents: "Sunita & Rajesh Sharma", groomParents: "" });
    expect(r.ok).toBe(true);
    const [w] = await db.select().from(weddings).where(eq(weddings.id, weddingId));
    expect(w).toMatchObject({ brideName: "Ananya", city: "Pune", brideParents: "Sunita & Rajesh Sharma", groomParents: null });
    expect(istParts(w.weddingDate)).toEqual({ date: "2027-02-01", time: "10:00" });
  });
  it("each family keeps its own words and theme (hash stripped from the hashtag)", async () => {
    expect((await updateWords(weddingId, "groom", { heroTagline: "Baraat at dawn", hashtag: "#ArjunKiShaadi", theme: "raj-mahal" })).ok).toBe(true);
    expect(await getLook(weddingId, "groom")).toMatchObject({ heroTagline: "Baraat at dawn", hashtag: "ArjunKiShaadi", theme: "raj-mahal" });
    expect((await getLook(weddingId, "bride")).hashtag).not.toBe("ArjunKiShaadi");
  });
  it("each family's invitation wording: lines tidied, blanks dropped", async () => {
    const r = await updateWording(weddingId, "groom", {
      invocation: "  ॥ श्री गणेशाय नमः ॥ ", shloka: "वक्रतुण्ड  महाकाय\n\n  निर्विघ्नं कुरु मे देव ",
      rsvpContacts: "Vikram +91 1\r\nKavita +91 2", compliments: "", closingLine: "Your blessings are our gifts",
    });
    expect(r.ok).toBe(true);
    expect(await getLook(weddingId, "groom")).toMatchObject({
      invocation: "॥ श्री गणेशाय नमः ॥", shloka: "वक्रतुण्ड महाकाय\nनिर्विघ्नं कुरु मे देव",
      rsvpContacts: "Vikram +91 1\nKavita +91 2", compliments: null, closingLine: "Your blessings are our gifts",
    });
    expect((await getLook(weddingId, "bride")).invocation).toBeNull();
  });
  it("wording from the old print dialog fills only what's still empty", async () => {
    const r = await adoptCardWording(weddingId, "groom", { invocation: "|| Shree ||", compliments: "Mehta family", closingLine: "" });
    expect(r).toMatchObject({ ok: true, filled: 1 });
    expect(await getLook(weddingId, "groom")).toMatchObject({ invocation: "॥ श्री गणेशाय नमः ॥", compliments: "Mehta family" });
  });
  it("rsvp settings are each family's own: deadline is end of that IST day, blank clears", async () => {
    expect((await updateRsvpSettings(weddingId, "groom", { rsvpOpen: false, rsvpDeadline: "2027-01-15" })).ok).toBe(true);
    let groom = await getLook(weddingId, "groom");
    expect(groom.rsvpOpen).toBe(false);
    expect(groom.rsvpDeadline?.toISOString()).toBe("2027-01-15T18:29:00.000Z");
    expect(await getLook(weddingId, "bride")).toMatchObject({ rsvpOpen: true, rsvpDeadline: null });
    await updateRsvpSettings(weddingId, "groom", { rsvpOpen: true, rsvpDeadline: "" });
    groom = await getLook(weddingId, "groom");
    expect(groom.rsvpDeadline).toBeNull();
  });
  it("travel is each family's own", async () => {
    await updateTravel(weddingId, "bride", { stays: [{ name: "Taj", note: "Wedding block", url: "" }], gettingThere: "Fly to PNQ" });
    expect((await getLook(weddingId, "bride")).travel).toEqual({ stays: [{ name: "Taj", note: "Wedding block" }], gettingThere: "Fly to PNQ" });
    expect((await getLook(weddingId, "groom")).travel?.gettingThere).not.toBe("Fly to PNQ");
    expect((await getLook(weddingId, "groom")).travel?.stays ?? []).not.toContainEqual(expect.objectContaining({ name: "Taj" }));
  });
  it("a hotel ticked common shows for both families, and either can change or drop it", async () => {
    await updateTravel(weddingId, "groom", { stays: [{ name: "Oberoi", note: "Groom's own" }, { name: "taj", note: "old copy" }], gettingThere: "Train to Pune" });
    // the bride's family shares the Taj, and adds one more of its own
    await updateTravel(weddingId, "bride", {
      stays: [{ name: "Taj", note: "Wedding block", common: true }, { name: "Marriott", note: "Bride's own" }], gettingThere: "Fly to PNQ",
    });
    let groom = (await getLook(weddingId, "groom")).travel!;
    expect(groom.stays).toEqual([{ name: "Taj", note: "Wedding block", common: true }, { name: "Oberoi", note: "Groom's own" }]); // their same-named one replaced
    expect(groom.gettingThere).toBe("Train to Pune");
    // the groom's family edits the shared hotel; the bride's follows
    await updateTravel(weddingId, "groom", { stays: [{ name: "Taj", note: "Ask for the Sharma block", common: true }, { name: "Oberoi", note: "Groom's own" }], gettingThere: "Train to Pune" });
    expect((await getLook(weddingId, "bride")).travel!.stays).toEqual([{ name: "Taj", note: "Ask for the Sharma block", common: true }, { name: "Marriott", note: "Bride's own" }]);
    // unticked, it stays with the groom's family only
    await updateTravel(weddingId, "groom", { stays: [{ name: "Taj", note: "Ask for the Sharma block" }, { name: "Oberoi", note: "Groom's own" }], gettingThere: "Train to Pune" });
    expect((await getLook(weddingId, "bride")).travel!.stays).toEqual([{ name: "Marriott", note: "Bride's own" }]);
    groom = (await getLook(weddingId, "groom")).travel!;
    expect(groom.stays.map((s) => s.name)).toEqual(["Taj", "Oberoi"]);
  });
  it("events: create, edit, hide, reorder, delete — scoped to the wedding", async () => {
    const a = await upsertEvent(weddingId, { name: "Sangeet", date: "2027-01-31", time: "19:00", venueName: "Lawns", address: "Pune", mapUrl: "", isPublished: true });
    const b = await upsertEvent(weddingId, { name: "Pheras", date: "2027-02-01", time: "10:00", venueName: "Temple", address: "Pune", mapUrl: "https://maps.google.com/x", dressCode: "Traditional" });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    // edit
    expect((await upsertEvent(weddingId, { id: a.id!, name: "Sangeet Night", date: "2027-01-31", time: "20:30", venueName: "Lawns", address: "Pune" })).ok).toBe(true);
    let rows = await db.select().from(events).where(eq(events.weddingId, weddingId)).orderBy(events.sortOrder);
    expect(rows.map((r) => r.name)).toEqual(["Sangeet Night", "Pheras"]);
    expect(istParts(rows[0].startsAt)).toEqual({ date: "2027-01-31", time: "20:30" });
    // other wedding can't touch it
    expect((await upsertEvent(other, { id: a.id!, name: "Hack", date: "2027-01-31", time: "20:30", venueName: "x", address: "y" })).ok).toBe(false);
    expect((await deleteEvent(other, a.id!)).ok).toBe(false);
    // hide → gone from public
    await setEventPublished(weddingId, b.id!, false);
    expect((await getPublicWedding("ed1"))?.events.map((e) => e.name)).toEqual(["Sangeet Night"]);
    await setEventPublished(weddingId, b.id!, true);
    // reorder
    await moveEvent(weddingId, b.id!, "up");
    rows = await db.select().from(events).where(eq(events.weddingId, weddingId)).orderBy(events.sortOrder);
    expect(rows.map((r) => r.name)).toEqual(["Pheras", "Sangeet Night"]);
    await sortEventsByTime(weddingId);
    rows = await db.select().from(events).where(eq(events.weddingId, weddingId)).orderBy(events.sortOrder);
    expect(rows.map((r) => r.name)).toEqual(["Sangeet Night", "Pheras"]);
    // delete
    expect((await deleteEvent(weddingId, a.id!)).ok).toBe(true);
    expect((await db.select().from(events).where(eq(events.weddingId, weddingId))).length).toBe(1);
  });
});
