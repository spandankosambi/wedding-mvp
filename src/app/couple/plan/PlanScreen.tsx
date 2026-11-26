import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { weddings, type MeetingType } from "@/db/schema";
import { requireRole } from "@/lib/auth/authz";
import { sideNamesOf } from "@/lib/site/side-names";
import { asSpace, canDelete, canReach, spaceLabel, spaceOf, spacesFor, type Space } from "@/lib/plan/spaces";
import { getTask, peopleFor, tasksIn, type PlanCtx } from "@/lib/plan/tasks";
import { getMeeting, meetingsIn } from "@/lib/plan/meetings";
import { Field } from "@/components/Field";
import { FloatingSave } from "@/components/FloatingSave";
import { PortalNav } from "../PortalNav";
import { saveTaskAction, saveMeetingAction } from "./actions";
import { TaskList, DeleteButton, FollowUpRow, type TaskRow } from "./PlanClient";

/*
 * Plan: the couple's and each family committee's to-dos and meeting notes.
 * One screen at /couple/plan and /committee/plan. Three spaces (Both
 * families, and each family's own); a committee member who works one side
 * sees Both families and theirs. Anything outside reads as not found.
 */

export type PlanParams = { space?: string; task?: string; meeting?: string; saved?: string; error?: string; wedding?: string };

const TYPES: [MeetingType, string][] = [["family", "Family"], ["vendor", "Vendor"], ["other_family", "With the other family"]];

/** today in India, as YYYY-MM-DD */
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const plusDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const dayText = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export async function PlanScreen({ base, sp }: { base: "/couple/plan" | "/committee/plan"; sp: PlanParams }) {
  const staff = await requireRole(["committee", "couple", "admin"]);
  const admin = staff.role === "admin";
  const weddingId = admin ? (sp.wedding ?? null) : staff.weddingId;
  if (!weddingId) return <main className="p-10 text-sm text-neutral-500">No wedding is linked to this account.</main>;
  const [w] = await db.select().from(weddings).where(eq(weddings.id, weddingId));
  if (!w) notFound();
  const ctx: PlanCtx = { weddingId, userId: staff.userId, access: staff.access };
  const names = sideNamesOf(w);
  const spaces = spacesFor(staff.access);

  // what's open: a task, a meeting, or a space's list; the other family's are "not found"
  const task = sp.task && sp.task !== "new" ? await getTask(ctx, sp.task) : null;
  const meeting = sp.meeting && sp.meeting !== "new" ? await getMeeting(ctx, sp.meeting) : null;
  if ((sp.task && sp.task !== "new" && !task) || (sp.meeting && sp.meeting !== "new" && !meeting)) notFound();
  const asked = sp.space === undefined ? "both" : asSpace(sp.space);
  if (!asked || !canReach(staff.access, asked)) notFound();
  const space: Space = task ? spaceOf(task.side) : meeting ? spaceOf(meeting.side) : asked;

  const wq = admin ? `wedding=${weddingId}&` : "";
  const href = (q: string) => `${base}?${wq}${q}`;
  const hidden = (
    <>
      <input type="hidden" name="base" value={base} />
      <input type="hidden" name="space" value={space} />
      {admin && <><input type="hidden" name="weddingId" value={weddingId} /><input type="hidden" name="wedding" value={weddingId} /></>}
    </>
  );

  const [tasks, meetings, people] = await Promise.all([tasksIn(ctx, space), meetingsIn(ctx, space), peopleFor(weddingId, space)]);
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const titleOf = new Map(meetings.map((m) => [m.id, m.title]));
  const now = today();
  const soon = plusDays(now, 7);
  const rows: TaskRow[] = tasks.map((t) => ({
    id: t.id, title: t.title, done: t.done, due: t.dueDate, dueText: t.dueDate ? dayText(t.dueDate) : null,
    owner: t.ownerUserId ? nameOf.get(t.ownerUserId) ?? "No owner" : t.ownerName, mine: t.ownerUserId === staff.userId,
    meeting: t.meetingId ? titleOf.get(t.meetingId) ?? null : null, href: href(`space=${space}&task=${t.id}`), late: !!t.dueDate && t.dueDate < now,
  }));
  const overdue = rows.filter((t) => !t.done && t.due && t.due < now);
  const dueSoon = rows.filter((t) => !t.done && t.due && t.due >= now && t.due <= soon);
  const label = (s: Space) => spaceLabel(s, names);
  const mayDelete = (createdBy: string | null) => canDelete(staff.access, staff.userId, createdBy);

  return (
    <main className="portal-page">
      <PortalNav sideNames={names} names={`${w.brideName} & ${w.groomName}`} current="plan" weddingId={weddingId} admin={admin} access={staff.access} />
      <div className="portal-shell mx-auto max-w-3xl px-4 py-6 sm:py-10">
        <header>
          <h1 className="portal-heading">Plan</h1>
          <p className="portal-subheading mt-2">To-dos and meeting notes for the wedding. Each family&apos;s space is only seen by that family&apos;s helpers and the couple.</p>
        </header>

        <nav aria-label="Spaces" className="mt-5 flex gap-1 rounded-xl bg-neutral-100 p-1">
          {spaces.map((s) => (
            <Link key={s} href={href(`space=${s}`)} aria-current={s === space && !task && !meeting && !sp.task && !sp.meeting ? "page" : undefined}
              className={`min-w-0 flex-1 break-words rounded-lg px-2 py-2 text-center text-sm leading-tight ${s === space ? "bg-white font-semibold text-neutral-900 shadow-sm" : "text-neutral-600"}`}>
              {label(s)}
            </Link>
          ))}
        </nav>

        {sp.saved && <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{sp.saved}</p>}
        {sp.error && <p role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{sp.error}</p>}

        {sp.task ? (
          /* ── a task: new or existing ── */
          <section className="portal-panel mt-5 p-5" aria-labelledby="task-h">
            <Link href={href(`space=${space}`)} className="text-sm text-neutral-500 underline underline-offset-2">← {label(space)}</Link>
            <h2 id="task-h" className="mt-3 text-lg font-semibold">{task ? "Task" : `New task in ${label(space)}`}</h2>
            <form data-save-part="task" action={saveTaskAction} className="mt-4 space-y-4">
              {hidden}
              {task && <input type="hidden" name="id" value={task.id} />}
              <Field label="What needs doing"><input name="title" required maxLength={200} defaultValue={task?.title ?? ""} className="portal-input" placeholder="e.g. Book the caterer tasting" /></Field>
              <Field label="Who's doing it" hint="optional">
                <select name="ownerUserId" defaultValue={task?.ownerUserId ?? ""} className="portal-input">
                  <option value="">Nobody yet, or someone without a login</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <Field label="Or type a name" hint="for someone without a login, e.g. Mama">
                <input name="ownerName" maxLength={100} defaultValue={task?.ownerName ?? ""} className="portal-input" />
              </Field>
              <Field label="Due" hint="optional"><input name="dueDate" type="date" defaultValue={task?.dueDate ?? ""} className="portal-input" /></Field>
              <Field label="From a meeting" hint="optional">
                <select name="meetingId" defaultValue={task?.meetingId ?? ""} className="portal-input">
                  <option value="">Not linked</option>
                  {meetings.map((m) => <option key={m.id} value={m.id}>{dayText(m.meetingDate)}: {m.title}</option>)}
                </select>
              </Field>
            </form>
            {task && mayDelete(task.createdByUserId) && (
              <div className="mt-6 border-t border-neutral-100 pt-4">
                <DeleteButton kind="task" id={task.id} name={task.title} weddingId={admin ? weddingId : undefined} after={href(`space=${space}`)} />
              </div>
            )}
            <FloatingSave key={`${sp.task}-${sp.saved ?? ""}`} action={saveTaskAction} failedPart={sp.error ? "task" : undefined} label={task ? "Save task" : "Add task"} />
          </section>
        ) : sp.meeting ? (
          /* ── a meeting: new, or its notes, decisions and follow-ups ── */
          <section className="mt-5 space-y-5" aria-labelledby="meeting-h">
            <Link href={href(`space=${space}`)} className="text-sm text-neutral-500 underline underline-offset-2">← {label(space)}</Link>
            {meeting && (
              <div className="portal-panel p-5">
                <p className="portal-eyebrow">{dayText(meeting.meetingDate)} · {TYPES.find(([t]) => t === meeting.type)?.[1]}</p>
                <h2 id="meeting-h" className="mt-1 break-words text-lg font-semibold">{meeting.title}</h2>
                {meeting.decisions && (
                  <div className="mt-4 rounded-lg border-l-4 p-3" style={{ borderColor: "#9d7a3e", background: "#faf6ee" }}>
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#7a5c2a" }}>What we decided</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-neutral-800">{meeting.decisions}</p>
                  </div>
                )}
                <h3 className="mt-5 text-sm font-semibold text-neutral-700">Follow-up tasks</h3>
                {rows.filter((t) => tasks.find((x) => x.id === t.id)?.meetingId === meeting.id).length === 0
                  ? <p className="mt-1 text-sm text-neutral-500">None yet. Add one below.</p>
                  : (
                    <ul className="mt-1 text-sm">
                      {rows.filter((t) => tasks.find((x) => x.id === t.id)?.meetingId === meeting.id).map((t) => (
                        <li key={t.id} className="break-words py-1"><Link href={t.href} className={t.done ? "text-neutral-400 line-through" : "underline underline-offset-2"}>{t.title}</Link>{t.owner ? ` · ${t.owner}` : ""}</li>
                      ))}
                    </ul>
                  )}
                <FollowUpRow meetingId={meeting.id} people={people} weddingId={admin ? weddingId : undefined} />
              </div>
            )}
            <div className="portal-panel p-5">
              {!meeting && <h2 id="meeting-h" className="text-lg font-semibold">New meeting in {label(space)}</h2>}
              {meeting && <h3 className="text-sm font-semibold text-neutral-700">Meeting details</h3>}
              <form data-save-part="meeting" action={saveMeetingAction} className="mt-4 space-y-4">
                {hidden}
                {meeting && <input type="hidden" name="id" value={meeting.id} />}
                <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
                  <Field label="Date"><input name="meetingDate" type="date" required defaultValue={meeting?.meetingDate ?? now} className="portal-input" /></Field>
                  <Field label="Title"><input name="title" required maxLength={200} defaultValue={meeting?.title ?? ""} className="portal-input" placeholder="e.g. Caterer tasting" /></Field>
                </div>
                <fieldset className="portal-fieldset">
                  <legend className="text-xs font-medium text-neutral-600">Type</legend>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {TYPES.filter(([t]) => t !== "other_family" || space === "both").map(([t, l]) => (
                      <label key={t} className="portal-choice text-sm">
                        <input type="radio" name="type" value={t} defaultChecked={(meeting?.type ?? "family") === t} /> {l}
                      </label>
                    ))}
                  </div>
                  {space !== "both" && <p className="mt-1.5 text-xs text-neutral-500">Meetings with the other family go in Both families, so both sides can see them.</p>}
                </fieldset>
                <Field label="Who attended" hint="optional"><input name="attendees" maxLength={1000} defaultValue={meeting?.attendees ?? ""} className="portal-input" placeholder="e.g. Papa, Mama, Ravi bhaiya" /></Field>
                <Field label="Notes" hint="optional"><textarea name="notes" rows={5} maxLength={20000} defaultValue={meeting?.notes ?? ""} className="portal-input" /></Field>
                <Field label="What we decided" hint="optional"><textarea name="decisions" rows={3} maxLength={10000} defaultValue={meeting?.decisions ?? ""} className="portal-input" style={{ background: "#faf6ee" }} /></Field>
              </form>
              {meeting && mayDelete(meeting.createdByUserId) && (
                <div className="mt-6 border-t border-neutral-100 pt-4">
                  <DeleteButton kind="meeting" id={meeting.id} name={meeting.title} weddingId={admin ? weddingId : undefined} after={href(`space=${space}`)} />
                </div>
              )}
            </div>
            <FloatingSave key={`${sp.meeting}-${sp.saved ?? ""}`} action={saveMeetingAction} failedPart={sp.error ? "meeting" : undefined} label={meeting ? "Save meeting" : "Add meeting"} />
          </section>
        ) : (
          /* ── a space: what's due, the tasks, the meetings ── */
          <>
            {(overdue.length > 0 || dueSoon.length > 0) && (
              <section aria-label="Due soon and overdue" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
                {overdue.length > 0 && <p className="font-semibold text-red-800">Overdue · {overdue.length}</p>}
                {overdue.slice(0, 5).map((t) => <p key={t.id} className="break-words"><Link href={t.href} className="underline underline-offset-2">{t.title}</Link> <span className="text-neutral-500">({t.dueText})</span></p>)}
                {dueSoon.length > 0 && <p className={`font-semibold text-amber-900 ${overdue.length ? "mt-2" : ""}`}>Due in the next 7 days · {dueSoon.length}</p>}
                {dueSoon.slice(0, 5).map((t) => <p key={t.id} className="break-words"><Link href={t.href} className="underline underline-offset-2">{t.title}</Link> <span className="text-neutral-500">({t.dueText})</span></p>)}
              </section>
            )}
            <section className="portal-panel mt-5 p-5" aria-labelledby="tasks-h">
              <h2 id="tasks-h" className="text-lg font-semibold">Tasks</h2>
              <div className="mt-3">
                <TaskList tasks={rows} weddingId={admin ? weddingId : undefined} starter={space === "both"} newHref={href(`space=${space}&task=new`)} />
              </div>
            </section>
            <section className="portal-panel mt-5 p-5" aria-labelledby="meetings-h">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="meetings-h" className="text-lg font-semibold">Meetings</h2>
                <Link href={href(`space=${space}&meeting=new`)} className="portal-button-secondary">Add a meeting</Link>
              </div>
              {meetings.length === 0 ? (
                <p className="mt-3 text-sm text-neutral-500">No meetings noted yet. After the next family meeting or vendor visit, jot down who came and what you decided.</p>
              ) : (
                <ul className="mt-2">
                  {meetings.map((m) => (
                    <li key={m.id} className="border-b border-neutral-100 py-2.5 last:border-0">
                      <Link href={href(`space=${space}&meeting=${m.id}`)} className="block">
                        <span className="block break-words text-sm font-medium text-neutral-800">{m.title}</span>
                        <span className="text-xs text-neutral-500">{dayText(m.meetingDate)} · {TYPES.find(([t]) => t === m.type)?.[1]}{m.decisions ? " · has decisions" : ""}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
