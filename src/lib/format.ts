import { zoneNote } from "./timezones";

const TZ = "Asia/Kolkata";

/** The day, where the celebration is (India unless the event says otherwise). */
export function fmtEventDate(d: Date, zone?: string | null): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: zone || TZ, weekday: "long", day: "numeric", month: "long",
  }).format(d);
}

/** "7:00 pm", or "7:00 pm Dubai time" for a celebration outside India. */
export function fmtEventTime(d: Date, zone?: string | null): string {
  const t = new Intl.DateTimeFormat("en-IN", {
    timeZone: zone || TZ, hour: "numeric", minute: "2-digit", hour12: true,
  }).format(d).replace(/\s?(am|pm)/i, (m) => m.toLowerCase());
  const note = zoneNote(zone);
  return note ? `${t} ${note}` : t;
}

export function fmtWeddingDate(d: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TZ, day: "numeric", month: "long", year: "numeric",
  }).format(d);
}
