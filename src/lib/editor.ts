import { z } from "zod";
import { expandMapLink } from "@/lib/maplinks";
import { getLook, saveTravelLook, updateLook, type FamilySide, type LookPatch } from "@/lib/looks";
import { contactsOf, MAX_CONTACTS } from "@/lib/contacts";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { weddings, events, families, eventInvites, rsvps, type TravelInfo } from "@/db/schema";
import { THEMES } from "@/themes/catalog";

/* Everything the couple can change about their own site. Pure DB logic —
   the server actions in app/couple/site wrap these with requireRole. */

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hm = z.string().regex(/^\d{2}:\d{2}$/);
const optional = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);

/** What both families share: who, when, where, whose children. */
export const detailsSchema = z.object({
  brideName: z.string().trim().min(1).max(60),
  groomName: z.string().trim().min(1).max(60),
  weddingDate: ymd,
  city: optional(80),
  brideParents: optional(160),
  groomParents: optional(160),
});

/** One family's own words on the site. */
/** about 150 words: fits one screen on the site */
export const STORY_MAX = 900;

export const wordsSchema = z.object({
  heroTagline: optional(160),
  story: optional(STORY_MAX),
  hashtag: optional(60).transform((v) => (v ? v.replace(/^#+/, "") : v)),
  theme: z.enum(THEMES).optional(),
});

/** several lines: each trimmed, runs of spaces collapsed, blank lines dropped */
const multiline = (max: number) => z.string().max(max).optional().transform((v) => {
  const t = (v ?? "").split(/\r?\n/).map((l) => l.replace(/[ \t\u00a0]+/g, " ").trim()).filter(Boolean).join("\n");
  return t || null;
});

/** Someone guests can reach about RSVPs: a name, a number with 7–15 digits, and whether it's on WhatsApp. */
export const contactSchema = z.object({
  name: z.string().trim().max(60).transform((v) => v.replace(/\s+/g, " ")),
  phone: z.string().trim().max(30).refine((v) => /^\+?[\d\s\-().]+$/.test(v) && v.replace(/\D/g, "").length >= 7 && v.replace(/\D/g, "").length <= 15),
  whatsapp: z.boolean(),
});

/** The invitation's wording, on the family's site and its printed cards. */
export const wordingSchema = z.object({
  invocation: optional(80),
  shloka: multiline(200),
  contacts: z.array(contactSchema).max(MAX_CONTACTS).default([]),
  compliments: multiline(240),
  closingLine: optional(160),
});

export const rsvpSettingsSchema = z.object({
  rsvpOpen: z.boolean(),
  rsvpDeadline: z.union([ymd, z.literal("")]).optional(),
});

export const eventSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(60),
  date: ymd,
  time: hm,
  venueName: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(240),
  mapUrl: z.union([z.string().trim().url().max(500), z.literal("")]).optional().transform((v) => v || null),
  dressCode: optional(80),
  description: optional(400),
  isPublished: z.boolean().default(true),
  side: z.enum(["bride", "groom", "both"]).default("both"),
});

export const MAX_STAYS = 12;

export const travelSchema = z.object({
  stays: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    note: z.string().trim().max(400),
    url: z.union([z.string().trim().url().max(500), z.literal("")]).optional(),
    common: z.boolean().optional(),
  })).max(MAX_STAYS),
  gettingThere: z.string().trim().max(1200),
});

export const istDate = (date: string, time = "10:00") => new Date(`${date}T${time}:00+05:30`);

/** Split a stored timestamp back into the editor's IST date + time fields. */
export function istParts(d: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour").replace("24", "00")}:${get("minute")}` };
}

type Result = { ok: true } | { ok: false; error: string };

export async function updateDetails(weddingId: string, input: unknown): Promise<Result> {
  const p = detailsSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "invalid input" };
  const { weddingDate, ...rest } = p.data;
  await db.update(weddings).set({ ...rest, weddingDate: istDate(weddingDate) }).where(eq(weddings.id, weddingId));
  return { ok: true };
}

export async function updateWords(weddingId: string, side: FamilySide, input: unknown): Promise<Result> {
  const p = wordsSchema.safeParse(input);
  if (!p.success) {
    const long = p.error.issues.some((i) => i.path[0] === "story" && i.code === "too_big");
    return { ok: false, error: long ? `your story is too long — keep it under ${STORY_MAX} characters (about 150 words) so it fits one screen` : "invalid input" };
  }
  const { theme, ...words } = p.data;
  await updateLook(weddingId, side, { ...words, ...(theme && { theme }) });
  return { ok: true };
}

export async function updateWording(weddingId: string, side: FamilySide, input: unknown): Promise<Result> {
  const p = wordingSchema.safeParse(input);
  if (!p.success) {
    const phone = p.error.issues.some((i) => i.path[0] === "contacts" && i.path[2] === "phone");
    return { ok: false, error: phone ? "please check the RSVP contact number — digits only, with the country code if it isn't Indian" : "invalid input" };
  }
  const { contacts, ...words } = p.data;
  // the contact list replaces the older RSVP and family-contact boxes
  await updateLook(weddingId, side, { ...words, rsvpPeople: contacts, rsvpContacts: null, contactPhone: null });
  return { ok: true };
}

/**
 * Wording typed into the print dialog before it moved to the site editor
 * (kept on that device): fills only the fields this family hasn't filled.
 */
const oldCardWording = z.object({
  invocation: optional(80), shloka: multiline(200), rsvpContacts: multiline(240), compliments: multiline(240), closingLine: optional(160),
});

export async function adoptCardWording(weddingId: string, side: FamilySide, input: unknown): Promise<Result & { filled?: number }> {
  const p = oldCardWording.safeParse(input);
  if (!p.success) return { ok: false, error: "invalid input" };
  const look = await getLook(weddingId, side);
  const { rsvpContacts, ...rest } = p.data;
  const patch: LookPatch = Object.fromEntries(Object.entries(rest).filter(([k, v]) => v && !look[k as keyof typeof rest]));
  const people = contactsOf({ rsvpContacts });
  if (people.length && !contactsOf(look).length) patch.rsvpPeople = people;
  if (Object.keys(patch).length) await updateLook(weddingId, side, patch);
  return { ok: true, filled: Object.keys(patch).length };
}

/** Each family opens, closes and dates its own RSVPs. */
export async function updateRsvpSettings(weddingId: string, side: FamilySide, input: unknown): Promise<Result> {
  const p = rsvpSettingsSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "invalid input" };
  await updateLook(weddingId, side, {
    rsvpOpen: p.data.rsvpOpen,
    rsvpDeadline: p.data.rsvpDeadline ? istDate(p.data.rsvpDeadline, "23:59") : null,
  });
  return { ok: true };
}

export async function updateTravel(weddingId: string, side: FamilySide, input: unknown): Promise<Result> {
  const p = travelSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "invalid input" };
  const travel: TravelInfo = {
    stays: await Promise.all(p.data.stays.map(async (s) => ({
      name: s.name, note: s.note, ...(s.url && { url: await expandMapLink(s.url) }), ...(s.common && { common: true }),
    }))),
    gettingThere: p.data.gettingThere,
  };
  // stays ticked "common" show on the other family's site too
  await saveTravelLook(weddingId, side, travel);
  return { ok: true };
}

export async function upsertEvent(weddingId: string, input: unknown): Promise<Result & { id?: string }> {
  const p = eventSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "invalid input" };
  const { id, date, time, ...rest } = p.data;
  // a short Maps link is stored as its full google.com/maps address
  const values = { ...rest, mapUrl: rest.mapUrl ? await expandMapLink(rest.mapUrl) : null, startsAt: istDate(date, time) };
  if (id) {
    const [row] = await db.update(events).set(values)
      .where(and(eq(events.id, id), eq(events.weddingId, weddingId))).returning();
    if (!row) return { ok: false, error: "event not found" };
    if (row.side !== "both") await dropOtherSide(weddingId, row.id, row.side);
    return { ok: true, id: row.id };
  }
  const existing = await db.select({ sortOrder: events.sortOrder }).from(events).where(eq(events.weddingId, weddingId));
  const sortOrder = existing.reduce((m, e) => Math.max(m, e.sortOrder), -1) + 1;
  const [row] = await db.insert(events).values({ ...values, weddingId, sortOrder }).returning();
  return { ok: true, id: row.id };
}

/** An event that became one side's own: the other side's households are no
    longer invited to it (and their answers for it go with the invitation).
    Households marked "both" stay invited. */
async function dropOtherSide(weddingId: string, eventId: string, side: "bride" | "groom") {
  const other = side === "bride" ? "groom" : "bride";
  const theirs = (await db.select({ id: families.id }).from(families)
    .where(and(eq(families.weddingId, weddingId), eq(families.side, other)))).map((f) => f.id);
  if (!theirs.length) return;
  await db.delete(eventInvites).where(and(eq(eventInvites.eventId, eventId), inArray(eventInvites.familyId, theirs)));
  await db.delete(rsvps).where(and(eq(rsvps.eventId, eventId), inArray(rsvps.familyId, theirs)));
}

export async function setEventPublished(weddingId: string, eventId: string, isPublished: boolean): Promise<Result> {
  const [row] = await db.update(events).set({ isPublished })
    .where(and(eq(events.id, eventId), eq(events.weddingId, weddingId))).returning();
  return row ? { ok: true } : { ok: false, error: "event not found" };
}

export async function deleteEvent(weddingId: string, eventId: string): Promise<Result> {
  const [row] = await db.delete(events)
    .where(and(eq(events.id, eventId), eq(events.weddingId, weddingId))).returning();
  return row ? { ok: true } : { ok: false, error: "event not found" };
}

/** Swap sort order with the neighbour; renumbers first so gaps never matter. */
export async function moveEvent(weddingId: string, eventId: string, dir: "up" | "down"): Promise<Result> {
  const rows = await db.select().from(events).where(eq(events.weddingId, weddingId)).orderBy(events.sortOrder, events.startsAt);
  const i = rows.findIndex((r) => r.id === eventId);
  if (i < 0) return { ok: false, error: "event not found" };
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= rows.length) return { ok: true };
  [rows[i], rows[j]] = [rows[j], rows[i]];
  for (let k = 0; k < rows.length; k++) {
    if (rows[k].sortOrder !== k) await db.update(events).set({ sortOrder: k }).where(eq(events.id, rows[k].id));
  }
  return { ok: true };
}

/** Sort events by their start time — one click after the couple has typed the dates in. */
export async function sortEventsByTime(weddingId: string): Promise<Result> {
  const rows = await db.select().from(events).where(eq(events.weddingId, weddingId)).orderBy(events.startsAt);
  for (let k = 0; k < rows.length; k++) {
    if (rows[k].sortOrder !== k) await db.update(events).set({ sortOrder: k }).where(eq(events.id, rows[k].id));
  }
  return { ok: true };
}
