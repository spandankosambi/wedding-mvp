import { trimSize, type InvitationOptions } from "./options";

/*
 * The envelope that carries the card. Browser-safe: the print page shows the
 * size, the PDF draws it.
 *
 * Sizes follow the envelopes printers and stationers stock for each card:
 * a 5 × 7 in card goes in an A7 (5¼ × 7¼ in), an A5 card in a C5, and so on.
 * Envelopes are drawn landscape (opening along the long side); squares stay square.
 */

export const ENVELOPE_STYLES = ["none", "front", "flat"] as const;
export type EnvelopeStyle = (typeof ENVELOPE_STYLES)[number];

const STANDARD: Record<string, { name: string; mm: [number, number] }> = {
  "5x7": { name: "A7 · 5¼ × 7¼ in", mm: [184, 133] },
  a5: { name: "C5 · 162 × 229 mm", mm: [229, 162] },
  "5.5x8.5": { name: "A9 · 5¾ × 8¾ in", mm: [222, 146] },
  "6x6": { name: "6½ × 6½ in square", mm: [165, 165] },
  "5x5": { name: "5½ × 5½ in square", mm: [140, 140] },
  dl: { name: "DL · 110 × 220 mm", mm: [220, 110] },
  "4.25x5.5": { name: "A2 · 4⅜ × 5¾ in", mm: [146, 111] },
  a4: { name: "C4 · 229 × 324 mm", mm: [324, 229] },
};

/** The envelope for a card: its name and size in mm, [width, height] (landscape). */
export function envelopeFor(o: Pick<InvitationOptions, "size" | "customWidthMm" | "customHeightMm" | "orientation">): { name: string; mm: [number, number] } {
  const std = STANDARD[o.size];
  if (std) return std;
  // a custom card: 4 mm of room on every side, to the next whole mm
  const [w, h] = trimSize(o);
  const long = Math.ceil(Math.max(w, h) + 8), short = Math.ceil(Math.min(w, h) + 8);
  return { name: `${short} × ${long} mm`, mm: [long, short] };
}

/** The cut-and-fold template's parts, in mm: the front panel and its flaps. */
export function dieLine(env: [number, number]) {
  const [W, H] = env;
  const side = Math.round(W * 0.16);
  const top = Math.round(H * 0.55);
  const bottom = Math.round(H * 0.62);
  return { W, H, side, top, bottom, width: W + 2 * side, height: H + top + bottom };
}

/** The smallest common sheet the flat template fits on, with a margin; or its own size. */
export function flatSheet(env: [number, number]): { name: string; mm: [number, number] } {
  const d = dieLine(env);
  const m = 8;
  const sheets: [string, [number, number]][] = [["A4", [210, 297]], ["A4", [297, 210]], ["A3", [297, 420]], ["A3", [420, 297]]];
  for (const [name, [w, h]] of sheets) if (d.width + 2 * m <= w && d.height + 2 * m <= h) return { name, mm: [w, h] };
  return { name: "custom", mm: [d.width + 2 * m, d.height + 2 * m] };
}
