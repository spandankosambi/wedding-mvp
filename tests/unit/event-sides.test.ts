import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, migrateDb } from "@/db/client";
import { weddings, events, families, eventInvites, rsvps } from "@/db/schema";
import { upsertEvent, setEventPublished, deleteEvent, moveEvent, sortEventsByTime, NOT_YOUR_EVENT, COUPLE_SPLITS } from "@/lib/site/editor";

/* Someone who works one family's side may change only the common events and
   that side's own, checked in the database query. The other family's events,
   invitations and replies are never touched. */
let signedIn: Record<string, unknown> | null = null;
vi.mock("@/auth", () => ({ auth: async () => (signedIn ? { user: signedIn } : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw Object.assign(new Error("redirect"), { to }); } }));
const actions = await import("@/app/couple/site/actions");

let weddingId: string, common: string, brideHaldi: string, groomHaldi: string, brideFamily: string;
const groomMember = () => ({ id: "u-g", role: "committee", weddingId, side: "groom", access: { site: "full", guests: "none", print: "none" } });
const details = (side: "both" | "bride" | "groom", name = "Haldi") => ({ name, date: "2030-11-18", time: "10:00", venueName: "Home", address: "Pune", side, isPublished: true });
const ev = async (id: string) => (await db.select().from(events).where(eq(events.id, id)))[0];
const brideAnswers = async (eventId: string) => ({
  invites: (await db.select().from(eventInvites).where(and(eq(eventInvites.eventId, eventId), eq(eventInvites.familyId, brideFamily)))).length,
  rsvps: (await db.select().from(rsvps).where(and(eq(rsvps.eventId, eventId), eq(rsvps.familyId, brideFamily)))).length,
});

beforeAll(async () => {
  await migrateDb();
  const [w] = await db.insert(weddings).values({ slug: "evside", brideName: "A", groomName: "B", weddingDate: new Date("2030-11-20") }).returning();
  weddingId = w.id;
});
beforeEach(async () => {
  signedIn = groomMember();
  await db.delete(events).where(eq(events.weddingId, weddingId));
  await db.delete(families).where(eq(families.weddingId, weddingId));
  [{ id: common }, { id: brideHaldi }, { id: groomHaldi }] = await db.insert(events).values([
    { weddingId, name: "Wedding", startsAt: new Date("2030-11-20T10:00:00Z"), venueName: "V", address: "X", sortOrder: 0 },
    { weddingId, name: "Haldi", side: "bride", startsAt: new Date("2030-11-18T05:00:00Z"), venueName: "V", address: "X", sortOrder: 1 },
    { weddingId, name: "Haldi", side: "groom", startsAt: new Date("2030-11-17T05:00:00Z"), venueName: "V", address: "X", sortOrder: 2 },
  ]).returning();
  [{ id: brideFamily }] = await db.insert(families).values({ weddingId, name: "Bride cousins", side: "bride", email: "" }).returning();
  for (const e of [common, brideHaldi]) {
    await db.insert(eventInvites).values({ eventId: e, familyId: brideFamily });
    await db.insert(rsvps).values({ eventId: e, familyId: brideFamily, status: "attending", headcount: 2 });
  }
});

describe("a groom-side member and the bride's Haldi: refused, nothing touched", () => {
  it("edit (including turning it into a groom event)", async () => {
    const before = await ev(brideHaldi);
    expect(await upsertEvent(weddingId, { id: brideHaldi, ...details("groom") }, "groom")).toEqual({ ok: false, error: NOT_YOUR_EVENT });
    expect(await upsertEvent(weddingId, { id: brideHaldi, ...details("both", "Renamed") }, "groom")).toEqual({ ok: false, error: NOT_YOUR_EVENT });
    expect(await ev(brideHaldi)).toEqual(before);
    expect(await brideAnswers(brideHaldi)).toEqual({ invites: 1, rsvps: 1 });
  });
  it("unpublish", async () => {
    expect(await setEventPublished(weddingId, brideHaldi, false, "groom")).toEqual({ ok: false, error: NOT_YOUR_EVENT });
    expect((await ev(brideHaldi)).isPublished).toBe(true);
  });
  it("delete", async () => {
    expect(await deleteEvent(weddingId, brideHaldi, "groom")).toEqual({ ok: false, error: NOT_YOUR_EVENT });
    expect(await ev(brideHaldi)).toBeTruthy();
    expect(await brideAnswers(brideHaldi)).toEqual({ invites: 1, rsvps: 1 });
  });
  it("move", async () => {
    expect(await moveEvent(weddingId, brideHaldi, "up", "groom")).toEqual({ ok: false, error: NOT_YOUR_EVENT });
    expect((await ev(brideHaldi)).sortOrder).toBe(1);
  });
  it("a new event on the bride's side", async () => {
    expect(await upsertEvent(weddingId, details("bride", "Mehendi"), "groom")).toEqual({ ok: false, error: NOT_YOUR_EVENT });
  });
});

describe("common events", () => {
  it("a groom-side member can't make a common event groom-only (it would drop the bride's guests)", async () => {
    expect(await upsertEvent(weddingId, { id: common, ...details("groom", "Wedding") }, "groom")).toEqual({ ok: false, error: COUPLE_SPLITS });
    expect((await ev(common)).side).toBe("both");
    expect(await brideAnswers(common)).toEqual({ invites: 1, rsvps: 1 });
  });
  it("but can still edit its details", async () => {
    expect((await upsertEvent(weddingId, { id: common, ...details("both", "Wedding day") }, "groom")).ok).toBe(true);
    expect((await ev(common)).name).toBe("Wedding day");
    expect(await brideAnswers(common)).toEqual({ invites: 1, rsvps: 1 });
  });
  it("the couple can still split it", async () => {
    expect((await upsertEvent(weddingId, { id: common, ...details("groom", "Wedding") })).ok).toBe(true);
    expect((await ev(common)).side).toBe("groom");
  });
});

describe("their own and common events still work", () => {
  it("edit, unpublish and delete their own", async () => {
    expect((await upsertEvent(weddingId, { id: groomHaldi, ...details("groom", "Groom Haldi") }, "groom")).ok).toBe(true);
    expect((await setEventPublished(weddingId, groomHaldi, false, "groom")).ok).toBe(true);
    expect((await setEventPublished(weddingId, common, false, "groom")).ok).toBe(true);
    expect((await deleteEvent(weddingId, groomHaldi, "groom")).ok).toBe(true);
  });
  it("move swaps with the neighbour they can see, leaving the bride's event where it is", async () => {
    expect((await moveEvent(weddingId, groomHaldi, "up", "groom")).ok).toBe(true);
    expect((await ev(groomHaldi)).sortOrder).toBe(0);
    expect((await ev(common)).sortOrder).toBe(2);
    expect((await ev(brideHaldi)).sortOrder).toBe(1);
  });
  it("sort by time reorders only what they can see, in the places they hold", async () => {
    expect((await sortEventsByTime(weddingId, "groom")).ok).toBe(true);
    expect((await ev(groomHaldi)).sortOrder).toBe(0); // 17 Nov, before the wedding
    expect((await ev(common)).sortOrder).toBe(2);
    expect((await ev(brideHaldi)).sortOrder).toBe(1); // untouched
  });
});

describe("through the real actions (a crafted request)", () => {
  const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries({ weddingId, family: "groom", ...o })) f.set(k, v); return f; };
  const run = async (fn: (fd: FormData) => Promise<unknown>, fd: FormData) => {
    try { await fn(fd); return ""; } catch (e) { return (e as { to?: string }).to ?? String(e); }
  };
  it("removing the bride's Haldi is refused with a clear message; it and her guests' answers stay", async () => {
    const to = await run(actions.removeEventAction, form({ id: brideHaldi }));
    expect(decodeURIComponent(to.replace(/\+/g, " "))).toContain(NOT_YOUR_EVENT);
    expect(await ev(brideHaldi)).toBeTruthy();
    expect(await brideAnswers(brideHaldi)).toEqual({ invites: 1, rsvps: 1 });
  });
  it("saving the bride's Haldi as a groom event is refused; her invitations stay", async () => {
    const to = await run(actions.saveEventAction, form({ id: brideHaldi, name: "Haldi", date: "2030-11-18", time: "10:00", venueName: "V", address: "X", side: "groom", isPublished: "on", timeZone: "Asia/Kolkata", durationHours: "3" }));
    expect(to).toContain("error=");
    expect((await ev(brideHaldi)).side).toBe("bride");
    expect(await brideAnswers(brideHaldi)).toEqual({ invites: 1, rsvps: 1 });
  });
  it("unpublishing it is refused", async () => {
    await run(actions.toggleEventAction, form({ id: brideHaldi, isPublished: "false" }));
    expect((await ev(brideHaldi)).isPublished).toBe(true);
  });
  it("a member asking for the bride's section is refused outright", async () => {
    await run(actions.removeEventAction, form({ id: brideHaldi, family: "bride" }));
    expect(await ev(brideHaldi)).toBeTruthy();
  });
});
