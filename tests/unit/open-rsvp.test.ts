import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, migrateDb } from "@/db/client";
import { weddings, events, families, rsvps, guests, eventInvites } from "@/db/schema";
import { generateInviteToken } from "@/lib/auth/tokens";
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
  it("a reply with the phone of a household on the list leaves that household untouched and is kept apart", async () => {
    // the Sharmas were added by the committee, sent their private link, and declined the Sangeet
    const [sharmas] = await db.insert(families).values({
      weddingId, name: "The Sharmas", side: "bride", email: "sharma@example.com", phone: "9000011111", source: "committee",
    }).returning();
    await db.insert(guests).values([{ familyId: sharmas.id, fullName: "Asha Sharma" }, { familyId: sharmas.id, fullName: "Ravi Sharma" }]);
    const { token, tokenHash } = generateInviteToken();
    await db.update(families).set({ inviteTokenHash: tokenHash, tokenExpiresAt: new Date("2031-01-01") }).where(eq(families.id, sharmas.id));
    await db.insert(eventInvites).values({ eventId: sangeet, familyId: sharmas.id });
    await db.insert(rsvps).values({ eventId: sangeet, familyId: sharmas.id, status: "declined", headcount: 0, guestIds: [] });
    const snapshot = async () => ({
      family: (await db.select().from(families).where(eq(families.id, sharmas.id)))[0],
      members: await db.select().from(guests).where(eq(guests.familyId, sharmas.id)),
      invites: await db.select().from(eventInvites).where(eq(eventInvites.familyId, sharmas.id)),
      answers: await db.select().from(rsvps).where(eq(rsvps.familyId, sharmas.id)),
    });
    const before = await snapshot();

    // someone with the shared link types the Sharmas' number, differently formatted
    const r = await submitOpenRsvp({ slug: "open1", name: "Uncle Raj", phone: "+91 90000 11111", email: "raj@example.com", k: "bridekey", note: "taking over",
      responses: [{ eventId: sangeet, status: "attending", headcount: 4 }, { eventId: pheras, status: "attending", headcount: 4 }] }, "visitor-a");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await snapshot()).toEqual(before);
    // the visitor sees only their own name, and their link opens only their own reply
    expect(r.familyName).toBe("Uncle Raj");
    expect(JSON.stringify(r)).not.toContain("Sharma");
    expect((await getFamilyByToken(r.editPath.split("/rsvp/")[1]))?.family.id).not.toBe(sharmas.id);
    // the Sharmas' own private link still opens the Sharmas
    expect((await getFamilyByToken(token))?.family.id).toBe(sharmas.id);
    // a new household, flagged for a look
    const [mine] = await db.select().from(families).where(eq(families.name, "Uncle Raj"));
    expect(mine).toMatchObject({ side: "bride", source: "guest", possibleMatchFamilyId: sharmas.id, possibleMatchBy: "phone" });
    expect((await db.select().from(rsvps).where(eq(rsvps.familyId, mine.id))).map((x) => x.headcount)).toEqual([4, 4]);
  });
  it("matches by email too (any capitals), and still never touches the household", async () => {
    const r = await submitOpenRsvp({ slug: "open1", name: "Someone", email: "SHARMA@example.com", k: "bridekey", responses: [{ eventId: pheras, status: "declined", headcount: 0 }] }, "visitor-b");
    expect(r.ok).toBe(true);
    const [sharmas] = await db.select().from(families).where(eq(families.name, "The Sharmas"));
    const [mine] = await db.select().from(families).where(eq(families.name, "Someone"));
    expect(mine).toMatchObject({ possibleMatchFamilyId: sharmas.id, possibleMatchBy: "email" });
    expect(await db.select().from(rsvps).where(eq(rsvps.familyId, sharmas.id))).toHaveLength(1);
  });
  it("a new phone simply creates a new household, with nothing flagged", async () => {
    const r = await submitOpenRsvp({ slug: "open1", name: "The Iyers", phone: "+91 90000 22222", k: "bridekey", responses: [{ eventId: sangeet, status: "attending", headcount: 2 }] }, "visitor-c");
    expect(r.ok).toBe(true);
    const [iyers] = await db.select().from(families).where(eq(families.name, "The Iyers"));
    expect(iyers).toMatchObject({ source: "guest", side: "bride", possibleMatchFamilyId: null, possibleMatchBy: null });
  });
  it("the other family's households are never matched (or named) from this family's link", async () => {
    await db.insert(families).values({ weddingId, name: "Groom Cousins", side: "groom", email: "", phone: "9000033333", source: "committee" });
    const r = await submitOpenRsvp({ slug: "open1", name: "Bride Friend", phone: "+91 90000 33333", k: "bridekey", responses: [{ eventId: sangeet, status: "attending", headcount: 1 }] }, "visitor-d");
    expect(r.ok).toBe(true);
    const [mine] = await db.select().from(families).where(eq(families.name, "Bride Friend"));
    expect(mine.possibleMatchFamilyId).toBeNull();
  });
  it("the groom's link can't reply to a bride-only event (even claiming the bride's side)", async () => {
    const [haldi] = await db.insert(events).values({ weddingId, name: "Bride's Haldi", side: "bride", startsAt: new Date(), venueName: "V", address: "X", sortOrder: 3 }).returning();
    const one = [{ eventId: haldi.id, status: "attending" as const, headcount: 1 }];
    const who = { slug: "open1", name: "Groom Pal", phone: "+91 90000 44444", k: "groomkey", linkSide: "groom" as const };
    expect(await submitOpenRsvp({ ...who, responses: one }, "visitor-e")).toEqual({ ok: false, error: "unknown event" });
    expect(await submitOpenRsvp({ ...who, side: "bride", responses: one }, "visitor-e")).toEqual({ ok: false, error: "unknown event" });
    // common events are fine, and the household lands on the link's side
    const ok = await submitOpenRsvp({ ...who, side: "bride", responses: [{ eventId: sangeet, status: "attending", headcount: 1 }] }, "visitor-e");
    expect(ok.ok).toBe(true);
    expect((await db.select().from(families).where(eq(families.name, "Groom Pal")))[0].side).toBe("groom");
    // the bride's link still can
    expect((await submitOpenRsvp({ slug: "open1", name: "Bride Pal", phone: "+91 90000 55555", k: "bridekey", responses: one }, "visitor-f")).ok).toBe(true);
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
