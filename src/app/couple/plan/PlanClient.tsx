"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { safeCall } from "@/lib/core/safe-call";
import { setTaskDoneAction, deleteTaskAction, deleteMeetingAction, addFollowUpAction, addStarterTasksAction } from "./actions";

/* The parts of Plan that act straight away: ticking a task, the follow-up
   row under a meeting, the starter list, and deleting (always asked first). */

export type TaskRow = {
  id: string; title: string; done: boolean; due: string | null; dueText: string | null;
  owner: string | null; mine: boolean; meeting: string | null; href: string; late: boolean;
};

type Common = { weddingId?: string };

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
    <li className="flex items-start gap-3 border-b border-neutral-100 py-2.5 last:border-0" data-testid="plan-task">
      <button
        type="button" onClick={toggle} disabled={pending}
        role="checkbox" aria-checked={done} aria-label={`${done ? "Mark not done" : "Mark done"}: ${t.title}`}
        className="flex h-11 w-11 flex-none items-center justify-center rounded-full border-2 text-lg"
        style={{ borderColor: done ? "#4d7c4f" : "#c7c0b4", background: done ? "#4d7c4f" : "#fff", color: "#fff" }}
      >
        {done ? "✓" : ""}
      </button>
      <Link href={t.href} className="min-w-0 flex-1 pt-1.5">
        <span className={`block break-words text-sm font-medium ${done ? "text-neutral-400 line-through" : "text-neutral-800"}`}>{t.title}</span>
        <span className="mt-0.5 block text-xs text-neutral-500">
          {[t.owner, t.dueText && (t.late && !done ? `Overdue: ${t.dueText}` : `Due ${t.dueText}`), t.meeting && `From: ${t.meeting}`].filter(Boolean).join(" · ") || "No owner or date yet"}
        </span>
      </Link>
    </li>
  );
}

/** Open tasks, a "My tasks" chip, and done ones folded away at the bottom. */
export function TaskList({ tasks, weddingId, starter, newHref }: { tasks: TaskRow[]; starter: boolean; newHref: string } & Common) {
  const router = useRouter();
  const [mineOnly, setMineOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, start] = useTransition();
  const shown = mineOnly ? tasks.filter((t) => t.mine) : tasks;
  const open = shown.filter((t) => !t.done);
  const done = shown.filter((t) => t.done);

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
      <div className="flex flex-wrap items-center gap-2">
        <Link href={newHref} className="portal-button">Add a task</Link>
        {tasks.length > 0 && (
          <button type="button" aria-pressed={mineOnly} onClick={() => setMineOnly((v) => !v)} className={mineOnly ? "portal-button" : "portal-button-secondary"}>
            My tasks
          </button>
        )}
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{error}</p>}

      {tasks.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-neutral-300 p-5 text-sm text-neutral-600" data-testid="plan-empty">
          <p>No tasks here yet. Add the first one, like &ldquo;Book the caterer tasting&rdquo;.</p>
          {starter && (
            <>
              <p className="mt-2">Or start from a list of the usual wedding jobs, with no dates set. You can change or remove any of them.</p>
              <button type="button" onClick={addStarter} disabled={adding} className="portal-button-secondary mt-3">
                {adding ? "Adding…" : "Add suggested tasks"}
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          {open.length > 0 ? (
            <ul className="mt-3">{open.map((t) => <Tick key={`${t.id}-${t.done}`} t={t} weddingId={weddingId} onError={setError} />)}</ul>
          ) : (
            <p className="mt-4 text-sm text-neutral-500">{mineOnly ? "Nothing open with your name on it." : "Everything here is done."}</p>
          )}
          {done.length > 0 && (
            <details className="mt-3 rounded-lg bg-neutral-50 px-3 py-1">
              <summary className="cursor-pointer py-2 text-sm text-neutral-600">Done · {done.length}</summary>
              <ul>{done.map((t) => <Tick key={`${t.id}-${t.done}`} t={t} weddingId={weddingId} onError={setError} />)}</ul>
            </details>
          )}
        </>
      )}
    </div>
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
      <button type="button" onClick={() => setAsking(true)} className="portal-button-secondary" style={{ color: "#b91c1c" }}>
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
              <button type="button" className="portal-button" style={{ background: "#b91c1c" }} onClick={go} disabled={pending}>
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
        ownerUserId: owner.startsWith("u:") ? owner.slice(2) : "", ownerName: String(fd.get("ownerName") ?? ""), dueDate: String(fd.get("dueDate") ?? ""),
      }));
      if (!r.ok) { setError(r.error ?? "That didn't save. Please try again."); return; }
      form.reset();
      router.refresh();
    });
  }
  return (
    <form onSubmit={submit} className="mt-3 grid gap-2 sm:grid-cols-[1fr_10rem_9rem_auto]" aria-label="Add follow-up task">
      <input name="title" required maxLength={200} placeholder="Follow-up, e.g. Send the menu to Mama" className="portal-input" aria-label="Follow-up task" />
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
