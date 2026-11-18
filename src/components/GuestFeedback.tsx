"use client";

import { useRef, useState, useTransition } from "react";
import { GUEST_TOPICS } from "@/lib/help";
import { sendGuestFeedbackAction } from "@/app/feedback-actions";

/**
 * "Questions or feedback? Contact us" at the foot of an invitation: opens a
 * short form that reaches One Tap Invites (not the couple). A reply goes back
 * to the email they give.
 */
export function GuestFeedback() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const open = () => { setError(null); setSent(null); dialog.current?.showModal(); };
  const close = () => dialog.current?.close();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    start(async () => {
      setError(null);
      const r = await sendGuestFeedbackAction({
        name: String(f.get("name") ?? ""), email: String(f.get("email") ?? ""),
        topic: String(f.get("topic") ?? ""), message: String(f.get("message") ?? ""),
        website: String(f.get("website") ?? ""),
        page: window.location.pathname + window.location.search,
      });
      if (r.ok) { setSent(r.replyTo); form.reset(); } else setError(r.error);
    });
  }

  return (
    <>
      <button type="button" onClick={open} className="underline underline-offset-4" data-testid="guest-feedback-open">
        Questions or feedback? Contact us
      </button>
      <dialog ref={dialog} className="portal-help-dialog text-left" aria-labelledby="feedback-title"
        onClick={(e) => { if (e.target === dialog.current) close(); }}
        style={{ color: "#22201c", fontFamily: "var(--font-inter), system-ui, sans-serif" }}>
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="portal-eyebrow">One Tap Invites</p>
              <h2 id="feedback-title" className="mt-1 text-lg font-semibold">Questions or feedback?</h2>
              <p className="mt-1 text-sm text-neutral-500">This reaches the One Tap Invites team, not the couple. We usually reply within a day.</p>
            </div>
            <button type="button" onClick={close} className="portal-icon-button rounded-lg" aria-label="Close">×</button>
          </div>
          {sent !== null ? (
            <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
              Thank you — your message is on its way.{sent && <> We&apos;ll reply to <b>{sent}</b>.</>}
              <div className="mt-3"><button type="button" onClick={close} className="portal-button">Done</button></div>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-neutral-600">Your name</span>
                  <input name="name" required maxLength={80} autoComplete="name" className="portal-input mt-1.5" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-neutral-600">Your email</span>
                  <input name="email" type="email" required maxLength={254} autoComplete="email" className="portal-input mt-1.5" />
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">What is it about?</span>
                <select name="topic" className="portal-input mt-1.5" defaultValue={GUEST_TOPICS[0]}>
                  {GUEST_TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">Your message</span>
                <textarea name="message" required minLength={5} maxLength={3000} rows={5} className="portal-input mt-1.5" />
              </label>
              {/* a trap for bots: hidden from people and screen readers */}
              <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />
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
