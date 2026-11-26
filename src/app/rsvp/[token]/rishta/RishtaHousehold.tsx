"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { safeCall } from "@/lib/core/safe-call";
import { BLANK, ProfileFields, formFields, type ProfileValues } from "@/app/rishta/ProfileFields";
import { deleteRishtaDraftAction, saveRishtaDraftAction, sendRishtaLinkAction } from "./actions";

/*
 * A household's drafts: start a profile for someone single in the family and
 * send it to them. Once they've opened it with their passcode it's theirs:
 * the household sees only where it stands.
 */

export type DraftRow = ProfileValues & { id: string; email: string; sent: boolean; opened: boolean; status: "draft" | "pending" | "live" | "removed" };

function where(d: DraftRow): string {
  if (d.status === "live") return `${d.firstName}'s profile is live.`;
  if (d.status === "pending") return `${d.firstName} has published it; the couple is taking a look.`;
  if (d.status === "removed") return "The couple removed this profile.";
  if (d.opened) return `${d.firstName} has opened it. It's theirs to change and publish now.`;
  if (d.sent) return `Sent to ${d.email}. Waiting for ${d.firstName} to open it.`;
  return "Not sent yet.";
}

export function RishtaHousehold({ token, drafts }: { token: string; drafts: DraftRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(drafts.length ? null : "new");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [asking, setAsking] = useState<string | null>(null); // delete, confirming
  const [busy, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const current = editing && editing !== "new" ? drafts.find((d) => d.id === editing) : null;

  const save = (send: boolean) => {
    const f = form.current;
    if (!f || !f.reportValidity()) return;
    const fields = formFields(f);
    start(async () => {
      const r = await safeCall(() => saveRishtaDraftAction(token, fields, current?.id ?? null, send));
      if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
      setMsg({ ok: true, text: r.sent ? `Sent. ${String(fields.firstName)} will get an email with their own link.` : "Saved. You can send it whenever you're ready." });
      setEditing(null);
      router.refresh();
    });
  };
  const resend = (d: DraftRow) => start(async () => {
    const r = await safeCall(() => sendRishtaLinkAction(token, d.id));
    setMsg(r.ok ? { ok: true, text: `Sent again to ${d.email}. The earlier link no longer works.` } : { ok: false, text: r.error });
    router.refresh();
  });
  const remove = (d: DraftRow) => start(async () => {
    const r = await safeCall(() => deleteRishtaDraftAction(token, d.id));
    setAsking(null);
    setMsg(r.ok ? { ok: true, text: `${d.firstName}'s draft is deleted.` } : { ok: false, text: r.error });
    router.refresh();
  });

  return (
    <div className="mt-10 grid gap-5">
      {msg && <p className="r-alert" role={msg.ok ? "status" : "alert"}>{msg.text}</p>}

      {drafts.map((d) => (
        <section key={d.id} className="r-card" aria-label={d.firstName}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-2xl break-words" style={{ overflowWrap: "anywhere" }}>{d.firstName}</h2>
            <span className="r-note">{d.email}</span>
          </div>
          <p className="mt-2 text-sm" style={{ color: "var(--ink-soft)" }}>{where(d)}</p>
          {!d.opened && editing !== d.id && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="r-btn" disabled={busy} onClick={() => resend(d)}>{d.sent ? "Send again" : `Send to ${d.firstName}`}</button>
              <button type="button" className="r-btn-quiet" disabled={busy} onClick={() => { setMsg(null); setEditing(d.id); }}>Edit</button>
              {asking === d.id ? (
                <span className="flex flex-wrap items-center gap-2">
                  <button type="button" className="r-btn-quiet" disabled={busy} onClick={() => remove(d)}>Yes, delete</button>
                  <button type="button" className="r-btn-quiet" onClick={() => setAsking(null)}>Keep it</button>
                </span>
              ) : (
                <button type="button" className="r-btn-quiet" onClick={() => setAsking(d.id)}>Delete</button>
              )}
            </div>
          )}
        </section>
      ))}

      {editing ? (
        <form ref={form} key={editing} className="r-card" onSubmit={(e) => { e.preventDefault(); save(true); }} noValidate={false}>
          <h2 className="font-display text-2xl">{current ? `Edit ${current.firstName}'s draft` : "Someone single in your family"}</h2>
          <p className="r-note mt-2">
            Fill in what you know. They&apos;ll get their own link, check every word, add photos and decide whether to publish. Nothing is shown to anyone until they do.
          </p>
          <div className="mt-6"><ProfileFields v={current ?? BLANK} /></div>
          <label className="mt-5 block">
            <span className="r-label">Their own email address</span>
            <input name="email" type="email" inputMode="email" autoComplete="off" required maxLength={200} defaultValue={current?.email ?? ""} className="r-input" placeholder="name@gmail.com" />
            <span className="r-note mt-1 block">Theirs, not yours: the passcode to open the profile goes here.</span>
          </label>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button type="submit" className="r-btn" disabled={busy}>{busy ? "Sending…" : "Save and send to them"}</button>
            <button type="button" className="r-btn-quiet" disabled={busy} onClick={() => save(false)}>Save for later</button>
            {drafts.length > 0 && <button type="button" className="r-btn-quiet" onClick={() => setEditing(null)}>Cancel</button>}
          </div>
        </form>
      ) : (
        <button type="button" className="r-btn-quiet justify-self-start" onClick={() => { setMsg(null); setEditing("new"); }}>Add someone else</button>
      )}
    </div>
  );
}
