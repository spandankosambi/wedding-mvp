import { z } from "zod";

/**
 * Printed invitation cards: the choices the couple makes before downloading
 * the PDF. Browser-safe — the dialog and the PDF route both use it.
 *
 * Sizes are the trim (finished) sizes printers sell for wedding cards:
 * 5×7 in is the most common worldwide; A5 and small squares are the usual
 * Indian formats; A4 for large "shahi" cards; petite 4.25×5.5 in for inserts.
 */
export const CARD_SIZES = [
  { id: "5x7", label: "5 × 7 in", mm: [127, 178], note: "Most popular" },
  { id: "a5", label: "A5", mm: [148, 210], note: "Common in India" },
  { id: "5.5x8.5", label: "5.5 × 8.5 in", mm: [140, 216], note: "Half-letter, roomy" },
  { id: "6x6", label: "6 × 6 in", mm: [152, 152], note: "Square" },
  { id: "5x5", label: "5 × 5 in", mm: [127, 127], note: "Small square" },
  { id: "dl", label: "DL", mm: [99, 210], note: "Slim, fits a DL envelope" },
  { id: "4.25x5.5", label: "4.25 × 5.5 in", mm: [108, 140], note: "Petite, good for event cards" },
  { id: "a4", label: "A4", mm: [210, 297], note: "Large “shahi” card" },
] as const;

export type SizeId = (typeof CARD_SIZES)[number]["id"];
export const SIZE_IDS = CARD_SIZES.map((s) => s.id) as [SizeId, ...SizeId[]];

/** Custom sizes: from a small insert up to A4. */
export const CUSTOM_MIN_MM = 76;
export const CUSTOM_MAX_MM = 297;
/** Standard print bleed, and the safe margin text keeps from the trim. */
export const BLEED_MM = 3;
export const SAFE_MM = 6;

/** free text: trimmed, runs of spaces collapsed (line breaks kept) */
const text = (max: number) => z.string().max(max).transform((v) => v.replace(/[ \t\u00a0]+/g, " ").trim()).default("");

/** Crest shapes for the couple's monogram. */
export const MONOGRAM_STYLES = ["circle", "diamond", "arch", "wreath", "lotus"] as const;
export type MonogramStyle = (typeof MONOGRAM_STYLES)[number];
/** A shrunk photo is ~300 KB; this leaves room and stays under upload limits. */
export const MAX_PHOTO_CHARS = 2_800_000;

/** Default crest letters: the hosting side's initial first. */
export function defaultMonogram(bride: string, groom: string, version: "bride" | "groom"): string {
  const b = bride.trim().charAt(0).toUpperCase(), g = groom.trim().charAt(0).toUpperCase();
  return version === "groom" ? `${g} | ${b}` : `${b} | ${g}`;
}

export const invitationSchema = z.object({
  /** whose invitation: the bride's family's or the groom's */
  version: z.enum(["bride", "groom"]).default("bride"),
  size: z.enum([...SIZE_IDS, "custom"]).default("5x7"),
  /** custom trim size, in mm (the dialog converts inches) */
  customWidthMm: z.number().min(CUSTOM_MIN_MM).max(CUSTOM_MAX_MM).optional(),
  customHeightMm: z.number().min(CUSTOM_MIN_MM).max(CUSTOM_MAX_MM).optional(),
  orientation: z.enum(["portrait", "landscape"]).default("portrait"),
  /** "together": invitation on the front, all events on the back.
      "separate": invitation card plus one card per event (inserts). */
  eventLayout: z.enum(["together", "separate"]).default("together"),
  /** the events to print; left out, the version's own events on the site */
  eventIds: z.array(z.string().uuid()).max(30).optional(),
  /** "printer": exact size with 3 mm bleed. "home": cards on A4 sheets to cut out. */
  output: z.enum(["printer", "home"]).default("printer"),
  cropMarks: z.boolean().default(false),
  /** "theme": the website's colours, full bleed. "light": white card, coloured ink. */
  colours: z.enum(["theme", "light"]).default("theme"),
  /* ── the words come from the family's site wording (Edit your site);
     the PDF route fills these in, so the dialog doesn't send them ── */
  invocation: text(80),
  /** a blessing or shloka under the invocation, in any language (Devanagari prints too) */
  shloka: text(200),
  /** each family's own RSVP contacts and "with best compliments from";
      the card prints the hosting family's */
  rsvpBride: text(240),
  rsvpGroom: text(240),
  complimentsBride: text(240),
  complimentsGroom: text(240),
  note: text(160),
  qr: z.boolean().default(true),
  dressCode: z.boolean().default(true),
  replyBy: z.boolean().default(true),

  /* ── design. The theme's own motifs are always drawn. ── */
  /** "classic" double-rule frame, or a mehrab (temple/palace arch) —
      portrait cards only; a landscape or square card keeps the classic frame */
  frame: z.enum(["classic", "arch"]).default("classic"),
  /** a hanging toran of mango leaves and marigolds across the top */
  toran: z.boolean().default(false),
  /** a patterned band inside the edge, like a block-printed border */
  patternBorder: z.boolean().default(false),
  monogram: z.boolean().default(false),
  /** the crest's letters, e.g. "S | P" */
  monogramText: z.string().trim().max(9).default(""),
  monogramStyle: z.enum(MONOGRAM_STYLES).default("circle"),
  /** "fuller": bigger type that fills the card */
  fill: z.enum(["classic", "fuller"]).default("classic"),
  nameFont: z.enum(["serif", "script"]).default("serif"),
  /** a photo, already shrunk in the browser, as a data URL */
  photo: z.string().max(MAX_PHOTO_CHARS).regex(/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/).optional(),
  photoPlace: z.enum(["front", "back"]).default("front"),
  photoShape: z.enum(["arch", "circle"]).default("arch"),
}).refine((o) => o.size !== "custom" || (o.customWidthMm !== undefined && o.customHeightMm !== undefined), {
  message: "a custom size needs a width and a height",
});

export type InvitationOptions = z.infer<typeof invitationSchema>;

/** Trim size in mm as [width, height], after orientation. */
export function trimSize(o: Pick<InvitationOptions, "size" | "customWidthMm" | "customHeightMm" | "orientation">): [number, number] {
  let w: number, h: number;
  if (o.size === "custom") {
    w = o.customWidthMm ?? 127;
    h = o.customHeightMm ?? 178;
  } else {
    [w, h] = CARD_SIZES.find((s) => s.id === o.size)!.mm;
  }
  const portrait = w <= h ? [w, h] : [h, w];
  return (o.orientation === "landscape" ? [portrait[1], portrait[0]] : portrait) as [number, number];
}

export const MM_PER_INCH = 25.4;

/** The arch frame needs a portrait card (taller than wide). */
export function isPortrait(o: Pick<InvitationOptions, "size" | "customWidthMm" | "customHeightMm" | "orientation">): boolean {
  const [w, h] = trimSize(o);
  return h > w;
}
