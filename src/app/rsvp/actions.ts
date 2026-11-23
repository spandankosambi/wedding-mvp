"use server";
import { headers } from "next/headers";
import { getFamilyByToken, submitRsvp } from "@/lib/guests/rsvp";
import { googleCalendarLink, icsFile, maskEmail } from "@/lib/email/calendar";
import { namesFor } from "@/lib/site/looks";
import { appOrigin } from "@/lib/core/origin";
import { fmtEventDate, fmtEventTime } from "@/lib/core/format";
import { calendarOrganizer, sendCalendarInvite } from "@/lib/email/mailer";

const looksLikeEmail = (s: string | null | undefined) => !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export async function submitRsvpAction(input: {
  token: string;
  responses: { eventId: string; status: "attending" | "declined"; guestIds?: string[]; headcount?: number; note?: string }[];
}): Promise<{ ok: true; emailedTo: string | null } | { ok: false; error: string }> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const before = await getFamilyByToken(input.token);
  const res = await submitRsvp(input, ip);
  if (!res.ok || !before) return res.ok ? { ok: true, emailedTo: null } : res;

  // the celebrations they're now coming to; an invitation goes out for each
  // newly accepted one, and a cancellation for each they've dropped
  const answer = new Map(input.responses.map((r) => [r.eventId, r.status]));
  const was = new Set(before.events.filter((e) => e.rsvp?.status === "attending").map((e) => e.id));
  const coming = before.events.filter((e) => (answer.get(e.id) ?? e.rsvp?.status) === "attending");
  const comingIds = new Set(coming.map((e) => e.id));
  const added = coming.filter((e) => !was.has(e.id));
  const dropped = before.events.filter((e) => was.has(e.id) && !comingIds.has(e.id));
  const to = before.family.email?.trim();
  if (!looksLikeEmail(to)) return { ok: true, emailedTo: null };
  if (!added.length && !dropped.length) return { ok: true, emailedTo: coming.length ? maskEmail(to!) : null };

  const couple = namesFor(before.wedding, before.family.side === "groom" ? "groom" : "bride").couple;
  const rsvpUrl = `${await appOrigin()}/rsvp/${input.token}`;
  const invite = (method: "REQUEST" | "CANCEL") => ({
    method, organizer: calendarOrganizer(), attendee: to!, attendeeName: before.family.name, household: before.family.id,
  });
  try {
    for (const [list, method] of [[added, "REQUEST"], [dropped, "CANCEL"]] as const) {
      for (const e of list) {
        await sendCalendarInvite({
          to: to!, familyName: before.family.name, coupleNames: couple, rsvpUrl, method,
          ics: icsFile([e], { couple, link: rsvpUrl, invite: invite(method) }),
          event: {
            name: e.name, when: `${fmtEventDate(e.startsAt, e.timeZone)}, ${fmtEventTime(e.startsAt, e.timeZone)}`,
            where: [e.venueName, e.address].filter(Boolean).join(", "), google: googleCalendarLink(e, couple),
          },
        });
      }
    }
    return { ok: true, emailedTo: coming.length ? maskEmail(to!) : null };
  } catch {
    return { ok: true, emailedTo: null }; // the RSVP is saved either way; the download still works
  }
}
