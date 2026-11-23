import type { RsvpPerson } from "@/lib/guests/contacts";

/*
 * The example wedding on the landing page ("Open a real wedding"): Ananya &
 * Arjun. Visitors should always see a wedding that's coming up, so its dates
 * move with the calendar, and no real person's number is shown on it.
 */
export const SAMPLE_SLUG = "ananya-weds-arjun";
const SAMPLE_DAYS_AHEAD = 60;
export const SAMPLE_PHONE = "+91 XXXXX XXXXX";
/** the sample's replies close this many days before the wedding */
const SAMPLE_REPLY_BY_DAYS = 30;
const DAY = 86_400_000;

export const isSample = (slug: string | null | undefined) => slug === SAMPLE_SLUG;

/** Whole days to move the sample by, so its wedding day is 60 days from `now` (times of day kept). */
export function sampleShift(weddingDate: Date, now = new Date()): number {
  return Math.round((now.getTime() + SAMPLE_DAYS_AHEAD * DAY - weddingDate.getTime()) / DAY) * DAY;
}

const move = (d: Date | null, by: number) => (d ? new Date(d.getTime() + by) : d);

/** The sample's wedding and events, moved so the wedding is 60 days away; any other wedding as it is. */
export function asSampleDates<W extends { slug: string; weddingDate: Date; rsvpDeadline: Date | null }, E extends { startsAt: Date }>(
  w: W, evs: E[], now = new Date(),
): { wedding: W; events: E[] } {
  if (!isSample(w.slug)) return { wedding: w, events: evs };
  const by = sampleShift(w.weddingDate, now);
  const weddingDate = new Date(w.weddingDate.getTime() + by);
  return {
    wedding: { ...w, weddingDate, rsvpDeadline: w.rsvpDeadline ? new Date(weddingDate.getTime() - SAMPLE_REPLY_BY_DAYS * DAY) : null },
    events: evs.map((e) => ({ ...e, startsAt: move(e.startsAt, by)! })),
  };
}

/** A reply-by date for the sample, kept a month before its (moved) wedding day. */
export function sampleReplyBy(weddingDate: Date, had: Date | null): Date | null {
  return had ? new Date(weddingDate.getTime() - SAMPLE_REPLY_BY_DAYS * DAY) : null;
}

/** The sample's RSVP contacts, with a placeholder in place of each number. */
export const sampleContacts = (cs: RsvpPerson[]): RsvpPerson[] => cs.map((c) => ({ ...c, phone: SAMPLE_PHONE }));
