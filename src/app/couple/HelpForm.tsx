"use client";

import { useRef, useState, useTransition } from "react";
import { HELP_TOPICS } from "@/lib/core/help";
import { sendHelpAction } from "./help-actions";
import { safeCall } from "@/lib/core/safe-call";

/**
 * "Need help?" — a short form in a dialog rather than a bare email address:
 * name, what it's about, the message, and (optionally) a different email to
 * reply to. It reaches our inbox with the wedding and page attached, and a
 * reply goes straight back to the person.
 */
export function HelpForm() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const open = () => { setError(null); setSent(null); dialog.current?.showModal(); };
  const close = () => dialog.current?.close();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const form = e.currentTarget;
    start(async () => {
      setError(null);
      const r = await safeCall(() => sendHelpAction({
        name: String(f.get("name") ?? ""), email: String(f.get("replyEmail") ?? ""),
        topic: String(f.get("topic") ?? ""), message: String(f.get("message") ?? ""),
        page: window.location.pathname + window.location.search,
      }));
      if (r.ok) { setSent(r.replyTo); form.reset(); } else setError(r.error);
    });
  }

  return (
    <>
      <button type="button" onClick={open} className="portal-help-button">Ask us anything →</button>
      <dialog ref={dialog} className="portal-help-dialog" aria-labelledby="help-title" onClick={(e) => { if (e.target === dialog.current) close(); }}>
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="portal-eyebrow">Need help?</p>
              <h2 id="help-title" className="mt-1 text-lg font-semibold">Write to us</h2>
              <p className="mt-1 text-sm text-neutral-500">We read every message and usually reply within a day.</p>
            </div>
            <button type="button" onClick={close} className="portal-icon-button rounded-lg" aria-label="Close">×</button>
          </div>
          {sent ? (
            <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
              Thanks — your message is on its way. We&apos;ll reply to <b>{sent}</b>.
              <div className="mt-3"><button type="button" onClick={close} className="portal-button">Done</button></div>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-5 space-y-4">
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">Your name</span>
                <input name="name" required maxLength={80} autoComplete="name" className="portal-input mt-1.5" />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">What is it about?</span>
                <select name="topic" className="portal-input mt-1.5" defaultValue={HELP_TOPICS[0]}>
                  {HELP_TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">Your message</span>
                <textarea name="message" required minLength={5} maxLength={3000} rows={5} className="portal-input mt-1.5" placeholder="Tell us what you were trying to do and what happened." />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">Reply to a different email</span>
                <span className="ml-2 text-xs text-neutral-400">optional — otherwise your sign-in email</span>
                <input name="replyEmail" type="email" maxLength={254} autoComplete="email" className="portal-input mt-1.5" />
              </label>
              {error && <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-900" role="alert">{error}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={close} className="portal-button-secondary">Cancel</button>
                <button type="submit" disabled={pending} className="portal-button">{pending ? "Sending…" : "Send message"}</button>
              </div>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}
