"use client";

import { useState, useTransition } from "react";
import { upsertFamily, deleteFamilyAction } from "./actions";

export type FamilyDraft = {
  familyId?: string;
  name: string;
  side: "bride" | "groom" | "both";
  relation: string;
  members: DraftMember[];
  eventIds: string[];
};

type DraftMember = { id?: string; fullName: string; ageGroup: "adult" | "child"; email: string; phone: string; isPrimary: boolean };

/** The edit-dialog draft for a family row, from either the Families or the Guests view. */
export function draftFromFamily(r: {
  id: string; name: string; side: FamilyDraft["side"]; relation: string | null;
  members: { id: string; fullName: string; ageGroup: "adult" | "child"; email: string | null; phone: string | null; isPrimary: boolean }[];
  eventIds: string[];
}): FamilyDraft {
  return {
    familyId: r.id, name: r.name, side: r.side, relation: r.relation ?? "",
    members: r.members.map(({ id, fullName, ageGroup, email, phone, isPrimary }) => ({ id, fullName, ageGroup, email: email ?? "", phone: phone ?? "", isPrimary })),
    eventIds: r.eventIds,
  };
}

const EMPTY: FamilyDraft = {
  name: "", side: "bride", relation: "",
  members: [{ fullName: "", ageGroup: "adult", email: "", phone: "", isPrimary: true }], eventIds: [],
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

  /* Exactly one primary, always an adult when there is one */
  const withPrimary = (members: DraftMember[]): DraftMember[] => {
    const keep = members.findIndex((m) => m.isPrimary && m.ageGroup === "adult");
    const pick = keep >= 0 ? keep : Math.max(0, members.findIndex((m) => m.ageGroup === "adult"));
    return members.map((m, j) => ({ ...m, isPrimary: j === pick }));
  };
  const setMember = (i: number, patch: Partial<DraftMember>) =>
    setForm((f) => ({ ...f, members: f.members.map((m, j) => (j === i ? { ...m, ...patch } : m)) }));
  const setAge = (i: number, ageGroup: "adult" | "child") =>
    setForm((f) => ({ ...f, members: withPrimary(f.members.map((m, j) => (j === i ? { ...m, ageGroup } : m))) }));
  const setPrimary = (i: number) =>
    setForm((f) => ({ ...f, members: f.members.map((m, j) => ({ ...m, isPrimary: j === i })) }));
  const removeMember = (i: number) =>
    setForm((f) => ({ ...f, members: withPrimary(f.members.filter((_, j) => j !== i)) }));

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await upsertFamily({
        weddingId,
        familyId: form.familyId,
        name: form.name.trim(),
        side: form.side,
        relation: form.relation.trim() || undefined,
        members: form.members.filter((m) => m.fullName.trim())
          .map((m) => ({ ...m, email: m.email.trim(), phone: m.phone.trim() })),
        eventIds: form.eventIds,
      });
      if (res.ok) onClose(true);
      else setError(res.error === "invalid input"
        ? "Check the details: a family name and at least one guest are needed; any email must be a full address, and any phone number needs at least 8 digits."
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

          <fieldset>
            <legend className="text-xs font-medium uppercase tracking-wide text-neutral-500">Guests in this household</legend>
            <p className="mt-1 text-xs text-neutral-500">
              Email and phone are optional for everyone. The <span className="font-medium text-neutral-700">primary adult</span> is who the invite goes to, by email or WhatsApp.
            </p>
            <div className="mt-2 space-y-2">
              {form.members.map((m, i) => (
                <div key={i} className={`rounded-xl border p-2.5 ${m.isPrimary ? "border-amber-300 bg-amber-50/40" : "border-neutral-200 bg-white"}`}>
                  <div className="flex gap-2">
                    {/* .portal-input sets width:100% outside Tailwind's layers, so
                        utility widths lose to it; size these two explicitly or the
                        select swallows the row and the name box collapses */}
                    <input
                      value={m.fullName}
                      onChange={(e) => setMember(i, { fullName: e.target.value })}
                      placeholder={`Guest ${i + 1} — full name`}
                      autoFocus={!!focusGuestId && m.id === focusGuestId}
                      aria-label={`Guest ${i + 1} name`}
                      className="portal-input"
                      style={{ flex: "1 1 auto", minWidth: 0 }}
                    />
                    <select
                      value={m.ageGroup}
                      onChange={(e) => setAge(i, e.target.value as "adult" | "child")}
                      aria-label={`Guest ${i + 1} age group`}
                      className="portal-input"
                      style={{ width: "7.5rem", flex: "0 0 auto" }}
                    >
                      <option value="adult">Adult</option>
                      <option value="child">Child</option>
                    </select>
                    <button
                      type="button"
                      aria-label={`Remove guest ${i + 1}`}
                      onClick={() => removeMember(i)}
                      disabled={form.members.length === 1}
                      className="portal-icon-button h-auto w-10 text-neutral-400 hover:text-neutral-700 disabled:opacity-30"
                    >
                      ×
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      type="email"
                      value={m.email}
                      onChange={(e) => setMember(i, { email: e.target.value })}
                      placeholder="Email (optional)"
                      aria-label={`Guest ${i + 1} email`}
                      className="portal-input"
                      style={{ flex: "1 1 11rem", minWidth: 0, padding: "0.5rem 0.65rem", fontSize: "0.8125rem" }}
                    />
                    <input
                      type="tel"
                      inputMode="tel"
                      value={m.phone}
                      onChange={(e) => setMember(i, { phone: e.target.value })}
                      placeholder="Phone (optional)"
                      maxLength={30}
                      aria-label={`Guest ${i + 1} phone`}
                      className="portal-input"
                      style={{ flex: "1 1 9rem", minWidth: 0, padding: "0.5rem 0.65rem", fontSize: "0.8125rem" }}
                    />
                    <label className={`flex items-center gap-1.5 whitespace-nowrap text-xs ${m.ageGroup === "child" ? "text-neutral-300" : "text-neutral-700"}`}
                      title={m.ageGroup === "child" ? "The primary must be an adult" : undefined}>
                      <input
                        type="radio"
                        name="primary-guest"
                        checked={m.isPrimary}
                        disabled={m.ageGroup === "child"}
                        onChange={() => setPrimary(i)}
                        aria-label={`Guest ${i + 1} is the primary adult`}
                        className="h-4 w-4"
                      />
                      Primary adult
                    </label>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => set("members", [...form.members, { fullName: "", ageGroup: "adult", email: "", phone: "", isPrimary: !form.members.some((x) => x.isPrimary) }])}
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
