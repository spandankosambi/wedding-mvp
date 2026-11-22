import { CARD_SIZES, panelSize, type InvitationOptions } from "./options";

/*
 * The envelope that carries the card. Browser-safe: the print page shows the
 * size, the PDF draws it.
 *
 * Sizes follow the envelopes printers and stationers stock for each card:
 * a 5 × 7 in card goes in an A7 (5¼ × 7¼ in), an A5 card in a C5, and so on.
 * Envelopes are drawn landscape (opening along the long side); squares stay square.
 */

export const ENVELOPE_STYLES = ["none", "flat"] as const;
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
export function envelopeFor(o: Pick<InvitationOptions, "size" | "customWidthMm" | "customHeightMm" | "orientation"> & { eventLayout?: InvitationOptions["eventLayout"] }): { name: string; mm: [number, number] } {
  // a folded card goes in the envelope for its folded size (A4 folds to A5: a C5)
  const face = panelSize(o);
  const size = o.eventLayout === "folded"
    ? CARD_SIZES.find((s) => Math.abs(Math.min(...s.mm) - Math.min(...face)) <= 1 && Math.abs(Math.max(...s.mm) - Math.max(...face)) <= 1)?.id
    : o.size;
  const std = size ? STANDARD[size] : undefined;
  if (std) return std;
  // a custom card: 4 mm of room on every side, to the next whole mm
  const [w, h] = face;
  const long = Math.ceil(Math.max(w, h) + 8), short = Math.ceil(Math.min(w, h) + 8);
  return { name: `${short} × ${long} mm`, mm: [long, short] };
}

/**
 * The cut-and-fold template's parts, in mm: the front panel and its flaps.
 * `t` runs from compact (0: 15 mm side flaps, shallow top and bottom) to
 * roomy (1: classic proportions), so a template can shrink to fit a sheet.
 */
export function dieLine(env: [number, number], t = 1) {
  const [W, H] = env;
  const lerp = (a: number, b: number) => a + (b - a) * t;
  const side = Math.round(lerp(15, Math.max(15, W * 0.16)));
  const top = Math.round(H * lerp(0.42, 0.55));
  const bottom = Math.round(H * lerp(0.5, 0.62));
  return { W, H, side, top, bottom, width: W + 2 * side, height: H + top + bottom };
}

export const FLAT_MARGIN_MM = 5;

/** Sheets a template can go on, smallest first: home printers do A4, print shops the rest. */
const SHEETS: [string, [number, number]][] = [["A4", [210, 297]], ["A3", [297, 420]], ["SRA3", [320, 450]], ["A2", [420, 594]]];

/**
 * The smallest sheet the cut-and-fold template fits on (either way round),
 * with its flaps as roomy as that sheet allows; past A2, a sheet of its own size.
 */
export function flatSheet(env: [number, number]): { name: string; mm: [number, number]; t: number; label: string } {
  const m = 2 * FLAT_MARGIN_MM;
  for (const [name, [a, b]] of SHEETS) {
    for (const [w, h] of [[a, b], [b, a]] as [number, number][]) {
      for (let t = 1; t >= -0.001; t -= 0.05) {
        const d = dieLine(env, t);
        if (d.width + m <= w && d.height + m <= h) return { name, mm: [w, h], t: Math.max(0, t), label: `${name} (${Math.min(w, h)} × ${Math.max(w, h)} mm)` };
      }
    }
  }
  const d = dieLine(env, 0);
  const mm: [number, number] = [Math.ceil(d.width + m), Math.ceil(d.height + m)];
  return { name: "custom", mm, t: 0, label: `a ${mm[0]} × ${mm[1]} mm sheet` };
}
