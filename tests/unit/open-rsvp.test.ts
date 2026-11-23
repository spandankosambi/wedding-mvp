import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, migrateDb } from "@/db/client";
import { weddings, events, families, rsvps, guests } from "@/db/schema";
import { getPublicWedding, submitOpenRsvp, rsvpWindow } from "@/lib/guests/open-rsvp";
import { getFamilyByToken } from "@/lib/guests/rsvp";
import { getLook, updateLook } from "@/lib/site/looks";

let weddingId: string, sangeet: string, pheras: string, hidden: string;

beforeAll(async () => {
  await migrateDb();
  const [w] = await db.insert(weddings).values({
    slug: "open1", brideName: "A", groomName: "B", theme: "raj-mahal", weddingDate: new Date("2030-11-20"),
  }).returning();
  weddingId = w.id;
  const rows = await db.insert(events).values([
    { weddingId, name: "Sangeet", startsAt: new Date(), venueName: "V", address: "X", sortOrder: 0 },
    { weddingId, name: "Pheras", startsAt: new Date(), venueName: "V", address: "X", sortOrder: 1 },
    { weddingId, name: "Secret afterparty", startsAt: new Date(), venueName: "V", address: "X", sortOrder: 2, isPublished: false },
  ]).returning();
  [sangeet, pheras, hidden] = rows.map((r) => r.id);
  // both families let people who are not on the list reply, each from its own link
  await updateLook(weddingId, "bride", { rsvpOpen: true, shareKey: "bridekey" });
  await updateLook(weddingId, "groom", { rsvpOpen: true, shareKey: "groomkey" });
});

describe("getPublicWedding", () => {
  it("hides unpublished events", async () => {
    const d = await getPublicWedding("open1");
    expect(d?.events.map((e) => e.name)).toEqual(["Sangeet", "Pheras"]);
  });
});

describe("rsvpWindow", () => {
  const base = { rsvpOpen: true, rsvpDeadline: null, weddingDate: new Date("2030-11-20") };
  it("open by default", () => expect(rsvpWindow(base).open).toBe(true));
  it("closed when toggled off", () => expect(rsvpWindow({ ...base, rsvpOpen: false })).toMatchObject({ open: false, reason: "closed" }));
  it("closed after deadline", () => expect(rsvpWindow({ ...base, rsvpDeadline: new Date("2020-01-01") })).toMatchObject({ open: false, reason: "deadline" }));
  it("closed after the wedding", () => expect(rsvpWindow({ ...base, weddingDate: new Date("2020-01-01") })).toMatchObject({ open: false, reason: "past" }));
});

describe("submitOpenRsvp", () => {
  const base = { slug: "open1", name: "The Raos", phone: "+91 98765 43210", diet: "veg", k: "bridekey" };

  it("needs a phone or email", async () => {
    const r = await submitOpenRsvp({ slug: "open1", name: "Nobody", k: "bridekey", responses: [{ eventId: sangeet, status: "attending", headcount: 1 }] });
    expect(r).toEqual({ ok: false, error: "phone or email required" });
  });
  it("rejects hidden events", async () => {
    const r = await submitOpenRsvp({ ...base, responses: [{ eventId: hidden, status: "attending", headcount: 1 }] });
    expect(r).toEqual({ ok: false, error: "unknown event" });
  });
  it("creates a guest-source household, invites, rsvps and an edit link", async () => {
    const r = await submitOpenRsvp({ ...base, guestNames: ["P Rao", "Q Rao"], responses: [
      { eventId: sangeet, status: "attending", headcount: 2 }, { eventId: pheras, status: "declined", headcount: 0 },
    ] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.attending).toEqual(["Sangeet"]);
    expect(r.editPath).toMatch(/^\/rsvp\/[A-Za-z0-9_-]{20,}$/);
    const [fam] = await db.select().from(families).where(eq(families.weddingId, weddingId));
    expect(fam).toMatchObject({ name: "The Raos", source: "guest", phone: "9876543210", diet: "veg", email: "" });
    expect((await db.select().from(guests).where(eq(guests.familyId, fam.id))).length).toBe(2);
    const viaToken = await getFamilyByToken(r.editPath.split("/rsvp/")[1]);
    expect(viaToken?.events.map((e) => e.name).sort()).toEqual(["Pheras", "Sangeet"]);
  });
  it("a returning guest (same phone, different formatting) updates instead of duplicating", async () => {
    const r = await submitOpenRsvp({ ...base, phone: "09876543210", email: "rao@example.com", responses: [
      { eventId: sangeet, status: "attending", headcount: 4 },
    ] });
    expect(r.ok).toBe(true);
    const fams = await db.select().from(families).where(eq(families.weddingId, weddingId));
    expect(fams.length).toBe(1);
    expect(fams[0].email).toBe("rao@example.com");
    const [row] = await db.select().from(rsvps).where(eq(rsvps.eventId, sangeet));
    expect(row.headcount).toBe(4);
  });
  it("matches by email too", async () => {
    const r = await submitOpenRsvp({ slug: "open1", name: "Rao again", email: "RAO@example.com", k: "bridekey", responses: [{ eventId: pheras, status: "attending", headcount: 1 }] });
    expect(r.ok).toBe(true);
    expect((await db.select().from(families).where(eq(families.weddingId, weddingId))).length).toBe(1);
  });
  it("refuses when that family closes RSVP; the other family's link still works", async () => {
    await updateLook(weddingId, "groom", { rsvpOpen: false });
    const r = await submitOpenRsvp({ ...base, side: "groom", linkSide: "groom", k: "groomkey", responses: [{ eventId: sangeet, status: "attending", headcount: 1 }] });
    expect(r).toEqual({ ok: false, error: "rsvp closed" });
    const ok = await submitOpenRsvp({ ...base, name: "The Pais", phone: "+91 98765 00001", side: "bride", responses: [{ eventId: sangeet, status: "attending", headcount: 1 }] });
    expect(ok.ok).toBe(true);
  });
  it("refuses anyone without the family's link code, or with the other family's", async () => {
    const one = [{ eventId: sangeet, status: "attending", headcount: 1 }];
    const who = { slug: "open1", name: "A Stranger", phone: "+91 90000 00009" };
    expect(await submitOpenRsvp({ ...who, responses: one }, "stranger")).toEqual({ ok: false, error: "rsvp closed" });
    expect(await submitOpenRsvp({ ...who, k: "guess", responses: one }, "stranger")).toEqual({ ok: false, error: "rsvp closed" });
    expect(await submitOpenRsvp({ ...who, k: "groomkey", side: "bride", linkSide: "bride", responses: one }, "stranger")).toEqual({ ok: false, error: "rsvp closed" });
    expect((await db.select().from(families).where(eq(families.weddingId, weddingId))).some((f) => f.name === "A Stranger")).toBe(false);
  });
  it("a new wedding takes no replies from the shared link until a family turns that on", async () => {
    const [w] = await db.insert(weddings).values({ slug: "open2", brideName: "C", groomName: "D", weddingDate: new Date("2030-11-20") }).returning();
    const [e] = await db.insert(events).values({ weddingId: w.id, name: "Pheras", startsAt: new Date(), venueName: "V", address: "X" }).returning();
    const key = (await getLook(w.id, "bride")).shareKey!;
    expect(key).toMatch(/^[a-z2-9]{8}$/);
    const input = { slug: "open2", name: "Walk In", phone: "+91 90000 00001", k: key, responses: [{ eventId: e.id, status: "attending", headcount: 1 }] };
    expect(await submitOpenRsvp(input, "another-visitor")).toEqual({ ok: false, error: "rsvp closed" });
    await updateLook(w.id, "bride", { rsvpOpen: true });
    expect((await submitOpenRsvp(input, "another-visitor")).ok).toBe(true);
  });
});
