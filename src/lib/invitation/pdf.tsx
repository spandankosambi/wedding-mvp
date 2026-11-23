import { iconPng } from "@/lib/icon-png";
import path from "node:path";
import QRCode from "qrcode";
import {
  Document, Page, View, Text, Image, Svg, Line as SvgLine, Path, Circle, Font, renderToBuffer,
} from "@react-pdf/renderer";
import type { Style } from "@react-pdf/stylesheet";
import type { Theme } from "@/themes/catalog";
import type { Invitation, EventCard, InsertCard, Details, Line } from "./content";
import { SAFE_MM, canFold, panelSize, sheetFor, type InvitationOptions, type PrintSheet } from "./options";
import { envelopeFor, flatSheet } from "./envelope";
import { backgroundPattern, borderBand, icon, symbol, isGlyph, SYMBOL_GLYPHS, type DrawnSymbol } from "./decor";
import {
  paletteFor, topMotif, dividerMotif, cornerMotif, toranMotif, archPath, crest, scriptRuns, ARCH_CROWN,
  type Motif, type Ink, type Palette,
} from "./motifs";

export { paletteFor };

/* ── fonts (bundled, SIL Open Font Licence) ───────────────────── */
const FONT_DIR = path.join(process.cwd(), "src/lib/invitation/fonts");
let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  const f = (name: string) => path.join(FONT_DIR, name);
  Font.register({
    family: "Cormorant",
    fonts: [
      { src: f("cormorant-garamond-latin-500-normal.woff"), fontWeight: 500 },
      { src: f("cormorant-garamond-latin-500-italic.woff"), fontWeight: 500, fontStyle: "italic" },
      { src: f("cormorant-garamond-latin-600-normal.woff"), fontWeight: 600 },
      { src: f("cormorant-garamond-latin-700-normal.woff"), fontWeight: 700 },
    ],
  });
  Font.register({
    family: "Cinzel",
    fonts: [
      { src: f("cinzel-latin-500-normal.woff"), fontWeight: 500 },
      { src: f("cinzel-latin-600-normal.woff"), fontWeight: 600 },
    ],
  });
  // a single-glyph symbol: Ik Onkar (Gurmukhi)
  Font.register({ family: "Gurmukhi", src: f("noto-serif-gurmukhi-gurmukhi-500-normal.woff") });
  // Devanagari (Hindi, Marathi, Sanskrit): one face, answering every weight
  const deva = f("tiro-devanagari-sanskrit-devanagari-400-normal.woff");
  const devaIt = f("tiro-devanagari-sanskrit-devanagari-400-italic.woff");
  Font.register({
    family: "Tiro",
    fonts: [400, 500, 600, 700].flatMap((fontWeight) => [
      { src: deva, fontWeight },
      { src: devaIt, fontWeight, fontStyle: "italic" as const },
    ]),
  });
  // Gujarati: Noto Serif Gujarati, every weight and slant answered
  const guj = (w: number) => f(`noto-serif-gujarati-gujarati-${w}-normal.woff`);
  Font.register({
    family: "Gujarati",
    fonts: ([[400, 400], [500, 400], [600, 600], [700, 700]] as const).flatMap(([fontWeight, file]) => [
      { src: guj(file), fontWeight },
      { src: guj(file), fontWeight, fontStyle: "italic" as const },
    ]),
  });
  Font.register({
    family: "GreatVibes",
    fonts: [400, 500, 600, 700].map((fontWeight) => ({ src: f("great-vibes-latin-400-normal.woff"), fontWeight })),
  });
  Font.registerHyphenationCallback((w) => [w]); // never split names
  fontsReady = true;
}

/* ── geometry ─────────────────────────────────────────────────── */
const pt = (mm: number) => (mm * 72) / 25.4;
type Sheet = PrintSheet;

/* ── drawing context ──────────────────────────────────────────── */
type Ctx = {
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
function Tx({ style, children }: { style?: Style; children: string }) {
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
function Draw({ m, width, p, style }: { m: Motif; width: number; p: Palette; style?: Style }) {
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

function CropMarks({ sheet, trim, fold = false }: { sheet: Sheet; trim: [number, number]; fold?: boolean }) {
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
function Card({ c, children, toran = c.o.toran }: { c: Ctx; children: React.ReactNode; toran?: boolean }) {
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
function contentHeight(c: Ctx, toran: boolean) {
  const L = layout(c, toran);
  return L.bleedH - L.content.top - L.content.bottom;
}
function contentWidth(c: Ctx) {
  const L = layout(c, false);
  return L.bleedW - L.content.left - L.content.right;
}

/** Phone numbers never break across lines. */
const keepNumbers = (l: string) => l.replace(/(?<=[\d+])\s+(?=\d)/g, " ");
const nameSize = (name: string, base: number) => base * Math.min(1, 13 / Math.max(name.length, 1));

function Kicker({ c, children, size = 7.2 }: { c: Ctx; children: string; size?: number }) {
  return <Tx style={{ fontFamily: "Cinzel", fontWeight: 600, fontSize: size * c.s, letterSpacing: 1.6 * c.s, color: c.p.accent }}>{children}</Tx>;
}

function Wording({ c, lines }: { c: Ctx; lines: Line[] }) {
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

function Crest({ c, text, size }: { c: Ctx; text: string; size: number }) {
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

function Photo({ c, src, width }: { c: Ctx; src: string; width: number }) {
  const arch = c.o.photoShape === "arch";
  const h = arch ? width * 1.25 : width;
  const radius = arch ? { borderTopLeftRadius: width / 2, borderTopRightRadius: width / 2 } : { borderRadius: width / 2 };
  return (
    <View style={{ width: width + 4, height: h + 4, padding: 1.5, borderWidth: 0.9, borderColor: c.p.accent, ...radius, marginBottom: 6 * c.s }}>
      <Image src={src} style={{ width: width - 1, height: h - 1, objectFit: "cover", ...radius }} />
    </View>
  );
}

/* ── front ────────────────────────────────────────────────────── */

function Front({ c: base, inv }: { c: Ctx; inv: Invitation }) {
  const f = inv.front;
  const o = base.o;
  // an own symbol needs its upload; without one there's nothing to draw
  const hasSymbol = o.symbol !== "motif" && (o.symbol !== "custom" || !!iconPng(o.symbolImage));
  const photoFront = o.photo && o.photoPlace === "front";
  const crestTop = f.monogram && !photoFront;
  const crestSeal = f.monogram && photoFront;
  const width = contentWidth(base);
  const photoW = Math.min(width * 0.36, 110 * base.s);
  const nameBase = o.nameFont === "script" ? 36 : 30;

  // how tall the stack is at scale 1 (pt), to grow or shrink the type to fit
  const top = topMotif(base.theme), div = dividerMotif(base.theme);
  const need =
    (hasSymbol ? 34 : 0) + (crestTop ? 42 : 0) + (photoFront ? (photoW / base.s) * (o.photoShape === "arch" ? 1.25 : 1) + 10 : 0) +
    (f.invocation ? 12 : 0) + f.shloka.length * 13 + (78 * top.h) / top.w + 10 +
    f.lead.reduce((n, l) => n + (l.name ? 16 : 14), 0) + 10 +
    nameSize(f.first, nameBase) * 1.15 + 18 + nameSize(f.second, nameBase) * 1.15 +
    (f.secondOf ? 14 : 0) + (f.after.length ? f.after.length * 14 + 8 : 0) +
    16 + 14 + (f.place ? 14 : 0) + (f.enclosed ? 20 : 0) + (crestSeal ? 30 : 0);
  const room = contentHeight(base, o.toran);
  const k = Math.max(0.55, Math.min(base.grow, room / (need * base.s)));
  const c = { ...base, s: base.s * k };
  const nameStyle = (name: string) => o.nameFont === "script"
    ? { fontFamily: "GreatVibes", fontWeight: 400, fontSize: nameSize(name, nameBase) * c.s, lineHeight: 1.15, color: c.p.accent }
    : { fontWeight: 700, fontSize: nameSize(name, nameBase) * c.s, lineHeight: 1.05 };

  return (
    <Card c={base}>
      {hasSymbol && (o.symbol === "custom"
        ? <Image src={iconPng(o.symbolImage, c.p.accent)!} style={{ width: 30 * c.s, height: 30 * c.s, marginBottom: 4 * c.s }} />
        : isGlyph(o.symbol)
          ? <Text style={{ fontFamily: SYMBOL_GLYPHS[o.symbol].font, fontSize: 26 * c.s, color: c.p.accent, lineHeight: 1.1, marginBottom: 2 * c.s }}>{SYMBOL_GLYPHS[o.symbol].text}</Text>
          : <Draw m={symbol(o.symbol as DrawnSymbol)} width={30 * c.s} p={c.p} style={{ marginBottom: 4 * c.s }} />)}
      {crestTop && <Crest c={c} text={f.monogram!} size={38 * c.s} />}
      {photoFront && <Photo c={c} src={o.photo!} width={photoW * k} />}
      {f.invocation && <Kicker c={c}>{f.invocation}</Kicker>}
      {f.shloka.map((l, i) => (
        <Tx key={i} style={{ fontStyle: "italic", fontSize: 9.5 * c.s, color: c.p.accent, marginTop: i ? 0 : 2 * c.s }}>{l}</Tx>
      ))}
      <Draw m={top} width={78 * c.s} p={c.p} style={{ marginVertical: 5 * c.s }} />
      <View style={{ alignItems: "center" }}><Wording c={c} lines={f.lead} /></View>
      <Tx style={{ ...nameStyle(f.first), marginTop: 9 * c.s }}>{f.first}</Tx>
      <Tx style={{ fontStyle: "italic", fontSize: 13 * c.s, color: c.p.accent, marginVertical: 2 * c.s }}>{f.joiner}</Tx>
      <Tx style={nameStyle(f.second)}>{f.second}</Tx>
      {f.secondOf && <Tx style={{ fontStyle: "italic", fontSize: 9.5 * c.s, color: c.p.soft, marginTop: 3 * c.s }}>{f.secondOf}</Tx>}
      {f.after.length > 0 && <View style={{ marginTop: 8 * c.s, alignItems: "center" }}><Wording c={c} lines={f.after} /></View>}
      <Draw m={div} width={56 * c.s} p={c.p} style={{ marginVertical: 6 * c.s }} />
      <Kicker c={c} size={8.5}>{f.date}</Kicker>
      {f.place && <Tx style={{ fontSize: 10 * c.s, marginTop: 3 * c.s, color: c.p.soft }}>{f.place}</Tx>}
      {f.enclosed && <Tx style={{ fontStyle: "italic", fontSize: 8.5 * c.s, marginTop: 9 * c.s, color: c.p.soft }}>{f.enclosed}</Tx>}
      {crestSeal && <View style={{ marginTop: 8 * c.s }}><Crest c={c} text={f.monogram!} size={26 * c.s} /></View>}
    </Card>
  );
}

/* ── the envelope ─────────────────────────────────────────────── */

const DASH = "3,2.4";

/**
 * The envelope's front, drawn into a box of `w` × `h` points: the couple's
 * names and date at the top, and "To, Shri / Smt. ______ & Family" with two
 * more ruled lines to write the guest's name and address by hand.
 */
function EnvelopeFront({ c, inv, w, h, x, y }: { c: Ctx; inv: Invitation; w: number; h: number; x: number; y: number }) {
  const { p, theme, o } = c;
  const e = inv.envelope;
  const k = Math.min(w, h) / pt(133); // 1 on an A7 envelope
  const inset = pt(5) * Math.max(0.8, Math.min(1.3, k));
  const corner = Math.min(pt(12), h * 0.11);
  const top = topMotif(theme), div = dividerMotif(theme);
  const square = w / h < 1.2;
  const nameSize = (o.nameFont === "script" ? 22 : 18) * k;
  const names = `${e.first} ${e.joiner} ${e.second}`;
  const fitName = nameSize * Math.min(1, 30 / Math.max(names.length, 1));
  const toW = square ? w * 0.56 : w * 0.5;
  const rule = { borderBottomWidth: 0.6, borderBottomColor: p.soft, height: 15 * k };
  return (
    <View style={{ position: "absolute", left: x, top: y, width: w, height: h }}>
      <View style={{ position: "absolute", left: inset, top: inset, right: inset, bottom: inset, borderWidth: 0.9, borderColor: p.accent }} />
      <View style={{ position: "absolute", left: inset + pt(1.4), top: inset + pt(1.4), right: inset + pt(1.4), bottom: inset + pt(1.4), borderWidth: 0.35, borderColor: p.accent }} />
      {([[false, false], [true, false], [false, true], [true, true]] as const).map(([fx, fy], i) => (
        <Draw key={i} m={cornerMotif(theme, fx, fy)} width={corner} p={p}
          style={{ position: "absolute", left: fx ? w - inset - pt(1) - corner : inset + pt(1), top: fy ? h - inset - pt(1) - corner : inset + pt(1) }} />
      ))}
      {/* the couple, at the top */}
      <View style={{ position: "absolute", left: inset + corner, right: inset + corner, top: inset + pt(4) * k, alignItems: "center", color: p.ink, fontFamily: "Cormorant", fontWeight: 500, textAlign: "center" }}>
        <Draw m={top} width={w * (square ? 0.34 : 0.22)} p={p} style={{ marginBottom: 3 * k }} />
        <Kicker c={{ ...c, s: k }} size={7.5}>{e.title}</Kicker>
        <Tx style={o.nameFont === "script"
          ? { fontFamily: "GreatVibes", fontWeight: 400, fontSize: fitName, color: p.accent, lineHeight: 1.2, marginTop: 2 * k }
          : { fontWeight: 700, fontSize: fitName, lineHeight: 1.15, marginTop: 3 * k }}>{names}</Tx>
        <Draw m={div} width={w * 0.14} p={p} style={{ marginVertical: 3 * k }} />
        <Kicker c={{ ...c, s: k }} size={6.4}>{e.date}</Kicker>
      </View>
      {/* "To," and lines to write on, lower right */}
      <View style={{ position: "absolute", width: toW, right: inset + corner * (square ? 0.6 : 0.9), bottom: inset + pt(7) * k, color: p.ink, fontFamily: "Cormorant", fontWeight: 500 }}>
        <Tx style={{ fontStyle: "italic", fontSize: 10.5 * k, color: p.accent, marginBottom: 2 * k }}>{e.to}</Tx>
        <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
          <Tx style={{ fontSize: 10 * k, marginRight: 4 * k, marginBottom: 2 * k }}>{e.prefix}</Tx>
          <View style={{ ...rule, flexGrow: 1 }} />
          <Tx style={{ fontSize: 10 * k, marginLeft: 4 * k, marginBottom: 2 * k }}>{e.family}</Tx>
        </View>
        <View style={{ ...rule, marginTop: 4 * k }} />
        <View style={{ ...rule, marginTop: 4 * k }} />
      </View>
      {/* "From:" the hosts and their city, lower left */}
      {(
        <View style={{ position: "absolute", width: w - toW - 2 * (inset + corner) - 10 * k, left: inset + corner * 0.9, bottom: inset + pt(7) * k, color: p.ink, fontFamily: "Cormorant", fontWeight: 500 }}>
          <Tx style={{ fontStyle: "italic", fontSize: 9 * k, color: p.accent }}>{e.from}</Tx>
          <Tx style={{ fontWeight: 600, fontSize: 9 * k, marginTop: 1 * k }}>{e.fromName}</Tx>
          {e.fromPlace ? <Tx style={{ fontSize: 8.5 * k, color: p.soft }}>{e.fromPlace}</Tx> : null}
        </View>
      )}
    </View>
  );
}

/** The crest letters in a seal, where the flap closes. `flip` turns it upside down (a flap folded over). */
function Seal({ c, inv, size, x, y, flip = false }: { c: Ctx; inv: Invitation; size: number; x: number; y: number; flip?: boolean }) {
  return (
    <View style={{ position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size, ...(flip ? { transform: "rotate(180deg)" } : {}) }}>
      <Crest c={{ ...c, s: 0 }} text={inv.envelope.seal} size={size} />
    </View>
  );
}

/**
 * The envelope: one sheet to cut and fold, in the card's colours, with the
 * seal on the outside of the top flap.
 */
function EnvelopePages({ c, inv }: { c: Ctx; inv: Invitation }) {
  const env = envelopeFor(c.o).mm;
  const p = c.p;
  const fit = flatSheet(env);
  const d = fit.die;
  const [SW, SH] = fit.mm.map(pt);
  const ox = (SW - pt(d.width)) / 2, oy = (SH - pt(d.height)) / 2;
  const X = (mm: number) => ox + pt(mm), Y = (mm: number) => oy + pt(mm);
  const L = d.side, R = d.side + d.W, T = d.top, B = d.top + d.H, mid = d.side + d.W / 2;
  const r = 3; // corner rounding, mm
  // the outline, clockwise from the top-left of the front panel
  const outline = [
    `M ${X(L)} ${Y(T)}`,
    // top flap: a point with a soft tip
    `L ${X(mid - 9)} ${Y(4)} Q ${X(mid)} ${Y(-1)} ${X(mid + 9)} ${Y(4)} L ${X(R)} ${Y(T)}`,
    // right flap
    `L ${X(R + d.side - r)} ${Y(T + d.taper)} Q ${X(R + d.side)} ${Y(T + d.taper + 1)} ${X(R + d.side)} ${Y(T + d.taper + r)}`,
    `L ${X(R + d.side)} ${Y(B - d.taper - r)} Q ${X(R + d.side)} ${Y(B - d.taper - 1)} ${X(R + d.side - r)} ${Y(B - d.taper)} L ${X(R)} ${Y(B)}`,
    // bottom flap
    `L ${X(R - d.inset)} ${Y(B + d.bottom - r)} Q ${X(R - d.inset - 1)} ${Y(B + d.bottom)} ${X(R - d.inset - r)} ${Y(B + d.bottom)}`,
    `L ${X(L + d.inset + r)} ${Y(B + d.bottom)} Q ${X(L + d.inset + 1)} ${Y(B + d.bottom)} ${X(L + d.inset)} ${Y(B + d.bottom - r)} L ${X(L)} ${Y(B)}`,
    // left flap
    `L ${X(r)} ${Y(B - d.taper)} Q ${X(0)} ${Y(B - d.taper - 1)} ${X(0)} ${Y(B - d.taper - r)}`,
    `L ${X(0)} ${Y(T + d.taper + r)} Q ${X(0)} ${Y(T + d.taper + 1)} ${X(r)} ${Y(T + d.taper)} Z`,
  ].join(" ");
  // an accent line just inside the top flap's edge
  const flapLine = `M ${X(L + 6)} ${Y(T - 1.5)} L ${X(mid - 7)} ${Y(8)} Q ${X(mid)} ${Y(4.5)} ${X(mid + 7)} ${Y(8)} L ${X(R - 6)} ${Y(T - 1.5)}`;
  const cut = "#8a857d";
  return (
    <Page size={[SW, SH]} style={{ backgroundColor: "#ffffff" }}>
      {/* one fixed frame for everything, so nothing flows onto a second page */}
      <View wrap={false} style={{ position: "absolute", left: 0, top: 0, width: SW, height: SH }}>
      <Svg style={{ position: "absolute", left: 0, top: 0 }} width={SW} height={SH}>
        <Path d={outline} fill={p.bg} stroke={cut} strokeWidth={0.6} />
        <Path d={flapLine} fill="none" stroke={p.accent} strokeWidth={0.7} />
        {/* fold lines: the front panel's four edges */}
        <SvgLine x1={X(L)} y1={Y(T)} x2={X(R)} y2={Y(T)} stroke={cut} strokeWidth={0.5} strokeDasharray={DASH} />
        <SvgLine x1={X(L)} y1={Y(B)} x2={X(R)} y2={Y(B)} stroke={cut} strokeWidth={0.5} strokeDasharray={DASH} />
        <SvgLine x1={X(L)} y1={Y(T)} x2={X(L)} y2={Y(B)} stroke={cut} strokeWidth={0.5} strokeDasharray={DASH} />
        <SvgLine x1={X(R)} y1={Y(T)} x2={X(R)} y2={Y(B)} stroke={cut} strokeWidth={0.5} strokeDasharray={DASH} />
      </Svg>
      <EnvelopeFront c={c} inv={inv} w={pt(d.W)} h={pt(d.H)} x={X(L)} y={Y(T)} />
      {/* the seal on the outside of the top flap, near its tip: upside down here, upright once folded */}
      <Seal c={c} inv={inv} size={pt(Math.min(d.W, d.H) * 0.2)} x={X(mid)} y={Y(Math.min(d.top * 0.32, 22))} flip />
      {/* how to make it, where the sheet has room below the template */}
      {oy >= pt(7) && (
        <Text style={{ position: "absolute", left: pt(6), right: pt(6), bottom: Math.min(pt(4), oy / 2 - 5), textAlign: "center", fontFamily: "Cormorant", fontSize: 8.5, color: cut }}>
          {`Print on ${fit.label} · cut along the solid line · fold along the dashes, flaps behind the front · glue the side flaps under the bottom one · envelope ${envelopeFor(c.o).name}`}
        </Text>
      )}
      </View>
    </Page>
  );
}

/* ── the folded card ──────────────────────────────────────────── */

/**
 * The folded card's cover (panel 1): the couple and the date, "To, Shri /
 * Smt. ____ & Family" with lines to write on, and "From:" the hosts and city.
 */
function FoldCover({ c: base, inv }: { c: Ctx; inv: Invitation }) {
  const e = inv.envelope;
  const o = base.o;
  const top = topMotif(base.theme), div = dividerMotif(base.theme);
  const names = `${e.first} ${e.joiner} ${e.second}`;
  const nameBase = o.nameFont === "script" ? 30 : 24;
  const nameFs = nameBase * Math.min(1, 24 / Math.max(names.length, 1));
  // with an envelope printed too, the guest's name and the hosts go on the envelope
  const address = o.envelope === "none";
  const need = (70 * top.h) / top.w + 8 + 12 + nameFs * 1.3 + 22 + 12 + (address ? 34 + 18 + 15 + 15 + 15 + 30 + 14 + 13 + (e.fromPlace ? 13 : 0) : 0);
  const k = Math.max(0.55, Math.min(base.grow, contentHeight(base, o.toran) / (need * base.s)));
  const c = { ...base, s: base.s * k };
  const rule = { borderBottomWidth: 0.6, borderBottomColor: c.p.soft, height: 15 * c.s };
  return (
    <Card c={base}>
      <Draw m={top} width={70 * c.s} p={c.p} style={{ marginBottom: 8 * c.s }} />
      <Kicker c={c} size={8}>{e.title}</Kicker>
      <Tx style={o.nameFont === "script"
        ? { fontFamily: "GreatVibes", fontWeight: 400, fontSize: nameFs * c.s, color: c.p.accent, lineHeight: 1.25, marginTop: 3 * c.s }
        : { fontWeight: 700, fontSize: nameFs * c.s, lineHeight: 1.15, marginTop: 4 * c.s }}>{names}</Tx>
      <Draw m={div} width={46 * c.s} p={c.p} style={{ marginVertical: 6 * c.s }} />
      <Kicker c={c} size={7}>{e.date}</Kicker>
      {address && <>
      <View style={{ width: "86%", marginTop: 26 * c.s, alignItems: "stretch", textAlign: "left" }}>
        <Tx style={{ fontStyle: "italic", fontSize: 11 * c.s, color: c.p.accent, marginBottom: 2 * c.s }}>{e.to}</Tx>
        <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
          <Tx style={{ fontSize: 10.5 * c.s, marginRight: 4 * c.s, marginBottom: 2 * c.s }}>{e.prefix}</Tx>
          <View style={{ ...rule, flexGrow: 1 }} />
        </View>
        <View style={{ ...rule, marginTop: 5 * c.s }} />
        <View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 5 * c.s }}>
          <View style={{ ...rule, flexGrow: 1 }} />
          <Tx style={{ fontSize: 10.5 * c.s, marginLeft: 4 * c.s, marginBottom: 2 * c.s }}>{e.family}</Tx>
        </View>
      </View>
      <View style={{ width: "86%", marginTop: 24 * c.s, alignItems: "flex-end", textAlign: "right" }}>
        <Tx style={{ fontStyle: "italic", fontSize: 9.5 * c.s, color: c.p.accent }}>{e.from}</Tx>
        <Tx style={{ fontWeight: 600, fontSize: 10 * c.s, marginTop: 1.5 * c.s }}>{e.fromName}</Tx>
        {e.fromPlace ? <Tx style={{ fontSize: 9.5 * c.s, color: c.p.soft }}>{e.fromPlace}</Tx> : null}
      </View>
      </>}
    </Card>
  );
}

/** The folded card's back (panel 4): the monogram crest, and the QR code under it when it's printed. */
function FoldBack({ c, inv, qr }: { c: Ctx; inv: Invitation; qr: string | null }) {
  const size = Math.min(contentWidth(c) * (qr ? 0.42 : 0.5), contentHeight(c, false) * (qr ? 0.3 : 0.4));
  const qrW = Math.min(contentWidth(c) * 0.32, 54 * c.s);
  const div = dividerMotif(c.theme);
  return (
    <Card c={c} toran={false}>
      <Crest c={c} text={inv.envelope.seal} size={size} />
      <Draw m={div} width={40 * c.s} p={c.p} style={{ marginTop: 6 * c.s }} />
      {qr && (
        <View style={{ alignItems: "center", marginTop: 14 * c.s }}>
          <View style={{ backgroundColor: "#ffffff", padding: 2.5 * c.s, borderRadius: 2 }}>
            <Image src={qr} style={{ width: qrW, height: qrW }} />
          </View>
          <Tx style={{ fontStyle: "italic", fontSize: 7.5 * c.s, color: c.p.soft, marginTop: 3 * c.s }}>{c.labels.scan}</Tx>
        </View>
      )}
    </Card>
  );
}

/**
 * One sheet, printed both sides and folded in half. Outside: the back
 * (crest) on the left, the cover on the right. Inside: the invitation on the
 * left, the celebrations and details on the right. Each panel is the card size.
 */
function FoldedPages({ c, inv, qr }: { c: Ctx; inv: Invitation; qr: string | null }) {
  const spread = sheetFor(c.o);
  const w = c.trim[0];
  const left = { ...c, sheet: spread, panel: true };
  const right = { ...c, sheet: { ...spread, x: spread.x + w }, panel: true };
  const page = (a: React.ReactNode, b: React.ReactNode) => (
    <Page size={[pt(spread.page[0]), pt(spread.page[1])]} style={{ backgroundColor: spread.marks ? "#ffffff" : c.p.bg }}>
      <View wrap={false} style={{ position: "absolute", left: 0, top: 0, width: pt(spread.page[0]), height: pt(spread.page[1]) }}>
        {a}
        {b}
        {spread.marks && <CropMarks sheet={spread} trim={spread.trim} fold />}
      </View>
    </Page>
  );
  return (
    <>
      {/* the QR goes on the back, under the crest */}
      {page(<FoldBack c={left} inv={inv} qr={qr} />, <FoldCover c={right} inv={inv} />)}
      {page(<Front c={left} inv={inv} />, <Back c={right} inv={inv} qr={null} always />)}
    </>
  );
}

/* ── back and event cards ─────────────────────────────────────── */

function EventBlock({ c, e, width }: { c: Ctx; e: EventCard; width: string }) {
  return (
    <View style={{ width, alignItems: "center", paddingHorizontal: 4 * c.s, marginBottom: 9 * c.s }} wrap={false}>
      {c.o.icons && <EventIcon c={c} e={e} size={15} gap={2} />}
      <Tx style={{ fontWeight: 700, fontSize: 15 * c.s, lineHeight: 1.1 }}>{e.name}</Tx>
      {e.sideLabel && <Kicker c={c} size={5.6}>{e.sideLabel}</Kicker>}
      <Tx style={{ fontSize: 9.5 * c.s, marginTop: 2 * c.s }}>{`${e.date} · ${e.time}`}</Tx>
      <Tx style={{ fontWeight: 600, fontSize: 10 * c.s, marginTop: 1.5 * c.s }}>{e.venue}</Tx>
      <Tx style={{ fontSize: 8.8 * c.s, color: c.p.soft }}>{e.address}</Tx>
      {e.dressCode && <Tx style={{ fontStyle: "italic", fontSize: 8.5 * c.s, color: c.p.soft, marginTop: 1 * c.s }}>{`${c.labels.dress}: ${e.dressCode}`}</Tx>}
    </View>
  );
}

/** A celebration's icon: the family's own upload in the card's accent colour, or the drawn one. */
function EventIcon({ c, e, size, gap }: { c: Ctx; e: { icon: Parameters<typeof icon>[0]; iconImage: string | null }; size: number; gap: number }) {
  const own = iconPng(e.iconImage, c.p.accent);
  if (own) return <Image src={own} style={{ width: size * c.s, height: size * c.s, marginBottom: gap * c.s }} />;
  return <Draw m={icon(e.icon)} width={size * c.s} p={c.p} style={{ marginBottom: gap * c.s }} />;
}

/** "Mrs. Manisha Kosambi 9427702237" → the name, and the number on its own line. */
function splitContact(line: string): { name: string; phone: string } {
  const m = line.match(/(\+?\d[\d\s\-().]{5,}\d)\s*$/);
  if (!m) return { name: line, phone: "" };
  return { name: line.slice(0, m.index).replace(/[\s\-–:,]+$/, ""), phone: m[1] };
}

/**
 * The foot of the back: a rule, then R.S.V.P. on the left, the QR in the
 * middle and the compliments on the right — the same heading style and the
 * columns centred on one another — and the closing line under a small rule.
 * Each contact is a name with its number beneath, so nothing breaks mid-line.
 */
function DetailsBlock({ c, d, qr }: { c: Ctx; d: Details; qr: string | null }) {
  const hasRsvp = d.rsvp.length > 0 || !!d.replyBy, hasComp = d.compliments.length > 0;
  const cols = [hasRsvp, !!qr, hasComp].filter(Boolean).length;
  const side = c.trim[0] >= 120 && cols > 1; // side by side when there's room
  const qrW = "26%";
  const textW = !side ? "100%" : qr ? (cols === 3 ? "37%" : "60%") : "50%";
  const col = (width: string) => ({ width, alignItems: "center" as const, paddingHorizontal: 4 * c.s, marginTop: side ? 0 : 6 * c.s });
  const head = { fontStyle: "italic" as const, fontSize: 8.6 * c.s, color: c.p.accent, marginBottom: 2.5 * c.s };
  const contacts = d.rsvp.map(splitContact);
  // two contacts and no other column: set them side by side
  const pair = contacts.length === 2 && (!side || (!qr && !hasComp));
  const person = (p: { name: string; phone: string }, i: number, stacked: boolean) => (
    <View key={i} style={{ alignItems: "center", marginTop: stacked && i ? 3 * c.s : 0, paddingHorizontal: stacked ? 0 : 7 * c.s }}>
      {p.name ? <Tx style={{ fontWeight: 600, fontSize: 8.8 * c.s }}>{p.name}</Tx> : null}
      {p.phone ? <Text style={{ fontSize: 8.8 * c.s, letterSpacing: 0.3 }}>{keepNumbers(p.phone)}</Text> : null}
    </View>
  );
  const body = cols > 0 && (
    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center", width: "100%" }}>
      {hasRsvp && (
        <View style={col(textW)}>
          <Tx style={head}>{c.labels.rsvp}</Tx>
          {pair
            ? <View style={{ flexDirection: "row", justifyContent: "center" }}>{contacts.map((p, i) => person(p, i, false))}</View>
            : contacts.map((p, i) => person(p, i, true))}
          {d.replyBy && <Tx style={{ fontStyle: "italic", fontSize: 8 * c.s, color: c.p.soft, marginTop: 2.5 * c.s }}>{d.replyBy}</Tx>}
        </View>
      )}
      {qr && (
        <View style={col(side ? qrW : "100%")}>
          <View style={{ backgroundColor: "#ffffff", padding: 2.5 * c.s, borderRadius: 2 }}>
            <Image src={qr} style={{ width: 46 * c.s, height: 46 * c.s }} />
          </View>
          <Tx style={{ fontStyle: "italic", fontSize: 7 * c.s, color: c.p.soft, marginTop: 2.5 * c.s }}>{c.labels.scan}</Tx>
        </View>
      )}
      {hasComp && (
        <View style={col(textW)}>
          <Tx style={head}>{c.labels.compliments}</Tx>
          {d.compliments.map((l, i) => <Tx key={i} style={{ fontWeight: i ? 400 : 600, fontSize: 8.8 * c.s }}>{l}</Tx>)}
        </View>
      )}
    </View>
  );
  return (
    <View style={{ alignItems: "center", width: "100%", marginTop: 4 * c.s }}>
      {cols > 0 && <View style={{ width: "70%", height: 0.6, backgroundColor: c.p.hair, marginBottom: 7 * c.s }} />}
      {body}
      {d.note && cols > 0 && <View style={{ width: 24 * c.s, height: 0.6, backgroundColor: c.p.accent, marginTop: 7 * c.s }} />}
      {d.note && <Tx style={{ fontStyle: "italic", fontSize: 9.5 * c.s, color: c.p.accent, marginTop: 5 * c.s }}>{d.note}</Tx>}
    </View>
  );
}

function Back({ c, inv, qr, always = false }: { c: Ctx; inv: Invitation; qr: string | null; always?: boolean }) {
  const evs = inv.back.events;
  const d = inv.back.details;
  const photo = c.o.photo && c.o.photoPlace === "back" ? c.o.photo : null;
  const hasDetails = d.rsvp.length || d.replyBy || d.compliments.length || d.note || qr;
  if (!evs.length && !hasDetails && !photo) return always ? <Card c={c} toran={false}>{null}</Card> : null;
  // shrink the type so a long programme still fits the back of the card
  const ratio = c.trim[0] / c.trim[1];
  const cols = (ratio > 1.15 && evs.length > 2) || (ratio > 0.95 && evs.length > 3) ? 2 : 1;
  const rows = Math.ceil(evs.length / cols);
  const photoW = Math.min(contentWidth(c) * 0.32, 90 * c.s);
  const need = (photo ? (photoW / c.s) * (c.o.photoShape === "arch" ? 1.25 : 1) + 12 : 0) +
    (evs.length ? 30 : 0) + rows * (c.o.icons ? 92 : 74) + (hasDetails ? (qr ? 105 : 60) : 0);
  const k = Math.max(0.5, Math.min(c.grow, contentHeight(c, false) / (need * c.s)));
  const cc = { ...c, s: c.s * k };
  const div = dividerMotif(c.theme);
  return (
    <Card c={c} toran={false}>
      {photo && <Photo c={cc} src={photo} width={photoW * k} />}
      {evs.length > 0 && <Kicker c={cc} size={8}>{c.labels.celebrations}</Kicker>}
      {evs.length > 0 && <Draw m={div} width={50 * cc.s} p={c.p} style={{ marginVertical: 5 * cc.s }} />}
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", width: "100%" }}>
        {evs.map((e) => <EventBlock key={e.id} c={cc} e={e} width={cols === 2 ? "50%" : "100%"} />)}
      </View>
      {hasDetails ? <DetailsBlock c={cc} d={d} qr={qr} /> : null}
    </Card>
  );
}

function Insert({ c: base, card }: { c: Ctx; card: InsertCard }) {
  const e = card.event;
  const o = base.o;
  const top = topMotif(base.theme), div = dividerMotif(base.theme);
  const need = 16 + 14 + (66 * top.h) / top.w + 12 + nameSize(e.name, 28) * 1.2 + (e.sideLabel ? 10 : 0) + 18 +
    (card.couple ? 17 : 0) + 16 + 12 + 13 + 20 + 13 + (e.dressCode ? 17 : 0) + (o.icons ? 30 : 0);
  const k = Math.max(0.55, Math.min(base.grow, contentHeight(base, o.toran) / (need * base.s)));
  const c = { ...base, s: base.s * k };
  return (
    <Card c={base}>
      <Tx style={{ fontWeight: 600, fontSize: 11 * c.s }}>{card.hosts}</Tx>
      <Tx style={{ fontStyle: "italic", fontSize: 10.5 * c.s, color: c.p.soft, marginTop: 2 * c.s }}>{card.request}</Tx>
      <Draw m={top} width={66 * c.s} p={c.p} style={{ marginVertical: 5 * c.s }} />
      {o.icons && <EventIcon c={c} e={e} size={24} gap={4} />}
      <Tx style={o.nameFont === "script"
        ? { fontFamily: "GreatVibes", fontWeight: 400, fontSize: nameSize(e.name, 34) * c.s, lineHeight: 1.15, color: c.p.accent }
        : { fontWeight: 700, fontSize: nameSize(e.name, 28) * c.s, lineHeight: 1.05 }}>{e.name}</Tx>
      {e.sideLabel && <Kicker c={c} size={6}>{e.sideLabel}</Kicker>}
      <Tx style={{ fontStyle: "italic", fontSize: 10 * c.s, color: c.p.soft, marginTop: 6 * c.s }}>{card.occasion}</Tx>
      {card.couple && <Tx style={{ fontWeight: 600, fontSize: 13 * c.s, marginTop: 2 * c.s }}>{card.couple}</Tx>}
      <Draw m={div} width={50 * c.s} p={c.p} style={{ marginVertical: 6 * c.s }} />
      <Kicker c={c} size={8}>{e.date}</Kicker>
      <Tx style={{ fontSize: 10 * c.s, marginTop: 2 * c.s }}>{e.time}</Tx>
      <Tx style={{ fontWeight: 600, fontSize: 11.5 * c.s, marginTop: 7 * c.s }}>{e.venue}</Tx>
      <Tx style={{ fontSize: 9.5 * c.s, color: c.p.soft }}>{e.address}</Tx>
      {e.dressCode && <Tx style={{ fontStyle: "italic", fontSize: 9 * c.s, color: c.p.soft, marginTop: 5 * c.s }}>{`${c.labels.dress}: ${e.dressCode}`}</Tx>}
    </Card>
  );
}

/** The print-ready PDF: front, back (events and/or details), then one card per event. */
/**
 * The print-ready PDF. `part`: "all" (the preview: the cards, then the
 * envelope), "card" (the cards only) or "envelope" (the envelope sheet only).
 */
export async function renderInvitationPdf(inv: Invitation, o: InvitationOptions, theme: Theme, part: "all" | "card" | "envelope" = "all"): Promise<Buffer> {
  registerFonts();
  // folded cards are portrait or square panels; a landscape one prints as a flat card
  if (o.eventLayout === "folded") {
    if (!canFold(o)) o = { ...o, eventLayout: "together" };
  }
  const sheet = sheetFor(o);
  const trim = panelSize(o); // one half of a folded card
  const c: Ctx = {
    p: paletteFor(theme, o.colours), s: Math.min(trim[0], trim[1]) / 127, trim, sheet, theme, o, script: o.nameFont === "script",
    arch: o.frame === "arch" && trim[1] > trim[0],
    grow: o.fill === "fuller" ? 1.4 : 1,
    labels: inv.labels,
  };
  const qr = inv.back.details.qrUrl
    ? await QRCode.toDataURL(inv.back.details.qrUrl, { margin: 1, width: 360, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } })
    : null;
  const doc = (
    <Document title="Wedding invitation" creator="One Tap Invites" producer="One Tap Invites">
      {part !== "envelope" && (o.eventLayout === "folded" ? <FoldedPages c={c} inv={inv} qr={qr} /> : (
        <>
          <Front c={c} inv={inv} />
          <Back c={c} inv={inv} qr={qr} />
        </>
      ))}
      {part !== "envelope" && inv.inserts.map((card) => <Insert key={card.event.id} c={c} card={card} />)}
      {part !== "card" && o.envelope !== "none" && <EnvelopePages c={c} inv={inv} />}
    </Document>
  );
  return renderToBuffer(doc);
}
