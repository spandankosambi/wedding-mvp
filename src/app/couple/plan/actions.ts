"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { weddings } from "@/db/schema";
import { requireRole } from "@/lib/auth/authz";
import { asSpace, spaceOf } from "@/lib/plan/spaces";
import { createTask, updateTask, setTaskDone, deleteTask, type PlanCtx } from "@/lib/plan/tasks";
import { createMeeting, updateMeeting, deleteMeeting, getMeeting } from "@/lib/plan/meetings";
import { addStarterTasks } from "@/lib/plan/starter";

/* Plan, for the couple and committee (guests have no sign-in, so never reach
   here). The wedding is always the person's own (admin names one); the space
   and every item are checked again in src/lib/plan, in the database. */

type Out = { ok: boolean; error?: string; id?: string };

async function ctxFor(requested: unknown): Promise<PlanCtx | null> {
  const staff = await requireRole(["committee", "couple", "admin"]);
  const weddingId = staff.role === "admin" ? String(requested ?? "") : staff.weddingId;
  if (!weddingId || !z.string().uuid().safeParse(weddingId).success) return null;
  const [w] = await db.select({ id: weddings.id }).from(weddings).where(eq(weddings.id, weddingId));
  return w ? { weddingId: w.id, userId: staff.userId, access: staff.access } : null;
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");
/** back to whichever Plan page the form came from */
const baseOf = (fd: FormData) => (str(fd, "base") === "/committee/plan" ? "/committee/plan" : "/couple/plan");
function back(fd: FormData, params: Record<string, string | undefined>): never {
  const q = new URLSearchParams();
  if (str(fd, "wedding")) q.set("wedding", str(fd, "wedding"));
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  redirect(`${baseOf(fd)}?${q.toString()}`);
}
const refresh = () => { revalidatePath("/couple/plan"); revalidatePath("/committee/plan"); };

const taskFields = (fd: FormData) => ({
  title: str(fd, "title"), ownerUserId: str(fd, "ownerUserId"), ownerName: str(fd, "ownerName"),
  dueDate: str(fd, "dueDate"), meetingId: str(fd, "meetingId"),
});

/** The task form (new or existing), saved through the page's Floating Save. */
export async function saveTaskAction(fd: FormData) {
  const ctx = await ctxFor(fd.get("weddingId"));
  if (!ctx) back(fd, { error: "You don't have access to this plan." });
  const id = str(fd, "id");
  const space = asSpace(str(fd, "space")) ?? "both";
  const r = id ? await updateTask(ctx, id, taskFields(fd)) : await createTask(ctx, space, taskFields(fd));
  if (!r.ok) back(fd, { space, task: id || "new", error: r.error });
  refresh();
  back(fd, { space, saved: id ? "Task saved" : "Task added" });
}

/** The meeting form (new or existing). */
export async function saveMeetingAction(fd: FormData) {
  const ctx = await ctxFor(fd.get("weddingId"));
  if (!ctx) back(fd, { error: "You don't have access to this plan." });
  const id = str(fd, "id");
  const space = asSpace(str(fd, "space")) ?? "both";
  const fields = {
    meetingDate: str(fd, "meetingDate"), title: str(fd, "title"), type: str(fd, "type"),
    attendees: str(fd, "attendees"), notes: str(fd, "notes"), decisions: str(fd, "decisions"),
  };
  const r = id ? await updateMeeting(ctx, id, fields) : await createMeeting(ctx, space, fields);
  if (!r.ok) back(fd, { space, meeting: id || "new", error: r.error });
  refresh();
  back(fd, { space, meeting: r.id, saved: id ? "Meeting saved" : "Meeting added" });
}

const idInput = z.object({ weddingId: z.string().optional(), id: z.string() });

export async function setTaskDoneAction(input: unknown): Promise<Out> {
  const p = idInput.extend({ done: z.boolean() }).safeParse(input);
  if (!p.success) return { ok: false, error: "invalid input" };
  const ctx = await ctxFor(p.data.weddingId);
  if (!ctx) return { ok: false, error: "forbidden" };
  const r = await setTaskDone(ctx, p.data.id, p.data.done);
  if (r.ok) refresh();
  return r;
}

export async function deleteTaskAction(input: unknown): Promise<Out> {
  const p = idInput.safeParse(input);
  if (!p.success) return { ok: false, error: "invalid input" };
  const ctx = await ctxFor(p.data.weddingId);
  if (!ctx) return { ok: false, error: "forbidden" };
  const r = await deleteTask(ctx, p.data.id);
  if (r.ok) refresh();
  return r;
}

export async function deleteMeetingAction(input: unknown): Promise<Out> {
  const p = idInput.safeParse(input);
  if (!p.success) return { ok: false, error: "invalid input" };
  const ctx = await ctxFor(p.data.weddingId);
  if (!ctx) return { ok: false, error: "forbidden" };
  const r = await deleteMeeting(ctx, p.data.id);
  if (r.ok) refresh();
  return r;
}

/** "Add follow-up task" under a meeting: same space, linked to it. */
export async function addFollowUpAction(input: unknown): Promise<Out> {
  const p = z.object({
    weddingId: z.string().optional(), meetingId: z.string(),
    title: z.string(), ownerUserId: z.string().optional(), ownerName: z.string().optional(), dueDate: z.string().optional(),
  }).safeParse(input);
  if (!p.success) return { ok: false, error: "invalid input" };
  const ctx = await ctxFor(p.data.weddingId);
  if (!ctx) return { ok: false, error: "forbidden" };
  const m = await getMeeting(ctx, p.data.meetingId);
  if (!m) return { ok: false, error: "We couldn't find that meeting. It may have been deleted." };
  const { weddingId: _w, ...task } = p.data;
  void _w;
  const r = await createTask(ctx, spaceOf(m.side), task);
  if (r.ok) refresh();
  return r;
}

/** The "Add a task" box at the top of a list: just a name, in that space. */
export async function quickAddTaskAction(input: unknown): Promise<Out> {
  const p = z.object({ weddingId: z.string().optional(), space: z.string(), title: z.string() }).safeParse(input);
  if (!p.success) return { ok: false, error: "invalid input" };
  const ctx = await ctxFor(p.data.weddingId);
  if (!ctx) return { ok: false, error: "forbidden" };
  const space = asSpace(p.data.space);
  if (!space) return { ok: false, error: "invalid input" };
  const r = await createTask(ctx, space, { title: p.data.title });
  if (r.ok) refresh();
  return r;
}

export async function addStarterTasksAction(input: unknown): Promise<Out> {
  const p = z.object({ weddingId: z.string().optional() }).safeParse(input ?? {});
  if (!p.success) return { ok: false, error: "invalid input" };
  const ctx = await ctxFor(p.data.weddingId);
  if (!ctx) return { ok: false, error: "forbidden" };
  const r = await addStarterTasks(ctx);
  if (r.ok) refresh();
  return r;
}
