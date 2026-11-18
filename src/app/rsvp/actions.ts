"use server";
import { headers } from "next/headers";
import { getFamilyByToken, submitRsvp } from "@/lib/rsvp";
import { googleCalendarLink, icsFile, maskEmail } from "@/lib/calendar";
import { namesFor } from "@/lib/looks";
import { appOrigin } from "@/lib/origin";
import { fmtEventDate, fmtEventTime } from "@/lib/format";
import { sendCalendarEmail } from "@/lib/mailer";

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

  // the celebrations they're now coming to; the calendar file is emailed when
  // that list changes (not every time they press Send again)
  const answer = new Map(input.responses.map((r) => [r.eventId, r.status]));
  const was = before.events.filter((e) => e.rsvp?.status === "attending").map((e) => e.id).sort().join();
  const coming = before.events.filter((e) => (answer.get(e.id) ?? e.rsvp?.status) === "attending");
  const to = before.family.email?.trim();
  if (!coming.length || !looksLikeEmail(to)) return { ok: true, emailedTo: null };
  if (coming.map((e) => e.id).sort().join() === was) return { ok: true, emailedTo: maskEmail(to!) };

  const couple = namesFor(before.wedding, before.family.side === "groom" ? "groom" : "bride").couple;
  const rsvpUrl = `${await appOrigin()}/rsvp/${input.token}`;
  try {
    await sendCalendarEmail({
      to: to!, familyName: before.family.name, coupleNames: couple, rsvpUrl,
      ics: icsFile(coming, { couple, link: rsvpUrl }),
      events: coming.map((e) => ({
        name: e.name, when: `${fmtEventDate(e.startsAt)}, ${fmtEventTime(e.startsAt)}`,
        where: e.venueName, google: googleCalendarLink(e, couple),
      })),
    });
    return { ok: true, emailedTo: maskEmail(to!) };
  } catch {
    return { ok: true, emailedTo: null }; // the RSVP is saved either way; the download still works
  }
}
