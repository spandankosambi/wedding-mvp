import type { Theme } from "@/themes/catalog";
import type { MonogramStyle } from "./options";

/**
 * The card's decoration as plain shape data, drawn by the PDF and by the
 * print dialog's previews alike. Browser-safe.
 *
 * The theme motifs follow the website's own ornaments (src/themes/
 * ornaments.tsx) so a printed card matches its site; corners, toran, border,
 * arch and monogram crests are drawn here.
 */

export type Ink = "accent" | "accent2" | "hair" | "ink" | "bg";
type Paint = { fill?: Ink; stroke?: Ink; sw?: number; op?: number };
export type Shape =
  | ({ k: "path"; d: string } & Paint)
  | ({ k: "circle"; cx: number; cy: number; r: number } & Paint)
  | ({ k: "line"; x1: number; y1: number; x2: number; y2: number } & Paint);
export type Motif = { w: number; h: number; shapes: Shape[] };

/* ── palettes (shared with the dialog) ─────────────────────────── */
export type Palette = { bg: string; ink: string; soft: string; accent: string; accent2: string; hair: string };
const THEME_CARD: Record<Theme, Palette> = {
  "ivory-editorial": { bg: "#faf8f4", ink: "#232323", soft: "#5d5a55", accent: "#c87d08", accent2: "#9a5b03", hair: "#bdb7ad" },
  "raj-mahal": { bg: "#2a0a10", ink: "#f5ead6", soft: "#d9c8aa", accent: "#d4a439", accent2: "#e6c26e", hair: "#7a5a2e" },
  "gulaab-rococo": { bg: "#fdf2f6", ink: "#4a2b3a", soft: "#7a5a69", accent: "#c2447a", accent2: "#8b7ab8", hair: "#e3b3c8" },
  "mehfil-noor": { bg: "#0d1220", ink: "#e8ecf7", soft: "#aeb7cc", accent: "#d3aa5e", accent2: "#a9bce0", hair: "#3a4560" },
  "pichwai-bagh": { bg: "#0e2b22", ink: "#f1e9d6", soft: "#c9c0a8", accent: "#c9a145", accent2: "#e08cb2", hair: "#4f5e3a" },
  "neel-chhapa": { bg: "#f6f6f0", ink: "#22335e", soft: "#4f5b78", accent: "#31509f", accent2: "#b8492d", hair: "#b9c0d2" },
};
const LIGHT: Record<Theme, Omit<Palette, "bg">> = {
  "ivory-editorial": { ink: "#232323", soft: "#5d5a55", accent: "#b5730a", accent2: "#9a5b03", hair: "#cfc9bf" },
  "raj-mahal": { ink: "#4a0f1a", soft: "#6b4a42", accent: "#9a6f1a", accent2: "#8a1c2b", hair: "#d8c6a4" },
  "gulaab-rococo": { ink: "#4a2b3a", soft: "#7a5a69", accent: "#c2447a", accent2: "#8b7ab8", hair: "#ecc6d6" },
  "mehfil-noor": { ink: "#1a2440", soft: "#4f5870", accent: "#8a6a2a", accent2: "#4a5f8f", hair: "#cbd2e2" },
  "pichwai-bagh": { ink: "#0e3b2c", soft: "#4c5f55", accent: "#8f6f22", accent2: "#b2507e", hair: "#cfd8c6" },
  "neel-chhapa": { ink: "#22335e", soft: "#4f5b78", accent: "#31509f", accent2: "#b8492d", hair: "#c9cfdd" },
};
export function paletteFor(theme: Theme, colours: "theme" | "light"): Palette {
  return colours === "theme" ? THEME_CARD[theme] : { bg: "#ffffff", ...LIGHT[theme] };
}

/* ── helpers ──────────────────────────────────────────────────── */
const f = (n: number) => Math.round(n * 100) / 100;
const diamond = (cx: number, cy: number, r: number) =>
  `M ${f(cx)} ${f(cy - r)} L ${f(cx + r)} ${f(cy)} L ${f(cx)} ${f(cy + r)} L ${f(cx - r)} ${f(cy)} Z`;
const star = (cx: number, cy: number, r: number) => {
  const i = r * 0.36;
  return `M ${f(cx)} ${f(cy - r)} L ${f(cx + i)} ${f(cy - i)} L ${f(cx + r)} ${f(cy)} L ${f(cx + i)} ${f(cy + i)} L ${f(cx)} ${f(cy + r)} L ${f(cx - i)} ${f(cy + i)} L ${f(cx - r)} ${f(cy)} L ${f(cx - i)} ${f(cy - i)} Z`;
};
/** a pointed leaf from (x,y), `len` long, pointing at `deg` (0 = down) */
const leaf = (x: number, y: number, len: number, deg: number) => {
  const a = (deg * Math.PI) / 180, dx = Math.sin(a), dy = Math.cos(a), w = len * 0.32;
  const tx = x + dx * len, ty = y + dy * len, mx = x + dx * len * 0.5, my = y + dy * len * 0.5;
  return `M ${f(x)} ${f(y)} Q ${f(mx - dy * w)} ${f(my + dx * w)} ${f(tx)} ${f(ty)} Q ${f(mx + dy * w)} ${f(my - dx * w)} ${f(x)} ${f(y)} Z`;
};

/* ── theme motifs: the top ornament, the divider, a corner ─────── */

export function topMotif(theme: Theme): Motif {
  switch (theme) {
    case "raj-mahal":
      return { w: 280, h: 56, shapes: [
        { k: "path", d: "M40 52 V 34 C 40 30 44 28 46 30 C 48 24 54 24 56 28 C 58 20 66 20 68 26 C 72 14 84 10 96 10 C 104 6 112 2 140 2 C 168 2 176 6 184 10 C 196 10 208 14 212 26 C 214 20 222 20 224 28 C 226 24 232 24 234 30 C 236 28 240 30 240 34 V 52", stroke: "accent", sw: 2 },
        { k: "circle", cx: 140, cy: 3, r: 2.5, fill: "accent" },
        { k: "line", x1: 0, y1: 52, x2: 280, y2: 52, stroke: "hair", sw: 1 },
        { k: "path", d: diamond(24, 48, 5.6), fill: "accent2", op: 0.8 },
        { k: "path", d: diamond(256, 48, 5.6), fill: "accent2", op: 0.8 },
      ] };
    case "gulaab-rococo":
      return { w: 280, h: 46, shapes: [
        { k: "path", d: "M20 20 Q 35 38 50 20 Q 65 38 80 20 Q 95 38 110 20 Q 125 38 140 20 Q 155 38 170 20 Q 185 38 200 20 Q 215 38 230 20 Q 245 38 260 20", stroke: "accent", sw: 2 },
        ...[[20, 20, 10, "accent"], [30, 27, 6, "accent2"], [260, 20, 10, "accent"], [250, 27, 6, "accent2"], [140, 17, 12, "accent"], [128, 25, 6.5, "accent2"], [152, 25, 6.5, "accent2"]]
          .map(([cx, cy, r, c]) => ({ k: "circle" as const, cx: cx as number, cy: cy as number, r: r as number, fill: c as Ink, op: 0.38 })),
        { k: "circle", cx: 140, cy: 19, r: 3, fill: "accent" },
        { k: "circle", cx: 20, cy: 20, r: 2.2, fill: "accent" },
        { k: "circle", cx: 260, cy: 20, r: 2.2, fill: "accent" },
      ] };
    case "mehfil-noor":
      return { w: 280, h: 60, shapes: [
        { k: "path", d: "M92 14 C 100 34 118 44 140 44 C 162 44 180 34 188 14 C 178 28 160 34 140 34 C 120 34 102 28 92 14 Z", stroke: "accent", sw: 1.6 },
        ...[[104, 10], [122, 15], [140, 18], [158, 15], [176, 10]].flatMap(([x, len]) => [
          { k: "line" as const, x1: x, y1: 40, x2: x, y2: 40 + len - 4, stroke: "hair" as Ink, sw: 1 },
          { k: "circle" as const, cx: x, cy: 40 + len, r: 1.8, fill: "accent" as Ink },
        ]),
        { k: "path", d: star(140, 11, 7), fill: "accent2" },
        { k: "circle", cx: 52, cy: 18, r: 1.4, fill: "accent", op: 0.8 },
        { k: "circle", cx: 70, cy: 8, r: 1, fill: "accent", op: 0.55 },
        { k: "circle", cx: 228, cy: 18, r: 1.4, fill: "accent", op: 0.8 },
        { k: "circle", cx: 210, cy: 8, r: 1, fill: "accent", op: 0.55 },
      ] };
    case "pichwai-bagh":
      return { w: 280, h: 50, shapes: [
        { k: "path", d: "M140 10 C 134 22 134 34 140 44 C 146 34 146 22 140 10 Z", stroke: "accent", sw: 1.6 },
        { k: "path", d: "M122 18 C 122 30 128 40 140 44 C 136 34 132 24 122 18 Z", stroke: "accent", sw: 1.4 },
        { k: "path", d: "M158 18 C 158 30 152 40 140 44 C 144 34 148 24 158 18 Z", stroke: "accent", sw: 1.4 },
        { k: "path", d: "M106 28 C 110 38 122 44 140 44 C 128 40 116 36 106 28 Z", stroke: "accent", sw: 1.2, op: 0.8 },
        { k: "path", d: "M174 28 C 170 38 158 44 140 44 C 152 40 164 36 174 28 Z", stroke: "accent", sw: 1.2, op: 0.8 },
        { k: "circle", cx: 140, cy: 44, r: 2.4, fill: "accent2" },
        { k: "path", d: "M52 46 Q 66 30 84 34 Q 72 46 52 46 Z", stroke: "accent2", sw: 1.2 },
        { k: "path", d: "M228 46 Q 214 30 196 34 Q 208 46 228 46 Z", stroke: "accent2", sw: 1.2 },
        { k: "line", x1: 84, y1: 34, x2: 98, y2: 42, stroke: "hair", sw: 1 },
        { k: "line", x1: 196, y1: 34, x2: 182, y2: 42, stroke: "hair", sw: 1 },
      ] };
    case "neel-chhapa":
      return { w: 280, h: 44, shapes: [
        { k: "line", x1: 8, y1: 22, x2: 48, y2: 22, stroke: "hair", sw: 1 },
        { k: "line", x1: 232, y1: 22, x2: 272, y2: 22, stroke: "hair", sw: 1 },
        ...[70, 105, 140, 175, 210].flatMap((x, i) => {
          const c: Ink = i % 2 ? "accent2" : "accent";
          return [
            { k: "path" as const, d: diamond(x, 22, 11.3), fill: c, op: x === 140 ? 0.85 : 0.14 },
            { k: "path" as const, d: diamond(x, 22, 11.3), stroke: c, sw: 1.4 },
            { k: "circle" as const, cx: x, cy: 22, r: 1.8, fill: (x === 140 ? "bg" : c) as Ink },
          ];
        }),
      ] };
    default: // ivory-editorial
      return { w: 240, h: 24, shapes: [
        { k: "line", x1: 0, y1: 12, x2: 102, y2: 12, stroke: "hair", sw: 1 },
        { k: "path", d: diamond(120, 12, 8.5), fill: "accent" },
        { k: "line", x1: 138, y1: 12, x2: 240, y2: 12, stroke: "hair", sw: 1 },
      ] };
  }
}

export function dividerMotif(theme: Theme): Motif {
  switch (theme) {
    case "raj-mahal":
      return { w: 168, h: 16, shapes: [0, 1, 2, 3, 4, 5, 6].map((i) => ({ k: "path" as const, d: diamond(16 + i * 22, 8, 5.6), stroke: "accent" as Ink, sw: 1, ...(i === 3 ? { fill: "accent" as Ink } : {}) })) };
    case "gulaab-rococo":
      return { w: 120, h: 18, shapes: [
        { k: "circle", cx: 60, cy: 9, r: 5.5, fill: "accent", op: 0.45 },
        { k: "circle", cx: 52, cy: 12, r: 3.2, fill: "accent2", op: 0.45 },
        { k: "circle", cx: 68, cy: 12, r: 3.2, fill: "accent2", op: 0.45 },
        { k: "path", d: "M20 9 Q 30 15 40 9", stroke: "hair", sw: 1.2 },
        { k: "path", d: "M80 9 Q 90 15 100 9", stroke: "hair", sw: 1.2 },
        { k: "circle", cx: 60, cy: 9, r: 1.8, fill: "accent" },
      ] };
    case "mehfil-noor":
      return { w: 120, h: 14, shapes: [
        { k: "path", d: star(60, 7, 6), fill: "accent2" },
        { k: "circle", cx: 38, cy: 7, r: 1.5, fill: "accent", op: 0.8 },
        { k: "circle", cx: 82, cy: 7, r: 1.5, fill: "accent", op: 0.8 },
        { k: "circle", cx: 22, cy: 7, r: 1, fill: "accent", op: 0.45 },
        { k: "circle", cx: 98, cy: 7, r: 1, fill: "accent", op: 0.45 },
      ] };
    case "pichwai-bagh":
      return { w: 120, h: 16, shapes: [
        { k: "path", d: "M60 2 C 56 7 56 11 60 14 C 64 11 64 7 60 2 Z", stroke: "accent", sw: 1.3 },
        { k: "path", d: "M24 12 Q 36 4 48 10", stroke: "accent2", sw: 1.1 },
        { k: "path", d: "M96 12 Q 84 4 72 10", stroke: "accent2", sw: 1.1 },
        { k: "circle", cx: 60, cy: 14, r: 1.4, fill: "accent2" },
      ] };
    case "neel-chhapa":
      return { w: 120, h: 14, shapes: [
        { k: "path", d: diamond(60, 7, 7), fill: "accent" },
        { k: "path", d: diamond(34, 7, 5), stroke: "accent2", sw: 1.2 },
        { k: "path", d: diamond(86, 7, 5), stroke: "accent2", sw: 1.2 },
      ] };
    default:
      return { w: 120, h: 12, shapes: [
        { k: "line", x1: 14, y1: 6, x2: 50, y2: 6, stroke: "hair", sw: 0.8 },
        { k: "circle", cx: 60, cy: 6, r: 3, fill: "accent" },
        { k: "line", x1: 70, y1: 6, x2: 106, y2: 6, stroke: "hair", sw: 0.8 },
      ] };
  }
}

/** A corner ornament, 40×40; `fx`/`fy` mirror it into the other corners. */
export function cornerMotif(theme: Theme, fx = false, fy = false): Motif {
  const X = (x: number) => f(fx ? 40 - x : x), Y = (y: number) => f(fy ? 40 - y : y);
  const p = (x: number, y: number) => `${X(x)} ${Y(y)}`;
  const c = (cx: number, cy: number, r: number, paint: Paint): Shape => ({ k: "circle", cx: X(cx), cy: Y(cy), r, ...paint });
  const dm = (cx: number, cy: number, r: number) => `M ${p(cx, cy - r)} L ${p(cx + r, cy)} L ${p(cx, cy + r)} L ${p(cx - r, cy)} Z`;
  const shapes: Shape[] = (() => {
    switch (theme) {
      case "raj-mahal":
        return [
          { k: "path", d: `M ${p(2, 38)} Q ${p(2, 24)} ${p(7, 19)} Q ${p(6, 12)} ${p(12, 12)} Q ${p(12, 6)} ${p(19, 7)} Q ${p(24, 2)} ${p(38, 2)}`, stroke: "accent", sw: 1.2 },
          { k: "path", d: `M ${p(7, 38)} Q ${p(7, 28)} ${p(11, 24)} Q ${p(11, 17)} ${p(17, 17)} Q ${p(17, 11)} ${p(24, 11)} Q ${p(28, 7)} ${p(38, 7)}`, stroke: "accent", sw: 0.5, op: 0.7 },
          { k: "path", d: dm(5, 5, 3), fill: "accent2" },
        ];
      case "gulaab-rococo":
        return [
          c(11, 11, 8, { fill: "accent", op: 0.32 }), c(20, 7, 4.5, { fill: "accent2", op: 0.38 }), c(7, 20, 4.5, { fill: "accent2", op: 0.38 }),
          c(11, 11, 2, { fill: "accent" }),
          { k: "path", d: `M ${p(22, 12)} Q ${p(30, 18)} ${p(38, 13)}`, stroke: "hair", sw: 1 },
          { k: "path", d: `M ${p(12, 22)} Q ${p(18, 30)} ${p(13, 38)}`, stroke: "hair", sw: 1 },
        ];
      case "mehfil-noor": {
        const s = (cx: number, cy: number, r: number) => {
          const i = r * 0.36;
          return `M ${p(cx, cy - r)} L ${p(cx + i, cy - i)} L ${p(cx + r, cy)} L ${p(cx + i, cy + i)} L ${p(cx, cy + r)} L ${p(cx - i, cy + i)} L ${p(cx - r, cy)} L ${p(cx - i, cy - i)} Z`;
        };
        return [
          { k: "path", d: s(10, 10, 7), fill: "accent" },
          c(22, 6, 1.4, { fill: "accent2", op: 0.8 }), c(30, 4, 1, { fill: "accent2", op: 0.55 }), c(37, 6, 0.8, { fill: "accent2", op: 0.4 }),
          c(6, 22, 1.4, { fill: "accent2", op: 0.8 }), c(4, 30, 1, { fill: "accent2", op: 0.55 }), c(6, 37, 0.8, { fill: "accent2", op: 0.4 }),
        ];
      }
      case "pichwai-bagh":
        return [
          { k: "path", d: `M ${p(3, 38)} Q ${p(5, 10)} ${p(36, 3)}`, stroke: "accent2", sw: 1 },
          ...[[6, 26, 20], [9, 16, 45], [16, 9, 70], [26, 5, 95]].map(([x, y, a]) => {
            const L = 8, rad = (a * Math.PI) / 180;
            const tx = x + Math.cos(rad) * L, ty = y - Math.sin(rad) * L * 0.2 + 2;
            return { k: "path" as const, d: `M ${p(x, y)} Q ${p((x + tx) / 2 + 2, (y + ty) / 2 - 4)} ${p(tx, ty)} Q ${p((x + tx) / 2 - 1, (y + ty) / 2 + 2)} ${p(x, y)} Z`, fill: "accent" as Ink, op: 0.75 };
          }),
          c(36, 3, 1.6, { fill: "accent2" }),
        ];
      case "neel-chhapa":
        return [
          { k: "path", d: dm(9, 9, 6.5), fill: "accent" },
          c(9, 9, 1.6, { fill: "bg" }),
          { k: "path", d: dm(22, 6, 3.6), stroke: "accent2", sw: 1.1 },
          { k: "path", d: dm(6, 22, 3.6), stroke: "accent2", sw: 1.1 },
          { k: "path", d: dm(33, 5, 2.2), fill: "accent", op: 0.5 },
          { k: "path", d: dm(5, 33, 2.2), fill: "accent", op: 0.5 },
        ];
      default:
        return [
          { k: "path", d: `M ${p(1, 30)} L ${p(1, 1)} L ${p(30, 1)}`, stroke: "accent", sw: 0.9 },
          { k: "path", d: `M ${p(5, 20)} L ${p(5, 5)} L ${p(20, 5)}`, stroke: "hair", sw: 0.6 },
          { k: "path", d: dm(10, 10, 2.6), fill: "accent" },
        ];
    }
  })();
  return { w: 40, h: 40, shapes };
}

/* ── toran: swags of string, marigolds at the knots, mango leaves ─ */
export function toranMotif(width: number, s: number): Motif {
  const swag = 26 * s;
  const n = Math.max(3, Math.round(width / swag));
  const step = width / n, top = 2 * s, sag = 9 * s;
  const shapes: Shape[] = [];
  let d = `M 0 ${f(top)}`;
  for (let i = 0; i < n; i++) d += ` Q ${f(step * i + step / 2)} ${f(top + sag * 2)} ${f(step * (i + 1))} ${f(top)}`;
  shapes.push({ k: "path", d, stroke: "accent", sw: 0.9 * s });
  for (let i = 0; i < n; i++) {
    const mx = step * i + step / 2, my = top + sag; // lowest point of the swag
    shapes.push({ k: "path", d: leaf(mx, my, 13 * s, 0), fill: "accent", op: 0.95 });
    shapes.push({ k: "path", d: leaf(mx - 1.5 * s, my - 0.5 * s, 10 * s, 28), fill: "accent", op: 0.6 });
    shapes.push({ k: "path", d: leaf(mx + 1.5 * s, my - 0.5 * s, 10 * s, -28), fill: "accent", op: 0.6 });
  }
  for (let i = 0; i <= n; i++) {
    const x = step * i, y = top + 1.5 * s;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      shapes.push({ k: "circle", cx: f(x + Math.cos(a) * 2.6 * s), cy: f(y + Math.sin(a) * 2.6 * s), r: f(1.8 * s), fill: "accent2" });
    }
    shapes.push({ k: "circle", cx: f(x), cy: f(y), r: f(1.5 * s), fill: "accent" });
  }
  return { w: width, h: f(top + sag + 14 * s), shapes };
}

/* ── patterned border: a band of stamped diamonds and dots ──────── */
export function borderMotif(w: number, h: number, band: number): Motif {
  const shapes: Shape[] = [
    { k: "path", d: `M 0 0 H ${f(w)} V ${f(h)} H 0 Z`, stroke: "accent", sw: 0.9 },
    { k: "path", d: `M ${f(band)} ${f(band)} H ${f(w - band)} V ${f(h - band)} H ${f(band)} Z`, stroke: "accent", sw: 0.5 },
  ];
  const mid = band / 2, r = band * 0.3;
  const along = (len: number, place: (t: number) => [number, number]) => {
    const n = Math.max(2, Math.floor((len - band) / (band * 1.2)));
    for (let i = 0; i <= n; i++) {
      const t = band + ((len - 2 * band) * i) / n;
      const [x, y] = place(t);
      shapes.push(i % 2
        ? { k: "circle", cx: f(x), cy: f(y), r: f(r * 0.38), fill: "accent2" }
        : { k: "path", d: diamond(x, y, r), fill: "accent", op: 0.85 });
    }
  };
  along(w, (t) => [t, mid]);
  along(w, (t) => [t, h - mid]);
  along(h, (t) => [mid, t]);
  along(h, (t) => [w - mid, t]);
  for (const [x, y] of [[mid, mid], [w - mid, mid], [mid, h - mid], [w - mid, h - mid]]) {
    shapes.push({ k: "path", d: diamond(x, y, r * 1.25), fill: "accent2" });
  }
  return { w, h, shapes };
}

/* ── arch (mehrab) frame for a w×h box ──────────────────────────── */
export function archPath(x: number, y: number, w: number, h: number): string {
  const shoulder = y + Math.min(w * 0.55, h * 0.36), mid = x + w / 2;
  return [
    `M ${f(x)} ${f(y + h)}`, `L ${f(x)} ${f(shoulder)}`,
    `C ${f(x)} ${f(shoulder - w * 0.3)} ${f(mid - w * 0.22)} ${f(y + w * 0.1)} ${f(mid)} ${f(y)}`,
    `C ${f(mid + w * 0.22)} ${f(y + w * 0.1)} ${f(x + w)} ${f(shoulder - w * 0.3)} ${f(x + w)} ${f(shoulder)}`,
    `L ${f(x + w)} ${f(y + h)}`, "Z",
  ].join(" ");
}
/** how far the arch's crown pushes the content down, as a share of the box width */
export const ARCH_CROWN = 0.36;

/* ── monogram crests, 100×100, letters drawn on top ────────────── */
export type Crest = Motif & { textY: number; textSize: number };
export function crest(style: MonogramStyle): Crest {
  switch (style) {
    case "diamond":
      return { w: 100, h: 100, textY: 50, textSize: 17, shapes: [
        { k: "path", d: diamond(50, 50, 47), stroke: "accent", sw: 1.6 },
        { k: "path", d: diamond(50, 50, 41), stroke: "accent", sw: 0.6 },
        ...[[50, 2], [98, 50], [50, 98], [2, 50]].map(([cx, cy]) => ({ k: "circle" as const, cx, cy, r: 2.4, fill: "accent2" as Ink })),
      ] };
    case "arch":
      return { w: 100, h: 100, textY: 60, textSize: 17, shapes: [
        { k: "path", d: archPath(14, 4, 72, 92), stroke: "accent", sw: 1.6 },
        { k: "path", d: archPath(20, 12, 60, 80), stroke: "accent", sw: 0.6 },
        { k: "circle", cx: 50, cy: 3, r: 2.2, fill: "accent2" },
        { k: "line", x1: 4, y1: 96, x2: 96, y2: 96, stroke: "accent", sw: 0.9 },
      ] };
    case "wreath": {
      const shapes: Shape[] = [];
      for (const side of [-1, 1]) {
        let d = "";
        for (let i = 0; i <= 12; i++) {
          const a = Math.PI * (0.55 + (i / 12) * 0.85), r = 40;
          const x = 50 + side * Math.cos(a) * -r, y = 52 + Math.sin(a) * r * 1.0;
          d += `${i ? " L" : "M"} ${f(x)} ${f(y)}`;
          if (i % 2 === 0 && i > 0 && i < 12) {
            const deg = side * (90 + (i / 12) * 150) - side * 20;
            shapes.push({ k: "path", d: leaf(x, y, 11, deg), fill: "accent", op: 0.85 });
          }
        }
        shapes.push({ k: "path", d, stroke: "accent", sw: 1 });
      }
      shapes.push({ k: "path", d: star(50, 9, 4.5), fill: "accent2" });
      return { w: 100, h: 100, textY: 52, textSize: 17, shapes };
    }
    case "lotus":
      return { w: 100, h: 100, textY: 44, textSize: 16, shapes: [
        { k: "circle", cx: 50, cy: 46, r: 40, stroke: "accent", sw: 0.6 },
        { k: "path", d: "M50 66 C 44 76 44 86 50 96 C 56 86 56 76 50 66 Z", fill: "accent", op: 0.9 },
        { k: "path", d: "M50 96 C 40 92 32 84 30 72 C 40 76 46 84 50 96 Z", fill: "accent", op: 0.7 },
        { k: "path", d: "M50 96 C 60 92 68 84 70 72 C 60 76 54 84 50 96 Z", fill: "accent", op: 0.7 },
        { k: "path", d: "M50 96 C 36 96 24 90 18 80 C 30 82 42 88 50 96 Z", fill: "accent2", op: 0.6 },
        { k: "path", d: "M50 96 C 64 96 76 90 82 80 C 70 82 58 88 50 96 Z", fill: "accent2", op: 0.6 },
      ] };
    default:
      return { w: 100, h: 100, textY: 50, textSize: 18, shapes: [
        { k: "circle", cx: 50, cy: 50, r: 46, stroke: "accent", sw: 1.6 },
        { k: "circle", cx: 50, cy: 50, r: 40, stroke: "accent", sw: 0.6 },
        { k: "path", d: diamond(50, 4, 3.2), fill: "accent2" },
        { k: "path", d: diamond(50, 96, 3.2), fill: "accent2" },
        { k: "circle", cx: 4, cy: 50, r: 1.8, fill: "accent2" },
        { k: "circle", cx: 96, cy: 50, r: 1.8, fill: "accent2" },
      ] };
  }
}

/** Devanagari (and Vedic marks) → printed with the Devanagari face. */
export const DEVANAGARI = /[ऀ-ॿ᳐-᳿꣠-ꣿ]/;
/** Split a line into runs of Devanagari and everything else; the spaces
    and dandas (। ॥) between Devanagari words stay in the Devanagari run. */
export function scriptRuns(s: string): { text: string; deva: boolean }[] {
  return s
    .split(/([ऀ-ॿ᳐-᳿꣠-ꣿ]+(?:[\s।॥.,]+[ऀ-ॿ᳐-᳿꣠-ꣿ]+)*)/)
    .filter(Boolean)
    .map((text) => ({ text, deva: DEVANAGARI.test(text) }));
}
