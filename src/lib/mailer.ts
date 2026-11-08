import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import { render } from "@react-email/components";
import { db } from "@/db/client";
import { emailLog, outbox } from "@/db/schema";
import { InviteEmail } from "@/emails/InviteEmail";

type SendArgs = {
  familyId: string; to: string; familyName: string; coupleNames: string;
  rsvpUrl: string; theme: string; type: "invite" | "reminder" | "resend";
};

export const smtpConfigured = () =>
  process.env.EMAIL_MODE === "smtp" && !!process.env.SMTP_USER && !!process.env.SMTP_PASS;

export function smtpTransport() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

/**
 * Gmail pins the envelope address to the authenticated account, but the display
 * name is ours to choose — so a wedding invite arrives from "Ananya & Arjun"
 * rather than from the platform, which is what a guest expects to see in their
 * inbox. Quotes and control characters are stripped: they would break the header.
 */
export function fromHeader(displayName?: string): string | undefined {
  const configured = process.env.EMAIL_FROM;
  const address = process.env.SMTP_USER;
  if (!displayName || !address) return configured;
  const safe = displayName.replace(/[\r\n"\\]/g, "").trim().slice(0, 78);
  return safe ? `"${safe}" <${address}>` : configured;
}

/**
 * Where mail goes when nothing can send it: a database row (readable at
 * /admin/mailroom, works on Vercel's read-only filesystem) plus, best-effort,
 * the local outbox file that dev tooling and tests read.
 */
export async function recordOutbox(m: {
  to: string; subject: string; kind: "signin" | "invite" | "confirm"; link?: string; html?: string;
}) {
  await db.insert(outbox).values({ to: m.to, subject: m.subject, kind: m.kind, link: m.link ?? null });
  try {
    const dir = path.join(process.cwd(), "var/outbox");
    fs.mkdirSync(dir, { recursive: true });
    const at = new Date().toISOString();
    const line = m.kind === "signin" ? { to: m.to, subject: m.subject, signInUrl: m.link, at }
      : m.kind === "confirm" ? { to: m.to, subject: m.subject, confirmUrl: m.link, at }
      : { to: m.to, subject: m.subject, html: m.html, rsvpUrl: m.link, at };
    fs.appendFileSync(path.join(dir, "mail.jsonl"), JSON.stringify(line) + "\n");
  } catch {
    // read-only filesystem (Vercel) — the database row is the record
  }
}

async function deliver(to: string, subject: string, html: string, rsvpUrl: string, from?: string) {
  if (smtpConfigured()) {
    await smtpTransport().sendMail({ from, to, subject, html });
  } else {
    await recordOutbox({ to, subject, kind: "invite", link: rsvpUrl, html });
  }
}

export async function sendInvite(args: SendArgs): Promise<{ ok: boolean; error?: string }> {
  const subject = `${args.coupleNames} — you're invited! Please RSVP`;
  const html = await render(InviteEmail(args));
  try {
    await deliver(args.to, subject, html, args.rsvpUrl, fromHeader(args.coupleNames));
    await db.insert(emailLog).values({ familyId: args.familyId, type: args.type, status: "sent" });
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.insert(emailLog).values({ familyId: args.familyId, type: args.type, status: `failed: ${error}` });
    return { ok: false, error };
  }
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** The email that confirms a delete or reset. The link opens a page with one
    final button; nothing happens from opening the email or the link alone. */
export async function sendConfirmEmail(args: {
  to: string; kind: "delete" | "reset"; coupleNames: string; link: string; minutes: number; items?: string[];
}) {
  const what = args.kind === "delete" ? "delete your wedding website" : "reset parts of your wedding website";
  const subject = args.kind === "delete"
    ? `Confirm: delete ${args.coupleNames}'s wedding website`
    : `Confirm: reset ${args.coupleNames}'s wedding website`;
  const list = args.kind === "delete"
    ? "<p>This removes the website, every event, guest, RSVP and photo, and every login for this wedding, including yours. It can't be undone.</p>"
    : `<p>These will be erased:</p><ul>${(args.items ?? []).map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul><p>It can't be undone.</p>`;
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.55;color:#22201c;max-width:520px">
<p>Someone signed in as ${escapeHtml(args.to)} asked to ${what} for <b>${escapeHtml(args.coupleNames)}</b>.</p>
${list}
<p><a href="${args.link}" style="display:inline-block;background:#9b1c1c;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">Review and confirm</a></p>
<p style="color:#6b6760;font-size:13px">The link works once and expires in ${args.minutes} minutes. If this wasn't you, ignore this email and nothing will change.</p>
</div>`;
  if (smtpConfigured()) {
    await smtpTransport().sendMail({ from: process.env.EMAIL_FROM, to: args.to, subject, html });
  } else {
    await recordOutbox({ to: args.to, subject, kind: "confirm", link: args.link, html });
  }
}
