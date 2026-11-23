
import { type OtherLang } from "@/lib/invitation/langs";
import { eventForSide, type Side } from "@/lib/site/sides";
import type { Theme } from "@/themes/catalog";
import { type InvitationOptions, OMITTABLE } from "@/lib/invitation/options";
import { SYMBOLS } from "@/lib/invitation/decor";

/* The Print cards form: its fields, its starting values, and setups saved before. */
export type PrintEvent = { id: string; label: string; side: Side; isPublished: boolean };
export type Props = {
  weddingId: string;
  admin: boolean;
  /** whose cards these are: each family prints its own */
  family: "bride" | "groom";
  /** where the parents' names are edited */
  siteEditorHref: string;
  /** where this family's wording is edited (Edit your site) */
  wordingHref: string;
  /** celebration icons: the family's Design touches tick */
  icons: boolean;
  /** this family's wording, from its site: printed as is */
  wording: CardWording;
  theme: Theme;
  brideName: string;
  groomName: string;
  brideParents: string | null;
  groomParents: string | null;
  hasDeadline: boolean;
  events: PrintEvent[];
  /** choices saved with "Save configuration" (kept with the wedding, so on any device) */
  savedConfig?: Record<string, unknown> | null;
  /** the other family's saved choices, for "same as your partner's card" */
  partnerConfig?: Record<string, unknown> | null;
  /** the Card wording page for a language: base address, "&lang=gu" is added */
  wordsHref: string;
  /** lines the family has already put in their own words, per language */
  editedCounts?: Partial<Record<OtherLang, number>>;
};

export type CardWording = { invocation: string | null; shloka: string | null; rsvpContacts: string | null; compliments: string | null; closingLine: string | null };

/** The words come from the site; the PDF route fills them in. */
export type WordingOption = "invocation" | "shloka" | "rsvpBride" | "rsvpGroom" | "complimentsBride" | "complimentsGroom" | "note";
export type SentOptions = Omit<InvitationOptions, WordingOption>;

export type Form = Omit<InvitationOptions, "customWidthMm" | "customHeightMm" | "eventIds" | "photo" | WordingOption> & {
  eventIds: string[]; photo: string | null; customW: string; customH: string; unit: "mm" | "in";
};

const defaultEvents = (events: PrintEvent[], version: Side) =>
  events.filter((e) => e.isPublished && eventForSide(e.side, version)).map((e) => e.id);

export function initial(p: Props): Form {
  return {
    version: p.family, size: "5x7", orientation: "portrait", eventLayout: "together",
    eventIds: defaultEvents(p.events, p.family), output: "printer", cropMarks: false, colours: "theme",
    omit: [], qr: true, dressCode: true, replyBy: p.hasDeadline,
    frame: "classic", toran: false, patternBorder: false, borderStyle: "diamond", pattern: "none", symbol: "motif", symbolImage: "", icons: false, cardIcons: true, monogram: false, monogramText: "", monogramStyle: "circle",
    fill: "classic", nameFont: "serif", photo: null, photoPlace: "front", photoShape: "arch",
    lang: "en", envelope: "none",
    customW: "", customH: "", unit: "in",
  };
}

/** Answers saved by an earlier version of this dialog, made to fit this one. */
export function fromSaved(base: Form, saved: Record<string, unknown>): Form {
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(base)) if (k in saved && saved[k] !== undefined) out[k] = saved[k];
  out.omit = Array.isArray(out.omit) ? out.omit.filter((k) => (OMITTABLE as readonly unknown[]).includes(k)) : [];
  if (out.version !== "bride" && out.version !== "groom") out.version = base.version;
  // a symbol that's no longer offered, or "your own" with nothing uploaded
  if (!(SYMBOLS as readonly string[]).includes(out.symbol as string) || (out.symbol === "custom" && !out.symbolImage)) out.symbol = "motif";
  return out as Form;
}

/** Wording typed in this dialog before it moved to Edit your site, if any. */
export function oldWording(saved: Record<string, unknown>, family: "bride" | "groom"): CardWording | null {
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  const w: CardWording = {
    invocation: str(saved.invocation),
    shloka: str(saved.shloka),
    rsvpContacts: str(family === "bride" ? saved.rsvpBride ?? saved.rsvp : saved.rsvpGroom ?? saved.rsvp),
    compliments: str(family === "bride" ? saved.complimentsBride ?? saved.compliments : saved.complimentsGroom ?? saved.compliments),
    closingLine: str(saved.note),
  };
  return Object.values(w).some(Boolean) ? w : null;
}
export const WORDING_LABELS: Record<keyof CardWording, string> = {
  invocation: "Invocation", shloka: "Blessing or shloka", rsvpContacts: "RSVP contacts", compliments: "With best compliments from", closingLine: "Closing line",
};

export const storeKey = (id: string, family: "bride" | "groom") => `print-invitation:${id}:${family}`;
/** old wording kept aside until it's moved to the site or set aside */
export const oldWordingKey = (id: string, family: "bride" | "groom") => `print-wording:${id}:${family}`;
export const legacyKey = (id: string) => `print-invitation:${id}`;
/** What "same as your partner's card" copies: the setup and design — not
    whose card it is or its events (the wording has its own "Same as" on the site). */
export const SHARED_KEYS = [
  "size", "orientation", "eventLayout", "output", "cropMarks", "colours", "omit", "qr", "dressCode", "replyBy",
  "envelope", "frame", "toran", "patternBorder", "borderStyle", "pattern", "symbol", "symbolImage", "icons", "cardIcons", "monogram", "monogramStyle", "fill", "nameFont", "photo", "photoPlace", "photoShape", "customW", "customH", "unit",
] as const;
export const readSaved = (key: string): Record<string, unknown> | null => {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
};
