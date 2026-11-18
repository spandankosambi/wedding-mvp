"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { families, guests, eventInvites, events } from "@/db/schema";
import { requireRole } from "@/lib/authz";
import type { Access } from "@/lib/access";
import { issueInvites, whatsappInvite } from "@/lib/invites";
import * as household from "@/lib/household";
import { syncHousehold } from "@/lib/primary";
import { eventForSide } from "@/lib/sides";
import { sendStayDetails } from "@/lib/stay";

/* Admin may act on any wedding (passes it explicitly); everyone else is pinned
   to their own. Every action re-resolves this server-side — never trust input.
   Changing the guest list needs full access to it, and a person who works one
   family's side may only touch that side's households. */
async function scope(requested: string): Promise<{ weddingId: string; access: Access } | null> {
  const staff = await requireRole(["committee", "couple", "admin"]);
  const weddingId = staff.role === "admin" ? requested : staff.weddingId;
  if (!weddingId || staff.access.guests !== "full") return null;
  return { weddingId, access: staff.access };
}
async function scopedWeddingId(requested: string, touching?: { familyIds?: unknown; guestIds?: unknown; side?: unknown }): Promise<string | null> {
  const s = await scope(requested);
  if (!s) return null;
  if (s.access.side === "both" || !touching) return s.weddingId;
  if (touching.side !== undefined && touching.side !== s.access.side) return null;
  const uuids = (v: unknown) => (Array.isArray(v) ? v : []).filter((x): x is string => z.string().uuid().safeParse(x).success);
  let famIds = uuids(touching.familyIds);
  const gIds = uuids(touching.guestIds);
  if (gIds.length) {
    const gs = await db.select({ familyId: guests.familyId }).from(guests).where(inArray(guests.id, gIds));
    if (gs.length !== new Set(gIds).size) return null;
    famIds = [...famIds, ...gs.map((g) => g.familyId)];
  }
  famIds = [...new Set(famIds)];
  if (famIds.length) {
    const fs = await db.select({ side: families.side }).from(families)
      .where(and(eq(families.weddingId, s.weddingId), inArray(families.id, famIds)));
    if (fs.length !== famIds.length || fs.some((f) => f.side !== s.access.side)) return null;
  }
  return s.weddingId;
}

// Contact details are per guest and all optional (plenty of households are
// WhatsApp-only). A typed email must be valid; a phone needs 8+ digits.
const optionalEmail = z.union([z.string().trim().toLowerCase().email().max(254), z.literal("")]).optional().default("");
const optionalPhone = z.string().trim().max(30).optional().default("")
  .refine((v) => !v || v.replace(/\D/g, "").length >= 8, "phone");

const familySchema = z.object({
  weddingId: z.string().uuid(),
  familyId: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  side: z.enum(["bride", "groom"]), // every household belongs to one family
  relation: z.string().max(120).optional(),
  members: z.array(z.object({
    id: z.string().uuid().optional(),
    fullName: z.string().min(1).max(120),
    ageGroup: z.enum(["adult", "child"]),
    email: optionalEmail,
    phone: optionalPhone,
    isPrimary: z.boolean().optional().default(false),
  })).min(1).max(30),
  eventIds: z.array(z.string().uuid()).max(50),
  showTravel: z.boolean().optional(),
});

export async function upsertFamily(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const parsed = familySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const weddingId = await scopedWeddingId(parsed.data.weddingId, { side: parsed.data.side, familyIds: [parsed.data.familyId] });
  if (!weddingId) return { ok: false, error: "forbidden" };
  const { name, side, relation, eventIds, showTravel } = parsed.data;
  // one primary at most from the form; syncHousehold settles the rest
  let primarySeen = false;
  const members = parsed.data.members.map((m) => {
    const isPrimary = m.isPrimary && !primarySeen;
    if (isPrimary) primarySeen = true;
    return { ...m, email: m.email || null, phone: m.phone || null, isPrimary };
  });

  const weddingEvents = await db.select().from(events).where(eq(events.weddingId, weddingId));
  if (!eventIds.every((id) => weddingEvents.some((e) => e.id === id))) return { ok: false, error: "invalid events" };
  // the other side's own events aren't theirs to be invited to
  const invitable = eventIds.filter((id) => eventForSide(weddingEvents.find((e) => e.id === id)!.side, side));

  let familyId = parsed.data.familyId;
  if (familyId) {
    const [fam] = await db.select().from(families)
      .where(and(eq(families.id, familyId), eq(families.weddingId, weddingId)));
    if (!fam) return { ok: false, error: "family not found" };
    await db.update(families).set({ name, side, relation: relation ?? null, ...(showTravel === undefined ? {} : { showTravel }) })
      .where(eq(families.id, familyId));
    // Update guests in place — their ids carry RSVP answers and custom columns
    const current = await db.select().from(guests).where(eq(guests.familyId, familyId));
    const keep = new Set(members.filter((m) => m.id).map((m) => m.id!));
    for (const g of current) if (!keep.has(g.id)) await db.delete(guests).where(eq(guests.id, g.id));
    for (const m of members) {
      const fields = { fullName: m.fullName, ageGroup: m.ageGroup, email: m.email, phone: m.phone, isPrimary: m.isPrimary };
      if (m.id && current.some((g) => g.id === m.id)) await db.update(guests).set(fields).where(eq(guests.id, m.id));
      else await db.insert(guests).values({ familyId, ...fields });
    }
    await db.delete(eventInvites).where(eq(eventInvites.familyId, familyId));
  } else {
    const [f] = await db.insert(families).values({ weddingId, name, side, relation: relation ?? null, email: "", showTravel: showTravel ?? null }).returning();
    familyId = f.id;
    await db.insert(guests).values(members.map((m) => ({
      familyId: familyId!, fullName: m.fullName, ageGroup: m.ageGroup, email: m.email, phone: m.phone, isPrimary: m.isPrimary,
    })));
  }

  if (invitable.length) {
    await db.insert(eventInvites).values(invitable.map((eventId) => ({ eventId, familyId: familyId! })));
  }
  await syncHousehold(familyId);
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
  const weddingId = await scopedWeddingId(parsed.data.weddingId, { familyIds: parsed.data.familyIds });
  if (!weddingId) return { ok: false as const, error: "forbidden" };
  const results = await issueInvites(weddingId, parsed.data.familyIds, parsed.data.type);
  revalidatePath("/committee");
  return { ok: true as const, results };
}

const idsSchema = z.object({ weddingId: z.string().uuid(), familyId: z.string().uuid() });

export async function deleteFamilyAction(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const parsed = idsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const weddingId = await scopedWeddingId(parsed.data.weddingId, { familyIds: [parsed.data.familyId] });
  if (!weddingId) return { ok: false, error: "forbidden" };
  const res = await household.deleteFamily(weddingId, parsed.data.familyId);
  revalidatePath("/committee");
  revalidatePath("/couple");
  return res;
}

export async function recordRsvpAction(input: { weddingId: string } & Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const weddingParsed = z.string().uuid().safeParse(input?.weddingId);
  if (!weddingParsed.success) return { ok: false, error: "invalid input" };
  const weddingId = await scopedWeddingId(weddingParsed.data, { familyIds: [input.familyId] });
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
  // whichever households or guests the input names must be on this person's side
  const i = input as { familyId?: unknown; familyIds?: unknown; guestId?: unknown; guestIds?: unknown };
  return scopedWeddingId(w.data.weddingId, {
    familyIds: [...(Array.isArray(i.familyIds) ? i.familyIds : []), i.familyId],
    guestIds: [...(Array.isArray(i.guestIds) ? i.guestIds : []), i.guestId],
  });
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

export async function whatsappInviteAction(input: { weddingId: string; familyId: string }) {
  const weddingId = await scopedFrom(input);
  if (!weddingId) return { ok: false as const, error: "forbidden" };
  if (!z.string().uuid().safeParse(input.familyId).success) return { ok: false as const, error: "invalid input" };
  const r = await whatsappInvite(weddingId, input.familyId);
  revalidatePath("/committee");
  return r;
}

const travelSchema = z.object({
  weddingId: z.string().uuid(),
  familyId: z.string().uuid(),
  show: z.boolean(),
});

/** Show or hide the site's Travel & Stay section for one household (every
    guest in it — the Guests view's tick is the family's tick). */
export async function setTravelAction(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const parsed = travelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const weddingId = await scopedWeddingId(parsed.data.weddingId, { familyIds: [parsed.data.familyId] });
  if (!weddingId) return { ok: false, error: "forbidden" };
  const done = await db.update(families).set({ showTravel: parsed.data.show })
    .where(and(eq(families.id, parsed.data.familyId), eq(families.weddingId, weddingId)))
    .returning();
  if (!done.length) return { ok: false, error: "family not found" };
  revalidatePath("/committee");
  return { ok: true };
}

/** A household's hotel and rooms, for their primary contact: a WhatsApp message (opened for the sender) or an email. */
export async function stayDetailsAction(input: { weddingId: string; familyId: string; via: "whatsapp" | "email" }) {
  const weddingId = await scopedFrom(input);
  if (!weddingId) return { ok: false as const, error: "forbidden" };
  if (!z.string().uuid().safeParse(input.familyId).success || !["whatsapp", "email"].includes(input.via)) return { ok: false as const, error: "invalid input" };
  try {
    return await sendStayDetails(weddingId, input.familyId, input.via);
  } catch {
    return { ok: false as const, error: "Couldn't send it just now. Try again in a minute." };
  }
}
