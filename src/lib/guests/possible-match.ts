import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { events, families, guests, eventInvites, rsvps } from "@/db/schema";
import { attendeesFromCount } from "@/lib/guests/attendance";
import { seesSide, type Access } from "@/lib/auth/access";
import { eventForSide } from "@/lib/site/sides";

/* A reply from a family's shared link whose phone or email matched a household
   already on the list is kept as its own household, flagged "Needs a look".
   The couple or committee then merges it into that household or keeps the two
   apart. Both households must be in this wedding and on a side the person
   works; that is checked here, against the database, whatever the screen sent. */

type Result = { ok: true } | { ok: false; error: string };

const works = (a: Access, side: "bride" | "groom" | "both") => (side === "both" ? a.side === "both" : seesSide(a, side));

async function pair(weddingId: string, pendingId: string, access: Access) {
  const [pending] = await db.select().from(families)
    .where(and(eq(families.id, pendingId), eq(families.weddingId, weddingId), isNotNull(families.possibleMatchFamilyId)));
  if (!pending || !works(access, pending.side)) return null;
  const [existing] = await db.select().from(families)
    .where(and(eq(families.id, pending.possibleMatchFamilyId!), eq(families.weddingId, weddingId)));
  if (!existing || !works(access, existing.side)) return null;
  return { pending, existing };
}

/** "No, keep separate": the reply stays a household of its own. */
export async function keepSeparate(weddingId: string, pendingId: string, access: Access): Promise<Result> {
  const p = await pair(weddingId, pendingId, access);
  if (!p) return { ok: false, error: "not allowed" };
  await db.update(families).set({ possibleMatchFamilyId: null, possibleMatchBy: null }).where(eq(families.id, p.pending.id));
  return { ok: true };
}

/**
 * "Yes, that's them": the reply's answers and invitations move onto the
 * existing household, which keeps its own members, contact details and private
 * link. Where both answered an event, the newer reply wins. Then the reply's
 * household is removed.
 */
export async function mergePossibleMatch(weddingId: string, pendingId: string, access: Access): Promise<Result> {
  const p = await pair(weddingId, pendingId, access);
  if (!p) return { ok: false, error: "not allowed" };
  const { pending, existing } = p;

  // only events the existing household's side can be invited to
  const evs = await db.select({ id: events.id, side: events.side }).from(events).where(eq(events.weddingId, weddingId));
  const allowed = new Set(evs.filter((e) => eventForSide(e.side, existing.side)).map((e) => e.id));

  const invited = (await db.select({ eventId: eventInvites.eventId }).from(eventInvites).where(eq(eventInvites.familyId, pending.id)))
    .map((i) => i.eventId).filter((id) => allowed.has(id));
  if (invited.length) {
    await db.insert(eventInvites).values(invited.map((eventId) => ({ eventId, familyId: existing.id }))).onConflictDoNothing();
  }

  const answers = (await db.select().from(rsvps).where(eq(rsvps.familyId, pending.id))).filter((r) => allowed.has(r.eventId));
  if (answers.length) {
    const theirs = await db.select().from(rsvps)
      .where(and(eq(rsvps.familyId, existing.id), inArray(rsvps.eventId, answers.map((r) => r.eventId))));
    const memberIds = (await db.select({ id: guests.id }).from(guests).where(eq(guests.familyId, existing.id)).orderBy(guests.seq)).map((g) => g.id);
    for (const r of answers) {
      const old = theirs.find((x) => x.eventId === r.eventId);
      if (old && old.respondedAt.getTime() > r.respondedAt.getTime()) continue; // the newer reply wins
      const guestIds = r.status === "declined" ? [] : attendeesFromCount(r.headcount, memberIds);
      const set = { status: r.status, headcount: r.headcount, note: r.note, guestIds, respondedAt: r.respondedAt };
      await db.insert(rsvps).values({ eventId: r.eventId, familyId: existing.id, ...set })
        .onConflictDoUpdate({ target: [rsvps.eventId, rsvps.familyId], set });
    }
  }

  // the reply's household, its members, invitations and answers go with it
  await db.delete(families).where(and(eq(families.id, pending.id), eq(families.weddingId, weddingId)));
  return { ok: true };
}
