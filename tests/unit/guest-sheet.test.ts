import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db, migrateDb } from "@/db/client";
import { weddings, events, families, guests, eventInvites } from "@/db/schema";
import { guestSheet, updateFromSheet, COLS } from "@/lib/guest-sheet";
import { updateLook } from "@/lib/looks";

/* The guest list as a spreadsheet and back: only edits are applied, nobody
   is duplicated or removed, and the hotel defaults when there's one. */

let n = 0, weddingId: string, sharmaId: string, riyaId: string;
const date = new Date("2027-01-29T04:30:00Z");
beforeAll(async () => { await migrateDb(); });
beforeEach(async () => {
  n++;
  const [w] = await db.insert(weddings).values({ slug: `gs-${n}`, brideName: "Pooja", groomName: "Spandan", weddingDate: date }).returning();
  weddingId = w.id;
  const made = await db.insert(events).values([
    { name: "Haldi", side: "bride" as const }, { name: "Wedding", side: "both" as const },
  ].map((e, i) => ({ ...e, weddingId, startsAt: date, venueName: "V", address: "Pune", sortOrder: i }))).returning();
  const [f] = await db.insert(families).values({ weddingId, name: "Sharma Family", side: "bride", email: "", showTravel: true }).returning();
  sharmaId = f.id;
  const [riya] = await db.insert(guests).values([
    { familyId: f.id, fullName: "Riya Sharma", ageGroup: "adult" as const, phone: "+91 98200 11111", isPrimary: true },
    { familyId: f.id, fullName: "Aarav Sharma", ageGroup: "child" as const },
  ]).returning();
  riyaId = riya.id;
  await db.insert(eventInvites).values(made.map((e) => ({ eventId: e.id, familyId: f.id })));
  await updateLook(weddingId, "bride", { travel: { stays: [{ name: "Taj Pune", note: "", common: false }] } as never });
});

const table = async () => {
  const s = await guestSheet(weddingId, "bride");
  return [s.header, ...s.rows];
};
const col = (t: string[][], title: string) => t[0].indexOf(title);

describe("guest list spreadsheet", () => {
  it("downloads a row per guest, with ids, the family's name and the default hotel", async () => {
    const t = await table();
    expect(t).toHaveLength(3);
    expect(t[0].slice(0, 3)).toEqual([COLS.guestId, COLS.householdId, COLS.household]);
    expect(t[1][col(t, COLS.guest)]).toBe("Riya Sharma");
    expect(t[1][col(t, COLS.family)]).toBe("Pooja's family");
    expect(t[1][col(t, COLS.hotel)]).toBe("Taj Pune"); // the only hotel, so everyone's by default
    expect(t[1][col(t, COLS.invited)]).toBe("Haldi · Pooja, Wedding");
    expect(t[0]).toContain("RSVP: Wedding");
  });

  it("an unchanged file changes nothing", async () => {
    const plan = await updateFromSheet(weddingId, "bride", await table(), true);
    expect(plan.errors).toEqual([]);
    expect(plan.count).toBe(0);
    expect(plan.unchanged).toBe(2);
  });

  it("applies only what was edited, adds new people once, and removes nobody", async () => {
    const t = await table();
    t[1][col(t, COLS.room)] = "204";
    t[1][col(t, COLS.phone)] = "+91 98200 22222";
    t.splice(2, 1); // Aarav left out of the sheet: he stays on the list
    const blank = t[0].map(() => "");
    const kabir = [...blank]; kabir[col(t, COLS.household)] = "Sharma Family"; kabir[col(t, COLS.guest)] = "Kabir Sharma";
    const again = [...blank]; again[col(t, COLS.household)] = "Sharma Family"; again[col(t, COLS.guest)] = "Riya Sharma"; // already there
    const mehta = [...blank]; mehta[col(t, COLS.household)] = "Mehta Family"; mehta[col(t, COLS.guest)] = "Neel Mehta"; mehta[col(t, COLS.invited)] = "Wedding";
    t.push(kabir, again, mehta);

    const preview = await updateFromSheet(weddingId, "bride", t, false);
    expect(preview.errors).toEqual([]);
    expect(preview.count).toBe(3); // Riya's edits, Kabir, the Mehta household
    expect(preview.changes.find((c) => c.kind === "skip")?.text).toMatch(/Riya Sharma is already in Sharma Family/);
    expect((await db.select().from(guests).where(eq(guests.familyId, sharmaId)))).toHaveLength(2); // a preview saves nothing

    await updateFromSheet(weddingId, "bride", t, true);
    const sharma = await db.select().from(guests).where(eq(guests.familyId, sharmaId));
    expect(sharma.map((g) => g.fullName).sort()).toEqual(["Aarav Sharma", "Kabir Sharma", "Riya Sharma"]);
    const riya = sharma.find((g) => g.id === riyaId)!;
    expect(riya.phone).toBe("+91 98200 22222");
    expect(riya.details?.room).toBe("204");
    const [mehta2] = await db.select().from(families).where(eq(families.name, "Mehta Family"));
    expect(mehta2.side).toBe("bride");

    // uploading the same file again: nothing new
    const twice = await updateFromSheet(weddingId, "bride", t, false);
    expect(twice.count).toBe(0); // rows without ids now match people already there by name
    expect(twice.changes.filter((c) => c.kind === "skip")).toHaveLength(3);
  });

  it("refuses rows it can't place, with the row number", async () => {
    const t = await table();
    t[1][col(t, COLS.email)] = "not-an-email";
    t[2][col(t, COLS.hotel)] = "Some Other Hotel";
    const plan = await updateFromSheet(weddingId, "bride", t, true);
    expect(plan.errors.join(" ")).toMatch(/Row 2: "not-an-email" isn't a valid email/);
    expect(plan.errors.join(" ")).toMatch(/Row 3: "Some Other Hotel" isn't one of the hotels/);
  });
});
