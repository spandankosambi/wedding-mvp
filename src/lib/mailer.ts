import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import { render } from "@react-email/components";
import { db } from "@/db/client";
import { emailLog, outbox } from "@/db/schema";
import { InviteEmail } from "@/emails/InviteEmail";
import { BRAND, CONTACT_EMAIL, SITE_URL } from "@/lib/brand";
import { env } from "@/config/env";

type SendArgs = {
  familyId: string; to: string; familyName: string; coupleNames: string;
  rsvpUrl: string; theme: string; type: "invite" | "reminder" | "resend";
};

export const smtpConfigured = () =>
  env.email.mode === "smtp" && !!env.email.smtpUser && !!env.email.smtpPass;

function smtpTransport() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: env.email.smtpUser, pass: env.email.smtpPass },
  });
}

/**
 * Gmail pins the envelope address to the authenticated account, but the display
 * name is ours to choose — so a wedding invite arrives from "Ananya & Arjun"
 * rather than from the platform, which is what a guest expects to see in their
 * inbox. Quotes and control characters are stripped: they would break the header.
 */
export function fromHeader(displayName?: string): string | undefined {
  const configured = env.email.from;
  const address = env.email.smtpUser;
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
  to: string; subject: string; kind: "signin" | "invite" | "confirm" | "access" | "help" | "calendar" | "stay"; link?: string; html?: string; attachment?: string;
}) {
  await db.insert(outbox).values({ to: m.to, subject: m.subject, kind: m.kind, link: m.link ?? null });
  try {
    const dir = path.join(process.cwd(), "var/outbox");
    fs.mkdirSync(dir, { recursive: true });
    const at = new Date().toISOString();
    const line = m.kind === "signin" ? { to: m.to, subject: m.subject, signInUrl: m.link, at }
      : m.kind === "confirm" ? { to: m.to, subject: m.subject, confirmUrl: m.link, at }
      : m.kind === "access" ? { to: m.to, subject: m.subject, accessUrl: m.link, at }
      : m.kind === "help" ? { to: m.to, subject: m.subject, html: m.html, at }
      : m.kind === "calendar" ? { to: m.to, subject: m.subject, html: m.html, rsvpUrl: m.link, ics: m.attachment, at }
      : m.kind === "stay" ? { to: m.to, subject: m.subject, html: m.html, stay: true, at }
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

/** Logo at the top of the emails we send as the platform (not the couple's
    invitations, which come from the couple). A PNG: most mail apps block SVG. */
const emailLogo = () =>
  `<p style="margin:0 0 20px"><img src="${SITE_URL}/brand/logo-email.png" width="160" height="54" alt="${BRAND}" style="display:block;border:0"></p>`;

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
${emailLogo()}
<p>Someone signed in as ${escapeHtml(args.to)} asked to ${what} for <b>${escapeHtml(args.coupleNames)}</b>.</p>
${list}
<p><a href="${args.link}" style="display:inline-block;background:#9b1c1c;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">Review and confirm</a></p>
<p style="color:#6b6760;font-size:13px">The link works once and expires in ${args.minutes} minutes. If this wasn't you, ignore this email and nothing will change.</p>
</div>`;
  if (smtpConfigured()) {
    await smtpTransport().sendMail({ from: env.email.from, to: args.to, subject, html });
  } else {
    await recordOutbox({ to: args.to, subject, kind: "confirm", link: args.link, html });
  }
}

/** Tells someone the couple has given them a sign-in for the wedding. */
export async function sendAccessEmail(args: { to: string; coupleNames: string; link: string; what: string }) {
  const subject = `You've been added to ${args.coupleNames}'s wedding`;
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.55;color:#22201c;max-width:520px">
${emailLogo()}
<p>You&rsquo;ve been given access to <b>${escapeHtml(args.coupleNames)}</b>&rsquo;s wedding: ${escapeHtml(args.what)}.</p>
<p><a href="${args.link}" style="display:inline-block;background:#292723;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">Sign in</a></p>
<p style="color:#6b6760;font-size:13px">Sign in with this email address (${escapeHtml(args.to)}). We&rsquo;ll email you a one-time link each time; there is no password.</p>
</div>`;
  if (smtpConfigured()) {
    await smtpTransport().sendMail({ from: env.email.from, to: args.to, subject, html });
  } else {
    await recordOutbox({ to: args.to, subject, kind: "access", link: args.link, html });
  }
}

/** A "Need help?" message from the site, to our own inbox; replying goes straight to the person who wrote. */
export async function sendHelpRequest(args: {
  name: string; email: string; topic: string; message: string; page: string; wedding?: string | null; signedInAs?: string | null;
}) {
  const subject = `Help request: ${args.topic} — ${args.name}`;
  const row = (k: string, v?: string | null) => (v ? `<tr><td style="padding:2px 12px 2px 0;color:#6b6760">${k}</td><td>${escapeHtml(v)}</td></tr>` : "");
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.55;color:#22201c;max-width:560px">
${emailLogo()}
<table style="font-size:14px;margin-bottom:14px">${row("From", `${args.name} <${args.email}>`)}${row("Topic", args.topic)}${row("Wedding", args.wedding)}${row("Signed in as", args.signedInAs)}${row("Page", args.page)}</table>
<p style="white-space:pre-wrap;margin:0;padding:12px 14px;background:#f6f4ef;border-radius:8px">${escapeHtml(args.message)}</p>
</div>`;
  const to = CONTACT_EMAIL;
  if (smtpConfigured()) {
    await smtpTransport().sendMail({ from: env.email.from, to, replyTo: `${args.name} <${args.email}>`, subject, html });
  } else {
    await recordOutbox({ to, subject, kind: "help", html });
  }
}

/** The address calendar replies go to (the organiser of the invitation). */
export const calendarOrganizer = () => env.email.smtpUser || "onetapinvites@gmail.com";

/**
 * After an RSVP: one calendar invitation per celebration they're coming to.
 * Gmail, Outlook and Apple Mail show it with Yes / Maybe / No, and Yes adds
 * it to their calendar. A celebration they no longer come to is cancelled
 * the same way, which takes it off their calendar. Sent from the couple's name.
 */
export async function sendCalendarInvite(args: {
  to: string; familyName: string; coupleNames: string; rsvpUrl: string; ics: string;
  method: "REQUEST" | "CANCEL";
  event: { name: string; when: string; where: string; google: string };
}) {
  const e = args.event;
  const cancel = args.method === "CANCEL";
  const subject = cancel
    ? `Cancelled: ${e.name} · ${args.coupleNames}`
    : `Invitation: ${e.name} · ${args.coupleNames} · ${e.when}`;
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.55;color:#22201c;max-width:520px">
<p>Dear ${escapeHtml(args.familyName)},</p>
${cancel
  ? `<p>You&rsquo;ve let us know you can&rsquo;t make it to the <b>${escapeHtml(e.name)}</b>, so it&rsquo;s been taken off your calendar.</p>`
  : `<p>Thank you for your RSVP. Here&rsquo;s the <b>${escapeHtml(e.name)}</b> for your calendar:</p>
<p style="margin:12px 0;padding:12px 14px;border:1px solid #eee;border-radius:10px"><b>${escapeHtml(e.name)}</b><br><span style="color:#6b6760">${escapeHtml(e.when)}<br>${escapeHtml(e.where)}</span></p>
<p>Press <b>Yes</b> on the invitation above this message to add it to your calendar. Not seeing the buttons? Open the attached <b>invite.ics</b>, or <a href="${e.google}" style="color:#b23a26">add it to Google Calendar</a>.</p>`}
<p style="color:#6b6760;font-size:13px">Plans change? <a href="${args.rsvpUrl}">Update your RSVP</a> from the same link.</p>
</div>`;
  if (smtpConfigured()) {
    await smtpTransport().sendMail({
      from: fromHeader(args.coupleNames), to: args.to, subject, html,
      // the invitation itself, which mail apps turn into Yes / Maybe / No
      icalEvent: { method: args.method, filename: "invite.ics", content: args.ics },
    });
  } else {
    await recordOutbox({ to: args.to, subject, kind: "calendar", link: args.rsvpUrl, html, attachment: args.ics });
  }
}

/** A household's hotel, rooms and map links, from the couple. */
export async function sendStayEmail(args: {
  to: string; familyName: string; coupleNames: string; gettingThere: string;
  groups: { hotel: string; note: string; map: string | null; rooms: { room: string; names: string[] }[] }[];
}) {
  const subject = `${args.coupleNames}: where you're staying`;
  const block = (g: (typeof args.groups)[number]) => `<div style="margin:14px 0;padding:14px 16px;border:1px solid #eee;border-radius:10px">
<p style="margin:0;font-weight:600;font-size:16px">${escapeHtml(g.hotel)}</p>
${g.note ? `<p style="margin:4px 0 0;color:#6b6760;white-space:pre-wrap">${escapeHtml(g.note)}</p>` : ""}
<table style="margin-top:10px;font-size:14px;border-collapse:collapse">${g.rooms.map((r) => `<tr><td style="padding:3px 14px 3px 0;color:#6b6760;white-space:nowrap">${r.room ? `Room ${escapeHtml(r.room)}` : "Room to be confirmed"}</td><td>${escapeHtml(r.names.join(", "))}</td></tr>`).join("")}</table>
${g.map ? `<p style="margin:10px 0 0"><a href="${escapeHtml(g.map)}" style="color:#b23a26;font-weight:600">Open in Maps</a></p>` : ""}
</div>`;
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.55;color:#22201c;max-width:520px">
<p>Dear ${escapeHtml(args.familyName)},</p>
<p>Here&rsquo;s where you&rsquo;re staying for the wedding:</p>
${args.groups.map(block).join("")}
${args.gettingThere.trim() ? `<p style="margin-top:18px;font-weight:600">Getting there</p><p style="white-space:pre-wrap;margin-top:4px">${escapeHtml(args.gettingThere.trim())}</p>` : ""}
<p>See you soon!</p>
</div>`;
  if (smtpConfigured()) {
    await smtpTransport().sendMail({ from: fromHeader(args.coupleNames), to: args.to, subject, html });
  } else {
    await recordOutbox({ to: args.to, subject, kind: "stay", html });
  }
}
