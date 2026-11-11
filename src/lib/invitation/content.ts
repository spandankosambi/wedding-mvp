import { eventForSide, type Side } from "@/lib/sides";
import { fmtEventTime, fmtWeddingDate } from "@/lib/format";
import { defaultMonogram, type InvitationOptions } from "./options";

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
  /** from the couple's site editor */
  brideParents: string | null; groomParents: string | null;
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
  /** a blessing or shloka under the invocation, line by line */
  shloka: string[];
  /** the monogram crest's letters, when it's on */
  monogram: string | null;
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
/** one line per row; repeated spaces collapse (the PDF would hyphenate at them) */
const lines = (s: string) => s.split(/\r?\n/).map((l) => l.replace(/[ \t\u00a0]+/g, " ").trim()).filter(Boolean);

/** The events a version of the card shows: the couple's pick if they made
    one, else every event on the site that's open to that side. */
export function eventsFor(all: CardEvent[], o: Pick<InvitationOptions, "version" | "eventIds">): CardEvent[] {
  const sorted = [...all].sort((a, b) => a.sortOrder - b.sortOrder);
  if (o.eventIds) return sorted.filter((e) => o.eventIds!.includes(e.id));
  return sorted.filter((e) => e.isPublished && eventForSide(e.side, o.version));
}

/**
 * The hosting family's words around the couple's names — the same on the
 * printed card and at the top of that family's website.
 */
export function hostWords(w: { brideName: string; groomName: string; brideParents?: string | null; groomParents?: string | null }, side: Side) {
  const bride = w.brideName, groom = w.groomName;
  const bp = w.brideParents?.trim() || null, gp = w.groomParents?.trim() || null;
  const fromBride = side !== "groom";
  return {
    hosts: fromBride ? (bp ?? `The family of ${bride}`) : (gp ?? `The family of ${groom}`),
    request: ["request the pleasure of your company", `at the wedding of their ${fromBride ? "daughter" : "son"}`],
    first: fromBride ? bride : groom,
    joiner: "with",
    second: fromBride ? groom : bride,
    secondOf: fromBride ? (gp ? `son of ${gp}` : null) : (bp ? `daughter of ${bp}` : null),
  };
}

/** A blessing, contacts or compliments, one line per row. */
export const wordingLines = (s: string | null | undefined) => lines(s ?? "");

export function buildInvitation(w: CardWedding, all: CardEvent[], o: InvitationOptions, siteUrl: string): Invitation {
  const bride = w.brideName, groom = w.groomName;
  const fromBride = o.version === "bride";
  const h = hostWords(w, o.version);
  const hosts = h.hosts;

  const front: FrontCard = {
    invocation: o.invocation || null,
    shloka: lines(o.shloka),
    lead: [named(hosts), ...h.request.map(phrase)],
    first: h.first,
    joiner: h.joiner,
    second: h.second,
    secondOf: h.secondOf,
    after: [],
    date: fmtWeddingDate(w.weddingDate),
    place: w.city,
    enclosed: null,
    monogram: o.monogram ? o.monogramText || defaultMonogram(bride, groom, o.version) : null,
  };

  const events: EventCard[] = eventsFor(all, o).map((e) => ({
    id: e.id, name: e.name,
    // only an event the couple picked from the other side needs saying whose it is
    sideLabel: e.side === "both" || e.side === o.version ? null : e.side === "bride" ? "Bride's side" : "Groom's side",
    date: fmtCardDate(e.startsAt), time: fmtEventTime(e.startsAt),
    venue: e.venueName, address: e.address, dressCode: o.dressCode ? e.dressCode : null,
  }));

  const separate = o.eventLayout === "separate" && events.length > 0;
  if (separate) front.enclosed = events.length === 1 ? "Details of the celebration are enclosed" : "Details of each celebration are enclosed";

  const couple = `${front.first} & ${front.second}`;
  const inserts: InsertCard[] = separate
    ? events.map((event) => ({
        invocation: null, hosts, request: "request the pleasure of your company at the", event,
        occasion: "on the occasion of the wedding of", couple,
      }))
    : [];

  return {
    front,
    back: {
      events: separate ? [] : events,
      details: {
        rsvp: lines(fromBride ? o.rsvpBride : o.rsvpGroom),
        replyBy: o.replyBy && w.rsvpDeadline ? `Kindly reply by ${fmtWeddingDate(w.rsvpDeadline)}` : null,
        compliments: lines(fromBride ? o.complimentsBride : o.complimentsGroom),
        note: o.note || null,
        qrUrl: o.qr ? siteUrl : null,
      },
    },
    inserts,
  };
}

/** A short name for the download: invitation-bride-5x7.pdf */
export function fileName(o: Pick<InvitationOptions, "version" | "size" | "eventLayout">): string {
  return `invitation-${o.version}-${o.size}${o.eventLayout === "separate" ? "-with-event-cards" : ""}.pdf`;
}
