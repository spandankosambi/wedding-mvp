"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendInvitesAction, bulkFamilyRsvpAction, resolvePossibleMatchAction } from "./actions";
import { useTravelToggle } from "./travel";
import type { Side } from "@/lib/site/sides";
import { FamilyForm, draftFromFamily, type FamilyDraft } from "./FamilyForm";
import { RsvpEditor, type RsvpTarget } from "./RsvpEditor";
import { BulkRsvpDialog } from "./BulkRsvpDialog";
import { openWhatsAppInvite } from "./whatsapp";
import { useBarHeight, useIsPhone } from "./layout-hooks";
import { EditIcon, IconButton, MailIcon, RsvpIcon, WhatsAppIcon } from "@/components/icons";

import type { StaySent } from "@/db/schema";
import { safeCall } from "@/lib/core/safe-call";
export type Row = {
  id: string;
  name: string;
  side: "bride" | "groom" | "both"; // "both" only on households from before the split
  relation: string | null;
  email: string;
  phone?: string | null;
  diet?: string | null;
  source?: "committee" | "import" | "guest";
  members: { id: string; fullName: string; ageGroup: "adult" | "child"; details: Record<string, string>; email: string | null; phone: string | null; isPrimary: boolean }[];
  eventIds: string[];
  /** their invitation shows the site's Travel & Stay section */
  showTravel: boolean;
  /** when their stay details were last sent, and how */
  staySent?: StaySent | null;
  rsvpByEvent: Record<string, { status: "attending" | "declined"; headcount: number; note: string | null; guestIds: string[] | null }>;
  lastEmail: { type: string; status: string; sentAt: string } | null;
  /** the latest invitation by each route */
  inviteSent?: { whatsappAt: string | null; email: { at: string; type: string; ok: boolean; queued?: boolean } | null };
  /** a reply from the family's shared link whose phone or email matched this household on the list */
  possibleMatch?: { name: string; by: "phone" | "email" } | null;
};

/** "19 Nov, 12:44 am", in India time */
const sentWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

/** has this household already been sent a personal link (any route)? */
const hasLink = (r: Row) => !!(r.inviteSent?.whatsappAt || r.inviteSent?.email || r.lastEmail);


export function FamilyTable({
  weddingId,
  events,
  rows,
  family,
  importHref,
  readOnly = false,
}: {
  weddingId: string;
  family: "bride" | "groom";
  importHref: string;
  /** view-only access: look, search and filter, but change nothing */
  readOnly?: boolean;
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
  // a send that would replace links already given out waits for a yes
  const [confirm, setConfirm] = useState<{ title: string; body: string; go: string; run: () => void } | null>(null);
  const travel = useTravelToggle(weddingId, rows, setFlash);
  const [query, setQuery] = useState("");
  const [waitingOnly, setWaitingOnly] = useState(false);
  const [lookOnly, setLookOnly] = useState(false);
  const bar = useBarHeight<HTMLDivElement>();
  const phone = useIsPhone();

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  /** Every send makes a fresh personal link and the previous one stops
      working, so households that already have one ask first. */
  function guarded(familyIds: string[], how: string, run: () => void) {
    const had = rows.filter((r) => familyIds.includes(r.id) && hasLink(r));
    if (!had.length) { run(); return; }
    const one = familyIds.length === 1 ? had[0] : null;
    const before = (r: Row) => {
      const w = r.inviteSent?.whatsappAt, e = r.inviteSent?.email?.at;
      const latest = [w && { at: w, by: "WhatsApp" }, e && { at: e, by: "email" }].filter(Boolean).sort((a, b) => (a as { at: string }).at < (b as { at: string }).at ? 1 : -1)[0] as { at: string; by: string } | undefined;
      return latest ? ` (sent by ${latest.by} on ${sentWhen(latest.at)})` : "";
    };
    setConfirm({
      title: one ? `${one.name} already has an invite link` : `${had.length} of these ${familyIds.length} households already have an invite link`,
      body: one
        ? `Sending a new one ${how} gives them a fresh link${before(one)}. The link they already have will stop working, so they'll need to use the new one.`
        : `Sending ${how} gives each a fresh link. The links they already have will stop working, so they'll need to use the new ones.`,
      go: `Send ${how} anyway`,
      run,
    });
  }

  function whatsapp(r: Row) {
    guarded([r.id], "on WhatsApp", async () => {
      setFlash(null);
      const res = await openWhatsAppInvite(weddingId, r.id);
      setFlash(res.ok
        ? res.to ? `WhatsApp opened for ${r.name}: press send in WhatsApp` : `WhatsApp opened for ${r.name} — no phone saved, pick the contact`
        : `Couldn't prepare the WhatsApp message: ${res.error}`);
      if (res.ok) router.refresh();
    });
  }

  function send(type: "invite" | "resend" | "remind", familyIds: string[]) {
    guarded(familyIds, type === "remind" ? "as a reminder" : "by email", () => sendNow(type, familyIds));
  }

  function sendNow(type: "invite" | "resend" | "remind", familyIds: string[]) {
    setFlash(null);
    startTransition(async () => {
      const res = await safeCall(() => sendInvitesAction({ weddingId, familyIds, type }));
      if (!res.ok) { setFlash(res.error ?? "failed"); return; }
      const queued = res.results.filter((r) => r.ok && r.queued).length;
      const sent = res.results.filter((r) => r.ok).length - queued;
      const skipped = res.results.length - sent - queued;
      setFlash(`${sent} sent${queued ? `, ${queued} queued (today's email allowance is used up; they go out later)` : ""}${skipped ? `, ${skipped} skipped` : ""}`);
      setSelected(new Set());
      router.refresh();
    });
  }

  const ids = [...selected];

  // find a family by its name, relation, anyone in it, or a phone or email
  const waiting = rows.filter((r) => Object.keys(r.rsvpByEvent).length === 0);
  const needsLook = rows.filter((r) => r.possibleMatch);
  const q = query.trim().toLowerCase();
  const digits = q.replace(/\s/g, "");
  const shown = rows.filter((r) => {
    if (waitingOnly && Object.keys(r.rsvpByEvent).length > 0) return false;
    if (lookOnly && !r.possibleMatch) return false;
    if (!q) return true;
    return r.name.toLowerCase().includes(q) || (r.relation ?? "").toLowerCase().includes(q)
      || r.email.toLowerCase().includes(q) || (r.phone ?? "").replace(/\s/g, "").includes(digits)
      || r.members.some((m) => m.fullName.toLowerCase().includes(q) || (m.email ?? "").toLowerCase().includes(q)
        || (m.phone ?? "").replace(/\s/g, "").includes(digits));
  });
  const allShown = shown.length > 0 && shown.every((r) => selected.has(r.id));

  const tags = (r: Row) => (
    <p className="mt-1 text-xs text-neutral-500">
      {r.relation}
      {r.source === "guest" && <span className="ml-1 rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 font-medium text-violet-700">via link</span>}
      {r.diet && <span className="ml-1 rounded border border-neutral-200 px-1.5 py-0.5">{r.diet}</span>}
    </p>
  );
  /** "4 coming to Sangeet, Pheras. Can't make Haldi." */
  const replySummary = (r: Row) => {
    const answered = events.filter((e) => r.rsvpByEvent[e.id]);
    const yes = answered.filter((e) => r.rsvpByEvent[e.id].status === "attending");
    const no = answered.filter((e) => r.rsvpByEvent[e.id].status === "declined");
    const most = Math.max(0, ...yes.map((e) => r.rsvpByEvent[e.id].headcount));
    return [
      yes.length ? `${most} coming to ${yes.map((e) => e.name).join(", ")}.` : "",
      no.length ? `Can't make ${no.map((e) => e.name).join(", ")}.` : "",
    ].filter(Boolean).join(" ");
  };
  function resolve(r: Row, merge: boolean) {
    setFlash(null);
    startTransition(async () => {
      const res = await safeCall(() => resolvePossibleMatchAction({ weddingId, familyId: r.id, merge }));
      if (!res.ok) {
        setFlash(res.error === "not allowed"
          ? "Couldn't do that: this reply may already have been sorted. Refresh the page to see the latest."
          : res.error ?? "Something went wrong. Please try again.");
        return;
      }
      setFlash(merge ? `${r.name}'s reply is now part of ${r.possibleMatch!.name}` : `${r.name} kept as a separate household`);
      router.refresh();
    });
  }
  /* a shared-link reply that may be a household already on the list */
  const lookNotice = (r: Row) => r.possibleMatch && (
    <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-900" data-testid="needs-look">
      <p className="font-medium">Needs a look</p>
      <p className="break-words">
        Possible match: {r.possibleMatch.name} (same {r.possibleMatch.by}). {replySummary(r)}
      </p>
      {!readOnly && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            className="portal-button"
            onClick={() => setConfirm({
              title: `Add this reply to ${r.possibleMatch!.name}?`,
              body: `Their answers move onto ${r.possibleMatch!.name}, which keeps its own members, contact details and private link. Where both answered the same event, the newer answer is kept. This separate entry, ${r.name}, is then removed.`,
              go: "Yes, that's them",
              run: () => resolve(r, true),
            })}
          >
            Yes, that&apos;s them
          </button>
          <button type="button" disabled={pending} className="portal-button-secondary" onClick={() => resolve(r, false)}>
            No, keep separate
          </button>
        </div>
      )}
    </div>
  );
  const contact = (r: Row) => {
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
  };
  const chips = (r: Row) => (
    <div className="flex flex-wrap gap-1.5">
      {events.map((e) => {
        const rsvp = r.rsvpByEvent[e.id];
        if (!r.eventIds.includes(e.id)) return null;
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
  );
  const travelBox = (r: Row) => (
    <input
      type="checkbox"
      aria-label={`Show Travel & Stay to ${r.name}`}
      title="Show the Travel & Stay section on their wedding site"
      checked={travel.shows(r)}
      onChange={(e) => travel.set(r, e.target.checked)}
      className="h-4 w-4"
    />
  );
  /* what's gone out: email and WhatsApp, each with when */
  const sentLines = (r: Row) => {
    const s = r.inviteSent;
    if (!s?.email && !s?.whatsappAt) return <span className="text-xs text-neutral-400">Not sent yet</span>;
    return (
      <div className="sent-lines text-xs leading-relaxed" data-testid="invite-sent">
        {s.email && (s.email.queued
          ? <p className="text-amber-700" title="Today's email allowance is used up; it goes out once it frees up">⏳ Email queued {sentWhen(s.email.at)}</p>
          : s.email.ok
          ? <p className="text-emerald-700">✓ {s.email.type === "remind" ? "Reminded" : "Emailed"} {sentWhen(s.email.at)}{r.email && <span className="text-neutral-400"> · {r.email}</span>}</p>
          : <p className="font-medium text-red-600">
              ✗ Email failed {sentWhen(s.email.at)}
              <button disabled={pending} onClick={() => sendNow("resend", [r.id])} className="ml-2 rounded border border-red-200 px-1.5 py-0.5 hover:bg-red-50">retry</button>
            </p>)}
        {s.whatsappAt && <p style={{ color: "#128c7e" }} title="When WhatsApp was opened with the invitation; we can't see it being sent">✓ WhatsApp {sentWhen(s.whatsappAt)}</p>}
      </div>
    );
  };
  /** the number WhatsApp would go to: the primary adult's, else the household's */
  const waNumber = (r: Row) => (r.members.find((m) => m.isPrimary)?.phone || r.phone || "").replace(/[^\d+]/g, "");
  const openRsvp = (r: Row) =>
    setRsvpFor({ familyId: r.id, name: r.name, members: r.members, events: events.filter((e) => r.eventIds.includes(e.id)), current: r.rsvpByEvent });
  const sendIcons = (r: Row) => (
    <span className="row-actions">
      <IconButton
        label={`Share invitation with ${r.name} on WhatsApp`}
        title={waNumber(r) ? "Send the invitation on WhatsApp" : "No phone saved for this household — add one with Edit"}
        disabled={!waNumber(r)}
        onClick={() => whatsapp(r)}
      >
        <WhatsAppIcon />
      </IconButton>
      <IconButton
        label={`Email invitation to ${r.name}`}
        title={r.email ? `Email the invitation to ${r.email}` : "No email saved for this household — add one with Edit"}
        disabled={!r.email || pending}
        onClick={() => send(hasLink(r) ? "resend" : "invite", [r.id])}
      >
        <MailIcon />
      </IconButton>
    </span>
  );
  const rsvpIcon = (r: Row) => (
    <IconButton label={`Record RSVP for ${r.name}`} title="Record their RSVP" onClick={() => openRsvp(r)}>
      <RsvpIcon />
    </IconButton>
  );
  const editIcon = (r: Row) => (
    <IconButton label={`Edit ${r.name}`} title="Edit this household" onClick={() => setEditing(draftFromFamily({ ...r, showTravel: travel.shows(r) }))}>
      <EditIcon />
    </IconButton>
  );
  /** all four together, for the phone card */
  const actions = (r: Row) => <span className="row-actions">{sendIcons(r)}{rsvpIcon(r)}{editIcon(r)}</span>;
  const empty = rows.length === 0
    ? readOnly ? <>No families yet.</> : <>No families yet — add the first one, or <a href={importHref} className="portal-link">import a spreadsheet</a>.</>
    : lookOnly && !q ? <>Nothing needs a look right now.</>
    : waitingOnly && !q ? <>Everyone has answered. 🎉</> : <>No family matches that search.</>;

  return (
    <section>
      <div ref={bar} className="portal-panel guest-bar mb-4 flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a family, guest or phone…"
          aria-label="Find a family"
          className="portal-input"
          style={{ width: "15rem", maxWidth: "100%" }}
        />
        <button
          type="button"
          aria-pressed={waitingOnly}
          onClick={() => setWaitingOnly((v) => !v)}
          title="Families who haven't answered for any event yet"
          className={waitingOnly ? "portal-button" : "portal-button-secondary"}
        >
          Still waiting · {waiting.length}
        </button>
        {needsLook.length > 0 && (
          <button
            type="button"
            aria-pressed={lookOnly}
            onClick={() => setLookOnly((v) => !v)}
            title="Replies from your shared link that may be a household already on the list"
            className={lookOnly ? "portal-button" : "portal-button-secondary"}
          >
            Needs a look · {needsLook.length}
          </button>
        )}
        <div className="mx-1 hidden h-6 w-px bg-neutral-200 sm:block" />
        {!readOnly && <>
        <button
          onClick={() => setEditing("new")}
          className="portal-button"
        >
          Add family
        </button>
        <a href={importHref} className="portal-button-secondary">
          Import guest list
        </a>
        </>}
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
          {pending ? "Sending…" : flash ?? (ids.length
            ? `${ids.length} household${ids.length === 1 ? "" : "s"} selected`
            : q || waitingOnly || lookOnly ? `${shown.length} of ${rows.length} families` : readOnly ? "View only" : "Select households to email")}
        </p>
      </div>

      <fieldset disabled={readOnly} className="portal-fieldset">
      {phone ? (
        /* on a phone each family is a card: nothing to scroll sideways */
        <div data-testid="family-cards">
          {shown.length > 0 && (
            <label className="mb-3 flex items-center gap-2 px-1 text-xs font-medium text-neutral-600">
              <input
                type="checkbox"
                checked={allShown}
                onChange={(e) => setSelected(e.target.checked ? new Set(shown.map((r) => r.id)) : new Set())}
              />
              Select all {shown.length} shown
            </label>
          )}
          {shown.map((r) => (
            <article key={r.id} className="portal-panel guest-card" aria-label={r.name}>
              <div className="flex items-start gap-3">
                <input type="checkbox" aria-label={`Select ${r.name}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="mt-1" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-medium">{r.name}</p>
                    <p className="whitespace-nowrap text-xs text-neutral-500">{r.members.length} {r.members.length === 1 ? "guest" : "guests"}</p>
                  </div>
                  {tags(r)}
                  {lookNotice(r)}
                  <div className="mt-2 text-neutral-600">{contact(r)}</div>
                  <div className="mt-3">{chips(r)}</div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-600">
                    <label className="flex items-center gap-2">{travelBox(r)} Stay</label>
                    {sentLines(r)}
                  </div>
                  <div className="mt-3 border-t border-neutral-100 pt-3 text-sm">{actions(r)}</div>
                </div>
              </div>
            </article>
          ))}
          {shown.length === 0 && <p className="portal-panel p-8 text-center text-sm text-neutral-400">{empty}</p>}
        </div>
      ) : (
      <div className="portal-panel guest-table" data-freeze="true">
        <table className="portal-table w-full min-w-[60rem] text-left text-sm">
          <thead>
            <tr>
              <th className="p-3">
                <input
                  type="checkbox"
                  aria-label="Select all families"
                  checked={allShown}
                  onChange={(e) => setSelected(e.target.checked ? new Set(shown.map((r) => r.id)) : new Set())}
                />
              </th>
              <th className="p-3">Family</th>
              <th className="p-3">Contact</th>
              <th className="p-3">Replies</th>
              <th className="p-3 text-center" title="Show the Travel & Stay section on their wedding site">Stay</th>
              <th className="p-3">Sent</th>
              <th className="p-3 text-center">Send invites</th>
              <th className="p-3 text-center">RSVP</th>
              <th className="p-3 text-center">Edit</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <Fragment key={r.id}>
              <tr>
                <td>
                  <input type="checkbox" aria-label={`Select ${r.name}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                </td>
                <td>
                  <p className="font-medium">{r.name}</p>
                  <p className="text-xs text-neutral-500 tabular-nums">{r.members.length} {r.members.length === 1 ? "guest" : "guests"}</p>
                  {tags(r)}
                </td>
                <td className="text-neutral-600">{contact(r)}</td>
                <td>{chips(r)}</td>
                <td className="text-center">{travelBox(r)}</td>
                <td>{sentLines(r)}</td>
                <td className="whitespace-nowrap text-center">{sendIcons(r)}</td>
                <td className="text-center">{rsvpIcon(r)}</td>
                <td className="text-center">{editIcon(r)}</td>
              </tr>
              {r.possibleMatch && (
                <tr>
                  <td />
                  <td colSpan={8} className="pt-0">{lookNotice(r)}</td>
                </tr>
              )}
              </Fragment>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={9} className="p-10 text-center text-sm text-neutral-400">{empty}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}
      </fieldset>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 p-4 backdrop-blur-sm" role="alertdialog" aria-modal aria-labelledby="relink-title" aria-describedby="relink-body">
          <div className="portal-panel w-full max-w-md p-6">
            <p className="portal-eyebrow">Before you send</p>
            <h2 id="relink-title" className="mt-2 text-lg font-semibold tracking-tight">{confirm.title}</h2>
            <p id="relink-body" className="mt-3 text-sm leading-relaxed text-neutral-600">{confirm.body}</p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button type="button" className="portal-button-secondary" onClick={() => setConfirm(null)} autoFocus>Cancel</button>
              <button type="button" className="portal-button" onClick={() => { const run = confirm.run; setConfirm(null); run(); }}>{confirm.go}</button>
            </div>
          </div>
        </div>
      )}

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
          family={family}
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
