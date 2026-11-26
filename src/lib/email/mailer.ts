import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import { render } from "@react-email/components";
import { db } from "@/db/client";
import { and, asc, count, eq, gt } from "drizzle-orm";
import { emailLog, outbox, type QueuedMail } from "@/db/schema";
import { InviteEmail } from "@/emails/InviteEmail";
import { BRAND, CONTACT_EMAIL, SITE_URL } from "@/lib/core/brand";
import { env } from "@/config/env";

type SendArgs = {
  familyId: string; to: string; familyName: string; coupleNames: string;
  rsvpUrl: string; theme: string; type: "invite" | "reminder" | "resend";
};

export const smtpConfigured = () =>
  env.email.mode === "smtp" && !!env.email.smtpUser && !!env.email.smtpPass;

/** The mail server, from settings only (see src/config/env.ts). Sign-in links use it too. */
export function smtpServer() {
  const auth = { user: env.email.smtpUser, pass: env.email.smtpPass };
  return env.email.smtpHost
    ? { host: env.email.smtpHost, port: env.email.smtpPort, secure: env.email.smtpSecure, auth }
    : { service: env.email.smtpService, auth };
}

function smtpTransport() {
  return nodemailer.createTransport(smtpServer());
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
async function recordOutbox(m: {
  to: string; subject: string; kind: Kind; link?: string; html?: string; attachment?: string;
}) {
  await db.insert(outbox).values({ to: m.to, subject: m.subject, kind: m.kind, link: m.link ?? null, status: "recorded", sentAt: new Date() });
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

/* ── The daily email budget ─────────────────────────────────────────────
   Every email, real or recorded, is a row in the outbox with the time it went
   out. Sign-in links may use the whole budget; everything else stops 50
   short of it, so people can always sign in. Past that, mail that can wait
   (invitations, reminders, stay details, calendar invitations, access and
   help emails) is queued and sent later from /admin; a confirmation link,
   which expires in minutes, fails with a clear message instead. */

export const SIGNIN_RESERVE = 50;
type Kind = "signin" | "invite" | "confirm" | "access" | "help" | "calendar" | "stay" | "rishta";
const CAN_WAIT = new Set<Kind>(["invite", "calendar", "stay", "access", "help"]);

/** The daily email allowance is used up for this kind of email. */
export class EmailBudgetError extends Error {
  constructor() { super("daily email budget reached"); }
}

/** Emails sent (or recorded) in the last 24 hours. */
export async function sentToday(): Promise<number> {
  const [r] = await db.select({ n: count() }).from(outbox).where(gt(outbox.sentAt, new Date(Date.now() - 86_400_000)));
  return Number(r?.n ?? 0);
}

const roomFor = (kind: Kind) => (kind === "signin" ? env.email.dailyBudget : env.email.dailyBudget - SIGNIN_RESERVE);

type Mail = { kind: Kind; to: string; subject: string; link?: string; attachment?: string } & QueuedMail;

async function deliverNow(m: Mail) {
  if (smtpConfigured()) {
    await smtpTransport().sendMail({ from: m.from, to: m.to, subject: m.subject, html: m.html, replyTo: m.replyTo, icalEvent: m.icalEvent });
    // a real send keeps no link: the database never holds a working sign-in or RSVP link
    await db.insert(outbox).values({ to: m.to, subject: m.subject, kind: m.kind, status: "sent", sentAt: new Date() });
  } else {
    await recordOutbox({ to: m.to, subject: m.subject, kind: m.kind, link: m.link, html: m.html, attachment: m.attachment ?? m.icalEvent?.content });
  }
}

/** Send now if the budget allows; otherwise queue it (or, for mail that can't wait, throw). */
async function dispatch(m: Mail): Promise<"sent" | "queued"> {
  if (await sentToday() < roomFor(m.kind)) {
    await deliverNow(m);
    return "sent";
  }
  if (!CAN_WAIT.has(m.kind)) throw new EmailBudgetError();
  await db.insert(outbox).values({
    to: m.to, subject: m.subject, kind: m.kind, link: m.link ?? null, status: "queued",
    payload: { from: m.from, html: m.html, replyTo: m.replyTo, icalEvent: m.icalEvent, log: m.log },
  });
  return "queued";
}

/** A sign-in link. Auth.js renders it; this checks the budget and records it. */
export async function sendSignInLink(to: string, url: string, viaSmtp: () => Promise<void>) {
  if (await sentToday() >= roomFor("signin")) throw new EmailBudgetError();
  if (smtpConfigured()) {
    await viaSmtp();
    await db.insert(outbox).values({ to, subject: "Sign in", kind: "signin", status: "sent", sentAt: new Date() });
  } else {
    await recordOutbox({ to, subject: "Sign in", kind: "signin", link: url });
  }
}

/** Send what's queued, oldest first, while the budget allows. */
export async function sendQueued(max = 100): Promise<{ sent: number; left: number }> {
  const waiting = await db.select().from(outbox).where(eq(outbox.status, "queued")).orderBy(asc(outbox.at)).limit(max);
  let sent = 0;
  for (const row of waiting) {
    if (await sentToday() >= roomFor("invite")) break;
    // claim it first, so two people pressing the button can't send it twice
    const [mine] = await db.update(outbox).set({ status: "sending" }).where(and(eq(outbox.id, row.id), eq(outbox.status, "queued"))).returning();
    if (!mine || !row.payload) continue;
    const p = row.payload;
    try {
      if (smtpConfigured()) {
        await smtpTransport().sendMail({ from: p.from, to: row.to, subject: row.subject, html: p.html, replyTo: p.replyTo, icalEvent: p.icalEvent });
      } else {
        await recordOutbox({ to: row.to, subject: row.subject, kind: row.kind as Kind, link: row.link ?? undefined, html: p.html });
      }
    } catch (e) {
      await db.update(outbox).set({ status: "queued" }).where(eq(outbox.id, row.id));
      console.error("[mail] a queued email failed to send:", e instanceof Error ? e.message : e);
      continue;
    }
    if (smtpConfigured()) {
      await db.update(outbox).set({ status: "sent", sentAt: new Date(), payload: null, link: null }).where(eq(outbox.id, row.id));
    } else {
      await db.delete(outbox).where(eq(outbox.id, row.id)); // recordOutbox wrote its own row
    }
    if (p.log) {
      await db.insert(emailLog).values({ familyId: p.log.familyId, type: p.log.type, status: "sent" }).catch(() => { /* household since removed */ });
    }
    sent += 1;
  }
  const [r] = await db.select({ n: count() }).from(outbox).where(eq(outbox.status, "queued"));
  return { sent, left: Number(r?.n ?? 0) };
}

export async function sendInvite(args: SendArgs): Promise<{ ok: boolean; queued?: boolean; error?: string }> {
  const subject = `${args.coupleNames} — you're invited! Please RSVP`;
  const html = await render(InviteEmail(args));
  try {
    const how = await dispatch({
      kind: "invite", to: args.to, subject, html, link: args.rsvpUrl, from: fromHeader(args.coupleNames),
      log: { familyId: args.familyId, type: args.type },
    });
    await db.insert(emailLog).values({ familyId: args.familyId, type: args.type, status: how });
    return how === "queued" ? { ok: true, queued: true } : { ok: true };
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
  await dispatch({ kind: "confirm", to: args.to, subject, html, link: args.link, from: env.email.from });
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
  return dispatch({ kind: "access", to: args.to, subject, html, link: args.link, from: env.email.from });
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
  return dispatch({ kind: "help", to, subject, html, from: env.email.from, replyTo: `${args.name} <${args.email}>` });
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
  return dispatch({
    kind: "calendar", to: args.to, subject, html, link: args.rsvpUrl, from: fromHeader(args.coupleNames),
    // the invitation itself, which mail apps turn into Yes / Maybe / No
    icalEvent: { method: args.method, filename: "invite.ics", content: args.ics },
  });
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
  return dispatch({ kind: "stay", to: args.to, subject, html, from: fromHeader(args.coupleNames) });
}

/* ── Rishta Corner. Time-critical, so never queued: past the budget they fail
   with a clear message (see dispatch). Everything typed is escaped. ─────── */

const rishtaShell = (body: string) => `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.55;color:#22201c;max-width:520px">
${emailLogo()}
${body}
<p style="color:#6b6760;font-size:13px">Rishta Corner is for matrimonial introductions only, not a dating service. One Tap Invites does not verify profile information.</p>
</div>`;

/** To the single: your family started a profile for you; open it to check and publish. */
export async function sendRishtaLink(args: { to: string; firstName: string; coupleNames: string; link: string }) {
  const subject = `${args.firstName}, a Rishta Corner profile is waiting for you`;
  const html = rishtaShell(`<p>Hi ${escapeHtml(args.firstName)},</p>
<p>Your family started a profile for you in <b>Rishta Corner</b> at ${escapeHtml(args.coupleNames)}'s wedding: a private place where singles invited to the wedding can be introduced, with their families.</p>
<p>Nobody can see it until <b>you</b> check it, change anything you like, and publish it. If you'd rather not, just ignore this email or delete the draft from the page.</p>
<p><a href="${args.link}" style="display:inline-block;background:#292723;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">Open my profile</a></p>
<p style="color:#6b6760;font-size:13px">This link is only for you. Please don't forward it.</p>`);
  // the link is kept only in local test mode; a real send stores no link (see deliverNow)
  await dispatch({ kind: "rishta", to: args.to, subject, html, link: args.link, from: env.email.from });
}

/** The 6-digit passcode that proves the single is the one opening their page. */
export async function sendRishtaCode(args: { to: string; code: string; minutes: number }) {
  // the code stays out of the subject: subjects are kept in the email log
  const subject = "Your Rishta Corner code";
  const html = rishtaShell(`<p>Your code is</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:8px 0">${escapeHtml(args.code)}</p>
<p>It works for ${args.minutes} minutes. If you didn't ask for it, ignore this email: nobody can open your profile without it.</p>`);
  await dispatch({ kind: "rishta", to: args.to, subject, html, from: env.email.from });
}
