"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { safeCall } from "@/lib/core/safe-call";
import {
  setTaskDoneAction, deleteTaskAction, deleteMeetingAction, addFollowUpAction, addStarterTasksAction, quickAddTaskAction,
} from "./actions";

/* The parts of Plan that act straight away: ticking a task, the add box, the
   follow-up row under a meeting, the starter list, and deleting (always
   asked first). Typed text stays put if a save doesn't go through. */

export type Group = "overdue" | "week" | "later" | "undated" | "done";
export type TaskRow = {
  id: string; title: string; done: boolean; group: Group;
  dueText: string | null; owner: string | null; mine: boolean; meeting: string | null; href: string;
};

type Common = { weddingId?: string };

const GROUPS: { key: Exclude<Group, "done">; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "week", label: "This week" },
  { key: "later", label: "Later" },
  { key: "undated", label: "No date yet" },
];
const dueTone: Record<Group, string> = {
  overdue: "text-[#a3341f]", week: "text-[#8a5c15]", later: "text-[#74706a]", undated: "text-[#74706a]", done: "text-[#a8a299]",
};

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");

function Tick({ t, weddingId, onError }: { t: TaskRow; onError: (m: string | null) => void } & Common) {
  const router = useRouter();
  const [done, setDone] = useState(t.done);
  const [pending, start] = useTransition();
  function toggle() {
    const next = !done;
    setDone(next); // shows at once; put back if it didn't save
    onError(null);
    start(async () => {
      const r = await safeCall(() => setTaskDoneAction({ weddingId, id: t.id, done: next }));
      if (!r.ok) { setDone(!next); onError(r.error ?? "That didn't save. Please try again."); return; }
      router.refresh();
    });
  }
  return (
    <li className="plan-row group flex items-center gap-1 rounded-lg pr-2 hover:bg-[#faf8f4]" data-testid="plan-task">
      {/* 44px to tap, a light 22px circle to look at */}
      <button
        type="button" onClick={toggle} disabled={pending}
        role="checkbox" aria-checked={done} aria-label={`${done ? "Mark not done" : "Mark done"}: ${t.title}`}
        className="flex h-11 w-11 flex-none items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[#8a5c15]"
      >
        <span
          className="flex h-[22px] w-[22px] items-center justify-center rounded-full border-[1.5px] text-[11px] font-bold transition-colors"
          style={done ? { borderColor: "#5f7a4f", background: "#5f7a4f", color: "#fff" } : { borderColor: "#c9c2b6", background: "#fff" }}
        >
          {done ? "✓" : ""}
        </span>
      </button>
      <Link href={t.href} className="flex min-w-0 flex-1 items-center gap-3 py-2.5">
        <span className="min-w-0 flex-1">
          <span className={`block break-words text-[0.9375rem] leading-snug ${done ? "text-[#a8a299] line-through decoration-[#cfc9be]" : "text-[#272624]"}`}>{t.title}</span>
          {t.meeting && <span className="mt-0.5 block truncate text-xs text-[#8b857c]">From {t.meeting}</span>}
        </span>
        {t.dueText && <span className={`flex-none text-xs font-medium tabular-nums ${dueTone[t.group]}`}>{t.dueText}</span>}
        {t.owner && (
          <span title={t.owner} className="flex flex-none items-center gap-1.5">
            <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f1ebdf] text-[10px] font-semibold text-[#5f513c]">{initials(t.owner)}</span>
            <span className="hidden max-w-[7rem] truncate text-xs text-[#625c54] sm:inline">{t.owner.split(" ")[0]}</span>
            <span className="sr-only sm:hidden">{t.owner}</span>
          </span>
        )}
      </Link>
    </li>
  );
}

/** The add box: type a task, press Enter. Owner and date are a tap away on the task. */
function QuickAdd({ space, weddingId, onError, detailsHref }: { space: string; detailsHref: string; onError: (m: string | null) => void } & Common) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const title = input.current?.value.trim() ?? "";
    if (!title) { input.current?.focus(); return; }
    onError(null);
    start(async () => {
      const r = await safeCall(() => quickAddTaskAction({ weddingId, space, title }));
      if (!r.ok) { onError(r.error ?? "That didn't save. Please try again."); return; }
      if (input.current) input.current.value = "";
      router.refresh();
      input.current?.focus();
    });
  }
  return (
    <>
    <form onSubmit={submit} className="flex gap-2" aria-label="Add a task">
      <input
        ref={input} name="title" maxLength={200} autoComplete="off" enterKeyHint="done"
        placeholder="Add a task" aria-label="New task"
        className="portal-input min-w-0 flex-1"
      />
      <button type="submit" disabled={pending} className="portal-button flex-none">{pending ? "Adding…" : "Add"}</button>
    </form>
    <Link href={detailsHref} className="mt-1.5 inline-flex min-h-9 items-center px-1 text-xs text-[#74706a] underline decoration-[#d4b981] underline-offset-4 hover:text-[#272624]">Add with an owner and date</Link>
    </>
  );
}

/** One space's tasks: progress, the add box, then Overdue, This week, Later, No date yet, and Done folded. */
export function TaskBoard({ tasks, space, weddingId, starter, starterTitles, emptyHint, detailsHref }: {
  tasks: TaskRow[]; space: string; starter: boolean; starterTitles: readonly string[]; emptyHint: string; detailsHref: string;
} & Common) {
  const router = useRouter();
  const [mineOnly, setMineOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, start] = useTransition();
  const shown = mineOnly ? tasks.filter((t) => t.mine) : tasks;
  const done = shown.filter((t) => t.done);
  const total = tasks.length;
  const doneAll = tasks.filter((t) => t.done).length;

  function addStarter() {
    setError(null);
    start(async () => {
      const r = await safeCall(() => addStarterTasksAction({ weddingId }));
      if (!r.ok) { setError(r.error ?? "Those didn't save. Please try again."); return; }
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="tasks-h" className="text-lg font-semibold tracking-tight text-[#272624]">Tasks</h2>
        {total > 0 && <p className="text-sm tabular-nums text-[#74706a]">{doneAll} of {total} done</p>}
      </div>
      {total > 0 && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#efe9dc]" role="progressbar" aria-label="Tasks done" aria-valuemin={0} aria-valuemax={total} aria-valuenow={doneAll}>
          <div className="h-full rounded-full bg-[#c9a25e] transition-[width] duration-500" style={{ width: `${(doneAll / total) * 100}%` }} />
        </div>
      )}

      <div className="mt-4"><QuickAdd space={space} weddingId={weddingId} onError={setError} detailsHref={detailsHref} /></div>
      {error && <p role="alert" className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{error}</p>}

      {total === 0 ? (
        <div className="mt-5" data-testid="plan-empty">
          <p className="text-sm leading-relaxed text-[#625c54]">{emptyHint}</p>
          {starter && (
            <div className="mt-4 rounded-xl bg-[#faf6ee] p-4">
              <p className="text-sm font-medium text-[#3b3832]">Or start with the usual list</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {starterTitles.map((s) => <li key={s} className="rounded-full border border-[#e8dcc4] bg-white px-2.5 py-1 text-xs text-[#5f513c]">{s}</li>)}
              </ul>
              <button type="button" onClick={addStarter} disabled={adding} className="portal-button-secondary mt-3">
                {adding ? "Adding…" : "Add suggested tasks"}
              </button>
              <p className="mt-2 text-xs text-[#8b857c]">No dates are set. Change or remove any of them later.</p>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="mt-4 flex gap-2" role="group" aria-label="Show">
            {[false, true].map((m) => (
              <button key={String(m)} type="button" aria-pressed={mineOnly === m} onClick={() => setMineOnly(m)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${mineOnly === m ? "bg-[#292723] text-white" : "border border-[#dedad2] bg-white text-[#57524a]"}`}>
                {m ? "My tasks" : "Everyone's"}
              </button>
            ))}
          </div>
          {GROUPS.map(({ key, label }) => {
            const list = shown.filter((t) => !t.done && t.group === key);
            if (!list.length) return null;
            return (
              <section key={key} aria-label={label} className="mt-4">
                <h3 className={`px-1 text-xs font-semibold ${key === "overdue" ? "text-[#a3341f]" : key === "week" ? "text-[#8a5c15]" : "text-[#8b857c]"}`}>
                  {label} <span className="font-normal tabular-nums">{list.length}</span>
                </h3>
                <ul className="mt-1">{list.map((t) => <Tick key={`${t.id}-${t.done}`} t={t} weddingId={weddingId} onError={setError} />)}</ul>
              </section>
            );
          })}
          {!shown.some((t) => !t.done) && (
            <p className="mt-5 px-1 text-sm text-[#74706a]">{mineOnly ? "Nothing open with your name on it." : "Everything here is done."}</p>
          )}
          {done.length > 0 && (
            <details className="mt-4 border-t border-[#efede8] pt-2">
              <summary className="cursor-pointer px-1 py-2 text-xs font-semibold text-[#8b857c]">Done {done.length}</summary>
              <ul>{done.map((t) => <Tick key={`${t.id}-${t.done}`} t={t} weddingId={weddingId} onError={setError} />)}</ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

/** A meeting's follow-ups, tickable where they are. */
export function FollowUps({ tasks, weddingId }: { tasks: TaskRow[] } & Common) {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <ul className="mt-1">{tasks.map((t) => <Tick key={`${t.id}-${t.done}`} t={t} weddingId={weddingId} onError={setError} />)}</ul>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </>
  );
}

/** Delete, after asking. Only shown to the item's creator and the couple. */
export function DeleteButton({ kind, id, name, weddingId, after }: { kind: "task" | "meeting"; id: string; name: string; after: string } & Common) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function go() {
    setError(null);
    start(async () => {
      const r = await safeCall(() => (kind === "task" ? deleteTaskAction({ weddingId, id }) : deleteMeetingAction({ weddingId, id })));
      if (!r.ok) { setError(r.error ?? "That didn't delete. Please try again."); setAsking(false); return; }
      router.push(after);
      router.refresh();
    });
  }
  return (
    <>
      <button type="button" onClick={() => setAsking(true)} className="text-sm font-medium text-[#a3341f] underline-offset-4 hover:underline">
        Delete {kind}
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      {asking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 p-4 backdrop-blur-sm" role="alertdialog" aria-modal aria-labelledby="plan-del-title" aria-describedby="plan-del-body">
          <div className="portal-panel w-full max-w-md p-6">
            <h2 id="plan-del-title" className="break-words text-lg font-semibold tracking-tight">Delete &ldquo;{name}&rdquo;?</h2>
            <p id="plan-del-body" className="mt-3 text-sm leading-relaxed text-neutral-600">
              {kind === "meeting"
                ? "The meeting and its notes are removed for everyone. Its tasks stay on the list, just no longer linked to it."
                : "The task is removed for everyone in this space."}
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button type="button" className="portal-button-secondary" onClick={() => setAsking(false)} autoFocus>Keep it</button>
              <button type="button" className="portal-button" style={{ background: "#a3341f" }} onClick={go} disabled={pending}>
                {pending ? "Deleting…" : "Yes, delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Under a meeting: a quick task in the same space, linked to it. Typed text stays if it doesn't save. */
export function FollowUpRow({ meetingId, people, weddingId }: { meetingId: string; people: { id: string; name: string }[] } & Common) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const owner = String(fd.get("owner") ?? "");
    setError(null);
    start(async () => {
      const r = await safeCall(() => addFollowUpAction({
        weddingId, meetingId, title: String(fd.get("title") ?? ""),
        ownerUserId: owner.startsWith("u:") ? owner.slice(2) : "", ownerName: "", dueDate: String(fd.get("dueDate") ?? ""),
      }));
      if (!r.ok) { setError(r.error ?? "That didn't save. Please try again."); return; }
      form.reset();
      router.refresh();
    });
  }
  return (
    <form onSubmit={submit} className="mt-3 grid gap-2 rounded-xl bg-[#faf8f4] p-3 sm:grid-cols-[1fr_9.5rem_9rem_auto]" aria-label="Add follow-up task">
      <input name="title" required maxLength={200} placeholder="Add a follow-up, e.g. Send the menu to Mama" className="portal-input" aria-label="Follow-up task" />
      <select name="owner" defaultValue="" className="portal-input" aria-label="Who">
        <option value="">No owner</option>
        {people.map((p) => <option key={p.id} value={`u:${p.id}`}>{p.name}</option>)}
      </select>
      <input name="dueDate" type="date" className="portal-input" aria-label="Due date (optional)" />
      <button type="submit" disabled={pending} className="portal-button-secondary">{pending ? "Adding…" : "Add"}</button>
      {error && <p role="alert" className="text-sm text-red-700 sm:col-span-4">{error}</p>}
    </form>
  );
}
