import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { weddings, type MeetingType } from "@/db/schema";
import { requireRole } from "@/lib/auth/authz";
import { sideNamesOf } from "@/lib/site/side-names";
import { asSpace, canDelete, canReach, spaceLabel, spaceOf, spacesFor, type Space } from "@/lib/plan/spaces";
import { getTask, openCounts, peopleFor, tasksIn, type PlanCtx } from "@/lib/plan/tasks";
import { STARTER_TASKS } from "@/lib/plan/starter";
import { getMeeting, meetingsIn } from "@/lib/plan/meetings";
import { Field } from "@/components/Field";
import { FloatingSave } from "@/components/FloatingSave";
import { PortalNav } from "../PortalNav";
import { saveTaskAction, saveMeetingAction } from "./actions";
import { TaskBoard, FollowUps, DeleteButton, FollowUpRow, type Group, type TaskRow } from "./PlanClient";

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
const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

/** A small calendar leaf: the day, and the month under it. */
function DateTile({ d }: { d: string }) {
  const at = new Date(`${d}T00:00:00Z`);
  return (
    <span aria-hidden className="flex h-12 w-12 flex-none flex-col items-center justify-center rounded-lg border border-[#e8dcc4] bg-[#faf6ee]">
      <span className="text-lg font-semibold leading-none tabular-nums text-[#272624]">{at.getUTCDate()}</span>
      <span className="mt-0.5 text-[11px] font-medium text-[#8a5c15]">{at.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" })}</span>
    </span>
  );
}

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

  const [tasks, meetings, people, counts] = await Promise.all([tasksIn(ctx, space), meetingsIn(ctx, space), peopleFor(weddingId, space), openCounts(ctx)]);
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const titleOf = new Map(meetings.map((m) => [m.id, m.title]));
  const now = today();
  const soon = plusDays(now, 7);
  const tomorrow = plusDays(now, 1);
  const groupOf = (done: boolean, due: string | null): Group =>
    done ? "done" : !due ? "undated" : due < now ? "overdue" : due <= soon ? "week" : "later";
  const rows: TaskRow[] = tasks.map((t) => ({
    id: t.id, title: t.title, done: t.done, group: groupOf(t.done, t.dueDate),
    dueText: !t.dueDate ? null : t.dueDate === now ? "Today" : t.dueDate === tomorrow ? "Tomorrow" : shortDay(t.dueDate),
    owner: t.ownerUserId ? nameOf.get(t.ownerUserId) ?? null : t.ownerName, mine: t.ownerUserId === staff.userId,
    meeting: t.meetingId ? titleOf.get(t.meetingId) ?? null : null, href: href(`space=${space}&task=${t.id}`),
  }));
  const label = (s: Space) => spaceLabel(s, names);
  const mayDelete = (createdBy: string | null) => canDelete(staff.access, staff.userId, createdBy);
  const typeName = (t: MeetingType) => TYPES.find(([k]) => k === t)?.[1] ?? "";
  const listing = !sp.task && !sp.meeting;
  const daysLeft = Math.ceil((w.weddingDate.getTime() - Date.parse(`${now}T00:00:00+05:30`)) / 86_400_000);
  const back = (
    <Link href={href(`space=${space}`)} className="inline-flex min-h-11 items-center text-sm text-[#74706a] hover:text-[#272624]">
      <span aria-hidden className="mr-1.5">‹</span>{label(space)}
    </Link>
  );

  return (
    <main className="portal-page">
      <PortalNav sideNames={names} names={`${w.brideName} & ${w.groomName}`} current="plan" weddingId={weddingId} admin={admin} access={staff.access} />
      <div className="portal-shell">
        <div className="mx-auto max-w-6xl">
          <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <div>
              <h1 className="portal-heading">Plan</h1>
              <p className="portal-subheading mt-1.5 max-w-xl">Who&apos;s doing what, and what was decided. A family&apos;s own space is seen only by that family&apos;s helpers and the couple.</p>
            </div>
            {daysLeft > 0 && (
              <p className="text-sm text-[#74706a]"><strong className="text-2xl font-semibold tracking-tight tabular-nums text-[#272624]">{daysLeft}</strong> {daysLeft === 1 ? "day" : "days"} to the wedding</p>
            )}
          </header>

          <nav aria-label="Spaces" className="mt-6 flex gap-1 rounded-xl border border-[#e4e1db] bg-[#f4f2ee] p-1 sm:inline-flex">
            {spaces.map((s) => {
              const on = s === space;
              return (
                <Link key={s} href={href(`space=${s}`)} aria-current={on && listing ? "page" : undefined} aria-label={`${label(s)}, ${counts[s]} open`}
                  className={`flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-center text-sm leading-tight sm:flex-none sm:px-4 ${on ? "bg-white font-semibold text-[#272624] shadow-[0_1px_2px_rgba(40,35,25,0.08)]" : "text-[#625c54] hover:text-[#272624]"}`}>
                  <span className="break-words">{label(s)}</span>
                  {counts[s] > 0 && <span aria-hidden className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${on ? "bg-[#f1ebdf] text-[#5f513c]" : "bg-[#e8e4dc] text-[#625c54]"}`}>{counts[s]}</span>}
                </Link>
              );
            })}
          </nav>

          {sp.saved && <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{sp.saved}</p>}
          {sp.error && <p role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{sp.error}</p>}

          {sp.task ? (
            /* ── a task: new or existing ── */
            <section className="mt-5 max-w-xl" aria-labelledby="task-h">
              {back}
              <div className="portal-panel mt-1 p-5 sm:p-6">
                <h2 id="task-h" className="text-lg font-semibold tracking-tight">{task ? "Task" : `New task in ${label(space)}`}</h2>
                <form data-save-part="task" action={saveTaskAction} className="mt-4 space-y-4">
                  {hidden}
                  {task && <input type="hidden" name="id" value={task.id} />}
                  <Field label="What needs doing"><input name="title" required maxLength={200} defaultValue={task?.title ?? ""} className="portal-input" placeholder="e.g. Book the caterer tasting" /></Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Who's doing it" hint="optional">
                      <select name="ownerUserId" defaultValue={task?.ownerUserId ?? ""} className="portal-input">
                        <option value="">Nobody yet</option>
                        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Due" hint="optional"><input name="dueDate" type="date" defaultValue={task?.dueDate ?? ""} className="portal-input" /></Field>
                  </div>
                  <Field label="Or type a name" hint="for someone without a login, e.g. Mama">
                    <input name="ownerName" maxLength={100} defaultValue={task?.ownerName ?? ""} className="portal-input" />
                  </Field>
                  <Field label="From a meeting" hint="optional">
                    <select name="meetingId" defaultValue={task?.meetingId ?? ""} className="portal-input">
                      <option value="">Not linked</option>
                      {meetings.map((m) => <option key={m.id} value={m.id}>{dayText(m.meetingDate)}: {m.title}</option>)}
                    </select>
                  </Field>
                </form>
                {task && mayDelete(task.createdByUserId) && (
                  <div className="mt-6 border-t border-[#efede8] pt-4">
                    <DeleteButton kind="task" id={task.id} name={task.title} weddingId={admin ? weddingId : undefined} after={href(`space=${space}`)} />
                  </div>
                )}
              </div>
              <FloatingSave key={`${sp.task}-${sp.saved ?? ""}`} action={saveTaskAction} failedPart={sp.error ? "task" : undefined} label={task ? "Save task" : "Add task"} />
            </section>
          ) : sp.meeting ? (
            /* ── a meeting: read it, tick its follow-ups, edit below ── */
            <section className="mt-5 max-w-3xl" aria-labelledby="meeting-h">
              {back}
              {meeting && (
                <article className="portal-panel mt-1 p-5 sm:p-7">
                  <div className="flex items-start gap-4">
                    <DateTile d={meeting.meetingDate} />
                    <div className="min-w-0">
                      <h2 id="meeting-h" className="break-words text-xl font-semibold tracking-tight text-[#272624]">{meeting.title}</h2>
                      <p className="mt-1 text-sm text-[#74706a]">{typeName(meeting.type)} meeting{meeting.attendees ? `, with ${meeting.attendees}` : ""}</p>
                    </div>
                  </div>
                  {meeting.decisions && (
                    <div className="mt-6 rounded-r-lg border-l-[3px] border-[#c9a25e] bg-[#faf6ee] px-4 py-3">
                      <p className="text-sm font-semibold text-[#7a5c2a]">What we decided</p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-[0.9375rem] leading-relaxed text-[#272624]">{meeting.decisions}</p>
                    </div>
                  )}
                  {meeting.notes && (
                    <div className="mt-5">
                      <p className="text-sm font-semibold text-[#3b3832]">Notes</p>
                      <p className="mt-1 max-w-[68ch] whitespace-pre-wrap break-words text-[0.9375rem] leading-relaxed text-[#3b3832]">{meeting.notes}</p>
                    </div>
                  )}
                  <div className="mt-6 border-t border-[#efede8] pt-5">
                    <h3 className="text-sm font-semibold text-[#3b3832]">Follow-up tasks</h3>
                    {rows.filter((r) => tasks.find((x) => x.id === r.id)?.meetingId === meeting.id).length === 0
                      ? <p className="mt-1 text-sm text-[#8b857c]">None yet. Add what needs doing after this meeting.</p>
                      : <FollowUps tasks={rows.filter((r) => tasks.find((x) => x.id === r.id)?.meetingId === meeting.id).map((r) => ({ ...r, meeting: null }))} weddingId={admin ? weddingId : undefined} />}
                    <FollowUpRow meetingId={meeting.id} people={people} weddingId={admin ? weddingId : undefined} />
                  </div>
                </article>
              )}
              <details className="portal-panel mt-4" open={!meeting || !!sp.error}>
                <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-[#3b3832] sm:px-7">
                  {meeting ? "Edit meeting" : <span id="meeting-h">New meeting in {label(space)}</span>}
                </summary>
                <form data-save-part="meeting" action={saveMeetingAction} className="space-y-4 border-t border-[#efede8] px-5 py-5 sm:px-7">
                  {hidden}
                  {meeting && <input type="hidden" name="id" value={meeting.id} />}
                  <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
                    <Field label="Date"><input name="meetingDate" type="date" required defaultValue={meeting?.meetingDate ?? now} className="portal-input" /></Field>
                    <Field label="Title"><input name="title" required maxLength={200} defaultValue={meeting?.title ?? ""} className="portal-input" placeholder="e.g. Caterer tasting" /></Field>
                  </div>
                  <fieldset>
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
                  {meeting && mayDelete(meeting.createdByUserId) && (
                    <div className="border-t border-[#efede8] pt-4">
                      <DeleteButton kind="meeting" id={meeting.id} name={meeting.title} weddingId={admin ? weddingId : undefined} after={href(`space=${space}`)} />
                    </div>
                  )}
                </form>
              </details>
              <FloatingSave key={`${sp.meeting}-${sp.saved ?? ""}`} action={saveMeetingAction} failedPart={sp.error ? "meeting" : undefined} label={meeting ? "Save meeting" : "Add meeting"} />
            </section>
          ) : (
            /* ── a space: tasks, and meetings beside them on a wide screen ── */
            <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <section className="portal-panel p-5 sm:p-6" aria-labelledby="tasks-h">
                <TaskBoard
                  tasks={rows} space={space} weddingId={admin ? weddingId : undefined}
                  starter={space === "both"} starterTitles={STARTER_TASKS}
                  detailsHref={href(`space=${space}&task=new`)}
                  emptyHint={space === "both"
                    ? "Nothing on the list yet. Add the first job above: anything either family needs to get done."
                    : `Nothing here yet. Jobs only ${label(space)} should see go here, like gifts for the family or who picks up whom.`}
                />
              </section>
              <section className="portal-panel p-5 sm:p-6" aria-labelledby="meetings-h">
                <div className="flex items-center justify-between gap-3">
                  <h2 id="meetings-h" className="text-lg font-semibold tracking-tight text-[#272624]">Meetings</h2>
                  <Link href={href(`space=${space}&meeting=new`)} className="portal-button-secondary">Add a meeting</Link>
                </div>
                {meetings.length === 0 ? (
                  <p className="mt-4 text-sm leading-relaxed text-[#74706a]">No meetings noted yet. After a family meeting or a vendor visit, note who came and what you decided, so nobody has to remember it.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-[#efede8]">
                    {meetings.map((m) => (
                      <li key={m.id}>
                        <Link href={href(`space=${space}&meeting=${m.id}`)} className="-mx-2 flex gap-3 rounded-lg px-2 py-3 hover:bg-[#faf8f4]">
                          <DateTile d={m.meetingDate} />
                          <span className="min-w-0 flex-1">
                            <span className="block break-words text-[0.9375rem] font-medium leading-snug text-[#272624]">{m.title}</span>
                            <span className="block text-xs text-[#8b857c]">{typeName(m.type)} meeting</span>
                            {m.decisions && <span className="mt-1.5 line-clamp-2 border-l-2 border-[#d4b981] pl-2 text-xs leading-snug text-[#5f513c]">{m.decisions}</span>}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
