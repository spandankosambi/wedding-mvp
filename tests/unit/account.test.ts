import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, migrateDb } from "@/db/client";
import { weddings, events, families, guests, eventInvites, rsvps, users, sessions, accountActions } from "@/db/schema";
import { createAction, findAction, carryOut, resetWedding, deleteWedding } from "@/lib/account";
import { galleryOf } from "@/lib/gallery";

let n = 0;
type Fixture = { weddingId: string; coupleId: string; committeeId: string; familyId: string; eventId: string };

/** A fully populated wedding: events, a family with a reply, a committee
    member, photos, story — everything a reset might touch. */
async function makeWedding(): Promise<Fixture> {
  n++;
  const [w] = await db.insert(weddings).values({
    slug: `acc-${n}`, brideName: "Pooja", groomName: "Spandan", weddingDate: new Date("2027-01-29T04:30:00Z"), city: "Pune",
    story: "We met at work", hashtag: "PoojaSpandan", theme: "raj-mahal", rsvpOpen: false,
    gallery: { enabled: false, photos: [{ url: "https://blob.example.com/a.jpg", pathname: "a.jpg", width: 3, height: 4 }] },
  }).returning();
  const [e1] = await db.insert(events).values({ weddingId: w.id, name: "Haldi", startsAt: new Date(), venueName: "V", address: "X", sortOrder: 0 }).returning();
  await db.insert(events).values({ weddingId: w.id, name: "Sangeet", startsAt: new Date(), venueName: "V", address: "X", sortOrder: 1 });
  const [f] = await db.insert(families).values({ weddingId: w.id, name: "Friends", side: "groom", email: `f${n}@example.com` }).returning();
  await db.insert(guests).values({ familyId: f.id, fullName: "A Friend" });
  await db.insert(eventInvites).values({ eventId: e1.id, familyId: f.id });
  await db.insert(rsvps).values({ eventId: e1.id, familyId: f.id, status: "attending", headcount: 1 });
  const [couple] = await db.insert(users).values({ email: `couple${n}@example.com`, role: "couple", weddingId: w.id }).returning();
  const [committee] = await db.insert(users).values({ email: `committee${n}@example.com`, role: "committee", weddingId: w.id }).returning();
  await db.insert(sessions).values({ sessionToken: `s${n}`, userId: couple.id, expires: new Date(Date.now() + 86_400_000) });
  return { weddingId: w.id, coupleId: couple.id, committeeId: committee.id, familyId: f.id, eventId: e1.id };
}

const NONE = { guests: false, rsvps: false, events: false, photos: false, content: false, committee: false };
const wedding = async (id: string) => (await db.select().from(weddings).where(eq(weddings.id, id)))[0];
let fx: Fixture;

beforeAll(async () => { await migrateDb(); });
beforeEach(async () => { fx = await makeWedding(); });

describe("reset", () => {
  it("RSVP answers only: replies go, the guest list stays", async () => {
    await resetWedding(fx.weddingId, { ...NONE, rsvps: true }, fx.coupleId);
    expect(await db.select().from(rsvps).where(eq(rsvps.familyId, fx.familyId))).toHaveLength(0);
    expect(await db.select().from(families).where(eq(families.id, fx.familyId))).toHaveLength(1);
  });

  it("guest list: families, guests and their replies go", async () => {
    await resetWedding(fx.weddingId, { ...NONE, guests: true }, fx.coupleId);
    expect(await db.select().from(families).where(eq(families.weddingId, fx.weddingId))).toHaveLength(0);
    expect(await db.select().from(guests).where(eq(guests.familyId, fx.familyId))).toHaveLength(0);
  });

  it("celebrations: back to the single wedding day", async () => {
    await resetWedding(fx.weddingId, { ...NONE, events: true }, fx.coupleId);
    const evs = await db.select().from(events).where(eq(events.weddingId, fx.weddingId));
    expect(evs.map((e) => e.name)).toEqual(["Wedding"]);
    expect(evs[0].address).toBe("Pune");
  });

  it("photos: emptied (switch kept) and their URLs returned for cleanup", async () => {
    const r = await resetWedding(fx.weddingId, { ...NONE, photos: true }, fx.coupleId);
    expect(r.photoUrls).toEqual(["https://blob.example.com/a.jpg"]);
    expect(galleryOf(await wedding(fx.weddingId))).toEqual({ enabled: false, photos: [] });
  });

  it("site text and look: back to defaults, names and date untouched, photos kept", async () => {
    await resetWedding(fx.weddingId, { ...NONE, content: true }, fx.coupleId);
    const w = await wedding(fx.weddingId);
    expect(w).toMatchObject({ story: null, hashtag: null, theme: "ivory-editorial", rsvpOpen: true, brideName: "Pooja", groomName: "Spandan", city: "Pune" });
    expect(galleryOf(w).photos).toHaveLength(1);
  });

  it("committee logins go; the couple's own login stays", async () => {
    await resetWedding(fx.weddingId, { ...NONE, committee: true }, fx.coupleId);
    expect(await db.select().from(users).where(eq(users.id, fx.committeeId))).toHaveLength(0);
    expect(await db.select().from(users).where(eq(users.id, fx.coupleId))).toHaveLength(1);
  });

  it("touches nothing that wasn't chosen", async () => {
    await resetWedding(fx.weddingId, { ...NONE, events: true }, fx.coupleId);
    expect((await wedding(fx.weddingId)).story).toBe("We met at work");
    expect(await db.select().from(users).where(eq(users.id, fx.committeeId))).toHaveLength(1);
  });
});

describe("delete", () => {
  it("removes the wedding, everything on it, and every login and session", async () => {
    const r = await deleteWedding(fx.weddingId);
    expect(r.photoUrls).toHaveLength(1);
    expect(await wedding(fx.weddingId)).toBeUndefined();
    expect(await db.select().from(events).where(eq(events.weddingId, fx.weddingId))).toHaveLength(0);
    expect(await db.select().from(families).where(eq(families.weddingId, fx.weddingId))).toHaveLength(0);
    expect(await db.select().from(users).where(eq(users.weddingId, fx.weddingId))).toHaveLength(0);
    expect(await db.select().from(sessions).where(eq(sessions.userId, fx.coupleId))).toHaveLength(0);
  });
});

describe("email-confirmed requests", () => {
  it("a confirmation link works exactly once", async () => {
    const { token } = await createAction("reset", fx.weddingId, fx.coupleId, { ...NONE, rsvps: true });
    expect((await findAction(token)).ok).toBe(true);
    expect(await carryOut(token)).toMatchObject({ ok: true, kind: "reset" });
    expect(await carryOut(token)).toEqual({ ok: false, reason: "used" });
  });

  it("an expired link does nothing", async () => {
    const { token } = await createAction("delete", fx.weddingId, fx.coupleId);
    await db.update(accountActions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(accountActions.userId, fx.coupleId));
    expect(await carryOut(token)).toEqual({ ok: false, reason: "expired" });
    expect(await wedding(fx.weddingId)).toBeDefined();
  });

  it("a newer request replaces an older one", async () => {
    const first = await createAction("delete", fx.weddingId, fx.coupleId);
    await createAction("reset", fx.weddingId, fx.coupleId, { ...NONE, photos: true });
    expect(await findAction(first.token)).toEqual({ ok: false, reason: "invalid" });
  });

  it("a made-up token does nothing", async () => {
    expect(await carryOut("x".repeat(43))).toEqual({ ok: false, reason: "invalid" });
  });

  it("a confirmed delete removes the wedding", async () => {
    const { token } = await createAction("delete", fx.weddingId, fx.coupleId);
    expect(await carryOut(token)).toMatchObject({ ok: true, kind: "delete" });
    expect(await wedding(fx.weddingId)).toBeUndefined();
  });
});
