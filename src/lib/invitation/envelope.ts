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
 * The cut-and-fold template's parts, in mm. Folded, the back must be closed
 * everywhere: the top flap is a V, so beside its point only the bottom flap
 * and the side flaps can cover. The bottom flap therefore reaches up past
 * where the V's edges cross the side flaps, and the side flaps' cut corners
 * stay inside the V near the top. (The first version had a short bottom flap
 * and left two triangles open.)
 */
export type Die = {
  W: number; H: number; top: number; side: number; bottom: number;
  /** how far the side flaps' corners are cut back, along the fold */
  taper: number;
  /** how far the bottom flap's top corners are cut in, so the side flaps tuck under */
  inset: number;
  width: number; height: number;
};

const TIP = 4; // the top flap's point stops this short of the sheet edge, mm
const OVERLAP = 7; // how far the bottom flap runs under the top flap, mm

/** How deep the top flap reaches at `x` mm from the panel's left edge. */
export function flapDepth(d: Pick<Die, "W" | "top">, x: number) {
  const half = d.W / 2 - 9; // the rounded point is 18 mm wide
  return (d.top - TIP) * Math.min(1, Math.min(x, d.W - x) / half);
}

export function dieLine(env: [number, number], topF = 0.55, sideF = 0.16): Die {
  const [W, H] = env;
  const top = Math.round(H * topF);
  const side = Math.round(Math.max(15, W * sideF));
  const taper = Math.round(H * 0.08);
  const inset = Math.max(0, Math.min(Math.round(W * 0.05), side - 5));
  const need = H - flapDepth({ W, top }, side) + OVERLAP;
  const bottom = Math.round(Math.min(H - 3, Math.max(H * 0.45, need)));
  return { W, H, top, side, bottom, taper, inset, width: W + 2 * side, height: H + top + bottom };
}

/** Does every part of the back get covered by a flap? */
export function closes(d: Die) {
  const bottomOk = d.bottom >= d.H - flapDepth(d, d.side) + OVERLAP - 0.5 && d.bottom <= d.H - 2;
  // near the top corners, the side flap's cut corner has to stay under the V
  const cornerOk = d.taper / d.side <= (d.top - TIP) / (d.W / 2 - 9) * 0.92;
  return bottomOk && cornerOk;
}

export const FLAT_MARGIN_MM = 5;

/** Sheets a template can go on, smallest first: home printers do A4, print shops the rest. */
const SHEETS: [string, [number, number]][] = [["A4", [210, 297]], ["A3", [297, 420]], ["SRA3", [320, 450]], ["A2", [420, 594]]];

/**
 * The smallest sheet a closing template fits on (either way round), with the
 * deepest top flap and widest side flaps that sheet allows; past A2, a sheet
 * of its own size.
 */
export function flatSheet(env: [number, number]): { name: string; mm: [number, number]; die: Die; label: string } {
  const m = 2 * FLAT_MARGIN_MM;
  const candidates: Die[] = [];
  for (let topF = 0.62; topF >= 0.419; topF -= 0.02) {
    for (let sideF = 0.24; sideF >= 0.069; sideF -= 0.01) {
      const d = dieLine(env, topF, sideF);
      if (closes(d)) candidates.push(d);
    }
  }
  for (const [name, [a, b]] of SHEETS) {
    for (const [w, h] of [[a, b], [b, a]] as [number, number][]) {
      const d = candidates.find((c) => c.width + m <= w && c.height + m <= h);
      if (d) return { name, mm: [w, h], die: d, label: `${name} (${Math.min(w, h)} × ${Math.max(w, h)} mm)` };
    }
  }
  const d = candidates.reduce((best, c) => (c.width * c.height < best.width * best.height ? c : best), candidates[0] ?? dieLine(env));
  const mm: [number, number] = [Math.ceil(d.width + m), Math.ceil(d.height + m)];
  return { name: "custom", mm, die: d, label: `a ${mm[0]} × ${mm[1]} mm sheet` };
}
