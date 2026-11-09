import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db, migrateDb } from "@/db/client";
import { weddings, events, families, eventInvites } from "@/db/schema";
import { generateInviteToken, tokenExpiry } from "@/lib/tokens";
import { getFamilyByToken } from "@/lib/rsvp";
import { showsTravel } from "@/lib/travel";

describe("showsTravel", () => {
  const all = ["a", "b", "c"];
  it("is automatic until someone sets it: shown only when invited to every event", () => {
    expect(showsTravel(null, ["a", "b", "c"], all)).toBe(true);
    expect(showsTravel(undefined, ["c", "a", "b"], all)).toBe(true);
    expect(showsTravel(null, ["a", "b"], all)).toBe(false);
    expect(showsTravel(null, [], [])).toBe(false);
  });
  it("follows the committee's tick either way", () => {
    expect(showsTravel(true, ["a"], all)).toBe(true);
    expect(showsTravel(false, ["a", "b", "c"], all)).toBe(false);
  });
});

let n = 0, weddingId: string, familyId: string, token: string;
const ev: Record<string, string> = {};
beforeAll(async () => { await migrateDb(); });
beforeEach(async () => {
  n++;
  const date = new Date("2027-01-29T04:30:00Z");
  const [w] = await db.insert(weddings).values({ slug: `tr-${n}`, brideName: "Pooja", groomName: "Spandan", weddingDate: date }).returning();
  weddingId = w.id;
  const made = await db.insert(events).values(["Haldi", "Sangeet", "Wedding", "Family puja"].map((name, i) => ({
    weddingId, name, startsAt: date, venueName: "V", address: "Pune", sortOrder: i, isPublished: name !== "Family puja",
  }))).returning();
  for (const e of made) ev[e.name] = e.id;
  const t = generateInviteToken(); token = t.token;
  const [f] = await db.insert(families).values({ weddingId, name: "Wadiker Family", side: "groom", email: "", inviteTokenHash: t.tokenHash, tokenExpiresAt: tokenExpiry(date) }).returning();
  familyId = f.id;
});

const invite = (...names: string[]) => db.insert(eventInvites).values(names.map((nm) => ({ eventId: ev[nm], familyId })));

describe("a household's invitation", () => {
  it("lists only their events, in order, and never one the couple hides", async () => {
    await invite("Wedding", "Haldi", "Family puja");
    const data = await getFamilyByToken(token);
    expect(data?.events.map((e) => e.name)).toEqual(["Haldi", "Wedding"]);
  });

  it("shows Travel & Stay automatically only when invited to everything", async () => {
    await invite("Wedding");
    expect((await getFamilyByToken(token))?.family.showTravel).toBe(false);
    await invite("Haldi", "Sangeet", "Family puja");
    expect((await getFamilyByToken(token))?.family.showTravel).toBe(true);
  });

  it("follows the committee's tick", async () => {
    await invite("Wedding");
    await db.update(families).set({ showTravel: true }).where(eq(families.id, familyId));
    expect((await getFamilyByToken(token))?.family.showTravel).toBe(true);
    await invite("Haldi", "Sangeet", "Family puja");
    await db.update(families).set({ showTravel: false }).where(eq(families.id, familyId));
    expect((await getFamilyByToken(token))?.family.showTravel).toBe(false);
  });
});
