import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db, migrateDb } from "@/db/client";
import { weddings, events, families, guests, eventInvites, rsvps } from "@/db/schema";
import { eventForSide, eventLabel, sideLabel } from "@/lib/sides";
import { upsertEvent, istParts } from "@/lib/editor";
import { commitImport } from "@/lib/import/commit";
import type { ImportRow } from "@/lib/import/normalize";
import { generateInviteToken, tokenExpiry } from "@/lib/tokens";
import { getFamilyByToken, getRsvpSummary } from "@/lib/rsvp";

describe("sides", () => {
  it("a household sees common events and its own side's", () => {
    expect(eventForSide("both", "groom")).toBe(true);
    expect(eventForSide("groom", "groom")).toBe(true);
    expect(eventForSide("bride", "groom")).toBe(false);
    expect(eventForSide("bride", "both")).toBe(true);
    expect(eventForSide("groom", "bride")).toBe(false);
  });
  it("labels one-side events so two Haldis can be told apart", () => {
    expect(eventLabel({ name: "Haldi", side: "bride" })).toBe("Haldi · Bride");
    expect(eventLabel({ name: "Haldi", side: "groom" })).toBe("Haldi · Groom");
    expect(eventLabel({ name: "Wedding", side: "both" })).toBe("Wedding");
    expect(sideLabel("groom")).toBe("Groom's side");
    expect(sideLabel("both")).toBeNull();
  });
});

let n = 0, weddingId: string;
const ev: Record<string, string> = {};
const date = new Date("2027-01-29T04:30:00Z");
beforeAll(async () => { await migrateDb(); });
beforeEach(async () => {
  n++;
  const [w] = await db.insert(weddings).values({ slug: `sd-${n}`, brideName: "Pooja", groomName: "Spandan", weddingDate: date }).returning();
  weddingId = w.id;
  const made = await db.insert(events).values([
    { name: "Haldi", side: "both" as const }, { name: "Wedding", side: "both" as const },
  ].map((e, i) => ({ ...e, weddingId, startsAt: date, venueName: "V", address: "Pune", sortOrder: i }))).returning();
  for (const e of made) ev[e.name] = e.id;
});

async function family(name: string, side: "bride" | "groom" | "both", invited: string[]) {
  const t = generateInviteToken();
  const [f] = await db.insert(families).values({ weddingId, name, side, email: "", inviteTokenHash: t.tokenHash, tokenExpiresAt: tokenExpiry(date) }).returning();
  await db.insert(guests).values({ familyId: f.id, fullName: `${name} One` });
  if (invited.length) await db.insert(eventInvites).values(invited.map((id) => ({ eventId: id, familyId: f.id })));
  return { id: f.id, token: t.token };
}
const invitedTo = async (familyId: string) =>
  (await db.select().from(eventInvites).where(eq(eventInvites.familyId, familyId))).map((i) => i.eventId).sort();

describe("splitting an event by side", () => {
  it("making the Haldi the bride's own takes groom-side households off it (and their answer), not the others", async () => {
    const bride = await family("Bride Fam", "bride", [ev.Haldi, ev.Wedding]);
    const groom = await family("Groom Fam", "groom", [ev.Haldi, ev.Wedding]);
    const both = await family("Friends", "both", [ev.Haldi, ev.Wedding]);
    await db.insert(rsvps).values([bride, groom].map((f) => ({ eventId: ev.Haldi, familyId: f.id, status: "attending" as const, headcount: 1 })));

    const p = istParts(date);
    const r = await upsertEvent(weddingId, { id: ev.Haldi, name: "Haldi", date: p.date, time: p.time, venueName: "Her home", address: "Pune", side: "bride" });
    expect(r.ok).toBe(true);

    expect(await invitedTo(bride.id)).toEqual([ev.Haldi, ev.Wedding].sort());
    expect(await invitedTo(groom.id)).toEqual([ev.Wedding]);
    expect(await invitedTo(both.id)).toEqual([ev.Haldi, ev.Wedding].sort());
    expect((await db.select().from(rsvps).where(eq(rsvps.familyId, groom.id)))).toHaveLength(0);
    expect((await db.select().from(rsvps).where(eq(rsvps.familyId, bride.id)))).toHaveLength(1);
    // the dashboards can tell the two Haldis apart
    expect((await getRsvpSummary(weddingId)).map((s) => s.eventName)).toEqual(["Haldi · Bride", "Wedding"]);
  });

  it("a groom-side household invited to everything open to them gets Travel & Stay automatically", async () => {
    const [groomHaldi] = await db.insert(events).values({ weddingId, name: "Haldi", side: "groom", startsAt: date, venueName: "His home", address: "Pune", sortOrder: 2 }).returning();
    await db.update(events).set({ side: "bride" }).where(eq(events.id, ev.Haldi));
    const groom = await family("Groom Fam", "groom", [groomHaldi.id, ev.Wedding]);
    const data = await getFamilyByToken(groom.token);
    expect(data?.family.showTravel).toBe(true);
    expect(data?.events.map((e) => [e.name, e.side])).toEqual([["Wedding", "both"], ["Haldi", "groom"]]);
  });

  it("an imported household is only invited to events open to its side", async () => {
    await db.update(events).set({ side: "bride" }).where(eq(events.id, ev.Haldi));
    const row = (over: Partial<ImportRow> & { key: string; name: string }): ImportRow => ({
      side: "groom", relation: "", email: "", members: [{ fullName: over.name, ageGroup: "adult" }],
      eventIds: [ev.Haldi, ev.Wedding], issues: [], sourceRows: [], ...over,
    } as ImportRow);
    const res = await commitImport(weddingId, [row({ key: "g", name: "Groom Import" }), row({ key: "b", name: "Bride Import", side: "bride" })], { onExisting: "skip" });
    expect(res.errors).toEqual([]);
    const [g] = await db.select().from(families).where(eq(families.name, "Groom Import"));
    const [b] = await db.select().from(families).where(eq(families.name, "Bride Import"));
    expect(await invitedTo(g.id)).toEqual([ev.Wedding]);
    expect(await invitedTo(b.id)).toEqual([ev.Haldi, ev.Wedding].sort());
  });
});
