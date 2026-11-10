"use client";

import { useState, useTransition } from "react";
import { upsertFamily, deleteFamilyAction } from "./actions";
import { invitesAll } from "@/lib/travel";
import { eventForSide, type Side } from "@/lib/sides";

export type FamilyDraft = {
  familyId?: string;
  name: string;
  side: "bride" | "groom";
  relation: string;
  members: DraftMember[];
  eventIds: string[];
  /** their invitation shows the site's Travel & Stay section */
  showTravel: boolean;
};

const COMPACT = { padding: "0.45rem 0.6rem", fontSize: "0.875rem" } as const;

type DraftMember = { id?: string; fullName: string; ageGroup: "adult" | "child"; email: string; phone: string; isPrimary: boolean };

/** The edit-dialog draft for a family row, from either the Families or the Guests view. */
export function draftFromFamily(r: {
  id: string; name: string; side: Side; relation: string | null;
  members: { id: string; fullName: string; ageGroup: "adult" | "child"; email: string | null; phone: string | null; isPrimary: boolean }[];
  eventIds: string[];
  showTravel: boolean;
}): FamilyDraft {
  return {
    // a household from before the split ("both sides") opens on the bride's family
    familyId: r.id, name: r.name, side: r.side === "groom" ? "groom" : "bride", relation: r.relation ?? "",
    members: r.members.map(({ id, fullName, ageGroup, email, phone, isPrimary }) => ({ id, fullName, ageGroup, email: email ?? "", phone: phone ?? "", isPrimary })),
    eventIds: r.eventIds,
    showTravel: r.showTravel,
  };
}

const EMPTY: FamilyDraft = {
  name: "", side: "bride", relation: "",
  members: [{ fullName: "", ageGroup: "adult", email: "", phone: "", isPrimary: true }], eventIds: [], showTravel: false,
};

export function FamilyForm({
  weddingId,
  events,
  draft,
  focusGuestId,
  onClose,
  family = "bride",
}: {
  weddingId: string;
  /** whose guest list this is: a new family joins it */
  family?: "bride" | "groom";
  events: { id: string; name: string; side: Side }[];
  draft: FamilyDraft | null;
  /** opened from the Guests view: put the cursor in this guest's name */
  focusGuestId?: string;
  onClose: (saved: boolean) => void;
}) {
  const [form, setForm] = useState<FamilyDraft>(draft ?? { ...EMPTY, side: family });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  // contact rows opened by hand (the primary's, and any with details, always show)
  const [openContact, setOpenContact] = useState<Set<number>>(new Set());
  const toggleContact = (i: number) =>
    setOpenContact((o) => { const n = new Set(o); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  function set<K extends keyof FamilyDraft>(key: K, value: FamilyDraft[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  /* Travel & Stay ticks itself when every event is selected. Otherwise it's
     the committee's call: while the box still matches that rule it keeps
     following it; once they've set it by hand, it stays as they left it. */
  // a family sees common events plus their own side's
  const idsFor = (side: Side) => events.filter((e) => eventForSide(e.side, side)).map((e) => e.id);
  const visible = events.filter((e) => eventForSide(e.side, form.side));
  const withEvents = (f: FamilyDraft, side: FamilyDraft["side"], eventIds: string[]): FamilyDraft => {
    const was = invitesAll(f.eventIds, idsFor(f.side)), now = invitesAll(eventIds, idsFor(side));
    const showTravel = now ? true : f.showTravel === was ? now : f.showTravel;
    return { ...f, side, eventIds, showTravel };
  };
  const toggleEvent = (id: string) =>
    setForm((f) => withEvents(f, f.side, f.eventIds.includes(id) ? f.eventIds.filter((x) => x !== id) : [...f.eventIds, id]));
  // switching side drops the other side's own events
  const changeSide = (side: "bride" | "groom") =>
    setForm((f) => withEvents(f, side, f.eventIds.filter((id) => idsFor(side).includes(id))));

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
  const removeMember = (i: number) => {
    setForm((f) => ({ ...f, members: withPrimary(f.members.filter((_, j) => j !== i)) }));
    setOpenContact((o) => new Set([...o].filter((j) => j !== i).map((j) => (j > i ? j - 1 : j))));
  };

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
        showTravel: form.showTravel,
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
              <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">Family</span>
              <select
                value={form.side}
                onChange={(e) => changeSide(e.target.value as FamilyDraft["side"])}
                className="portal-input mt-1"
                aria-label="Side"
              >
                <option value="bride">Bride&apos;s family</option>
                <option value="groom">Groom&apos;s family</option>
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
            <div className="flex items-baseline justify-between gap-3">
              <legend className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Guests in this household <span className="normal-case tracking-normal text-neutral-400">· {form.members.length}</span>
              </legend>
              <span className="text-xs text-neutral-400">★ primary adult gets the invite</span>
            </div>
            <ul className="mt-2 divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white">
              {form.members.map((m, i) => {
                const showContact = m.isPrimary || openContact.has(i) || !!m.email || !!m.phone;
                return (
                  <li key={i} className={m.isPrimary ? "bg-amber-50/50" : ""}>
                    <div className="flex items-center gap-1.5 px-2 py-1.5">
                      {/* .portal-input sets width:100% outside Tailwind's layers, so size
                          these explicitly or the select swallows the row */}
                      <input
                        value={m.fullName}
                        onChange={(e) => setMember(i, { fullName: e.target.value })}
                        placeholder={`Guest ${i + 1} — full name`}
                        autoFocus={!!focusGuestId && m.id === focusGuestId}
                        aria-label={`Guest ${i + 1} name`}
                        className="portal-input"
                        style={{ ...COMPACT, flex: "1 1 auto", minWidth: 0, borderColor: "transparent", background: "transparent" }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = "#d9d5cd"; e.currentTarget.style.background = "#fff"; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.background = "transparent"; }}
                      />
                      <select
                        value={m.ageGroup}
                        onChange={(e) => setAge(i, e.target.value as "adult" | "child")}
                        aria-label={`Guest ${i + 1} age group`}
                        className="portal-input"
                        style={{ ...COMPACT, width: "5.75rem", flex: "0 0 auto", color: m.ageGroup === "child" ? "#8a837a" : undefined }}
                      >
                        <option value="adult">Adult</option>
                        <option value="child">Child</option>
                      </select>
                      <label
                        title={m.ageGroup === "child" ? "The primary must be an adult" : m.isPrimary ? "Primary adult — gets the invite" : "Make primary adult"}
                        className={`relative grid h-8 w-8 flex-none place-items-center rounded-lg text-base ${
                          m.ageGroup === "child" ? "cursor-not-allowed text-neutral-200"
                            : m.isPrimary ? "cursor-pointer text-amber-500" : "cursor-pointer text-neutral-300 hover:bg-neutral-50 hover:text-amber-400"}`}
                      >
                        <input
                          type="radio"
                          name="primary-guest"
                          checked={m.isPrimary}
                          disabled={m.ageGroup === "child"}
                          onChange={() => setPrimary(i)}
                          aria-label={`Guest ${i + 1} is the primary adult`}
                          className="peer sr-only"
                        />
                        <span aria-hidden className="rounded peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2">{m.isPrimary ? "★" : "☆"}</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => toggleContact(i)}
                        disabled={m.isPrimary}
                        aria-expanded={showContact}
                        aria-label={`Guest ${i + 1} contact details`}
                        title={m.isPrimary ? "The primary adult's contact is shown below" : "Email or phone"}
                        className={`grid h-8 w-8 flex-none place-items-center rounded-lg text-sm ${
                          m.email || m.phone ? "text-neutral-700" : "text-neutral-300"} hover:bg-neutral-50 disabled:cursor-default disabled:hover:bg-transparent`}
                      >
                        ✉
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove guest ${i + 1}`}
                        onClick={() => removeMember(i)}
                        disabled={form.members.length === 1}
                        className="grid h-8 w-8 flex-none place-items-center rounded-lg text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700 disabled:opacity-30"
                      >
                        ×
                      </button>
                    </div>
                    {showContact && (
                      <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2" style={{ paddingLeft: "0.75rem" }}>
                        {m.isPrimary && <span className="w-full text-[11px] font-medium text-amber-800">Invite goes here — email, WhatsApp or both (optional)</span>}
                        <input
                          type="email"
                          value={m.email}
                          onChange={(e) => setMember(i, { email: e.target.value })}
                          placeholder="Email"
                          aria-label={`Guest ${i + 1} email`}
                          className="portal-input"
                          style={{ ...COMPACT, flex: "1 1 12rem", minWidth: 0 }}
                        />
                        <input
                          type="tel"
                          inputMode="tel"
                          value={m.phone}
                          onChange={(e) => setMember(i, { phone: e.target.value })}
                          placeholder="Phone / WhatsApp"
                          maxLength={30}
                          aria-label={`Guest ${i + 1} phone`}
                          className="portal-input"
                          style={{ ...COMPACT, flex: "1 1 9rem", minWidth: 0 }}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={() => set("members", [...form.members, { fullName: "", ageGroup: "adult", email: "", phone: "", isPrimary: !form.members.some((x) => x.isPrimary) }])}
              className="portal-link mt-2"
            >
              + add another guest
            </button>
          </fieldset>

          <fieldset>
            <legend className="text-xs font-medium uppercase tracking-wide text-neutral-500">Invited to</legend>
            {events.some((e) => e.side !== "both") && (
              <p className="mt-1 text-xs text-neutral-500">
                Showing common and {form.side === "bride" ? "bride" : "groom"}&apos;s-side events.
              </p>
            )}
            <div className="mt-1 flex flex-wrap gap-2">
              {visible.map((e) => {
                const on = form.eventIds.includes(e.id);
                return (
                  <button
                    key={e.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleEvent(e.id)}
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
            <label className="mt-3 flex items-start gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={form.showTravel}
                onChange={(e) => set("showTravel", e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                Show Travel &amp; Stay on their wedding site
                <span className="block text-xs text-neutral-500">Ticked automatically when they&apos;re invited to every event for their side.</span>
              </span>
            </label>
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
