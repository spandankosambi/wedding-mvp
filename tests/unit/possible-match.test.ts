import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, migrateDb } from "@/db/client";
import { weddings, events, families, guests, eventInvites, rsvps } from "@/db/schema";
import { submitOpenRsvp } from "@/lib/guests/open-rsvp";
import { getFamilyByToken } from "@/lib/guests/rsvp";
import { generateInviteToken } from "@/lib/auth/tokens";
import { updateLook } from "@/lib/site/looks";

/* "Needs a look": merging a shared-link reply into the household it matched,
   or keeping them apart, through the real server action and its permission
   checks. Who is signed in is swapped per test. */
let signedIn: Record<string, unknown> | null = null;
vi.mock("@/auth", () => ({ auth: async () => (signedIn ? { user: signedIn } : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const { resolvePossibleMatchAction } = await import("@/app/committee/actions");

let weddingId: string, otherWeddingId: string, sangeet: string, pheras: string;
const couple = () => ({ id: "u-couple", role: "couple", weddingId });
const committee = (side: string, guestsLevel: "full" | "view") =>
  ({ id: "u-c", role: "committee", weddingId, side, access: { site: "none", guests: guestsLevel, print: "none" } });

beforeAll(async () => {
  await migrateDb();
  const [w] = await db.insert(weddings).values({ slug: "match1", brideName: "A", groomName: "B", weddingDate: new Date("2030-11-20") }).returning();
  weddingId = w.id;
  const [o] = await db.insert(weddings).values({ slug: "match2", brideName: "C", groomName: "D", weddingDate: new Date("2030-11-20") }).returning();
  otherWeddingId = o.id;
  [sangeet, pheras] = (await db.insert(events).values([
    { weddingId, name: "Sangeet", startsAt: new Date(), venueName: "V", address: "X", sortOrder: 0 },
    { weddingId, name: "Pheras", startsAt: new Date(), venueName: "V", address: "X", sortOrder: 1 },
  ]).returning()).map((e) => e.id);
  await updateLook(weddingId, "bride", { rsvpOpen: true, shareKey: "bk" });
});

let n = 0;
/** The Mehtas (3 people, private link, declined the Sangeet long ago), plus a
    shared-link reply with their phone: 2 coming to the Sangeet and Pheras. */
async function setup() {
  n += 1;
  const phone = `90000${String(n).padStart(5, "0")}`;
  const [mehtas] = await db.insert(families).values({ weddingId, name: `The Mehtas ${n}`, side: "bride", email: "", phone, source: "committee" }).returning();
  const members = await db.insert(guests).values(["Neha", "Arun", "Tara"].map((fullName) => ({ familyId: mehtas.id, fullName }))).returning();
  const { token, tokenHash } = generateInviteToken();
  await db.update(families).set({ inviteTokenHash: tokenHash, tokenExpiresAt: new Date("2031-01-01") }).where(eq(families.id, mehtas.id));
  await db.insert(eventInvites).values({ eventId: sangeet, familyId: mehtas.id });
  await db.insert(rsvps).values({ eventId: sangeet, familyId: mehtas.id, status: "declined", headcount: 0, guestIds: [], respondedAt: new Date("2026-01-01") });
  const r = await submitOpenRsvp({ slug: "match1", name: `Neha M ${n}`, phone, k: "bk", note: "see you",
    responses: [{ eventId: sangeet, status: "attending", headcount: 2 }, { eventId: pheras, status: "attending", headcount: 2 }] }, `v${n}`);
  if (!r.ok) throw new Error(r.error);
  const [reply] = await db.select().from(families).where(eq(families.name, `Neha M ${n}`));
  expect(reply.possibleMatchFamilyId).toBe(mehtas.id);
  return { mehtas, members, token, reply };
}
const exists = async (id: string) => (await db.select().from(families).where(eq(families.id, id))).length === 1;

beforeEach(() => { signedIn = couple(); });

describe("Yes, that's them", () => {
  it("moves the reply's answers and invitations onto the household, which keeps its members, contacts and link", async () => {
    const { mehtas, token, reply } = await setup();
    expect(await resolvePossibleMatchAction({ weddingId, familyId: reply.id, merge: true })).toEqual({ ok: true });
    const answers = await db.select().from(rsvps).where(eq(rsvps.familyId, mehtas.id));
    const sang = answers.find((a) => a.eventId === sangeet)!, ph = answers.find((a) => a.eventId === pheras)!;
    // the newer reply wins over their old "no"; 2 of their 3 members, so who exactly is left open
    expect(sang).toMatchObject({ status: "attending", headcount: 2, note: "see you", guestIds: null });
    expect(ph).toMatchObject({ status: "attending", headcount: 2 });
    expect((await db.select().from(eventInvites).where(eq(eventInvites.familyId, mehtas.id))).map((i) => i.eventId).sort()).toEqual([sangeet, pheras].sort());
    expect((await db.select().from(guests).where(eq(guests.familyId, mehtas.id))).map((g) => g.fullName)).toEqual(["Neha", "Arun", "Tara"]);
    const [after] = await db.select().from(families).where(eq(families.id, mehtas.id));
    expect(after).toMatchObject({ name: mehtas.name, phone: mehtas.phone, email: mehtas.email });
    expect((await getFamilyByToken(token))?.family.id).toBe(mehtas.id);
    // the separate entry is gone
    expect(await exists(reply.id)).toBe(false);
  });
  it("a headcount that covers the whole household marks each of its own members", async () => {
    const { mehtas, members, reply } = await setup();
    await db.update(rsvps).set({ headcount: 3 }).where(and(eq(rsvps.familyId, reply.id), eq(rsvps.eventId, pheras)));
    expect((await resolvePossibleMatchAction({ weddingId, familyId: reply.id, merge: true })).ok).toBe(true);
    const [ph] = await db.select().from(rsvps).where(and(eq(rsvps.familyId, mehtas.id), eq(rsvps.eventId, pheras)));
    expect(ph.guestIds).toEqual(members.map((m) => m.id));
  });
  it("keeps the household's own answer where it is newer than the reply", async () => {
    const { mehtas, reply } = await setup();
    await db.update(rsvps).set({ respondedAt: new Date("2099-01-01") }).where(and(eq(rsvps.familyId, mehtas.id), eq(rsvps.eventId, sangeet)));
    expect((await resolvePossibleMatchAction({ weddingId, familyId: reply.id, merge: true })).ok).toBe(true);
    const [sang] = await db.select().from(rsvps).where(and(eq(rsvps.familyId, mehtas.id), eq(rsvps.eventId, sangeet)));
    expect(sang).toMatchObject({ status: "declined", headcount: 0 });
  });
  it("works for a committee member with full guest-list access on that side", async () => {
    const { reply } = await setup();
    signedIn = committee("bride", "full");
    expect((await resolvePossibleMatchAction({ weddingId, familyId: reply.id, merge: true })).ok).toBe(true);
  });
});

describe("No, keep separate", () => {
  it("clears the flag and changes nothing else", async () => {
    const { mehtas, reply } = await setup();
    expect(await resolvePossibleMatchAction({ weddingId, familyId: reply.id, merge: false })).toEqual({ ok: true });
    const [r] = await db.select().from(families).where(eq(families.id, reply.id));
    expect(r).toMatchObject({ possibleMatchFamilyId: null, possibleMatchBy: null });
    expect(await db.select().from(rsvps).where(eq(rsvps.familyId, mehtas.id))).toHaveLength(1);
  });
});

describe("should be refused", () => {
  async function refusedFor(user: Record<string, unknown>) {
    const { mehtas, reply } = await setup();
    signedIn = user;
    for (const merge of [true, false]) {
      expect((await resolvePossibleMatchAction({ weddingId, familyId: reply.id, merge })).ok).toBe(false);
    }
    // nothing moved, nothing removed, still flagged
    expect(await exists(reply.id)).toBe(true);
    expect((await db.select().from(families).where(eq(families.id, reply.id)))[0].possibleMatchFamilyId).toBe(mehtas.id);
    expect(await db.select().from(rsvps).where(eq(rsvps.familyId, mehtas.id))).toHaveLength(1);
  }
  it("a committee member from the other side", () => refusedFor(committee("groom", "full")));
  it("a view-only committee member", () => refusedFor(committee("bride", "view")));
  it("the couple of another wedding", () => refusedFor({ id: "u-other", role: "couple", weddingId: otherWeddingId }));
  it("a household that isn't waiting for a look", async () => {
    const { mehtas } = await setup();
    expect((await resolvePossibleMatchAction({ weddingId, familyId: mehtas.id, merge: true })).ok).toBe(false);
    expect(await exists(mehtas.id)).toBe(true);
  });
});
