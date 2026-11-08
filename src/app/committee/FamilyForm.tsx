"use client";

import { useState, useTransition } from "react";
import { upsertFamily, deleteFamilyAction } from "./actions";

export type FamilyDraft = {
  familyId?: string;
  name: string;
  side: "bride" | "groom" | "both";
  relation: string;
  email: string;
  phone: string;
  members: { id?: string; fullName: string; ageGroup: "adult" | "child" }[];
  eventIds: string[];
};

/** The edit-dialog draft for a family row, from either the Families or the Guests view. */
export function draftFromFamily(r: {
  id: string; name: string; side: FamilyDraft["side"]; relation: string | null; email: string; phone?: string | null;
  members: { id: string; fullName: string; ageGroup: "adult" | "child" }[]; eventIds: string[];
}): FamilyDraft {
  return {
    familyId: r.id, name: r.name, side: r.side, relation: r.relation ?? "", email: r.email, phone: r.phone ?? "",
    members: r.members.map(({ id, fullName, ageGroup }) => ({ id, fullName, ageGroup })), eventIds: r.eventIds,
  };
}

const EMPTY: FamilyDraft = {
  name: "", side: "bride", relation: "", email: "", phone: "",
  members: [{ fullName: "", ageGroup: "adult" }], eventIds: [],
};

export function FamilyForm({
  weddingId,
  events,
  draft,
  focusGuestId,
  onClose,
}: {
  weddingId: string;
  events: { id: string; name: string }[];
  draft: FamilyDraft | null;
  /** opened from the Guests view: put the cursor in this guest's name */
  focusGuestId?: string;
  onClose: (saved: boolean) => void;
}) {
  const [form, setForm] = useState<FamilyDraft>(draft ?? EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  function set<K extends keyof FamilyDraft>(key: K, value: FamilyDraft[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await upsertFamily({
        weddingId,
        familyId: form.familyId,
        name: form.name.trim(),
        side: form.side,
        relation: form.relation.trim() || undefined,
        email: form.email.trim(),
        phone: form.phone.trim(),
        members: form.members.filter((m) => m.fullName.trim()),
        eventIds: form.eventIds,
      });
      if (res.ok) onClose(true);
      else setError(res.error === "invalid input"
        ? "Check the details: a family name and at least one guest are needed; an email, if you add one, must be a full address, and a phone number needs at least 8 digits."
        : res.error ?? "failed");
    });
  }

  function remove() {
    if (!form.familyId) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteFamilyAction({ weddingId, familyId: form.familyId });
      if (res.ok) onClose(true);
      else setError(res.error ?? "failed");
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 p-4 backdrop-blur-sm" role="dialog" aria-modal aria-labelledby="family-form-title">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-[#fcfbf9] p-6 shadow-2xl md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="portal-eyebrow">Guest household</p>
            <h2 id="family-form-title" className="mt-1 text-xl font-semibold tracking-tight">{form.familyId ? "Edit family" : "Add family"}</h2>
          </div>
          <button type="button" onClick={() => onClose(false)} className="portal-icon-button" aria-label="Close family editor">×</button>
        </div>

        <div className="mt-5 space-y-4 text-sm">
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">Family name</span>
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Sharma Family"
              className="portal-input mt-1"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">Side</span>
              <select
                value={form.side}
                onChange={(e) => set("side", e.target.value as FamilyDraft["side"])}
                className="portal-input mt-1"
              >
                <option value="bride">Bride</option>
                <option value="groom">Groom</option>
                <option value="both">Both</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">Relation</span>
              <input
                value={form.relation}
                onChange={(e) => set("relation", e.target.value)}
                placeholder="Mama's family"
                className="portal-input mt-1"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">Email <span className="normal-case tracking-normal text-neutral-400">— optional</span></span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="sharma@example.com"
                className="portal-input mt-1"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">Phone <span className="normal-case tracking-normal text-neutral-400">— optional</span></span>
              <input
                type="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+91 98765 43210"
                maxLength={30}
                className="portal-input mt-1"
              />
            </label>
          </div>
          <p className="-mt-2 text-xs text-neutral-500">Both optional. An email is needed only to email them their invite link.</p>

          <fieldset>
            <legend className="text-xs font-medium uppercase tracking-wide text-neutral-500">Guests in this household</legend>
            <div className="mt-1 space-y-2">
              {form.members.map((m, i) => (
                <div key={i} className="flex gap-2">
                  {/* .portal-input sets width:100% outside Tailwind's layers, so
                      utility widths lose to it; size these two explicitly or the
                      select swallows the row and the name box collapses */}
                  <input
                    value={m.fullName}
                    onChange={(e) =>
                      set("members", form.members.map((x, j) => (j === i ? { ...x, fullName: e.target.value } : x)))
                    }
                    placeholder={`Guest ${i + 1} — full name`}
                    autoFocus={!!focusGuestId && m.id === focusGuestId}
                    aria-label={`Guest ${i + 1} name`}
                    className="portal-input"
                    style={{ flex: "1 1 auto", minWidth: 0 }}
                  />
                  <select
                    value={m.ageGroup}
                    onChange={(e) =>
                      set("members", form.members.map((x, j) => (j === i ? { ...x, ageGroup: e.target.value as "adult" | "child" } : x)))
                    }
                    aria-label={`Guest ${i + 1} age group`}
                    className="portal-input"
                    style={{ width: "7.5rem", flex: "0 0 auto" }}
                  >
                    <option value="adult">Adult</option>
                    <option value="child">Child</option>
                  </select>
                  <button
                    type="button"
                    aria-label="Remove member"
                    onClick={() => set("members", form.members.filter((_, j) => j !== i))}
                    disabled={form.members.length === 1}
                    className="portal-icon-button h-auto w-10 text-neutral-400 hover:text-neutral-700 disabled:opacity-30"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => set("members", [...form.members, { fullName: "", ageGroup: "adult" }])}
                className="portal-link"
              >
                + add another guest
              </button>
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-xs font-medium uppercase tracking-wide text-neutral-500">Invited to</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {events.map((e) => {
                const on = form.eventIds.includes(e.id);
                return (
                  <button
                    key={e.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      set("eventIds", on ? form.eventIds.filter((id) => id !== e.id) : [...form.eventIds, e.id])
                    }
                    className={`rounded-full border px-3 py-1.5 text-xs ${
                      on
                        ? "border-stone-800 bg-stone-800 text-white"
                        : "border-neutral-300 bg-white text-neutral-600 hover:border-neutral-500"
                    }`}
                  >
                    {e.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>

        {error && <p className="mt-4 text-sm text-red-600" role="alert">{error}</p>}

        {confirmDelete && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alertdialog" aria-labelledby="delete-family-q">
            <p id="delete-family-q" className="font-medium">Delete {form.name || "this family"}?</p>
            <p className="mt-1 text-red-800">Their guests, invitations and any RSVPs they sent are removed for good. Links already emailed to them stop working.</p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={remove} disabled={pending} className="portal-button disabled:opacity-40" style={{ background: "#b91c1c" }}>
                {pending ? "Deleting…" : "Yes, delete family"}
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} disabled={pending} className="portal-button-secondary">Keep</button>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {form.familyId && !confirmDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="portal-button-secondary mr-auto" style={{ color: "#b91c1c" }}
            >
              Delete family
            </button>
          )}
          <button
            onClick={() => onClose(false)}
            className="portal-button-secondary"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={pending || !form.name.trim() || !form.members.some((m) => m.fullName.trim())}
            className="portal-button disabled:opacity-40"
          >
            {pending ? "Saving…" : "Save family"}
          </button>
        </div>
      </div>
    </div>
  );
}
