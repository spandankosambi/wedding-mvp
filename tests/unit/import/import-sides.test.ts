import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, migrateDb } from "@/db/client";
import { weddings, events, families, guests, eventInvites } from "@/db/schema";
import { commitImport } from "@/lib/import/commit";
import type { ImportRow } from "@/lib/import/normalize";

/* A one-side importer only ever sees, matches and changes their own side's
   households. Tested in the library and through the real actions, with a
   pretend signed-in person. */
let signedIn: Record<string, unknown> | null = null;
vi.mock("@/auth", () => ({ auth: async () => (signedIn ? { user: signedIn } : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const { checkRowsAction, commitRowsAction } = await import("@/app/committee/import/actions");

let weddingId: string, common: string, brideHaldi: string, groomHaldi: string;
const groomMember = () => ({ id: "u-g", role: "committee", weddingId, side: "groom", access: { site: "none", guests: "full", print: "none" } });
const couple = () => ({ id: "u-c", role: "couple", weddingId });

function row(over: Partial<ImportRow> & { key: string; name: string }): ImportRow {
  return { side: "groom", relation: "", email: "", members: [{ fullName: "Raj Sharma", ageGroup: "adult" }], eventIds: [common], issues: [], sourceRows: [], ...over };
}

/** The bride's "Sharma Family", with two people, invited to the common event and her Haldi */
async function brideSharmas(email = "") {
  await db.delete(families).where(eq(families.weddingId, weddingId));
  const [f] = await db.insert(families).values({ weddingId, name: "Sharma Family", side: "bride", email, relation: "Mama" }).returning();
  await db.insert(guests).values([{ familyId: f.id, fullName: "Asha Sharma" }, { familyId: f.id, fullName: "Vik Sharma" }]);
  await db.insert(eventInvites).values([{ eventId: common, familyId: f.id }, { eventId: brideHaldi, familyId: f.id }]);
  return f.id;
}
const snapshot = async (id: string) => ({
  family: (await db.select().from(families).where(eq(families.id, id)))[0],
  members: (await db.select().from(guests).where(eq(guests.familyId, id))).map((g) => g.fullName).sort(),
  invites: (await db.select().from(eventInvites).where(eq(eventInvites.familyId, id))).map((i) => i.eventId).sort(),
});

beforeAll(async () => {
  await migrateDb();
  const [w] = await db.insert(weddings).values({ slug: "impside", brideName: "A", groomName: "B", weddingDate: new Date("2030-11-20") }).returning();
  weddingId = w.id;
  [{ id: common }, { id: brideHaldi }, { id: groomHaldi }] = await db.insert(events).values([
    { weddingId, name: "Wedding", startsAt: new Date(), venueName: "V", address: "X", sortOrder: 0 },
    { weddingId, name: "Haldi", side: "bride", startsAt: new Date(), venueName: "V", address: "X", sortOrder: 1 },
    { weddingId, name: "Haldi", side: "groom", startsAt: new Date(), venueName: "V", address: "X", sortOrder: 2 },
  ]).returning();
});
beforeEach(() => { signedIn = groomMember(); });

describe("one-side import (library)", () => {
  for (const onExisting of ["update", "merge", "skip"] as const) {
    it(`groom side, "${onExisting}": a new groom-side Sharma Family; the bride's is untouched`, async () => {
      const bride = await brideSharmas();
      const before = await snapshot(bride);
      const res = await commitImport(weddingId, [row({ key: "a", name: "Sharma Family", eventIds: [common, groomHaldi] })], { onExisting, side: "groom" });
      expect(res).toMatchObject({ created: 1, updated: 0, skipped: 0 });
      expect(await snapshot(bride)).toEqual(before);
      const fams = await db.select().from(families).where(eq(families.weddingId, weddingId));
      const mine = fams.find((f) => f.id !== bride)!;
      expect(mine).toMatchObject({ name: "Sharma Family", side: "groom" });
    });
  }
  it("matching by the same email on the other side doesn't count either", async () => {
    const bride = await brideSharmas("sharma@site.org");
    const before = await snapshot(bride);
    const res = await commitImport(weddingId, [row({ key: "a", name: "Anything", email: "sharma@site.org" })], { onExisting: "update", side: "groom" });
    expect(res.created).toBe(1);
    expect(await snapshot(bride)).toEqual(before);
  });
  it("a groom-side importer's rows all land on the groom's side, whatever the sheet says", async () => {
    await brideSharmas();
    await commitImport(weddingId, [row({ key: "a", name: "Mehta Family", side: "bride", eventIds: [common, brideHaldi] })], { onExisting: "update", side: "groom" });
    const [m] = await db.select().from(families).where(eq(families.name, "Mehta Family"));
    expect(m.side).toBe("groom");
    // and never onto the bride's own event
    expect((await snapshot(m.id)).invites).toEqual([common]);
  });
  it("still updates their own side's household as before", async () => {
    await brideSharmas();
    const [g] = await db.insert(families).values({ weddingId, name: "Kapoor Family", side: "groom", email: "" }).returning();
    const res = await commitImport(weddingId, [row({ key: "a", name: "Kapoor Family", members: [{ fullName: "New Kapoor", ageGroup: "adult" }] })], { onExisting: "update", side: "groom" });
    expect(res).toMatchObject({ created: 0, updated: 1 });
    expect((await snapshot(g.id)).members).toEqual(["New Kapoor"]);
  });
});

describe("both-side import (couple)", () => {
  it("still matches across sides, and 'update' keeps the household on its own side", async () => {
    const bride = await brideSharmas();
    const res = await commitImport(weddingId, [row({ key: "a", name: "Sharma Family", side: "groom", members: [{ fullName: "Asha Sharma", ageGroup: "adult" }], eventIds: [common, groomHaldi, brideHaldi] })], { onExisting: "update" });
    expect(res).toMatchObject({ created: 0, updated: 1 });
    const after = await snapshot(bride);
    expect(after.family.side).toBe("bride"); // not moved
    expect(after.invites).toEqual([common, brideHaldi].sort()); // its own side's events only
    expect(await db.select().from(families).where(eq(families.weddingId, weddingId))).toHaveLength(1);
  });
  it("merge across sides keeps the side too", async () => {
    const bride = await brideSharmas();
    await commitImport(weddingId, [row({ key: "a", name: "Sharma Family", side: "groom", members: [{ fullName: "Neel Sharma", ageGroup: "adult" }] })], { onExisting: "merge" });
    const after = await snapshot(bride);
    expect(after.family.side).toBe("bride");
    expect(after.members).toEqual(["Asha Sharma", "Neel Sharma", "Vik Sharma"]);
  });
});

describe("through the actions (should be refused / hidden)", () => {
  it("preview check: a groom-side member sees no 'exists' for the bride's households", async () => {
    await brideSharmas("sharma@site.org");
    const res = await checkRowsAction({ weddingId, rows: [row({ key: "a", name: "Sharma Family" }), row({ key: "b", name: "X", email: "sharma@site.org" })] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.existsCount).toBe(0);
    expect(res.rows.every((r) => !r.issues.includes("exists") && !r.match)).toBe(true);
  });
  it("the couple's check still finds it", async () => {
    await brideSharmas();
    signedIn = couple();
    const res = await checkRowsAction({ weddingId, rows: [row({ key: "a", name: "Sharma Family" })] });
    expect(res.ok && res.existsCount).toBe(1);
  });
  it("commit: a crafted match id pointing at the bride's household is ignored; it stays untouched", async () => {
    const bride = await brideSharmas();
    const before = await snapshot(bride);
    const res = await commitRowsAction({ weddingId, onExisting: "update", rows: [row({ key: "a", name: "Sharma Family", side: "bride", match: { id: bride, reason: "name" } })] });
    expect(res.ok && res.result).toMatchObject({ created: 1, updated: 0 });
    expect(await snapshot(bride)).toEqual(before);
  });
  it("a view-only member can't import at all", async () => {
    signedIn = { ...groomMember(), access: { site: "none", guests: "view", print: "none" } };
    expect(await commitRowsAction({ weddingId, onExisting: "update", rows: [row({ key: "a", name: "Z" })] })).toEqual({ ok: false, error: "forbidden" });
  });
});
