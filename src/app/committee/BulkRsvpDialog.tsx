"use client";

import { useState, useTransition } from "react";

export type BulkAnswer = "yes" | "no" | "none";

/** Mark an RSVP for many families or guests in one go: pick the events and
    the answer. Answers only land on events each one is invited to. */
export function BulkRsvpDialog({
  count,
  noun,
  events,
  onSubmit,
  onClose,
}: {
  count: number;
  noun: "family" | "guest";
  events: { id: string; name: string }[];
  onSubmit: (eventIds: string[], answer: BulkAnswer) => Promise<{ ok: boolean; error?: string }>;
  onClose: (saved: boolean) => void;
}) {
  const [eventIds, setEventIds] = useState<string[]>(events.map((e) => e.id));
  const [answer, setAnswer] = useState<BulkAnswer>("yes");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const plural = count === 1 ? noun : noun === "family" ? "families" : "guests";

  const labels: Record<BulkAnswer, string> = noun === "family"
    ? { yes: "Attending — whole family", no: "Not attending", none: "Clear reply" }
    : { yes: "Attending", no: "Not attending", none: "Clear reply" };

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await onSubmit(eventIds, answer);
      if (r.ok) onClose(true);
      else setError(r.error ?? "failed");
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 p-4 backdrop-blur-sm" role="dialog" aria-modal aria-labelledby="bulk-rsvp-title">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[#fcfbf9] p-6 shadow-2xl md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="portal-eyebrow">Mark RSVP</p>
            <h2 id="bulk-rsvp-title" className="mt-1 text-xl font-semibold tracking-tight">{count} {plural} selected</h2>
          </div>
          <button type="button" onClick={() => onClose(false)} className="portal-icon-button" aria-label="Close">×</button>
        </div>

        <fieldset className="mt-5">
          <legend className="text-xs font-medium uppercase tracking-wide text-neutral-500">For these events</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {events.map((e) => {
              const on = eventIds.includes(e.id);
              return (
                <button key={e.id} type="button" aria-pressed={on}
                  onClick={() => setEventIds(on ? eventIds.filter((x) => x !== e.id) : [...eventIds, e.id])}
                  className={`rounded-full border px-3 py-1.5 text-xs ${on ? "border-stone-800 bg-stone-800 text-white" : "border-neutral-300 bg-white text-neutral-600 hover:border-neutral-500"}`}>
                  {e.name}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="mt-5">
          <legend className="text-xs font-medium uppercase tracking-wide text-neutral-500">Answer</legend>
          <div className="mt-2 grid gap-2">
            {(Object.keys(labels) as BulkAnswer[]).map((a) => (
              <label key={a} className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm">
                <input type="radio" name="bulk-answer" checked={answer === a} onChange={() => setAnswer(a)} className="h-4 w-4" />
                {labels[a]}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-neutral-500">Only applies to events each {noun} is invited to.</p>
        </fieldset>

        {error && <p className="mt-4 text-sm text-red-600" role="alert">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={() => onClose(false)} className="portal-button-secondary">Cancel</button>
          <button type="button" onClick={save} disabled={pending || eventIds.length === 0} className="portal-button disabled:opacity-40">
            {pending ? "Saving…" : `Mark ${count} ${plural}`}
          </button>
        </div>
      </div>
    </div>
  );
}
