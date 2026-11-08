"use client";

import { useState, useTransition } from "react";
import { recordRsvpAction } from "./actions";

type Answer = "attending" | "declined" | "none";

export type RsvpTarget = {
  familyId: string;
  name: string;
  memberCount: number;
  events: { id: string; name: string }[];
  current: Record<string, { status: "attending" | "declined"; headcount: number; note: string | null }>;
};

const CHOICES: { value: Answer; label: string }[] = [
  { value: "attending", label: "Attending" },
  { value: "declined", label: "Not attending" },
  { value: "none", label: "No reply" },
];

/** Committee enters or corrects a household's replies — for the family that
    answered on the phone or at the door instead of through their link. */
export function RsvpEditor({
  weddingId,
  target,
  onClose,
}: {
  weddingId: string;
  target: RsvpTarget;
  onClose: (saved: boolean) => void;
}) {
  const defaultHeads = Math.max(target.memberCount, 1);
  const maxHeads = defaultHeads + 2;
  const [answers, setAnswers] = useState<Record<string, { status: Answer; headcount: number }>>(() =>
    Object.fromEntries(target.events.map((e) => {
      const r = target.current[e.id];
      return [e.id, r ? { status: r.status, headcount: r.status === "attending" ? r.headcount : defaultHeads } : { status: "none", headcount: defaultHeads }];
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function setAnswer(eventId: string, patch: Partial<{ status: Answer; headcount: number }>) {
    setAnswers((a) => ({ ...a, [eventId]: { ...a[eventId], ...patch } }));
  }

  function setAll(status: Answer) {
    setAnswers((a) => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, { ...v, status }])));
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await recordRsvpAction({
        weddingId,
        familyId: target.familyId,
        responses: target.events.map((e) => ({ eventId: e.id, ...answers[e.id] })),
      });
      if (res.ok) onClose(true);
      else setError(res.error ?? "failed");
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 p-4 backdrop-blur-sm" role="dialog" aria-modal aria-labelledby="rsvp-editor-title">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-[#fcfbf9] p-6 shadow-2xl md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="portal-eyebrow">RSVP on their behalf</p>
            <h2 id="rsvp-editor-title" className="mt-1 text-xl font-semibold tracking-tight">{target.name}</h2>
            <p className="mt-1 text-sm text-neutral-500">
              {target.memberCount} guest{target.memberCount === 1 ? "" : "s"} in this household. Their own link keeps working and shows these answers.
            </p>
          </div>
          <button type="button" onClick={() => onClose(false)} className="portal-icon-button" aria-label="Close RSVP editor">×</button>
        </div>

        {target.events.length === 0 ? (
          <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            This family isn&apos;t invited to any event yet. Use <span className="font-medium">edit</span> to choose their events first.
          </p>
        ) : (
          <>
            <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
              Mark all:
              <button type="button" onClick={() => setAll("attending")} className="portal-badge hover:border-neutral-400">Attending</button>
              <button type="button" onClick={() => setAll("declined")} className="portal-badge hover:border-neutral-400">Not attending</button>
            </div>
            <ul className="mt-3 space-y-3">
              {target.events.map((e) => {
                const a = answers[e.id];
                return (
                  <li key={e.id} className="rounded-xl border border-neutral-200 bg-white p-4" data-testid="committee-rsvp-event">
                    <p className="font-medium">{e.name}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <div className="flex overflow-hidden rounded-lg border border-neutral-300" role="radiogroup" aria-label={`${e.name} reply`}>
                        {CHOICES.map((c) => (
                          <button
                            key={c.value}
                            type="button"
                            role="radio"
                            aria-checked={a.status === c.value}
                            onClick={() => setAnswer(e.id, { status: c.value })}
                            className={`px-3 py-1.5 text-xs font-medium ${
                              a.status === c.value
                                ? c.value === "attending" ? "bg-green-700 text-white" : c.value === "declined" ? "bg-neutral-700 text-white" : "bg-neutral-200 text-neutral-800"
                                : "bg-white text-neutral-600 hover:bg-neutral-50"
                            }`}
                          >
                            {c.label}
                          </button>
                        ))}
                      </div>
                      {a.status === "attending" && (
                        <label className="ml-auto flex items-center gap-2 text-xs text-neutral-600">
                          How many
                          <input
                            type="number"
                            min={1}
                            max={maxHeads}
                            value={a.headcount}
                            onChange={(ev) => setAnswer(e.id, { headcount: Number(ev.target.value) || 0 })}
                            aria-label={`${e.name} headcount`}
                            className="portal-input"
                            style={{ width: "4.5rem", padding: "0.4rem 0.5rem" }}
                          />
                        </label>
                      )}
                    </div>
                    {target.current[e.id]?.note && (
                      <p className="mt-2 text-xs text-neutral-500">Their note: “{target.current[e.id].note}”</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {error && <p className="mt-4 text-sm text-red-600" role="alert">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={() => onClose(false)} className="portal-button-secondary">Cancel</button>
          <button
            type="button"
            onClick={save}
            disabled={pending || target.events.length === 0}
            className="portal-button disabled:opacity-40"
          >
            {pending ? "Saving…" : "Save RSVP"}
          </button>
        </div>
      </div>
    </div>
  );
}
