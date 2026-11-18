/*
 * Calendar entries for the celebrations a household said it's coming to:
 * one .ics file (opens in Apple Calendar, Outlook, Google Calendar…) and a
 * "Add to Google Calendar" link per celebration.
 *
 * We only know when a celebration starts, so each entry runs three hours.
 */

export type CalendarEvent = {
  id: string;
  name: string;
  startsAt: Date;
  venueName: string;
  address: string;
  mapUrl?: string | null;
  dressCode?: string | null;
};

const HOURS = 3;
const end = (d: Date) => new Date(d.getTime() + HOURS * 3600_000);

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
    e.dressCode ? `Dress: ${e.dressCode}` : "",
    e.mapUrl ? `Map: ${e.mapUrl}` : "",
    extra ?? "",
  ].filter(Boolean).join("\n");
}

export function icsFile(events: CalendarEvent[], opts: { couple: string; link?: string }) {
  const now = stamp(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//One Tap Invites//Wedding//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(opts.couple)}`,
  ];
  for (const e of events) {
    const where = [e.venueName, e.address].filter(Boolean).join(", ");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@onetapinvites.com`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(e.startsAt)}`,
      `DTEND:${stamp(end(e.startsAt))}`,
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
    dates: `${stamp(e.startsAt)}/${stamp(end(e.startsAt))}`,
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
