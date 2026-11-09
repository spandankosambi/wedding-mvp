import { eventForSide, type Side } from "@/lib/sides";
import { fmtEventTime, fmtWeddingDate } from "@/lib/format";
import type { InvitationOptions } from "./options";

/**
 * The words on the printed cards, decided separately from how they're drawn
 * so they can be checked on their own. Follows the traditional Indian card:
 * an invocation, the hosting family "requesting the pleasure of your company"
 * at the wedding of their daughter/son, the couple, the date and city — and
 * the celebrations on the back or on one card each, with RSVP contacts and
 * "with best compliments from".
 */

export type CardEvent = {
  id: string; name: string; side: Side; startsAt: Date; venueName: string; address: string;
  dressCode: string | null; isPublished: boolean; sortOrder: number;
};
export type CardWedding = {
  brideName: string; groomName: string; weddingDate: Date; city: string | null; rsvpDeadline: Date | null;
};

/** A line of wording; `name` lines (people) are set upright, phrases in italic. */
export type Line = { t: string; name?: boolean };

export type FrontCard = {
  invocation: string | null;
  /** lines above the names: hosts, the request */
  lead: Line[];
  first: string; joiner: string; second: string;
  /** "son of …" under the second name */
  secondOf: string | null;
  /** lines after the names */
  after: Line[];
  date: string;
  place: string | null;
  /** separate layout: the event cards are enclosed */
  enclosed: string | null;
};

export type EventCard = {
  id: string; name: string; sideLabel: string | null;
  date: string; time: string; venue: string; address: string; dressCode: string | null;
};

export type InsertCard = { invocation: string | null; hosts: string; request: string; event: EventCard; occasion: string; couple: string };

export type Details = {
  rsvp: string[];
  replyBy: string | null;
  compliments: string[];
  note: string | null;
  qrUrl: string | null;
};

export type Invitation = {
  front: FrontCard;
  /** the back of the invitation: the events (together layout) and the details */
  back: { events: EventCard[]; details: Details };
  inserts: InsertCard[];
};

const TZ = "Asia/Kolkata";
export const fmtCardDate = (d: Date) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);

const phrase = (t: string): Line => ({ t });
const named = (t: string): Line => ({ t, name: true });
const lines = (s: string) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

/** The events a version of the card shows: the couple's pick if they made
    one, else every event on the site that's open to that side. */
export function eventsFor(all: CardEvent[], o: Pick<InvitationOptions, "version" | "eventIds">): CardEvent[] {
  const sorted = [...all].sort((a, b) => a.sortOrder - b.sortOrder);
  if (o.eventIds) return sorted.filter((e) => o.eventIds!.includes(e.id));
  return sorted.filter((e) => e.isPublished && eventForSide(e.side, o.version));
}

export function buildInvitation(w: CardWedding, all: CardEvent[], o: InvitationOptions, siteUrl: string): Invitation {
  const bride = w.brideName, groom = w.groomName;
  const bp = o.brideParents || null, gp = o.groomParents || null;
  const invocation = o.invocation || null;

  let front: FrontCard;
  if (o.version === "bride") {
    front = {
      invocation, lead: [named(bp ?? `The family of ${bride}`), phrase("request the pleasure of your company"), phrase("at the wedding of their daughter")],
      first: bride, joiner: "with", second: groom, secondOf: gp ? `son of ${gp}` : null, after: [],
      date: "", place: null, enclosed: null,
    };
  } else if (o.version === "groom") {
    front = {
      invocation, lead: [named(gp ?? `The family of ${groom}`), phrase("request the pleasure of your company"), phrase("at the wedding of their son")],
      first: groom, joiner: "with", second: bride, secondOf: bp ? `daughter of ${bp}` : null, after: [],
      date: "", place: null, enclosed: null,
    };
  } else {
    const blessings = bp && gp ? [phrase("With the blessings of"), named(bp), phrase("and"), named(gp)]
      : bp || gp ? [phrase("With the blessings of"), named((bp ?? gp)!)] : [];
    front = {
      invocation, lead: [...blessings, phrase("together with their families")],
      first: bride, joiner: "&", second: groom, secondOf: null,
      after: [phrase("request the pleasure of your company"), phrase("at their wedding")],
      date: "", place: null, enclosed: null,
    };
  }
  front.date = fmtWeddingDate(w.weddingDate);
  front.place = w.city;

  const events: EventCard[] = eventsFor(all, o).map((e) => ({
    id: e.id, name: e.name,
    sideLabel: e.side === "both" || o.version !== "both" ? null : e.side === "bride" ? "Bride's side" : "Groom's side",
    date: fmtCardDate(e.startsAt), time: fmtEventTime(e.startsAt),
    venue: e.venueName, address: e.address, dressCode: o.dressCode ? e.dressCode : null,
  }));

  const separate = o.eventLayout === "separate" && events.length > 0;
  if (separate) front.enclosed = events.length === 1 ? "Details of the celebration are enclosed" : "Details of each celebration are enclosed";

  const hosts = o.version === "bride" ? (bp ?? `The family of ${bride}`)
    : o.version === "groom" ? (gp ?? `The family of ${groom}`)
    : `${bride} & ${groom}`;
  const couple = o.version === "groom" ? `${groom} & ${bride}` : `${bride} & ${groom}`;
  const inserts: InsertCard[] = separate
    ? events.map((event) => ({
        invocation: null, hosts, request: "request the pleasure of your company at the", event,
        occasion: o.version === "both" ? "as we celebrate our wedding" : "on the occasion of the wedding of", couple: o.version === "both" ? "" : couple,
      }))
    : [];

  return {
    front,
    back: {
      events: separate ? [] : events,
      details: {
        rsvp: lines(o.rsvp),
        replyBy: o.replyBy && w.rsvpDeadline ? `Kindly reply by ${fmtWeddingDate(w.rsvpDeadline)}` : null,
        compliments: lines(o.compliments),
        note: o.note || null,
        qrUrl: o.qr ? siteUrl : null,
      },
    },
    inserts,
  };
}

/** A short name for the download: invitation-bride-5x7.pdf */
export function fileName(o: Pick<InvitationOptions, "version" | "size" | "eventLayout">): string {
  const who = o.version === "both" ? "joint" : o.version;
  return `invitation-${who}-${o.size}${o.eventLayout === "separate" ? "-with-event-cards" : ""}.pdf`;
}
