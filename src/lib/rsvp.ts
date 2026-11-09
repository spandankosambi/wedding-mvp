import { z } from "zod";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { weddings, events, families, guests, eventInvites, rsvps } from "@/db/schema";
import { showsTravel } from "@/lib/travel";
import { hashToken, isExpired } from "@/lib/tokens";
import { rateLimit } from "@/lib/ratelimit";
import { attendeesFromCount } from "@/lib/household";

export async function getFamilyByToken(token: string) {
  const [family] = await db.select().from(families)
    .where(eq(families.inviteTokenHash, hashToken(token)));
  if (!family || isExpired(family.tokenExpiresAt)) return null;

  const [wedding] = await db.select().from(weddings).where(eq(weddings.id, family.weddingId));
  const members = await db.select().from(guests).where(eq(guests.familyId, family.id)).orderBy(guests.seq);
  const invites = await db.select().from(eventInvites).where(eq(eventInvites.familyId, family.id));
  const eventIds = invites.map((i) => i.eventId);
  const allEvents = await db.select().from(events).where(eq(events.weddingId, family.weddingId)).orderBy(events.sortOrder);
  // only what they're invited to, and only events the couple shows on the
  // site — the wedding site and this RSVP page list exactly the same ones
  const evs = allEvents.filter((e) => e.isPublished && eventIds.includes(e.id));
  const existing = await db.select().from(rsvps).where(eq(rsvps.familyId, family.id));

  return {
    family: {
      id: family.id, name: family.name, side: family.side, relation: family.relation,
      showTravel: showsTravel(family.showTravel, eventIds, allEvents.map((e) => e.id)),
    },
    wedding: { id: wedding.id, slug: wedding.slug, brideName: wedding.brideName, groomName: wedding.groomName, theme: wedding.theme, weddingDate: wedding.weddingDate },
    members: members.map((m) => ({ id: m.id, fullName: m.fullName, ageGroup: m.ageGroup })),
    events: evs.map((e) => {
      const r = existing.find((x) => x.eventId === e.id);
      return { id: e.id, name: e.name, startsAt: e.startsAt, venueName: e.venueName, address: e.address, mapUrl: e.mapUrl, dressCode: e.dressCode,
        rsvp: r ? { status: r.status, headcount: r.headcount, note: r.note, guestIds: r.guestIds ?? null } : null };
    }),
  };
}

const submitSchema = z.object({
  token: z.string().min(20),
  responses: z.array(z.object({
    eventId: z.string().uuid(),
    status: z.enum(["attending", "declined"]),
    /** who is coming, by name — the form sends this; headcount follows from it */
    guestIds: z.array(z.string().uuid()).max(50).optional(),
    /** older clients sent only a number */
    headcount: z.number().int().min(0).max(50).optional(),
    note: z.string().max(500).optional(),
  })).min(1),
});

export async function submitRsvp(input: unknown, clientKey = "local"):
  Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const { token, responses } = parsed.data;

  if (!rateLimit(`rsvp:${clientKey}`) || !rateLimit(`rsvp:tok:${token.slice(0, 12)}`))
    return { ok: false, error: "too many requests" };

  const fam = await getFamilyByToken(token);
  if (!fam) return { ok: false, error: "invalid token" };

  const invitedIds = new Set(fam.events.map((e) => e.id));
  const memberIds = fam.members.map((m) => m.id);
  const members = new Set(memberIds);
  // A household can only answer for the people on its list: by name, or a
  // number no bigger than the list. Anyone missing goes in the note.
  for (const r of responses) {
    if (!invitedIds.has(r.eventId)) return { ok: false, error: "not invited to event" };
    if (r.status !== "attending") continue;
    if (r.guestIds) {
      if (r.guestIds.length < 1 || !r.guestIds.every((id) => members.has(id))) return { ok: false, error: "headcount out of range" };
    } else if (r.headcount === undefined || r.headcount < 1 || r.headcount > Math.max(memberIds.length, 1)) {
      return { ok: false, error: "headcount out of range" };
    }
  }

  for (const r of responses) {
    const guestIds = r.status === "declined" ? [] : r.guestIds ? [...new Set(r.guestIds)] : attendeesFromCount(r.headcount!, memberIds);
    const headcount = r.status === "declined" ? 0 : r.guestIds ? guestIds!.length : r.headcount!;
    await db.insert(rsvps)
      .values({ eventId: r.eventId, familyId: fam.family.id, status: r.status, headcount, guestIds, note: r.note })
      .onConflictDoUpdate({
        target: [rsvps.eventId, rsvps.familyId],
        set: { status: r.status, headcount, guestIds, note: r.note ?? null, respondedAt: new Date() },
      });
  }
  return { ok: true };
}

export async function getRsvpSummary(weddingId: string) {
  const evs = await db.select().from(events).where(eq(events.weddingId, weddingId)).orderBy(events.sortOrder);
  const out = [];
  for (const e of evs) {
    const invited = await db.select({ n: sql<number>`count(*)::int` }).from(eventInvites).where(eq(eventInvites.eventId, e.id));
    const resp = await db.select({
      n: sql<number>`count(*)::int`,
      heads: sql<number>`coalesce(sum(case when status = 'attending' then headcount else 0 end), 0)::int`,
    }).from(rsvps).where(eq(rsvps.eventId, e.id));
    out.push({ eventId: e.id, eventName: e.name, invitedFamilies: invited[0].n, responded: resp[0].n, attendingHeadcount: resp[0].heads });
  }
  return out;
}
