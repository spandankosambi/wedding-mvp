import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { families, guests, eventInvites, rsvps, weddings, type GuestColumn } from "@/db/schema";

/* Committee-side household operations. Callers pass a weddingId they have
   already scoped to the signed-in staff member; every function re-checks that
   what it touches belongs to that wedding.

   Attendance is per guest: an RSVP row (one per family per event) lists the
   guest ids who are coming, and its headcount is that list's length. A row
   with guestIds = null came from the family's own link as a bare number. */

type Result = { ok: true } | { ok: false; error: string };

export { guestAnswer, attendeesFromCount, type GuestAnswer } from "@/lib/attendance";

async function familyInWedding(weddingId: string, familyId: string) {
  const [fam] = await db.select({ id: families.id }).from(families)
    .where(and(eq(families.id, familyId), eq(families.weddingId, weddingId)));
  return fam ?? null;
}

async function writeRow(familyId: string, eventId: string, attendees: string[] | "declined" | "none") {
  if (attendees === "none") {
    await db.delete(rsvps).where(and(eq(rsvps.eventId, eventId), eq(rsvps.familyId, familyId)));
    return;
  }
  const status = attendees === "declined" || attendees.length === 0 ? "declined" : "attending";
  const guestIds = attendees === "declined" ? [] : attendees;
  await db.insert(rsvps)
    .values({ eventId, familyId, status, headcount: guestIds.length, guestIds })
    .onConflictDoUpdate({
      target: [rsvps.eventId, rsvps.familyId],
      // a note the guest left stays; only the answer changes
      set: { status, headcount: guestIds.length, guestIds, respondedAt: new Date() },
    });
}

/** Remove a household and everything hanging off it — guests, invitations,
    RSVPs and its email log all cascade in the database. */
export async function deleteFamily(weddingId: string, familyId: string): Promise<Result> {
  if (!z.string().uuid().safeParse(familyId).success) return { ok: false, error: "invalid input" };
  if (!(await familyInWedding(weddingId, familyId))) return { ok: false, error: "family not found" };
  await db.delete(families).where(eq(families.id, familyId));
  return { ok: true };
}

export const committeeRsvpSchema = z.object({
  familyId: z.string().uuid(),
  /** People to add to the household first; refer to them as "new:<index>" in guestIds */
  addGuests: z.array(z.object({ fullName: z.string().trim().min(1).max(120), ageGroup: z.enum(["adult", "child"]) })).max(20).default([]),
  responses: z.array(z.object({
    eventId: z.string().uuid(),
    status: z.enum(["attending", "declined", "none"]),
    guestIds: z.array(z.string().max(60)).max(70).default([]),
  })).min(1).max(50),
});

/**
 * Record a household's replies on their behalf — for the aunt who answered on
 * the phone. For each invited event: who is coming (ticked by name), not
 * attending, or no reply. The count can't exceed the household: anyone extra
 * is added as a named guest in the same save.
 */
export async function recordRsvpForFamily(weddingId: string, input: unknown): Promise<Result> {
  const parsed = committeeRsvpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const { familyId, addGuests, responses } = parsed.data;
  if (!(await familyInWedding(weddingId, familyId))) return { ok: false, error: "family not found" };

  const invited = new Set(
    (await db.select().from(eventInvites).where(eq(eventInvites.familyId, familyId))).map((i) => i.eventId),
  );
  const members = new Set((await db.select({ id: guests.id }).from(guests).where(eq(guests.familyId, familyId))).map((g) => g.id));
  for (const r of responses) {
    if (!invited.has(r.eventId)) return { ok: false, error: "not invited to that event" };
    if (r.status === "attending") {
      if (r.guestIds.length === 0) return { ok: false, error: "tick who is coming" };
      for (const id of r.guestIds) {
        const n = id.startsWith("new:") ? Number(id.slice(4)) : NaN;
        if (!members.has(id) && !(Number.isInteger(n) && n >= 0 && n < addGuests.length)) return { ok: false, error: "unknown guest" };
      }
    }
  }

  const added = addGuests.length
    ? await db.insert(guests).values(addGuests.map((g) => ({ familyId, fullName: g.fullName, ageGroup: g.ageGroup }))).returning()
    : [];
  const resolve = (id: string) => (id.startsWith("new:") ? added[Number(id.slice(4))].id : id);

  for (const r of responses) {
    await writeRow(familyId, r.eventId, r.status === "none" ? "none" : r.status === "declined" ? "declined" : [...new Set(r.guestIds.map(resolve))]);
  }
  return { ok: true };
}

const bulkFamilySchema = z.object({
  familyIds: z.array(z.string().uuid()).min(1).max(500),
  eventIds: z.array(z.string().uuid()).min(1).max(50),
  answer: z.enum(["attending", "declined", "none"]),
});

/** Several households at once: everyone in each family attending, not
    attending, or reply cleared — for the chosen events they're invited to. */
export async function bulkFamilyRsvp(weddingId: string, input: unknown): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  const parsed = bulkFamilySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const { familyIds, eventIds, answer } = parsed.data;
  const fams = await db.select({ id: families.id }).from(families)
    .where(and(eq(families.weddingId, weddingId), inArray(families.id, familyIds)));
  if (fams.length !== new Set(familyIds).size) return { ok: false, error: "family not found" };
  const invites = await db.select().from(eventInvites).where(inArray(eventInvites.familyId, familyIds));
  const members = await db.select({ id: guests.id, familyId: guests.familyId }).from(guests).where(inArray(guests.familyId, familyIds));
  let updated = 0;
  for (const inv of invites) {
    if (!eventIds.includes(inv.eventId)) continue;
    const all = members.filter((m) => m.familyId === inv.familyId).map((m) => m.id);
    await writeRow(inv.familyId, inv.eventId, answer === "attending" ? (all.length ? all : "declined") : answer);
    updated++;
  }
  return { ok: true, updated };
}

const guestRsvpSchema = z.object({
  guestIds: z.array(z.string().uuid()).min(1).max(1000),
  eventIds: z.array(z.string().uuid()).min(1).max(50),
  answer: z.enum(["yes", "no", "none"]),
});

/**
 * Mark individual guests for the chosen events. A guest only gets an answer
 * for events their household is invited to. "none" clears this guest; if
 * nobody in the family is left with an answer the row goes back to no reply.
 * A family's anonymous count (from their own link) is replaced by names.
 */
export async function setGuestRsvp(weddingId: string, input: unknown): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  const parsed = guestRsvpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const { guestIds, eventIds, answer } = parsed.data;
  const rows = await db.select({ id: guests.id, familyId: guests.familyId }).from(guests)
    .innerJoin(families, eq(guests.familyId, families.id))
    .where(and(eq(families.weddingId, weddingId), inArray(guests.id, guestIds)));
  if (rows.length !== new Set(guestIds).size) return { ok: false, error: "guest not found" };

  const byFamily = new Map<string, string[]>();
  for (const r of rows) byFamily.set(r.familyId, [...(byFamily.get(r.familyId) ?? []), r.id]);
  const famIds = [...byFamily.keys()];
  const invites = await db.select().from(eventInvites).where(inArray(eventInvites.familyId, famIds));
  const existing = await db.select().from(rsvps).where(inArray(rsvps.familyId, famIds));
  const allMembers = await db.select({ id: guests.id, familyId: guests.familyId }).from(guests).where(inArray(guests.familyId, famIds));

  let updated = 0;
  for (const [familyId, chosen] of byFamily) {
    const familyAll = allMembers.filter((m) => m.familyId === familyId).map((m) => m.id);
    for (const eventId of eventIds) {
      if (!invites.some((i) => i.familyId === familyId && i.eventId === eventId)) continue;
      const row = existing.find((r) => r.familyId === familyId && r.eventId === eventId);
      const set = new Set<string>(
        !row || row.status === "declined" ? [] : row.guestIds ?? (row.headcount >= familyAll.length ? familyAll : []),
      );
      for (const g of chosen) { if (answer === "yes") set.add(g); else set.delete(g); }
      if (set.size > 0) await writeRow(familyId, eventId, [...set]);
      else if (answer === "no" || (row && row.status === "declined")) await writeRow(familyId, eventId, "declined");
      else await writeRow(familyId, eventId, "none");
      updated += chosen.length;
    }
  }
  return { ok: true, updated };
}

/** After a family's guest list changes, drop removed guests from their
    answers so counts stay true. */
export async function pruneAttendees(familyId: string) {
  const ids = new Set((await db.select({ id: guests.id }).from(guests).where(eq(guests.familyId, familyId))).map((g) => g.id));
  const rows = await db.select().from(rsvps).where(eq(rsvps.familyId, familyId));
  for (const r of rows) {
    if (!r.guestIds) continue;
    const kept = r.guestIds.filter((g) => ids.has(g));
    if (kept.length === r.guestIds.length) continue;
    if (kept.length === 0 && r.status === "attending") await db.update(rsvps).set({ status: "declined", headcount: 0, guestIds: [] }).where(eq(rsvps.id, r.id));
    else await db.update(rsvps).set({ guestIds: kept, headcount: kept.length }).where(eq(rsvps.id, r.id));
  }
}

/* ── Custom guest columns ───────────────────────────────────────────── */

export const MAX_GUEST_COLUMNS = 8;

async function columnsOf(weddingId: string): Promise<GuestColumn[] | null> {
  const [w] = await db.select({ c: weddings.guestColumns }).from(weddings).where(eq(weddings.id, weddingId));
  return w ? w.c ?? [] : null;
}

export async function addGuestColumn(weddingId: string, label: string): Promise<{ ok: true; column: GuestColumn } | { ok: false; error: string }> {
  const name = label.trim().slice(0, 40);
  if (!name) return { ok: false, error: "give the column a name" };
  const cols = await columnsOf(weddingId);
  if (!cols) return { ok: false, error: "wedding not found" };
  if (cols.length >= MAX_GUEST_COLUMNS) return { ok: false, error: `up to ${MAX_GUEST_COLUMNS} extra columns` };
  if (cols.some((c) => c.label.toLowerCase() === name.toLowerCase())) return { ok: false, error: "there's already a column with that name" };
  const column = { id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, label: name };
  await db.update(weddings).set({ guestColumns: [...cols, column] }).where(eq(weddings.id, weddingId));
  return { ok: true, column };
}

export async function removeGuestColumn(weddingId: string, columnId: string): Promise<Result> {
  const cols = await columnsOf(weddingId);
  if (!cols) return { ok: false, error: "wedding not found" };
  if (!cols.some((c) => c.id === columnId)) return { ok: false, error: "column not found" };
  await db.update(weddings).set({ guestColumns: cols.filter((c) => c.id !== columnId) }).where(eq(weddings.id, weddingId));
  // drop the stored values too
  const rows = await db.select({ id: guests.id, details: guests.details }).from(guests)
    .innerJoin(families, eq(guests.familyId, families.id)).where(eq(families.weddingId, weddingId));
  for (const r of rows) {
    if (!r.details || !(columnId in r.details)) continue;
    const { [columnId]: _gone, ...rest } = r.details;
    await db.update(guests).set({ details: rest }).where(eq(guests.id, r.id));
  }
  return { ok: true };
}

export async function setGuestDetail(weddingId: string, guestId: string, columnId: string, value: string): Promise<Result> {
  const cols = await columnsOf(weddingId);
  if (!cols?.some((c) => c.id === columnId)) return { ok: false, error: "column not found" };
  if (!z.string().uuid().safeParse(guestId).success) return { ok: false, error: "invalid input" };
  const [g] = await db.select({ id: guests.id, details: guests.details }).from(guests)
    .innerJoin(families, eq(guests.familyId, families.id))
    .where(and(eq(guests.id, guestId), eq(families.weddingId, weddingId)));
  if (!g) return { ok: false, error: "guest not found" };
  const v = value.trim().slice(0, 200);
  const details = { ...(g.details ?? {}) };
  if (v) details[columnId] = v; else delete details[columnId];
  await db.update(guests).set({ details }).where(eq(guests.id, guestId));
  return { ok: true };
}
