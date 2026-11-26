import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { planMeetings, planTasks } from "@/db/schema";
import { canDelete, canReach, meetingTypeAllowed, sideOf, spaceOf, type Space } from "@/lib/plan/spaces";
import { inSpace, reachable, NOT_FOUND, NOT_YOURS, type PlanCtx, type PlanResult } from "@/lib/plan/tasks";

/* Plan meetings: short notes of who met, what was said and what was decided.
   Pinned to the wedding and the person's spaces in every query. */

const text = (max: number) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable()).optional();

const meetingInput = z.object({
  meetingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the meeting's date.")
    .refine((s) => new Date(`${s}T00:00:00Z`).toISOString().startsWith(s), "Pick the meeting's date."),
  title: z.string().trim().min(1, "Give the meeting a title.").max(200, "Keep the title under 200 characters."),
  type: z.enum(["family", "vendor", "other_family"]),
  attendees: text(1000),
  notes: text(20_000),
  decisions: text(10_000),
});

const OTHER_FAMILY_ONLY_IN_BOTH = "A meeting with the other family goes in Both families, so both sides can see it.";

export async function getMeeting(ctx: PlanCtx, id: string) {
  if (!z.string().uuid().safeParse(id).success) return null;
  const [m] = await db.select().from(planMeetings)
    .where(and(eq(planMeetings.id, id), eq(planMeetings.weddingId, ctx.weddingId), reachable(planMeetings.side, ctx.access)));
  return m ?? null;
}

export async function createMeeting(ctx: PlanCtx, s: Space, raw: unknown): Promise<PlanResult> {
  if (!canReach(ctx.access, s)) return { ok: false, error: NOT_FOUND };
  const p = meetingInput.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Please check the meeting." };
  if (!meetingTypeAllowed(s, p.data.type)) return { ok: false, error: OTHER_FAMILY_ONLY_IN_BOTH };
  const [m] = await db.insert(planMeetings).values({
    weddingId: ctx.weddingId, side: sideOf(s), ...p.data,
    attendees: p.data.attendees ?? null, notes: p.data.notes ?? null, decisions: p.data.decisions ?? null, createdByUserId: ctx.userId,
  }).returning();
  return { ok: true, id: m.id };
}

/** Edit a meeting; it stays in its space. */
export async function updateMeeting(ctx: PlanCtx, id: string, raw: unknown): Promise<PlanResult> {
  const m = await getMeeting(ctx, id);
  if (!m) return { ok: false, error: NOT_FOUND };
  const p = meetingInput.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Please check the meeting." };
  if (!meetingTypeAllowed(spaceOf(m.side), p.data.type)) return { ok: false, error: OTHER_FAMILY_ONLY_IN_BOTH };
  await db.update(planMeetings).set({
    ...p.data, attendees: p.data.attendees ?? null, notes: p.data.notes ?? null, decisions: p.data.decisions ?? null, updatedAt: new Date(),
  }).where(and(eq(planMeetings.id, m.id), eq(planMeetings.weddingId, ctx.weddingId), reachable(planMeetings.side, ctx.access)));
  return { ok: true, id: m.id };
}

/** Deleting a meeting keeps its tasks; they're just no longer linked to it. */
export async function deleteMeeting(ctx: PlanCtx, id: string): Promise<PlanResult> {
  const m = await getMeeting(ctx, id);
  if (!m) return { ok: false, error: NOT_FOUND };
  if (!canDelete(ctx.access, ctx.userId, m.createdByUserId)) return { ok: false, error: NOT_YOURS };
  await db.update(planTasks).set({ meetingId: null }).where(and(eq(planTasks.meetingId, m.id), eq(planTasks.weddingId, ctx.weddingId)));
  await db.delete(planMeetings).where(and(eq(planMeetings.id, m.id), eq(planMeetings.weddingId, ctx.weddingId)));
  return { ok: true };
}

/** One space's meetings, newest first. */
export async function meetingsIn(ctx: PlanCtx, s: Space) {
  if (!canReach(ctx.access, s)) return [];
  return db.select().from(planMeetings)
    .where(and(eq(planMeetings.weddingId, ctx.weddingId), inSpace(planMeetings.side, s)))
    .orderBy(desc(planMeetings.meetingDate), desc(planMeetings.createdAt));
}
