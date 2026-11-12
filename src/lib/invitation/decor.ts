import type { Motif, Shape, Ink } from "./motifs";

/**
 * More decoration, as the same plain shape data motifs.ts uses, so the PDF,
 * the print dialog and the website all draw it: celebration icons, the
 * symbol at the top of a card, border styles and background patterns.
 * Browser-safe.
 */

const f = (n: number) => Math.round(n * 100) / 100;
/** a pointed leaf from (x,y), `len` long, pointing at `deg` (0 = down, 90 = right) */
const leaf = (x: number, y: number, len: number, deg: number, fat = 0.32) => {
  const a = (deg * Math.PI) / 180, dx = Math.sin(a), dy = Math.cos(a), w = len * fat;
  const tx = x + dx * len, ty = y + dy * len, mx = x + dx * len * 0.5, my = y + dy * len * 0.5;
  return `M ${f(x)} ${f(y)} Q ${f(mx - dy * w)} ${f(my + dx * w)} ${f(tx)} ${f(ty)} Q ${f(mx + dy * w)} ${f(my - dx * w)} ${f(x)} ${f(y)} Z`;
};
const diamond = (cx: number, cy: number, r: number) =>
  `M ${f(cx)} ${f(cy - r)} L ${f(cx + r)} ${f(cy)} L ${f(cx)} ${f(cy + r)} L ${f(cx - r)} ${f(cy)} Z`;

/* ── celebration icons: 24×24 line drawings ────────────────────── */

export const ICONS = ["haldi", "mehendi", "music", "dandiya", "fire", "rings", "drum", "glass", "diya", "thali", "kalash"] as const;
export type IconId = (typeof ICONS)[number];

const S = (d: string, sw = 1.4): Shape => ({ k: "path", d, stroke: "accent", sw });
const dot = (cx: number, cy: number, r = 1, fill: Ink = "accent2"): Shape => ({ k: "circle", cx, cy, r, fill });

const ICON_SHAPES: Record<IconId, Shape[]> = {
  // a bowl of turmeric paste with a marigold
  haldi: [
    S("M4 12 H20 C 20 17 16.5 20 12 20 C 7.5 20 4 17 4 12 Z"),
    S("M9 21.5 H15"),
    S("M7 12 C 8 9.5 10 9.5 12 11 C 14 9.5 16 9.5 17 12", 1.1),
    ...[0, 1, 2, 3, 4, 5].map((i) => dot(12 + Math.cos((i / 6) * Math.PI * 2) * 2.2, 5 + Math.sin((i / 6) * Math.PI * 2) * 2.2, 1.2)),
    dot(12, 5, 1, "accent"),
  ],
  // a mehendi paisley (mango) with a curl and dots
  mehendi: [
    S("M13 3 C 20 5 21 14 15 18.5 C 10 22 4 19 5 13.5 C 5.8 9.5 10.5 9 12 12.5 C 12.8 14.6 10.8 16 9.6 14.8"),
    dot(15.5, 9, 1), dot(16, 12.5, 0.9), dot(13.6, 6.3, 0.8),
    S("M13 3 C 12 2.2 10.6 2.4 10 3.4", 1.1),
  ],
  // two joined notes
  music: [
    S("M9 17.5 V5.5 L19 3.5 V15.5"),
    S("M9 9 L19 7", 1.1),
    { k: "circle", cx: 6.8, cy: 17.6, r: 2.4, stroke: "accent", sw: 1.4 },
    { k: "circle", cx: 16.8, cy: 15.6, r: 2.4, stroke: "accent", sw: 1.4 },
  ],
  // crossed dandiya sticks
  dandiya: [
    S("M4 20 L20 4", 1.8), S("M4 4 L20 20", 1.8),
    S("M6.2 15.4 L8.6 17.8 M8.4 13.2 L10.8 15.6 M17.8 15.4 L15.4 17.8 M15.6 13.2 L13.2 15.6", 1),
    dot(3.6, 3.6, 1.3), dot(20.4, 3.6, 1.3), dot(3.6, 20.4, 1.3), dot(20.4, 20.4, 1.3),
  ],
  // the sacred fire in its kund
  fire: [
    S("M12 3 C 15 7 17 9 17 12.5 C 17 15.5 14.8 17 12 17 C 9.2 17 7 15.5 7 12.5 C 7 10.5 8 9.5 9 8.5 C 9.5 10 10.2 10.6 11 10.6 C 10.6 8 11 5.5 12 3 Z"),
    S("M12 17 C 10.6 15.6 10.8 14 12 12.6 C 13.2 14 13.4 15.6 12 17 Z", 1),
    S("M4.5 17.5 H19.5 L17.5 21.5 H6.5 Z"),
  ],
  // two rings, one with a stone
  rings: [
    { k: "circle", cx: 9, cy: 14.5, r: 5.5, stroke: "accent", sw: 1.4 },
    { k: "circle", cx: 15.5, cy: 14.5, r: 5.5, stroke: "accent", sw: 1.4 },
    { k: "path", d: diamond(9, 6.2, 2.4), fill: "accent2" },
  ],
  // a dhol with its sticks
  drum: [
    S("M5 9 C 5 6.8 8 5.5 12 5.5 C 16 5.5 19 6.8 19 9 V16 C 19 18.2 16 19.5 12 19.5 C 8 19.5 5 18.2 5 16 Z"),
    S("M5 9 C 5 11.2 8 12.5 12 12.5 C 16 12.5 19 11.2 19 9", 1.1),
    S("M7.5 12 L10 19.2 M12 12.5 V19.5 M16.5 12 L14 19.2", 0.9),
    S("M15 2 L20.5 6.5 M9 2 L3.5 6.5", 1.3),
  ],
  // glasses raised
  glass: [
    S("M4 4 H11 L10 10 C 9.6 12.2 8.8 13 7.5 13 C 6.2 13 5.4 12.2 5 10 Z"),
    S("M7.5 13 V19 M5 19.5 H10"),
    S("M13 6 H20 L19 12 C 18.6 14.2 17.8 15 16.5 15 C 15.2 15 14.4 14.2 14 12 Z"),
    S("M16.5 15 V20 M14 20.5 H19"),
    dot(12, 2.6, 0.8), dot(14.2, 3.4, 0.6),
  ],
  // a lit lamp
  diya: [
    S("M3.5 14 H20.5 C 19.5 18.5 16 20.5 12 20.5 C 8 20.5 4.5 18.5 3.5 14 Z"),
    S("M12 3.5 C 14.4 6.6 14.6 9 12 11.5 C 9.4 9 9.6 6.6 12 3.5 Z"),
    S("M8 17 C 10.5 18.2 13.5 18.2 16 17", 1),
    dot(6, 8, 0.7), dot(18, 8, 0.7), dot(12, 14, 0.9, "accent"),
  ],
  // a thali: plate with bowls
  thali: [
    { k: "circle", cx: 12, cy: 12, r: 9, stroke: "accent", sw: 1.4 },
    { k: "circle", cx: 12, cy: 12, r: 6.6, stroke: "accent", sw: 0.8 },
    { k: "circle", cx: 9.4, cy: 10, r: 1.7, stroke: "accent", sw: 1 },
    { k: "circle", cx: 14.6, cy: 10, r: 1.7, stroke: "accent", sw: 1 },
    { k: "circle", cx: 12, cy: 14.6, r: 1.7, stroke: "accent", sw: 1 },
  ],
  // a kalash with coconut and mango leaves
  kalash: [
    S("M8 11 H16 C 19.5 13 19.5 19 15 21 H9 C 4.5 19 4.5 13 8 11 Z"),
    S("M8.5 9 H15.5 V11 H8.5 Z", 1.1),
    S("M12 2.5 C 14.4 4.4 14.4 7 12 9 C 9.6 7 9.6 4.4 12 2.5 Z"),
    { k: "path", d: leaf(9.5, 9, 6, -125, 0.3), stroke: "accent", sw: 1 },
    { k: "path", d: leaf(14.5, 9, 6, 125, 0.3), stroke: "accent", sw: 1 },
    S("M7.5 15.5 C 10.5 17 13.5 17 16.5 15.5", 1),
  ],
};

/** The family's pick for a celebration, or the one its name suggests. */
export const iconOf = (e: { name: string; icon?: string | null }): IconId =>
  (ICONS as readonly string[]).includes(e.icon ?? "") ? (e.icon as IconId) : iconFor(e.name);

export const icon = (id: IconId): Motif => ({ w: 24, h: 24, shapes: ICON_SHAPES[id] });

/** Which icon suits a celebration, from its name. */
const ICON_WORDS: [RegExp, IconId][] = [
  [/haldi|pithi|pith[iy]|ubtan|mandva|turmeric/i, "haldi"],
  [/mehe?ndi|mehn?di|henna/i, "mehendi"],
  [/garba|dandiya|raas/i, "dandiya"],
  [/sangee?t|music|dj\b|qawwali|ghazal|dance|sufi/i, "music"],
  [/baraa?t|varghodo|jaan|procession|dhol/i, "drum"],
  [/phera|wedding|vivah|shaadi|shadi|lagna|lagan|muhurt|kanyadaan|nikah|anand karaj|ceremony|hast ?melap/i, "fire"],
  [/reception|cocktail|party|after ?party|mixer|welcome/i, "glass"],
  [/engagement|sagai|ring|roka|tilak|sakharpuda|chandlo/i, "rings"],
  [/lunch|dinner|brunch|breakfast|bhoj|jaman|feast|high ?tea/i, "thali"],
  [/pooja|puja|ganesh|griha|shanti|satyanarayan|sthapana|aarti|katha/i, "diya"],
];
export function iconFor(eventName: string): IconId {
  for (const [re, id] of ICON_WORDS) if (re.test(eventName)) return id;
  return "kalash";
}

/* ── the symbol at the top of a card: 60×60 ───────────────────── */

export const SYMBOLS = ["motif", "ganesh", "om", "swastik", "kalash", "diya"] as const;
export type SymbolId = (typeof SYMBOLS)[number];
export const SYMBOL_LABELS: Record<SymbolId, string> = {
  motif: "None", ganesh: "Shree Ganesh", om: "Om", swastik: "Swastik", kalash: "Kalash", diya: "Diya",
};

/** `om` is set in type (ॐ), not drawn — see OM below. */
export const OM = "ॐ";

export function symbol(id: Exclude<SymbolId, "motif" | "om">): Motif {
  const A = (d: string, sw = 1.8): Shape => ({ k: "path", d, stroke: "accent", sw });
  switch (id) {
    case "swastik":
      return { w: 60, h: 60, shapes: [
        A("M30 10 V50 M10 30 H50", 3),
        A("M30 10 H48 M50 30 V48 M30 50 H12 M10 30 V12", 3),
        ...[[20, 20], [40, 20], [20, 40], [40, 40]].map(([cx, cy]) => ({ k: "circle" as const, cx, cy, r: 2.6, fill: "accent2" as Ink })),
      ] };
    case "kalash":
      return { w: 60, h: 60, shapes: [
        A("M20 28 H40 C 50 33 50 49 38 55 H22 C 10 49 10 33 20 28 Z"),
        A("M21 23 H39 V28 H21 Z", 1.5),
        A("M30 5 C 37 10 37 18 30 23 C 23 18 23 10 30 5 Z"),
        { k: "path", d: leaf(24, 23, 17, -122, 0.28), fill: "accent", op: 0.85 },
        { k: "path", d: leaf(36, 23, 17, 122, 0.28), fill: "accent", op: 0.85 },
        { k: "path", d: leaf(25, 23, 13, -160, 0.3), fill: "accent", op: 0.6 },
        { k: "path", d: leaf(35, 23, 13, 160, 0.3), fill: "accent", op: 0.6 },
        A("M15 38 C 24 43 36 43 45 38", 1.2),
        A("M17 45 C 25 49 35 49 43 45", 1.2),
        { k: "path", d: diamond(30, 34, 2.6), fill: "accent2" },
        { k: "circle", cx: 30, cy: 12.5, r: 1.6, fill: "accent2" },
      ] };
    case "diya":
      return { w: 60, h: 60, shapes: [
        A("M8 36 H52 C 49 48 40 54 30 54 C 20 54 11 48 8 36 Z"),
        A("M30 8 C 37 17 37.5 24 30 31 C 22.5 24 23 17 30 8 Z"),
        A("M30 18 C 32.6 21.6 32.6 25 30 28 C 27.4 25 27.4 21.6 30 18 Z", 1.1),
        A("M18 44 C 25 47.5 35 47.5 42 44", 1.2),
        { k: "path", d: diamond(30, 40, 2.4), fill: "accent2" },
        ...[[14, 20, 1.5], [46, 20, 1.5], [9, 28, 1.1], [51, 28, 1.1], [20, 12, 1.1], [40, 12, 1.1]].map(([cx, cy, r]) => ({ k: "circle" as const, cx, cy, r, fill: "accent2" as Ink, op: 0.8 })),
      ] };
    default: // ganesh: crown, ears, eyes, the trunk curling to a modak
      return { w: 60, h: 60, shapes: [
        A("M21 15 L23.5 6 L27 12 L30 3.5 L33 12 L36.5 6 L39 15 Z", 1.5),
        { k: "circle", cx: 30, cy: 3.5, r: 1.3, fill: "accent2" },
        A("M20 17 C 24 14.5 36 14.5 40 17", 1.6),
        // ears
        A("M20 17 C 9 14 5 27 10.5 34 C 14 38 19.5 35.5 21 30"),
        A("M40 17 C 51 14 55 27 49.5 34 C 46 38 40.5 35.5 39 30"),
        // brow and eyes
        A("M23.5 24.5 C 25 22.8 27 22.8 28.3 24.5 M31.7 24.5 C 33 22.8 35 22.8 36.5 24.5", 1.4),
        { k: "path", d: leaf(30, 17.5, 4.6, 0, 0.42), fill: "accent2" },
        // trunk
        A("M26 29 C 26 39 22.5 43 26 48.5 C 29 53 36.5 52 37 46.5 C 37.3 42.6 32.6 42.4 32.6 45.6"),
        A("M34 29 C 34 34 33.2 37 32 39.5", 1.6),
        A("M26.5 35 H31.5 M26 40 H30", 0.9),
        // tusks
        A("M22.5 31 C 20.5 33.5 20.5 36 22 37.5", 1.3),
        A("M37.5 31 C 39.5 33.5 39.5 35 38.6 36.2", 1.3),
        // modak
        { k: "path", d: "M41 50 C 41 46.5 43 45 44.5 43 C 46 45 48 46.5 48 50 Z", fill: "accent2", op: 0.9 },
      ] };
  }
}

/* ── border styles: a band inside the card's edge ──────────────── */

export const BORDER_STYLES = ["diamond", "paisley", "lotus", "jali", "vine"] as const;
export type BorderStyle = (typeof BORDER_STYLES)[number];
export const BORDER_LABELS: Record<BorderStyle, string> = {
  diamond: "Diamonds", paisley: "Paisley", lotus: "Lotus", jali: "Jali lattice", vine: "Flower vine",
};

/** A patterned band for a w×h box, `band` thick, in one of the styles. */
export function borderBand(w: number, h: number, band: number, style: BorderStyle): Motif {
  const shapes: Shape[] = [
    { k: "path", d: `M 0 0 H ${f(w)} V ${f(h)} H 0 Z`, stroke: "accent", sw: 0.9 },
    { k: "path", d: `M ${f(band)} ${f(band)} H ${f(w - band)} V ${f(h - band)} H ${f(band)} Z`, stroke: "accent", sw: 0.5 },
  ];
  const mid = band / 2, r = band * 0.3;
  /** the four sides: a point `t` along it, and which way is inward */
  const sides: { len: number; at: (t: number, off: number) => [number, number]; inward: number }[] = [
    { len: w, at: (t, o) => [t, mid + o], inward: 0 },
    { len: w, at: (t, o) => [t, h - mid - o], inward: 180 },
    { len: h, at: (t, o) => [mid + o, t], inward: 90 },
    { len: h, at: (t, o) => [w - mid - o, t], inward: -90 },
  ];
  const each = (pitch: number, draw: (x: number, y: number, i: number, inward: number, at: (t: number, off: number) => [number, number], t: number) => void) => {
    for (const s of sides) {
      const n = Math.max(2, Math.round((s.len - 2 * band) / pitch));
      for (let i = 0; i <= n; i++) {
        const t = band + ((s.len - 2 * band) * i) / n;
        const [x, y] = s.at(t, 0);
        draw(x, y, i, s.inward, s.at, t);
      }
    }
  };

  if (style === "paisley") {
    each(band * 1.25, (x, y, i, inward, at, t) => {
      if (i % 2) { shapes.push({ k: "circle", cx: f(x), cy: f(y), r: f(r * 0.34), fill: "accent2" }); return; }
      const [bx, by] = at(t, -band * 0.3);
      shapes.push({ k: "path", d: leaf(bx, by, band * 0.66, inward + (Math.floor(i / 2) % 2 ? 24 : -24), 0.42), fill: "accent", op: 0.85 });
    });
  } else if (style === "lotus") {
    each(band * 1.7, (_x, _y, i, inward, at, t) => {
      const [bx, by] = at(t, -band * 0.3);
      shapes.push({ k: "path", d: leaf(bx, by, band * 0.62, inward, 0.36), fill: "accent", op: 0.9 });
      shapes.push({ k: "path", d: leaf(bx, by, band * 0.5, inward - 42, 0.36), fill: "accent2", op: 0.7 });
      shapes.push({ k: "path", d: leaf(bx, by, band * 0.5, inward + 42, 0.36), fill: "accent2", op: 0.7 });
      void i;
    });
  } else if (style === "jali") {
    for (const s of sides) {
      const n = Math.max(2, Math.round((s.len - 2 * band) / (band * 0.9)));
      const step = (s.len - 2 * band) / n, q = band * 0.34;
      let d = "";
      for (let i = 0; i < n; i++) {
        const [x1, y1] = s.at(band + step * i, -q), [x2, y2] = s.at(band + step * (i + 1), q);
        const [x3, y3] = s.at(band + step * i, q), [x4, y4] = s.at(band + step * (i + 1), -q);
        d += `M ${f(x1)} ${f(y1)} L ${f(x2)} ${f(y2)} M ${f(x3)} ${f(y3)} L ${f(x4)} ${f(y4)} `;
      }
      shapes.push({ k: "path", d: d.trim(), stroke: "accent", sw: 0.55 });
      for (let i = 0; i < n; i++) {
        const [x, y] = s.at(band + step * (i + 0.5), 0);
        shapes.push({ k: "circle", cx: f(x), cy: f(y), r: f(band * 0.07), fill: "accent2" });
      }
    }
  } else if (style === "vine") {
    for (const s of sides) {
      const n = Math.max(2, Math.round((s.len - 2 * band) / (band * 1.5)));
      const step = (s.len - 2 * band) / n, amp = band * 0.24;
      const [sx, sy] = s.at(band, 0);
      let d = `M ${f(sx)} ${f(sy)}`;
      for (let i = 0; i < n; i++) {
        const [cx, cy] = s.at(band + step * (i + 0.5), i % 2 ? amp * 2 : -amp * 2);
        const [ex, ey] = s.at(band + step * (i + 1), 0);
        d += ` Q ${f(cx)} ${f(cy)} ${f(ex)} ${f(ey)}`;
        const [lx, ly] = s.at(band + step * (i + 0.5), i % 2 ? amp * 0.8 : -amp * 0.8);
        shapes.push({ k: "path", d: leaf(lx, ly, band * 0.36, s.inward + (i % 2 ? 180 : 0) + 30, 0.4), fill: "accent", op: 0.8 });
      }
      shapes.push({ k: "path", d, stroke: "accent", sw: 0.6 });
      for (let i = 1; i < n; i++) {
        const [x, y] = s.at(band + step * i, 0);
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          shapes.push({ k: "circle", cx: f(x + Math.cos(a) * band * 0.13), cy: f(y + Math.sin(a) * band * 0.13), r: f(band * 0.09), fill: "accent2", op: 0.9 });
        }
        shapes.push({ k: "circle", cx: f(x), cy: f(y), r: f(band * 0.06), fill: "accent" });
      }
    }
  } else {
    each(band * 1.2, (x, y, i) => {
      shapes.push(i % 2
        ? { k: "circle", cx: f(x), cy: f(y), r: f(r * 0.38), fill: "accent2" }
        : { k: "path", d: diamond(x, y, r), fill: "accent", op: 0.85 });
    });
  }
  for (const [x, y] of [[mid, mid], [w - mid, mid], [mid, h - mid], [w - mid, h - mid]]) {
    shapes.push({ k: "path", d: diamond(x, y, r * 1.25), fill: "accent2" });
  }
  return { w, h, shapes };
}

/* ── background patterns: faint, behind the words ──────────────── */

export const PATTERNS = ["none", "mandala", "jaal", "floral"] as const;
export type PatternId = (typeof PATTERNS)[number];
export const PATTERN_LABELS: Record<PatternId, string> = { none: "None", mandala: "Mandala", jaal: "Jaal trellis", floral: "Scattered flowers" };

/** A faint pattern filling a w×h box (same units as the box). */
export function backgroundPattern(w: number, h: number, id: Exclude<PatternId, "none">): Motif {
  const shapes: Shape[] = [];
  const u = Math.min(w, h);
  if (id === "mandala") {
    const cx = w / 2, cy = h / 2, R = u * 0.46;
    for (const [k, n, fat] of [[1, 24, 0.3], [0.74, 16, 0.36], [0.5, 12, 0.4], [0.28, 8, 0.44]] as const) {
      const r0 = R * k * 0.62, len = R * k * 0.38;
      let d = "";
      for (let i = 0; i < n; i++) {
        const deg = (i / n) * 360, a = (deg * Math.PI) / 180;
        d += leaf(cx + Math.sin(a) * r0, cy + Math.cos(a) * r0, len, deg, fat) + " ";
      }
      shapes.push({ k: "path", d: d.trim(), stroke: "accent", sw: u * 0.0022, op: 0.2 });
      shapes.push({ k: "circle", cx: f(cx), cy: f(cy), r: f(r0), stroke: "accent", sw: u * 0.0018, op: 0.16 });
    }
    shapes.push({ k: "circle", cx: f(cx), cy: f(cy), r: f(R), stroke: "accent", sw: u * 0.002, op: 0.16 });
    shapes.push({ k: "circle", cx: f(cx), cy: f(cy), r: f(R * 0.06), fill: "accent", op: 0.14 });
  } else if (id === "jaal") {
    const cell = u / 9;
    let d = "";
    for (let x = -h; x < w + h; x += cell) {
      d += `M ${f(x)} 0 L ${f(x + h)} ${f(h)} M ${f(x + h)} 0 L ${f(x)} ${f(h)} `;
    }
    shapes.push({ k: "path", d: d.trim(), stroke: "accent", sw: u * 0.0018, op: 0.13 });
    for (let j = 0; j * cell <= h * 2; j++) {
      for (let i = 0; i * cell <= w; i++) {
        const x = i * cell + (j % 2 ? cell / 2 : 0), y = (j * cell) / 2;
        if (x <= w && y <= h) shapes.push({ k: "circle", cx: f(x), cy: f(y), r: f(cell * 0.045), fill: "accent", op: 0.2 });
      }
    }
  } else {
    const cell = u / 6;
    for (let j = 0; (j - 0.5) * cell * 0.86 <= h; j++) {
      for (let i = 0; (i - 0.5) * cell <= w; i++) {
        const x = i * cell + (j % 2 ? cell / 2 : 0), y = j * cell * 0.86, r = cell * 0.09;
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 + (i + j) * 0.7;
          shapes.push({ k: "circle", cx: f(x + Math.cos(a) * r * 1.2), cy: f(y + Math.sin(a) * r * 1.2), r: f(r * 0.85), fill: (i + j) % 2 ? "accent2" : "accent", op: 0.12 });
        }
        shapes.push({ k: "circle", cx: f(x), cy: f(y), r: f(r * 0.5), fill: "accent", op: 0.22 });
      }
    }
  }
  return { w, h, shapes };
}
