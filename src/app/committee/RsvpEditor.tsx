"use client";

import { useState, useTransition } from "react";
import { recordRsvpAction } from "./actions";

type Answer = "attending" | "declined" | "none";
type Member = { id: string; fullName: string; ageGroup: "adult" | "child" };
type Current = { status: "attending" | "declined"; headcount: number; note: string | null; guestIds: string[] | null };

export type RsvpTarget = {
  familyId: string;
  name: string;
  members: Member[];
  events: { id: string; name: string }[];
  current: Record<string, Current>;
};

const CHOICES: { value: Answer; label: string }[] = [
  { value: "attending", label: "Attending" },
  { value: "declined", label: "Not attending" },
  { value: "none", label: "No reply" },
];

/** Committee enters or corrects a household's replies by ticking who's
    coming. The count is always the number of names ticked; someone not on the
    list is added as a named guest of the family in the same save. */
export function RsvpEditor({
  weddingId,
  target,
  onClose,
}: {
  weddingId: string;
  target: RsvpTarget;
  onClose: (saved: boolean) => void;
}) {
  const [added, setAdded] = useState<{ fullName: string; ageGroup: "adult" | "child" }[]>([]);
  const people = [
    ...target.members.map((m) => ({ key: m.id, fullName: m.fullName, isNew: false })),
    ...added.map((a, i) => ({ key: `new:${i}`, fullName: a.fullName, isNew: true })),
  ];
  const [answers, setAnswers] = useState<Record<string, { status: Answer; who: string[] }>>(() =>
    Object.fromEntries(target.events.map((e) => {
      const r = target.current[e.id];
      const everyone = target.members.map((m) => m.id);
      if (!r) return [e.id, { status: "none", who: everyone }];
      if (r.status === "declined") return [e.id, { status: "declined", who: everyone }];
      return [e.id, { status: "attending", who: r.guestIds ?? everyone }];
    })),
  );
  const [newName, setNewName] = useState("");
  const [newAge, setNewAge] = useState<"adult" | "child">("adult");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const setAnswer = (eventId: string, patch: Partial<{ status: Answer; who: string[] }>) =>
    setAnswers((a) => ({ ...a, [eventId]: { ...a[eventId], ...patch } }));

  function toggle(eventId: string, key: string) {
    const who = answers[eventId].who;
    setAnswer(eventId, { who: who.includes(key) ? who.filter((k) => k !== key) : [...who, key] });
  }

  function addPerson() {
    const fullName = newName.trim();
    if (!fullName) return;
    const key = `new:${added.length}`;
    setAdded((a) => [...a, { fullName, ageGroup: newAge }]);
    // a new guest is coming to every event already marked attending
    setAnswers((a) => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v.status === "attending" ? { ...v, who: [...v.who, key] } : v])));
    setNewName("");
  }

  function setAll(status: Answer) {
    const everyone = people.map((p) => p.key);
    setAnswers((a) => Object.fromEntries(Object.keys(a).map((k) => [k, { status, who: everyone }])));
  }

  const missing = target.events.find((e) => answers[e.id].status === "attending" && answers[e.id].who.length === 0);

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await recordRsvpAction({
        weddingId,
        familyId: target.familyId,
        addGuests: added,
        responses: target.events.map((e) => ({ eventId: e.id, status: answers[e.id].status, guestIds: answers[e.id].status === "attending" ? answers[e.id].who : [] })),
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
              Tick who&apos;s coming to each event. Someone extra? Add them below and they join the family.
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
              <button type="button" onClick={() => setAll("attending")} className="portal-badge hover:border-neutral-400">Everyone attending</button>
              <button type="button" onClick={() => setAll("declined")} className="portal-badge hover:border-neutral-400">Not attending</button>
            </div>
            <ul className="mt-3 space-y-3">
              {target.events.map((e) => {
                const a = answers[e.id];
                const unknown = target.current[e.id]?.status === "attending" && target.current[e.id]?.guestIds === null;
                return (
                  <li key={e.id} className="rounded-xl border border-neutral-200 bg-white p-4" data-testid="committee-rsvp-event">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{e.name}</p>
                      {a.status === "attending" && <span className="text-xs tabular-nums text-neutral-500">{a.who.length} coming</span>}
                    </div>
                    <div className="mt-3 flex overflow-hidden rounded-lg border border-neutral-300" role="radiogroup" aria-label={`${e.name} reply`} style={{ width: "fit-content" }}>
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
                      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={`Who is coming to ${e.name}`}>
                        {people.map((p) => {
                          const on = a.who.includes(p.key);
                          return (
                            <label key={p.key} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-xs ${on ? "border-green-700 bg-green-50 text-green-900" : "border-neutral-300 text-neutral-500"}`}>
                              <input type="checkbox" className="h-3.5 w-3.5" checked={on} onChange={() => toggle(e.id, p.key)} aria-label={`${p.fullName} coming to ${e.name}`} />
                              {p.fullName}{p.isNew && <span className="text-[10px] uppercase tracking-wide text-green-700">new</span>}
                            </label>
                          );
                        })}
                      </div>
                    )}
                    {unknown && (
                      <p className="mt-2 text-xs text-amber-700">
                        They said {target.current[e.id].headcount} of {target.members.length} via their link, without names. Tick who.
                      </p>
                    )}
                    {target.current[e.id]?.note && (
                      <p className="mt-2 text-xs text-neutral-500">Their note: “{target.current[e.id].note}”</p>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 rounded-xl border border-dashed border-neutral-300 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Someone not on the list?</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPerson(); } }}
                  placeholder="Full name"
                  aria-label="New guest's full name"
                  className="portal-input"
                  style={{ flex: "1 1 12rem", minWidth: 0 }}
                />
                <select value={newAge} onChange={(e) => setNewAge(e.target.value as "adult" | "child")} aria-label="New guest's age group" className="portal-input" style={{ width: "7rem", flex: "0 0 auto" }}>
                  <option value="adult">Adult</option>
                  <option value="child">Child</option>
                </select>
                <button type="button" onClick={addPerson} disabled={!newName.trim()} className="portal-button-secondary disabled:opacity-40">+ Add guest</button>
              </div>
              <p className="mt-2 text-xs text-neutral-500">They&apos;re added to {target.name} when you save, and ticked for events marked Attending.</p>
            </div>
          </>
        )}

        {missing && <p className="mt-4 text-sm text-amber-700" role="status">Tick at least one name for {missing.name}, or mark it Not attending.</p>}
        {error && <p className="mt-4 text-sm text-red-600" role="alert">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={() => onClose(false)} className="portal-button-secondary">Cancel</button>
          <button type="button" onClick={save} disabled={pending || target.events.length === 0 || !!missing} className="portal-button disabled:opacity-40">
            {pending ? "Saving…" : "Save RSVP"}
          </button>
        </div>
      </div>
    </div>
  );
}
