import { fmtEventDate, fmtEventTime } from "@/lib/core/format";
/*
 * Calendar entries for the celebrations a household said it's coming to:
 * one .ics file (opens in Apple Calendar, Outlook, Google Calendar…) and a
 * "Add to Google Calendar" link per celebration.
 *
 * Each entry runs for the celebration's duration (3 hours unless the couple
 * set another).
 *
 * Two kinds of file: a plain one to download (PUBLISH), and an invitation
 * (REQUEST) for email, which Gmail, Outlook and Apple Mail show with
 * Yes / Maybe / No buttons that add it to the guest's calendar.
 */

type CalendarEvent = {
  id: string;
  name: string;
  startsAt: Date;
  venueName: string;
  address: string;
  mapUrl?: string | null;
  dressCode?: string | null;
  /** how long it runs; unset = 3 hours */
  durationMinutes?: number | null;
  /** where it happens; times in calendars are exact moments, this just says it in local words */
  timeZone?: string | null;
};

const end = (e: Pick<CalendarEvent, "startsAt" | "durationMinutes">) =>
  new Date(e.startsAt.getTime() + (e.durationMinutes || 180) * 60_000);

/** 20270303T083000Z */
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** commas, semicolons and line breaks are special in .ics text */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");

/** .ics lines are folded at 75 bytes */
function fold(line: string) {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ""; bytes = 0; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

function details(e: CalendarEvent, extra?: string) {
  return [
    `${fmtEventDate(e.startsAt, e.timeZone)}, ${fmtEventTime(e.startsAt, e.timeZone)}${e.timeZone && e.timeZone !== "Asia/Kolkata" ? "" : " (India time)"}`,
    e.dressCode ? `Dress: ${e.dressCode}` : "",
    e.mapUrl ? `Map: ${e.mapUrl}` : "",
    extra ?? "",
  ].filter(Boolean).join("\n");
}

/** a name inside a calendar property: quoted, no characters that break it */
const cn = (s: string) => `"${s.replace(/["\r\n;:,]/g, " ").trim().slice(0, 80)}"`;

export function icsFile(events: CalendarEvent[], opts: {
  couple: string; link?: string;
  /** an email invitation: the household is invited, replies go to the organiser */
  invite?: { method: "REQUEST" | "CANCEL"; organizer: string; attendee: string; attendeeName: string; household: string };
}) {
  const now = stamp(new Date());
  const inv = opts.invite;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//One Tap Invites//Wedding//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${inv?.method ?? "PUBLISH"}`,
    `X-WR-CALNAME:${esc(opts.couple)}`,
  ];
  for (const e of events) {
    const where = [e.venueName, e.address].filter(Boolean).join(", ");
    lines.push(
      "BEGIN:VEVENT",
      // per household for invitations, so a later change or cancel finds the same entry
      `UID:${e.id}${inv ? `-${inv.household}` : ""}@onetapinvites.com`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(e.startsAt)}`,
      `DTEND:${stamp(end(e))}`,
      ...(inv ? [
        // each send is newer than the last
        `SEQUENCE:${Math.floor(Date.now() / 1000)}`,
        `STATUS:${inv.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
        `ORGANIZER;CN=${cn(opts.couple)}:mailto:${inv.organizer}`,
        `ATTENDEE;CN=${cn(inv.attendeeName)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${inv.attendee}`,
      ] : []),
      `SUMMARY:${esc(`${e.name} · ${opts.couple}`)}`,
      `LOCATION:${esc(where)}`,
      `DESCRIPTION:${esc(details(e, opts.link ? `Your RSVP: ${opts.link}` : ""))}`,
      ...(opts.link ? [`URL:${opts.link}`] : []),
      // a reminder the day before
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.name)} tomorrow`, "TRIGGER:-P1D", "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function googleCalendarLink(e: CalendarEvent, couple: string) {
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: `${e.name} · ${couple}`,
    dates: `${stamp(e.startsAt)}/${stamp(end(e))}`,
    location: [e.venueName, e.address].filter(Boolean).join(", "),
    details: details(e),
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

/** "sp•••••@gmail.com": enough for someone to recognise their own address */
export function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  if (!domain) return email;
  const keep = user.length <= 2 ? 1 : 2;
  return `${user.slice(0, keep)}${"•".repeat(Math.max(user.length - keep, 3))}@${domain}`;
}
