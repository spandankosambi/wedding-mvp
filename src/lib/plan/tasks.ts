import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { planMeetings, planTasks, users } from "@/db/schema";
import type { Access } from "@/lib/auth/access";
import { canDelete, canReach, sideOf, spaceOf, type Space } from "@/lib/plan/spaces";

/* Plan tasks. Every query is pinned to the wedding and to the spaces this
   person may reach, in the database; anything outside reads as not found. */

export type PlanCtx = { weddingId: string; userId: string; access: Access };
export type PlanResult = { ok: true; id?: string } | { ok: false; error: string };

export const NOT_FOUND = "We couldn't find that. It may have been deleted, or it isn't in a space you can open.";
export const NOT_YOURS = "Only the person who added this, or the couple, can delete it.";

/** Rows in spaces this person may reach (the other family's never match). */
export function reachable(col: typeof planTasks.side | typeof planMeetings.side, a: Access) {
  return a.side === "both" ? undefined : or(isNull(col), eq(col, a.side));
}
/** Rows in exactly this space. */
export const inSpace = (col: typeof planTasks.side | typeof planMeetings.side, s: Space) =>
  s === "both" ? isNull(col) : eq(col, s);

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s), "not a date");
const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const taskInput = z.object({
  title: z.string().trim().min(1, "Give the task a name.").max(200, "Keep the task name under 200 characters."),
  ownerUserId: z.preprocess(blankToNull, z.string().uuid().nullable()).optional(),
  ownerName: z.preprocess(blankToNull, z.string().trim().max(100).nullable()).optional(),
  dueDate: z.preprocess(blankToNull, day.nullable()).optional(),
  meetingId: z.preprocess(blankToNull, z.string().uuid().nullable()).optional(),
});

/** The couple and committee members who can see a space: who a task there can belong to. */
export async function peopleFor(weddingId: string, s: Space): Promise<{ id: string; name: string }[]> {
  const rows = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, side: users.side })
    .from(users).where(and(eq(users.weddingId, weddingId), inArray(users.role, ["couple", "committee"]))).orderBy(asc(users.name));
  return rows
    .filter((u) => u.role === "couple" || s === "both" || u.side === "both" || u.side === s)
    // a name, else the part of the email before the @ (the address itself stays private)
    .map((u) => ({ id: u.id, name: u.name?.trim() || u.email.split("@")[0] }));
}

/** Owner and meeting are checked against this wedding and this space. */
async function checked(ctx: PlanCtx, s: Space, raw: unknown) {
  const p = taskInput.safeParse(raw);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Please check the task." } as const;
  const d = p.data;
  let ownerUserId: string | null = null;
  let ownerName: string | null = null;
  if (d.ownerUserId) {
    if (!(await peopleFor(ctx.weddingId, s)).some((u) => u.id === d.ownerUserId)) return { error: "Pick someone who can see this space, or type a name." } as const;
    ownerUserId = d.ownerUserId;
  } else if (d.ownerName) {
    ownerName = d.ownerName;
  }
  if (d.meetingId) {
    // a task linked to a meeting lives in the same space as that meeting
    const [m] = await db.select({ id: planMeetings.id }).from(planMeetings)
      .where(and(eq(planMeetings.id, d.meetingId), eq(planMeetings.weddingId, ctx.weddingId), inSpace(planMeetings.side, s)));
    if (!m) return { error: "That meeting is in a different space. Pick a meeting from this space." } as const;
  }
  return { values: { title: d.title, ownerUserId, ownerName, dueDate: d.dueDate ?? null, meetingId: d.meetingId ?? null } } as const;
}

export async function getTask(ctx: PlanCtx, id: string) {
  if (!z.string().uuid().safeParse(id).success) return null;
  const [t] = await db.select().from(planTasks)
    .where(and(eq(planTasks.id, id), eq(planTasks.weddingId, ctx.weddingId), reachable(planTasks.side, ctx.access)));
  return t ?? null;
}

export async function createTask(ctx: PlanCtx, s: Space, raw: unknown): Promise<PlanResult> {
  if (!canReach(ctx.access, s)) return { ok: false, error: NOT_FOUND };
  const c = await checked(ctx, s, raw);
  if ("error" in c) return { ok: false, error: c.error! };
  const [t] = await db.insert(planTasks).values({ weddingId: ctx.weddingId, side: sideOf(s), ...c.values, createdByUserId: ctx.userId }).returning();
  return { ok: true, id: t.id };
}

/** Edit a task; it stays in its space. */
export async function updateTask(ctx: PlanCtx, id: string, raw: unknown): Promise<PlanResult> {
  const t = await getTask(ctx, id);
  if (!t) return { ok: false, error: NOT_FOUND };
  const c = await checked(ctx, spaceOf(t.side), raw);
  if ("error" in c) return { ok: false, error: c.error! };
  await db.update(planTasks).set({ ...c.values, updatedAt: new Date() })
    .where(and(eq(planTasks.id, t.id), eq(planTasks.weddingId, ctx.weddingId), reachable(planTasks.side, ctx.access)));
  return { ok: true, id: t.id };
}

export async function setTaskDone(ctx: PlanCtx, id: string, done: boolean): Promise<PlanResult> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: NOT_FOUND };
  const [t] = await db.update(planTasks).set({ done, doneAt: done ? new Date() : null, updatedAt: new Date() })
    .where(and(eq(planTasks.id, id), eq(planTasks.weddingId, ctx.weddingId), reachable(planTasks.side, ctx.access))).returning();
  return t ? { ok: true, id: t.id } : { ok: false, error: NOT_FOUND };
}

export async function deleteTask(ctx: PlanCtx, id: string): Promise<PlanResult> {
  const t = await getTask(ctx, id);
  if (!t) return { ok: false, error: NOT_FOUND };
  if (!canDelete(ctx.access, ctx.userId, t.createdByUserId)) return { ok: false, error: NOT_YOURS };
  await db.delete(planTasks).where(and(eq(planTasks.id, t.id), eq(planTasks.weddingId, ctx.weddingId)));
  return { ok: true };
}

/** One space's tasks: open ones by due date (undated last), then done ones. */
export async function tasksIn(ctx: PlanCtx, s: Space) {
  if (!canReach(ctx.access, s)) return [];
  const rows = await db.select().from(planTasks)
    .where(and(eq(planTasks.weddingId, ctx.weddingId), inSpace(planTasks.side, s))).orderBy(asc(planTasks.createdAt));
  return rows.sort((a, b) => Number(a.done) - Number(b.done) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
}
