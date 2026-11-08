import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { families, guests, eventInvites, rsvps } from "@/db/schema";

/* Committee-side household operations. Callers pass a weddingId they have
   already scoped to the signed-in staff member; every function re-checks that
   the family belongs to that wedding before touching it. */

type Result = { ok: true } | { ok: false; error: string };

async function familyInWedding(weddingId: string, familyId: string) {
  const [fam] = await db.select({ id: families.id }).from(families)
    .where(and(eq(families.id, familyId), eq(families.weddingId, weddingId)));
  return fam ?? null;
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
  responses: z.array(z.object({
    eventId: z.string().uuid(),
    /** "none" clears an answer — back to "no reply yet" */
    status: z.enum(["attending", "declined", "none"]),
    headcount: z.number().int().min(0).max(50),
  })).min(1).max(50),
});

/**
 * Record a household's replies on their behalf — for the aunt who answered on
 * the phone instead of the link. Same rules as the guest form: only events the
 * family is invited to, and an attending headcount between 1 and the household
 * size plus two.
 */
export async function recordRsvpForFamily(weddingId: string, input: unknown): Promise<Result> {
  const parsed = committeeRsvpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const { familyId, responses } = parsed.data;
  if (!(await familyInWedding(weddingId, familyId))) return { ok: false, error: "family not found" };

  const invited = new Set(
    (await db.select().from(eventInvites).where(eq(eventInvites.familyId, familyId))).map((i) => i.eventId),
  );
  const members = await db.select({ id: guests.id }).from(guests).where(eq(guests.familyId, familyId));
  const maxHeadcount = Math.max(members.length, 1) + 2;
  for (const r of responses) {
    if (!invited.has(r.eventId)) return { ok: false, error: "not invited to that event" };
    if (r.status === "attending" && (r.headcount < 1 || r.headcount > maxHeadcount))
      return { ok: false, error: `headcount must be between 1 and ${maxHeadcount}` };
  }

  for (const r of responses) {
    if (r.status === "none") {
      await db.delete(rsvps).where(and(eq(rsvps.eventId, r.eventId), eq(rsvps.familyId, familyId)));
      continue;
    }
    const headcount = r.status === "declined" ? 0 : r.headcount;
    await db.insert(rsvps)
      .values({ eventId: r.eventId, familyId, status: r.status, headcount })
      .onConflictDoUpdate({
        target: [rsvps.eventId, rsvps.familyId],
        // a note the guest left stays; only the answer changes
        set: { status: r.status, headcount, respondedAt: new Date() },
      });
  }
  return { ok: true };
}
