"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendInvitesAction, bulkFamilyRsvpAction } from "./actions";
import { useTravelToggle } from "./travel";
import type { Side } from "@/lib/sides";
import { FamilyForm, draftFromFamily, type FamilyDraft } from "./FamilyForm";
import { RsvpEditor, type RsvpTarget } from "./RsvpEditor";
import { BulkRsvpDialog } from "./BulkRsvpDialog";
import { openWhatsAppInvite } from "./whatsapp";

export type Row = {
  id: string;
  name: string;
  side: "bride" | "groom" | "both";
  relation: string | null;
  email: string;
  phone?: string | null;
  diet?: string | null;
  source?: "committee" | "import" | "guest";
  members: { id: string; fullName: string; ageGroup: "adult" | "child"; details: Record<string, string>; email: string | null; phone: string | null; isPrimary: boolean }[];
  eventIds: string[];
  /** their invitation shows the site's Travel & Stay section */
  showTravel: boolean;
  rsvpByEvent: Record<string, { status: "attending" | "declined"; headcount: number; note: string | null; guestIds: string[] | null }>;
  lastEmail: { type: string; status: string; sentAt: string } | null;
};

const SIDE_BADGE: Record<Row["side"], string> = {
  bride: "bg-rose-50 text-rose-700 border-rose-200",
  groom: "bg-sky-50 text-sky-700 border-sky-200",
  both: "bg-amber-50 text-amber-700 border-amber-200",
};

export function FamilyTable({
  weddingId,
  events,
  rows,
}: {
  weddingId: string;
  events: { id: string; name: string; side: Side }[];
  rows: Row[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<FamilyDraft | "new" | null>(null);
  const [rsvpFor, setRsvpFor] = useState<RsvpTarget | null>(null);
  const [bulk, setBulk] = useState(false);
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);
  const travel = useTravelToggle(weddingId, rows, setFlash);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function send(type: "invite" | "resend" | "remind", familyIds: string[]) {
    setFlash(null);
    startTransition(async () => {
      const res = await sendInvitesAction({ weddingId, familyIds, type });
      if (!res.ok) { setFlash(res.error ?? "failed"); return; }
      const sent = res.results.filter((r) => r.ok).length;
      const skipped = res.results.length - sent;
      setFlash(`${sent} sent${skipped ? `, ${skipped} skipped` : ""}`);
      setSelected(new Set());
      router.refresh();
    });
  }

  const ids = [...selected];

  return (
    <section>
      <div className="portal-panel mb-4 flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setEditing("new")}
          className="portal-button"
        >
          Add family
        </button>
        <a href={`/committee/import?wedding=${weddingId}`} className="portal-button-secondary">
          Import guest list
        </a>
        <div className="mx-1 hidden h-6 w-px bg-neutral-200 sm:block" />
        <button
          disabled={!ids.length || pending}
          onClick={() => setBulk(true)}
          className="portal-button-secondary"
        >
          Mark RSVP…
        </button>
        <button
          disabled={!ids.length || pending}
          onClick={() => send("invite", ids)}
          className="portal-button-secondary"
        >
          Send invites
        </button>
        <button
          disabled={!ids.length || pending}
          onClick={() => send("resend", ids)}
          className="portal-button-secondary"
        >
          Resend link
        </button>
        <button
          disabled={!ids.length || pending}
          onClick={() => send("remind", ids)}
          className="portal-button-secondary"
        >
          Send reminder
        </button>
        </div>
        <p className="text-xs font-medium text-neutral-500" aria-live="polite">
          {pending ? "Sending…" : flash ?? (ids.length ? `${ids.length} household${ids.length === 1 ? "" : "s"} selected` : "Select households to email")}
        </p>
      </div>

      <div className="portal-panel overflow-x-auto">
        <table className="portal-table w-full min-w-[66rem] text-left text-sm">
          <thead>
            <tr>
              <th className="p-3">
                <input
                  type="checkbox"
                  aria-label="Select all families"
                  checked={selected.size === rows.length && rows.length > 0}
                  onChange={(e) =>
                    setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())
                  }
                />
              </th>
              <th className="p-3">Family</th>
              <th className="p-3">Primary contact</th>
              <th className="p-3">Members</th>
              <th className="p-3">RSVP by event</th>
              <th className="p-3" title="Show the Travel & Stay section on their wedding site">Travel &amp; Stay</th>
              <th className="p-3">Last sent</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.name}`}
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                  />
                </td>
                <td>
                  <p className="font-medium">{r.name}</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    <span className={`mr-1 inline-block rounded border px-1.5 py-0.5 font-medium ${SIDE_BADGE[r.side]}`}>
                      {r.side}
                    </span>
                    {r.relation}
                    {r.source === "guest" && <span className="ml-1 rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 font-medium text-violet-700">via link</span>}
                    {r.diet && <span className="ml-1 rounded border border-neutral-200 px-1.5 py-0.5">{r.diet}</span>}
                  </p>
                </td>
                <td className="text-neutral-600">
                  {(() => {
                    const p = r.members.find((m) => m.isPrimary);
                    return (
                      <>
                        {p && <p className="text-xs font-medium text-neutral-800">{p.fullName}</p>}
                        {r.email && <p className="text-xs">{r.email}</p>}
                        {r.phone && <p className="text-xs tabular-nums">{r.phone}</p>}
                        {!r.email && !r.phone && (
                          <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">no contact</span>
                        )}
                      </>
                    );
                  })()}
                </td>
                <td className="tabular-nums">{r.members.length}</td>
                <td>
                  <div className="flex flex-wrap gap-1.5">
                    {events.map((e) => {
                      const invited = r.eventIds.includes(e.id);
                      const rsvp = r.rsvpByEvent[e.id];
                      if (!invited) return null;
                      return (
                        <span
                          key={e.id}
                          title={`${e.name}: ${rsvp ? (rsvp.status === "attending" ? `${rsvp.headcount} attending` : "declined") : "no answer yet"}${rsvp?.note ? ` — “${rsvp.note}”` : ""}`}
                          className={`rounded-full border px-2 py-1 text-xs font-medium ${
                            rsvp
                              ? rsvp.status === "attending"
                                ? "border-green-200 bg-green-50 text-green-700"
                                : "border-neutral-300 bg-neutral-100 text-neutral-500"
                              : "border-neutral-200 text-neutral-400"
                          }`}
                        >
                          {e.name} {rsvp ? (rsvp.status === "attending" ? `✓${rsvp.headcount}` : "✗") : "—"}
                        </span>
                      );
                    })}
                  </div>
                </td>
                <td className="text-center">
                  <input
                    type="checkbox"
                    aria-label={`Show Travel & Stay to ${r.name}`}
                    title="Show the Travel & Stay section on their wedding site"
                    checked={travel.shows(r)}
                    onChange={(e) => travel.set(r, e.target.checked)}
                    className="h-4 w-4"
                  />
                </td>
                <td>
                  {r.lastEmail ? (
                    r.lastEmail.status === "whatsapp" ? (
                      <span className="portal-badge">invite · WhatsApp</span>
                    ) : r.lastEmail.status === "sent" ? (
                      <span className="portal-badge">
                        {r.lastEmail.type} · sent
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-red-600">
                        failed
                        <button
                          disabled={pending}
                          onClick={() => send("resend", [r.id])}
                          className="ml-2 rounded border border-red-200 px-1.5 py-0.5 text-xs hover:bg-red-50"
                        >
                          retry
                        </button>
                      </span>
                    )
                  ) : (
                    <span className="text-xs text-neutral-400">never</span>
                  )}
                </td>
                <td className="whitespace-nowrap text-right">
                  <button
                    onClick={async () => {
                      setFlash(null);
                      const res = await openWhatsAppInvite(weddingId, r.id);
                      setFlash(res.ok
                        ? res.to ? `WhatsApp opened for ${r.name}` : `WhatsApp opened for ${r.name} — no phone saved, pick the contact`
                        : `Couldn't prepare the WhatsApp message: ${res.error}`);
                      if (res.ok) router.refresh();
                    }}
                    className="portal-link mr-4"
                    style={{ color: "#128c7e" }}
                    aria-label={`Share invitation with ${r.name} on WhatsApp`}
                  >
                    WhatsApp
                  </button>
                  <button
                    onClick={() =>
                      setRsvpFor({
                        familyId: r.id,
                        name: r.name,
                        members: r.members,
                        events: events.filter((e) => r.eventIds.includes(e.id)),
                        current: r.rsvpByEvent,
                      })
                    }
                    className="portal-link mr-4"
                    aria-label={`Record RSVP for ${r.name}`}
                  >
                    RSVP
                  </button>
                  <button
                    onClick={() => setEditing(draftFromFamily({ ...r, showTravel: travel.shows(r) }))}
                    className="portal-link"
                  >
                    edit
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="p-10 text-center text-sm text-neutral-400">
                  No families yet — add the first one, or{" "}
                  <a href={`/committee/import?wedding=${weddingId}`} className="portal-link">import a spreadsheet</a>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {bulk && (
        <BulkRsvpDialog
          count={ids.length}
          noun="family"
          events={events}
          onSubmit={(eventIds, answer) =>
            bulkFamilyRsvpAction({ weddingId, familyIds: ids, eventIds, answer: answer === "yes" ? "attending" : answer === "no" ? "declined" : "none" })}
          onClose={(saved) => {
            setBulk(false);
            if (saved) { setFlash(`RSVP marked for ${ids.length} famil${ids.length === 1 ? "y" : "ies"}`); setSelected(new Set()); router.refresh(); }
          }}
        />
      )}

      {rsvpFor && (
        <RsvpEditor
          weddingId={weddingId}
          target={rsvpFor}
          onClose={(saved) => {
            setRsvpFor(null);
            if (saved) { setFlash(`RSVP saved for ${rsvpFor.name}`); router.refresh(); }
          }}
        />
      )}

      {editing && (
        <FamilyForm
          weddingId={weddingId}
          events={events}
          draft={editing === "new" ? null : editing}
          onClose={(saved) => {
            setEditing(null);
            if (saved) router.refresh();
          }}
        />
      )}
    </section>
  );
}
