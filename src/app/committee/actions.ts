"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { families, guests, eventInvites, events } from "@/db/schema";
import { requireRole } from "@/lib/authz";
import { issueInvites } from "@/lib/invites";
import * as household from "@/lib/household";

/* Admin may act on any wedding (passes it explicitly); committee is pinned
   to their own. Every action re-resolves this server-side — never trust input. */
async function scopedWeddingId(requested: string): Promise<string | null> {
  const staff = await requireRole(["committee", "couple", "admin"]);
  if (staff.role === "admin") return requested;
  return staff.weddingId;
}

const familySchema = z.object({
  weddingId: z.string().uuid(),
  familyId: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  side: z.enum(["bride", "groom", "both"]),
  relation: z.string().max(120).optional(),
  // optional: plenty of households are WhatsApp-only; invites skip them
  email: z.union([z.string().trim().toLowerCase().email().max(254), z.literal("")]),
  members: z.array(z.object({
    id: z.string().uuid().optional(),
    fullName: z.string().min(1).max(120),
    ageGroup: z.enum(["adult", "child"]),
  })).min(1).max(30),
  eventIds: z.array(z.string().uuid()).max(50),
});

export async function upsertFamily(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const parsed = familySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const weddingId = await scopedWeddingId(parsed.data.weddingId);
  if (!weddingId) return { ok: false, error: "forbidden" };
  const { name, side, relation, email, members, eventIds } = parsed.data;

  const validEvents = new Set(
    (await db.select().from(events).where(eq(events.weddingId, weddingId))).map((e) => e.id),
  );
  if (!eventIds.every((id) => validEvents.has(id))) return { ok: false, error: "invalid events" };

  let familyId = parsed.data.familyId;
  if (familyId) {
    const [fam] = await db.select().from(families)
      .where(and(eq(families.id, familyId), eq(families.weddingId, weddingId)));
    if (!fam) return { ok: false, error: "family not found" };
    await db.update(families).set({ name, side, relation: relation ?? null, email })
      .where(eq(families.id, familyId));
    // Update guests in place — their ids carry RSVP answers and custom columns
    const current = await db.select().from(guests).where(eq(guests.familyId, familyId));
    const keep = new Set(members.filter((m) => m.id).map((m) => m.id!));
    for (const g of current) if (!keep.has(g.id)) await db.delete(guests).where(eq(guests.id, g.id));
    for (const m of members) {
      if (m.id && current.some((g) => g.id === m.id)) {
        await db.update(guests).set({ fullName: m.fullName, ageGroup: m.ageGroup }).where(eq(guests.id, m.id));
      } else {
        await db.insert(guests).values({ familyId, fullName: m.fullName, ageGroup: m.ageGroup });
      }
    }
    await db.delete(eventInvites).where(eq(eventInvites.familyId, familyId));
  } else {
    const [f] = await db.insert(families)
      .values({ weddingId, name, side, relation: relation ?? null, email }).returning();
    familyId = f.id;
    await db.insert(guests).values(members.map((m) => ({ familyId: familyId!, fullName: m.fullName, ageGroup: m.ageGroup })));
  }

  if (eventIds.length) {
    await db.insert(eventInvites).values(eventIds.map((eventId) => ({ eventId, familyId: familyId! })));
  }
  await household.pruneAttendees(familyId);
  revalidatePath("/committee");
  return { ok: true };
}

const sendSchema = z.object({
  weddingId: z.string().uuid(),
  familyIds: z.array(z.string().uuid()).min(1).max(100),
  type: z.enum(["invite", "resend", "remind"]),
});

export async function sendInvitesAction(input: unknown) {
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid input" };
  const weddingId = await scopedWeddingId(parsed.data.weddingId);
  if (!weddingId) return { ok: false as const, error: "forbidden" };
  const results = await issueInvites(weddingId, parsed.data.familyIds, parsed.data.type);
  revalidatePath("/committee");
  return { ok: true as const, results };
}

const idsSchema = z.object({ weddingId: z.string().uuid(), familyId: z.string().uuid() });

export async function deleteFamilyAction(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const parsed = idsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const weddingId = await scopedWeddingId(parsed.data.weddingId);
  if (!weddingId) return { ok: false, error: "forbidden" };
  const res = await household.deleteFamily(weddingId, parsed.data.familyId);
  revalidatePath("/committee");
  revalidatePath("/couple");
  return res;
}

export async function recordRsvpAction(input: { weddingId: string } & Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const weddingParsed = z.string().uuid().safeParse(input?.weddingId);
  if (!weddingParsed.success) return { ok: false, error: "invalid input" };
  const weddingId = await scopedWeddingId(weddingParsed.data);
  if (!weddingId) return { ok: false, error: "forbidden" };
  const res = await household.recordRsvpForFamily(weddingId, input);
  revalidatePath("/committee");
  revalidatePath("/couple");
  return res;
}

/* Every action below takes { weddingId, ... }; the wedding is re-scoped
   server-side and the rest is validated in lib/household. */
async function scopedFrom(input: unknown) {
  const w = z.object({ weddingId: z.string().uuid() }).safeParse(input);
  if (!w.success) return null;
  return scopedWeddingId(w.data.weddingId);
}
const done = () => { revalidatePath("/committee"); revalidatePath("/couple"); };

export async function bulkFamilyRsvpAction(input: unknown) {
  const weddingId = await scopedFrom(input);
  if (!weddingId) return { ok: false as const, error: "forbidden" };
  const r = await household.bulkFamilyRsvp(weddingId, input);
  done();
  return r;
}

export async function guestRsvpAction(input: unknown) {
  const weddingId = await scopedFrom(input);
  if (!weddingId) return { ok: false as const, error: "forbidden" };
  const r = await household.setGuestRsvp(weddingId, input);
  done();
  return r;
}

export async function addGuestColumnAction(input: { weddingId: string; label: string }) {
  const weddingId = await scopedFrom(input);
  if (!weddingId) return { ok: false as const, error: "forbidden" };
  const r = await household.addGuestColumn(weddingId, String(input.label ?? ""));
  revalidatePath("/committee");
  return r;
}

export async function removeGuestColumnAction(input: { weddingId: string; columnId: string }) {
  const weddingId = await scopedFrom(input);
  if (!weddingId) return { ok: false as const, error: "forbidden" };
  const r = await household.removeGuestColumn(weddingId, String(input.columnId ?? ""));
  revalidatePath("/committee");
  return r;
}

export async function setGuestDetailAction(input: { weddingId: string; guestId: string; columnId: string; value: string }) {
  const weddingId = await scopedFrom(input);
  if (!weddingId) return { ok: false as const, error: "forbidden" };
  return household.setGuestDetail(weddingId, String(input.guestId ?? ""), String(input.columnId ?? ""), String(input.value ?? ""));
}
