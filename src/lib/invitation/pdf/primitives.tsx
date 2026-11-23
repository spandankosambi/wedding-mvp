/* The building blocks every PDF page shares: units, the drawing context, text and ornaments, the card frame, crop marks. */
import { Page, View, Text, Image, Svg, Line as SvgLine, Path, Circle } from "@react-pdf/renderer";
import type { ComponentProps } from "react";
import type { Theme } from "@/themes/catalog";
import type { Invitation, Line } from "../content";
import { SAFE_MM, type InvitationOptions, type PrintSheet } from "../options";
import { backgroundPattern, borderBand } from "../decor";
import { cornerMotif, toranMotif, archPath, crest, scriptRuns, ARCH_CROWN, type Motif, type Ink, type Palette } from "../motifs";

/** One style object, as the PDF library takes it (its own package for the type is not a direct dependency). */
type Style = Exclude<NonNullable<ComponentProps<typeof View>["style"]>, readonly unknown[] | unknown[]>;

/* ── geometry ─────────────────────────────────────────────────── */
export const pt = (mm: number) => (mm * 72) / 25.4;
export type Sheet = PrintSheet;

/* ── drawing context ──────────────────────────────────────────── */
export type Ctx = {
  p: Palette; s: number; trim: [number, number]; sheet: Sheet; theme: Theme; o: InvitationOptions; script: boolean;
  /** the arch frame is drawn on portrait cards only */
  arch: boolean;
  /** how far type may grow to fill the space: 1 (classic spacing) or more (fill the card) */
  grow: number;
  /** the cards' headings, in the card's language */
  labels: Invitation["labels"];
  /** one half of a folded card's sheet: the Card draws its face, not a page of its own */
  panel?: boolean;
};
const ink = (p: Palette, k?: Ink) => (k ? p[k === "hair" ? "hair" : k] : undefined);

/** Text that switches to the Devanagari face for Hindi/Marathi/Sanskrit runs, and the Gujarati face for Gujarati. */
export function Tx({ style, children }: { style?: Style; children: string }) {
  const runs = scriptRuns(children);
  if (runs.length === 1 && !runs[0].font) return <Text style={style}>{children}</Text>;
  // Indian scripts hang vowel signs (ુ ृ) below the line: give them room
  const lh = Number((style as { lineHeight?: number } | undefined)?.lineHeight ?? 1.2);
  return (
    <Text style={{ ...style, lineHeight: Math.max(lh, 1.35) }}>
      {runs.map((r, i) => (r.font ? <Text key={i} style={{ fontFamily: r.font, letterSpacing: 0 }}>{r.text}</Text> : r.text))}
    </Text>
  );
}

/** A motif at `width` points wide (height follows), in the card's colours. */
export function Draw({ m, width, p, style }: { m: Motif; width: number; p: Palette; style?: Style }) {
  const height = (width * m.h) / m.w;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${m.w} ${m.h}`} style={style}>
      {m.shapes.map((sh, i) => {
        const paint = {
          fill: ink(p, sh.fill) ?? "none", stroke: ink(p, sh.stroke), strokeWidth: sh.sw,
          ...(sh.op !== undefined ? { opacity: sh.op } : {}),
        };
        if (sh.k === "circle") return <Circle key={i} cx={sh.cx} cy={sh.cy} r={sh.r} {...paint} />;
        if (sh.k === "line") return <SvgLine key={i} x1={sh.x1} y1={sh.y1} x2={sh.x2} y2={sh.y2} stroke={paint.stroke ?? p.hair} strokeWidth={sh.sw ?? 1} {...(sh.op !== undefined ? { opacity: sh.op } : {})} />;
        return <Path key={i} d={sh.d} {...paint} />;
      })}
    </Svg>
  );
}

export function CropMarks({ sheet, trim, fold = false }: { sheet: Sheet; trim: [number, number]; fold?: boolean }) {
  const [pw, ph] = sheet.page;
  const left = sheet.x + sheet.bleed, top = sheet.y + sheet.bleed;
  const right = left + trim[0], bottom = top + trim[1];
  const gap = sheet.bleed + 1, len = 6;
  const marks: [number, number, number, number][] = [];
  for (const x of [left, right]) {
    marks.push([x, top - gap - len, x, top - gap], [x, bottom + gap, x, bottom + gap + len]);
  }
  for (const y of [top, bottom]) {
    marks.push([left - gap - len, y, left - gap, y], [right + gap, y, right + gap + len, y]);
  }
  return (
    <Svg style={{ position: "absolute", left: 0, top: 0 }} width={pt(pw)} height={pt(ph)}>
      {marks.map(([x1, y1, x2, y2], i) => (
        <SvgLine key={i} x1={pt(x1)} y1={pt(y1)} x2={pt(x2)} y2={pt(y2)} strokeWidth={0.3} stroke="#000000" />
      ))}
      {/* a folded card: short dashes above and below the fold */}
      {fold && [[top - gap - len, top - gap], [bottom + gap, bottom + gap + len]].map(([y1, y2], i) => (
        <SvgLine key={`f${i}`} x1={pt((left + right) / 2)} y1={pt(y1)} x2={pt((left + right) / 2)} y2={pt(y2)} strokeWidth={0.3} stroke="#000000" strokeDasharray="1.5,1.2" />
      ))}
    </Svg>
  );
}

/** Insets (pt, from the bleed edge) where the frame and the content sit. */
function layout(c: Ctx, withToran: boolean) {
  const { sheet, trim, o, s } = c;
  void o;
  const bleedW = pt(trim[0] + 2 * sheet.bleed), bleedH = pt(trim[1] + 2 * sheet.bleed);
  const frame = pt(sheet.bleed + SAFE_MM * 0.55);
  const band = o.patternBorder ? pt(Math.min(trim[0], trim[1]) * 0.035 + 1.5) : 0;
  const inside = frame + (band || pt(1.4)); // just inside the border / the double rule
  const pad = pt(3) * Math.min(1.3, s);
  const toranH = withToran ? toranMotif(bleedW - 2 * inside, s).h : 0;
  const archBox = { x: inside + pt(2), y: inside + pt(2) + toranH * 0.35, w: bleedW - 2 * (inside + pt(2)), h: bleedH - 2 * (inside + pt(2)) - toranH * 0.35 };
  const crown = c.arch ? archBox.w * ARCH_CROWN * 0.62 : 0;
  const content = {
    left: inside + pad + (c.arch ? pt(2) : 0),
    right: inside + pad + (c.arch ? pt(2) : 0),
    top: inside + pad + Math.max(toranH * 0.9, crown) + (c.arch && toranH ? toranH * 0.35 : 0),
    bottom: inside + pad + (c.arch ? pt(2) : 0),
  };
  return { bleedW, bleedH, frame, band, inside, toranH, archBox, content };
}

/** One card: background to the bleed, frame and ornaments, content centred inside. */
export function Card({ c, children, toran = c.o.toran }: { c: Ctx; children: React.ReactNode; toran?: boolean }) {
  const panel = !!c.panel;
  const { sheet, trim, p, o, theme, s } = c;
  const L = layout(c, toran);
  const cornerW = Math.min(pt(13), pt(Math.min(trim[0], trim[1]) * 0.1)) * Math.max(0.8, Math.min(1.2, s));
  const ci = L.inside + pt(1);
  const face = (
      <View style={{ position: "absolute", left: pt(sheet.x), top: pt(sheet.y), width: L.bleedW, height: L.bleedH, backgroundColor: p.bg }}>
        {/* a faint pattern behind everything, inside the frame */}
        {o.pattern !== "none" && (
          <Draw m={backgroundPattern(L.bleedW - 2 * L.inside, L.bleedH - 2 * L.inside, o.pattern)} width={L.bleedW - 2 * L.inside} p={p}
            style={{ position: "absolute", left: L.inside, top: L.inside }} />
        )}
        {/* edge: a patterned band, or the classic double rule */}
        {o.patternBorder ? (
          <Draw m={borderBand(L.bleedW - 2 * L.frame, L.bleedH - 2 * L.frame, L.band, o.borderStyle)} width={L.bleedW - 2 * L.frame} p={p} style={{ position: "absolute", left: L.frame, top: L.frame }} />
        ) : (
          <>
            <View style={{ position: "absolute", left: L.frame, top: L.frame, right: L.frame, bottom: L.frame, borderWidth: 0.9, borderColor: p.accent }} />
            <View style={{ position: "absolute", left: L.frame + pt(1.4), top: L.frame + pt(1.4), right: L.frame + pt(1.4), bottom: L.frame + pt(1.4), borderWidth: 0.35, borderColor: p.accent }} />
          </>
        )}
        {/* the arch, double-ruled */}
        {c.arch && (
          <Svg style={{ position: "absolute", left: 0, top: 0 }} width={L.bleedW} height={L.bleedH}>
            <Path d={archPath(L.archBox.x, L.archBox.y, L.archBox.w, L.archBox.h)} stroke={p.accent} strokeWidth={1} fill="none" />
            <Path d={archPath(L.archBox.x + pt(1.6), L.archBox.y + pt(2.4), L.archBox.w - pt(3.2), L.archBox.h - pt(2.4))} stroke={p.accent} strokeWidth={0.4} fill="none" />
            <Circle cx={L.archBox.x + L.archBox.w / 2} cy={L.archBox.y - pt(1.2)} r={pt(0.9)} fill={p.accent2} />
          </Svg>
        )}
        {/* the theme's corners */}
        {([[false, false], [true, false], [false, true], [true, true]] as const).filter(([, fy]) => !toran || fy).map(([fx, fy], i) => (
          <Draw key={i} m={cornerMotif(theme, fx, fy)} width={cornerW} p={p}
            style={{ position: "absolute", left: fx ? L.bleedW - ci - cornerW : ci, top: fy ? L.bleedH - ci - cornerW : ci }} />
        ))}
        {toran && (
          <Draw m={toranMotif(L.bleedW - 2 * L.inside, s)} width={L.bleedW - 2 * L.inside} p={p} style={{ position: "absolute", left: L.inside, top: L.inside }} />
        )}
        <View style={{
          position: "absolute", left: L.content.left, top: L.content.top, right: L.content.right, bottom: L.content.bottom,
          alignItems: "center", justifyContent: "center", color: p.ink, fontFamily: "Cormorant", fontWeight: 500, textAlign: "center",
        }}>
          {children}
        </View>
      </View>
  );
  if (panel) return face;
  return (
    <Page size={[pt(sheet.page[0]), pt(sheet.page[1])]} style={{ backgroundColor: sheet.marks ? "#ffffff" : p.bg }}>
      {face}
      {sheet.marks && <CropMarks sheet={sheet} trim={trim} />}
    </Page>
  );
}

/** The content box's height in pt, to size the type to fit. */
export function contentHeight(c: Ctx, toran: boolean) {
  const L = layout(c, toran);
  return L.bleedH - L.content.top - L.content.bottom;
}
export function contentWidth(c: Ctx) {
  const L = layout(c, false);
  return L.bleedW - L.content.left - L.content.right;
}

/** Phone numbers never break across lines. */
export const keepNumbers = (l: string) => l.replace(/(?<=[\d+])\s+(?=\d)/g, " ");
export const nameSize = (name: string, base: number) => base * Math.min(1, 13 / Math.max(name.length, 1));

export function Kicker({ c, children, size = 7.2 }: { c: Ctx; children: string; size?: number }) {
  return <Tx style={{ fontFamily: "Cinzel", fontWeight: 600, fontSize: size * c.s, letterSpacing: 1.6 * c.s, color: c.p.accent }}>{children}</Tx>;
}

export function Wording({ c, lines }: { c: Ctx; lines: Line[] }) {
  return (
    <>
      {lines.map((l, i) => (
        <Tx key={i} style={l.name
          ? { fontWeight: 600, fontSize: 11.5 * c.s, marginVertical: 1.5 * c.s }
          : { fontStyle: "italic", fontSize: 10.5 * c.s, color: c.p.soft, lineHeight: 1.25 }}>
          {l.t}
        </Tx>
      ))}
    </>
  );
}

export function Crest({ c, text, size }: { c: Ctx; text: string; size: number }) {
  const cr = crest(c.o.monogramStyle);
  const fs = (cr.textSize * size) / 100 * Math.min(1, 5 / Math.max(text.replace(/\s/g, "").length, 2));
  return (
    <View style={{ width: size, height: size, marginBottom: 5 * c.s }}>
      <Draw m={cr} width={size} p={c.p} />
      <View style={{ position: "absolute", left: 0, right: 0, top: (cr.textY * size) / 100 - fs * 0.62, alignItems: "center" }}>
        <Tx style={{ fontFamily: "Cinzel", fontWeight: 600, fontSize: fs, color: c.p.accent, letterSpacing: fs * 0.08 }}>{text}</Tx>
      </View>
    </View>
  );
}

export function Photo({ c, src, width }: { c: Ctx; src: string; width: number }) {
  const arch = c.o.photoShape === "arch";
  const h = arch ? width * 1.25 : width;
  const radius = arch ? { borderTopLeftRadius: width / 2, borderTopRightRadius: width / 2 } : { borderRadius: width / 2 };
  return (
    <View style={{ width: width + 4, height: h + 4, padding: 1.5, borderWidth: 0.9, borderColor: c.p.accent, ...radius, marginBottom: 6 * c.s }}>
      <Image src={src} style={{ width: width - 1, height: h - 1, objectFit: "cover", ...radius }} />
    </View>
  );
}
