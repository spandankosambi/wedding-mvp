import { z } from "zod";
import { asSampleDates } from "@/lib/site/sample";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { weddings, events, families, guests, eventInvites, rsvps } from "@/db/schema";
import { generateInviteToken, tokenExpiry } from "@/lib/auth/tokens";
import { attendeesFromCount } from "@/lib/guests/household";
import { syncHousehold } from "@/lib/guests/primary";
import { rateLimit } from "@/lib/auth/ratelimit";
import { normalizePhone } from "@/lib/site/slug";
import { DIET_OPTIONS } from "@/lib/site/presets";
import { getLook, withLook } from "@/lib/site/looks";
import { keyOpens } from "@/lib/site/share";
import { eventForSide } from "@/lib/site/sides";

/** The wedding as guests see it: only published events, in order. */
export async function getPublicWedding(slug: string) {
  const [wedding] = await db.select().from(weddings).where(eq(weddings.slug, slug));
  if (!wedding) return null;
  const evs = await db.select().from(events)
    .where(and(eq(events.weddingId, wedding.id), eq(events.isPublished, true)))
    .orderBy(events.sortOrder);
  // the example wedding stays 60 days away
  return asSampleDates(wedding, evs);
}

export function rsvpWindow(w: { rsvpOpen: boolean; rsvpDeadline: Date | null; weddingDate: Date }, now = new Date()) {
  if (!w.rsvpOpen) return { open: false as const, reason: "closed" as const };
  if (w.rsvpDeadline && w.rsvpDeadline.getTime() < now.getTime()) return { open: false as const, reason: "deadline" as const };
  if (w.weddingDate.getTime() + 86_400_000 < now.getTime()) return { open: false as const, reason: "past" as const };
  return { open: true as const };
}

const MAX_OPEN_HEADCOUNT = 10;

const schema = z.object({
  slug: z.string().min(1).max(80),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().toLowerCase().email().max(254).optional().or(z.literal("")),
  side: z.enum(["bride", "groom"]).optional(),
  /** the family link the guest arrived on, and its code */
  linkSide: z.enum(["bride", "groom"]).optional(),
  k: z.string().max(40).optional(),
  diet: z.enum(DIET_OPTIONS.map((d) => d.value) as [string, ...string[]]).optional(),
  guestNames: z.array(z.string().trim().min(1).max(120)).max(MAX_OPEN_HEADCOUNT).optional(),
  note: z.string().trim().max(500).optional(),
  responses: z.array(z.object({
    eventId: z.string().uuid(),
    status: z.enum(["attending", "declined"]),
    headcount: z.number().int().min(0).max(MAX_OPEN_HEADCOUNT),
  })).min(1).max(30),
});

export type OpenRsvpInput = z.input<typeof schema>;
type OpenRsvpResult =
  /** `editPath` is origin-relative on purpose: the guest is already on the right
      host, so the link they are handed never depends on APP_URL being correct. */
  | { ok: true; editPath: string; familyName: string; attending: string[] }
  | { ok: false; error: string };

/**
 * RSVP from a family's shared invitation link (or the QR on its cards): no
 * token, no account. The reply always becomes a NEW household (source
 * "guest") on the link's side, in the same tables the committee uses.
 *
 * A shared link must never change, reveal or take over a household that is
 * already on the list: anyone holding it could type a relative's number. So
 * when the phone or email matches a household on that side, the existing one
 * is left exactly as it is and the new reply is flagged as a possible match
 * for the couple or committee to merge ("Yes, that's them") or keep apart.
 * The guest only ever sees their own name, and their edit link opens only the
 * household this reply created.
 */
export async function submitOpenRsvp(input: unknown, clientKey = "local"): Promise<OpenRsvpResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const d = parsed.data;
  const email = d.email || null;
  const phone = normalizePhone(d.phone);
  if (!email && !phone) return { ok: false, error: "phone or email required" };
  if (!rateLimit(`open-rsvp:${clientKey}`, { max: 10 })) return { ok: false, error: "too many requests" };

  const data = await getPublicWedding(d.slug);
  if (!data) return { ok: false, error: "wedding not found" };
  const { wedding, events: published } = data;
  // the link decides the side: its code, its events, its RSVP window, the new household
  const side = d.linkSide ?? d.side ?? "bride";
  const look = await getLook(wedding.id, side);
  // only someone holding a family's link may reply through it
  if (!keyOpens(look, d.k)) return { ok: false, error: "rsvp closed" };
  // each family opens and closes its own RSVPs
  if (!rsvpWindow(withLook(wedding, look)).open) return { ok: false, error: "rsvp closed" };

  // common events and this side's own; never the other family's
  const allowedIds = new Set(published.filter((e) => eventForSide(e.side, side)).map((e) => e.id));
  for (const r of d.responses) {
    if (!allowedIds.has(r.eventId)) return { ok: false, error: "unknown event" };
    if (r.status === "attending" && r.headcount < 1) return { ok: false, error: "headcount out of range" };
  }

  // Is this someone already on this side's list? Only flag it; never touch them.
  // (Households still waiting for a look aren't matched against.)
  const candidates = (await db.select().from(families)
    .where(and(eq(families.weddingId, wedding.id), eq(families.side, side))))
    .filter((f) => !f.possibleMatchFamilyId);
  const byEmail = email ? candidates.find((f) => f.email.trim().toLowerCase() === email) : undefined;
  const byPhone = byEmail ? undefined : phone ? candidates.find((f) => normalizePhone(f.phone) === phone) : undefined;
  const match = byEmail ?? byPhone;

  const { token, tokenHash } = generateInviteToken();
  const [family] = await db.insert(families).values({
    weddingId: wedding.id, name: d.name, side, relation: "RSVP'd via invitation link",
    email: email ?? "", phone, diet: d.diet ?? null, source: "guest",
    inviteTokenHash: tokenHash, tokenExpiresAt: tokenExpiry(wedding.weddingDate),
    possibleMatchFamilyId: match?.id ?? null,
    possibleMatchBy: match ? (byEmail ? "email" : "phone") : null,
  }).returning();

  // members: the names they gave, else the household name itself
  const names = (d.guestNames?.filter(Boolean).length ? d.guestNames! : [d.name]);
  await db.insert(guests).values(names.map((fullName) => ({ familyId: family.id, fullName })));

  // whoever filled in the form is reachable at what they typed
  await syncHousehold(family.id, { email, phone });

  const responded = d.responses.map((r) => r.eventId);
  await db.insert(eventInvites)
    .values(responded.map((eventId) => ({ eventId, familyId: family.id })))
    .onConflictDoNothing();

  const memberIds = (await db.select({ id: guests.id }).from(guests).where(eq(guests.familyId, family.id)).orderBy(guests.seq)).map((g) => g.id);
  await db.insert(rsvps).values(d.responses.map((r) => {
    const headcount = r.status === "declined" ? 0 : r.headcount;
    return {
      eventId: r.eventId, familyId: family.id, status: r.status, headcount,
      guestIds: r.status === "declined" ? [] : attendeesFromCount(headcount, memberIds), note: d.note || null,
    };
  }));

  const attendingIds = d.responses.filter((r) => r.status === "attending").map((r) => r.eventId);
  const attending = attendingIds.length
    ? (await db.select({ name: events.name }).from(events).where(inArray(events.id, attendingIds)).orderBy(events.sortOrder)).map((e) => e.name)
    : [];
  // their own typed name, never a matched household's
  return { ok: true, editPath: `/rsvp/${token}`, familyName: d.name, attending };
}
