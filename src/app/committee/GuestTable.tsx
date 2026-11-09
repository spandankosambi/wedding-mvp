"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GuestColumn } from "@/db/schema";
import { guestAnswer, type GuestAnswer } from "@/lib/attendance";
import { guestRsvpAction, addGuestColumnAction, removeGuestColumnAction, setGuestDetailAction } from "./actions";
import { BulkRsvpDialog } from "./BulkRsvpDialog";
import { FamilyForm, draftFromFamily, type FamilyDraft } from "./FamilyForm";
import { openWhatsAppInvite } from "./whatsapp";
import { useTravelToggle } from "./travel";
import type { Side } from "@/lib/sides";
import type { Row } from "./FamilyTable";

const SIDE_BADGE: Record<Row["side"], string> = {
  bride: "bg-rose-50 text-rose-700 border-rose-200",
  groom: "bg-sky-50 text-sky-700 border-sky-200",
  both: "bg-amber-50 text-amber-700 border-amber-200",
};

const ANSWER_CHIP: Record<GuestAnswer, { mark: string; cls: string; label: string }> = {
  yes: { mark: "✓", cls: "border-green-200 bg-green-50 text-green-700", label: "attending" },
  no: { mark: "✗", cls: "border-neutral-300 bg-neutral-100 text-neutral-500", label: "not attending" },
  none: { mark: "—", cls: "border-neutral-200 text-neutral-400", label: "no reply yet" },
  unknown: { mark: "?", cls: "border-amber-200 bg-amber-50 text-amber-700", label: "family replied with a number, not names" },
};

/** One row per person: their family, their answer per event, and the
    wedding's extra columns (Stay, Room no.…) edited right in the table. */
export function GuestTable({
  weddingId,
  events,
  rows,
  columns,
}: {
  weddingId: string;
  events: { id: string; name: string; side: Side }[];
  rows: Row[];
  columns: GuestColumn[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rsvpFor, setRsvpFor] = useState<{ ids: string[]; label: string } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [newColumn, setNewColumn] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ draft: FamilyDraft; guestId: string; name: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const travel = useTravelToggle(weddingId, rows, setFlash);

  const guests = useMemo(() => rows.flatMap((f) => f.members.map((m) => ({ ...m, family: f }))), [rows]);
  const q = query.trim().toLowerCase();
  const shown = q
    ? guests.filter((g) => g.fullName.toLowerCase().includes(q) || g.family.name.toLowerCase().includes(q)
        || (g.email ?? "").toLowerCase().includes(q) || (g.phone ?? "").replace(/\s/g, "").includes(q.replace(/\s/g, ""))
        || Object.values(g.details).some((v) => v.toLowerCase().includes(q)))
    : guests;
  const ids = [...selected];

  function toggle(id: string) {
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  function addColumn() {
    const label = (newColumn ?? "").trim();
    if (!label) return;
    startTransition(async () => {
      const r = await addGuestColumnAction({ weddingId, label });
      if (r.ok) { setNewColumn(null); setFlash(`Added column “${label}”`); router.refresh(); }
      else setFlash(r.error);
    });
  }

  function removeColumn(columnId: string, label: string) {
    startTransition(async () => {
      const r = await removeGuestColumnAction({ weddingId, columnId });
      setRemoving(null);
      if (r.ok) { setFlash(`Removed column “${label}”`); router.refresh(); }
      else setFlash(r.error);
    });
  }

  return (
    <section>
      <div className="portal-panel mb-4 flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a guest, family, phone or room…"
            aria-label="Find a guest"
            className="portal-input"
            style={{ width: "16rem", maxWidth: "100%" }}
          />
          <button
            type="button"
            disabled={!ids.length || pending}
            onClick={() => setRsvpFor({ ids, label: `${ids.length} guest${ids.length === 1 ? "" : "s"}` })}
            className="portal-button-secondary"
          >
            Mark RSVP…
          </button>
          {newColumn === null ? (
            <button type="button" onClick={() => setNewColumn("")} className="portal-button-secondary">+ Add column</button>
          ) : (
            <span className="flex flex-wrap items-center gap-2">
              <input
                autoFocus
                value={newColumn}
                onChange={(e) => setNewColumn(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addColumn(); if (e.key === "Escape") setNewColumn(null); }}
                placeholder="Column name, e.g. Room no."
                aria-label="New column name"
                maxLength={40}
                className="portal-input"
                style={{ width: "13rem" }}
              />
              <button type="button" onClick={addColumn} disabled={!newColumn.trim() || pending} className="portal-button disabled:opacity-40">Add</button>
              <button type="button" onClick={() => setNewColumn(null)} className="portal-button-secondary">Cancel</button>
            </span>
          )}
        </div>
        <p className="text-xs font-medium text-neutral-500" aria-live="polite">
          {pending ? "Saving…" : flash ?? (ids.length ? `${ids.length} guest${ids.length === 1 ? "" : "s"} selected` : `${shown.length} of ${guests.length} guests`)}
        </p>
      </div>

      <div className="portal-panel overflow-x-auto">
        <table className="portal-table w-full text-left text-sm" style={{ minWidth: `${48 + columns.length * 10}rem` }}>
          <thead>
            <tr>
              <th className="p-3">
                <input
                  type="checkbox"
                  aria-label="Select all shown guests"
                  checked={shown.length > 0 && shown.every((g) => selected.has(g.id))}
                  onChange={(e) => setSelected(e.target.checked ? new Set(shown.map((g) => g.id)) : new Set())}
                />
              </th>
              <th className="p-3">Guest</th>
              <th className="p-3">Contact</th>
              <th className="p-3">Family</th>
              <th className="p-3">RSVP by event</th>
              <th className="p-3" title="Set per household: ticking one guest ticks their whole family">Travel &amp; Stay</th>
              {columns.map((c) => (
                <th key={c.id} className="p-3">
                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                    {c.label}
                    {removing === c.id ? (
                      <span className="ml-1 inline-flex items-center gap-1 normal-case tracking-normal">
                        <button type="button" onClick={() => removeColumn(c.id, c.label)} className="rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-xs font-medium" style={{ color: "#b91c1c" }}>Remove column?</button>
                        <button type="button" onClick={() => setRemoving(null)} className="px-1 text-xs text-neutral-500">Keep</button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setRemoving(c.id)} aria-label={`Remove column ${c.label}`} className="px-1 text-neutral-400 hover:text-neutral-700">×</button>
                    )}
                  </span>
                </th>
              ))}
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {shown.map((g) => {
              const f = g.family;
              return (
                <tr key={g.id}>
                  <td>
                    <input type="checkbox" aria-label={`Select ${g.fullName}`} checked={selected.has(g.id)} onChange={() => toggle(g.id)} />
                  </td>
                  <td>
                    <p className="font-medium">{g.fullName}</p>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {g.isPrimary && <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800">primary</span>}
                      {g.ageGroup === "child" && <span className="rounded border border-neutral-200 px-1.5 py-0.5 text-xs text-neutral-500">child</span>}
                    </span>
                  </td>
                  <td className="text-xs text-neutral-600">
                    {g.email && <p>{g.email}</p>}
                    {g.phone && <p className="tabular-nums">{g.phone}</p>}
                    {!g.email && !g.phone && <span className="text-neutral-300">—</span>}
                  </td>
                  <td>
                    <p>{f.name}</p>
                    <span className={`mt-1 inline-block rounded border px-1.5 py-0.5 text-xs font-medium ${SIDE_BADGE[f.side]}`}>{f.side}</span>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1.5">
                      {events.filter((e) => f.eventIds.includes(e.id)).map((e) => {
                        const a = guestAnswer(f.rsvpByEvent[e.id], g.id, f.members.length);
                        const chip = ANSWER_CHIP[a];
                        return (
                          <span key={e.id} title={`${e.name}: ${chip.label}`} className={`rounded-full border px-2 py-1 text-xs font-medium ${chip.cls}`}>
                            {e.name} {chip.mark}
                          </span>
                        );
                      })}
                      {f.eventIds.length === 0 && <span className="text-xs text-neutral-400">not invited yet</span>}
                    </div>
                  </td>
                  <td className="text-center">
                    <input
                      type="checkbox"
                      aria-label={`Show Travel & Stay to ${g.fullName}`}
                      title={`Set for the whole of ${f.name}`}
                      checked={travel.shows(f)}
                      onChange={(e) => travel.set(f, e.target.checked)}
                      className="h-4 w-4"
                    />
                  </td>
                  {columns.map((c) => (
                    <td key={c.id}>
                      <DetailCell weddingId={weddingId} guestId={g.id} column={c} initial={g.details[c.id] ?? ""} guestName={g.fullName} />
                    </td>
                  ))}
                  <td className="whitespace-nowrap text-right">
                    {g.isPrimary && (
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await openWhatsAppInvite(weddingId, f.id);
                          setFlash(res.ok ? `WhatsApp opened for ${g.fullName}` : `Couldn't prepare the WhatsApp message: ${res.error}`);
                        }}
                        className="portal-link mr-4"
                        style={{ color: "#128c7e" }}
                        aria-label={`Share invitation with ${g.fullName} on WhatsApp`}
                      >
                        WhatsApp
                      </button>
                    )}
                    <button type="button" onClick={() => setRsvpFor({ ids: [g.id], label: g.fullName })} className="portal-link mr-4" aria-label={`Record RSVP for ${g.fullName}`}>
                      RSVP
                    </button>
                    <button type="button" onClick={() => setEditing({ draft: draftFromFamily({ ...f, showTravel: travel.shows(f) }), guestId: g.id, name: g.fullName })} className="portal-link" aria-label={`Edit ${g.fullName}`}>
                      edit
                    </button>
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={7 + columns.length} className="p-10 text-center text-sm text-neutral-400">
                  {guests.length ? "No guest matches that search." : "No guests yet — add a family in the Families view."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <FamilyForm
          weddingId={weddingId}
          events={events}
          draft={editing.draft}
          focusGuestId={editing.guestId}
          onClose={(saved) => {
            const name = editing.name;
            setEditing(null);
            if (saved) { setFlash(`Saved ${name}'s household`); router.refresh(); }
          }}
        />
      )}

      {rsvpFor && (
        <BulkRsvpDialog
          count={rsvpFor.ids.length}
          noun="guest"
          events={events}
          onSubmit={(eventIds, answer) => guestRsvpAction({ weddingId, guestIds: rsvpFor.ids, eventIds, answer })}
          onClose={(saved) => {
            const label = rsvpFor.label;
            setRsvpFor(null);
            if (saved) { setFlash(`RSVP marked for ${label}`); setSelected(new Set()); router.refresh(); }
          }}
        />
      )}
    </section>
  );
}

/** An editable cell: saves when you leave it, if it changed. */
function DetailCell({ weddingId, guestId, column, initial, guestName }: {
  weddingId: string; guestId: string; column: GuestColumn; initial: string; guestName: string;
}) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");

  async function commit() {
    if (value.trim() === saved.trim()) return;
    setState("saving");
    const r = await setGuestDetailAction({ weddingId, guestId, columnId: column.id, value });
    if (r.ok) { setSaved(value.trim()); setState("idle"); } else setState("error");
  }

  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      maxLength={200}
      aria-label={`${column.label} for ${guestName}`}
      placeholder="—"
      className="w-full rounded-md border bg-transparent px-2 py-1 text-sm"
      style={{ borderColor: state === "error" ? "#dc2626" : "transparent", minWidth: "7rem", opacity: state === "saving" ? 0.6 : 1 }}
      onFocus={(e) => { e.currentTarget.style.borderColor = "#d9d5cd"; }}
      onBlurCapture={(e) => { if (state !== "error") e.currentTarget.style.borderColor = "transparent"; }}
    />
  );
}
