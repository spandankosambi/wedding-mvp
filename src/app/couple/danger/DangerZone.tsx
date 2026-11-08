"use client";

import { useState, useTransition } from "react";
import type { ResetScope } from "@/db/schema";
import { requestDeleteWedding, requestResetWedding } from "./actions";

const RESET_OPTIONS: { key: keyof ResetScope; label: string; hint: string }[] = [
  { key: "guests", label: "Guest list", hint: "Every family and guest, their invitations and replies" },
  { key: "rsvps", label: "RSVP answers only", hint: "Clears every reply but keeps the guest list" },
  { key: "events", label: "Celebrations", hint: "Back to just the wedding day" },
  { key: "photos", label: "Gallery photos", hint: "Removes every uploaded photo" },
  { key: "content", label: "Site text and look", hint: "Story, tagline, parents, travel, hashtag, contact, theme, RSVP settings" },
  { key: "committee", label: "Committee logins", hint: "Everyone else who can sign in to this wedding" },
];

const NONE: ResetScope = { guests: false, rsvps: false, events: false, photos: false, content: false, committee: false };

type Sent = { email: string; minutes: number; kind: "delete" | "reset" };

export function DangerZone({ coupleNames }: { coupleNames: string }) {
  const [scope, setScope] = useState<ResetScope>(NONE);
  const [confirming, setConfirming] = useState<"reset" | "delete" | null>(null);
  const [understood, setUnderstood] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const chosen = RESET_OPTIONS.filter((o) => scope[o.key] || (o.key === "rsvps" && scope.guests));
  const any = chosen.length > 0;

  function send(kind: "reset" | "delete") {
    setError(null);
    startTransition(async () => {
      const r = kind === "delete" ? await requestDeleteWedding() : await requestResetWedding(scope);
      if (r.ok) { setSent({ email: r.email, minutes: r.minutes, kind }); setConfirming(null); setUnderstood(false); }
      else setError(r.error);
    });
  }

  if (sent) {
    return (
      <section id="danger" className="portal-panel p-6" aria-live="polite">
        <p className="portal-eyebrow">Check your email</p>
        <h2 className="mt-1 font-semibold">We&apos;ve sent a confirmation link to {sent.email}</h2>
        <p className="mt-2 text-sm text-neutral-600">
          Open it and press the final button to {sent.kind === "delete" ? "delete the website" : "reset the parts you chose"}.
          The link works once and expires in {sent.minutes} minutes. Nothing changes until then.
        </p>
        <button type="button" onClick={() => setSent(null)} className="portal-button-secondary mt-4">Done</button>
      </section>
    );
  }

  return (
    <section id="danger" className="portal-panel p-6" style={{ borderColor: "#ecc9c4" }}>
      <p className="portal-eyebrow" style={{ color: "#9b1c1c" }}>Danger zone</p>
      <h2 className="mt-1 font-semibold">Reset or delete</h2>
      <p className="mt-1 text-sm text-neutral-500">Both need a confirmation link we email to your login address, so nobody can do this from your laptop alone.</p>

      {/* ── Reset ─────────────────────────────── */}
      <div className="mt-6 rounded-xl border border-neutral-200 p-4">
        <p className="font-medium">Reset</p>
        <p className="mt-1 text-sm text-neutral-500">Start parts of the site again. Your login, names, wedding date, city and web address always stay.</p>
        <fieldset className="mt-4 grid gap-3 sm:grid-cols-2">
          <legend className="sr-only">What to reset</legend>
          {RESET_OPTIONS.map((o) => {
            const implied = o.key === "rsvps" && scope.guests;
            return (
              <label key={o.key} className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={scope[o.key] || implied}
                  disabled={implied || pending}
                  onChange={(e) => { setScope((s) => ({ ...s, [o.key]: e.target.checked })); setConfirming(null); }}
                />
                <span>
                  <span className="font-medium">{o.label}</span>
                  <span className="block text-xs text-neutral-500">{implied ? "Included with the guest list" : o.hint}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
        {confirming === "reset" ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alertdialog" aria-labelledby="reset-q">
            <p id="reset-q" className="font-medium">Reset {chosen.length} part{chosen.length === 1 ? "" : "s"} of {coupleNames}&apos;s site?</p>
            <ul className="mt-2 list-disc pl-5">{chosen.map((o) => <li key={o.key}>{o.label}</li>)}</ul>
            <p className="mt-2">We&apos;ll email you a link to confirm. This can&apos;t be undone once confirmed.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => send("reset")} disabled={pending} className="portal-button disabled:opacity-40" style={{ background: "#9b1c1c" }}>
                {pending ? "Sending…" : "Email me the confirmation link"}
              </button>
              <button type="button" onClick={() => setConfirming(null)} disabled={pending} className="portal-button-secondary">Cancel</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming("reset")} disabled={!any || pending} className="portal-button-secondary mt-4 disabled:opacity-40" style={{ color: "#b91c1c" }}>
            Reset selected…
          </button>
        )}
      </div>

      {/* ── Delete ────────────────────────────── */}
      <div className="mt-4 rounded-xl border border-neutral-200 p-4">
        <p className="font-medium">Delete wedding website</p>
        <p className="mt-1 text-sm text-neutral-500">Removes the site, every guest, RSVP and photo, and every login for this wedding, including yours.</p>
        {confirming === "delete" ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alertdialog" aria-labelledby="delete-q">
            <p id="delete-q" className="font-medium">Delete {coupleNames}&apos;s wedding website for good?</p>
            <p className="mt-1">Guests with the link will see nothing, and you&apos;ll be signed out everywhere. We&apos;ll email you a link to confirm.</p>
            <label className="mt-3 flex items-start gap-2">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
              <span>I understand this can&apos;t be undone</span>
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => send("delete")} disabled={!understood || pending} className="portal-button disabled:opacity-40" style={{ background: "#9b1c1c" }}>
                {pending ? "Sending…" : "Email me the confirmation link"}
              </button>
              <button type="button" onClick={() => { setConfirming(null); setUnderstood(false); }} disabled={pending} className="portal-button-secondary">Cancel</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming("delete")} disabled={pending} className="portal-button-secondary mt-4" style={{ color: "#b91c1c" }}>
            Delete wedding website…
          </button>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-red-700" role="alert">{error}</p>}
    </section>
  );
}
