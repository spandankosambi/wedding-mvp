import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { planTasks } from "@/db/schema";
import type { PlanCtx, PlanResult } from "@/lib/plan/tasks";

/** A first list for an empty plan: undated, in Both families. */
export const STARTER_TASKS = [
  "Fix the muhurat",
  "Book the venue",
  "Caterer tasting",
  "Get a decorator's quote",
  "Book the pandit",
  "Book the photographer",
  "Book the mehendi artist",
  "Outfits for every function",
  "Finalise the guest list",
  "Send invites via One Tap Invites",
  "Transport for the elders",
  "Return gifts",
] as const;

/** Adds the starter list, only while Both families has no tasks at all. */
export async function addStarterTasks(ctx: PlanCtx): Promise<PlanResult> {
  const where = and(eq(planTasks.weddingId, ctx.weddingId), isNull(planTasks.side));
  const [r] = await db.select({ n: count() }).from(planTasks).where(where);
  if (Number(r?.n ?? 0) > 0) return { ok: false, error: "Your list already has tasks, so the suggestions weren't added." };
  await db.insert(planTasks).values(STARTER_TASKS.map((title) => ({ weddingId: ctx.weddingId, side: null, title, createdByUserId: ctx.userId })));
  return { ok: true };
}
