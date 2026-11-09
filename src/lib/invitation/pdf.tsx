import path from "node:path";
import QRCode from "qrcode";
import { Document, Page, View, Text, Image, Svg, Line as SvgLine, Path, Font, renderToBuffer } from "@react-pdf/renderer";
import type { Theme } from "@/themes/catalog";
import type { Invitation, EventCard, InsertCard, Details, Line } from "./content";
import { BLEED_MM, SAFE_MM, trimSize, type InvitationOptions } from "./options";

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
  Font.registerHyphenationCallback((w) => [w]); // never split names
  fontsReady = true;
}

/* ── colours: each website theme, as card stock or as ink on white ── */
type Palette = { bg: string; ink: string; accent: string; soft: string };
const THEME_CARD: Record<Theme, Palette> = {
  "ivory-editorial": { bg: "#faf8f4", ink: "#232323", accent: "#b5730a", soft: "#5d5a55" },
  "raj-mahal": { bg: "#2a0a10", ink: "#f5ead6", accent: "#d4a439", soft: "#d9c8aa" },
  "gulaab-rococo": { bg: "#fdf2f6", ink: "#4a2b3a", accent: "#c2447a", soft: "#7a5a69" },
  "mehfil-noor": { bg: "#0d1220", ink: "#e8ecf7", accent: "#d3aa5e", soft: "#aeb7cc" },
  "pichwai-bagh": { bg: "#0e2b22", ink: "#f1e9d6", accent: "#c9a145", soft: "#c9c0a8" },
  "neel-chhapa": { bg: "#f6f6f0", ink: "#22335e", accent: "#b8492d", soft: "#4f5b78" },
};
const LIGHT_INK: Record<Theme, Omit<Palette, "bg">> = {
  "ivory-editorial": { ink: "#232323", accent: "#b5730a", soft: "#5d5a55" },
  "raj-mahal": { ink: "#4a0f1a", accent: "#9a6f1a", soft: "#6b4a42" },
  "gulaab-rococo": { ink: "#4a2b3a", accent: "#c2447a", soft: "#7a5a69" },
  "mehfil-noor": { ink: "#1a2440", accent: "#8a6a2a", soft: "#4f5870" },
  "pichwai-bagh": { ink: "#0e3b2c", accent: "#8f6f22", soft: "#4c5f55" },
  "neel-chhapa": { ink: "#22335e", accent: "#b8492d", soft: "#4f5b78" },
};
export function paletteFor(theme: Theme, colours: InvitationOptions["colours"]): Palette {
  return colours === "theme" ? THEME_CARD[theme] : { bg: "#ffffff", ...LIGHT_INK[theme] };
}

/* ── geometry ─────────────────────────────────────────────────── */
const pt = (mm: number) => (mm * 72) / 25.4;
const A4: [number, number] = [210, 297];
const HOME_BLEED_MM = 2;
const SLUG_MM = 9; // room outside the bleed for crop marks

type Sheet = { page: [number, number]; x: number; y: number; bleed: number; marks: boolean };

/** Where the card sits on the PDF page, all in mm. */
export function sheetFor(o: InvitationOptions): Sheet & { trim: [number, number] } {
  const trim = trimSize(o);
  const [w, h] = trim;
  if (o.output === "home") {
    const fits = (pw: number, ph: number) => w + 2 * (HOME_BLEED_MM + SLUG_MM) <= pw && h + 2 * (HOME_BLEED_MM + SLUG_MM) <= ph;
    const page: [number, number] | null = fits(A4[0], A4[1]) ? A4 : fits(A4[1], A4[0]) ? [A4[1], A4[0]] : null;
    if (page) {
      return { trim, page, x: (page[0] - w) / 2 - HOME_BLEED_MM, y: (page[1] - h) / 2 - HOME_BLEED_MM, bleed: HOME_BLEED_MM, marks: true };
    }
    // as big as the sheet itself: print it as it is
    return { trim, page: [w, h], x: 0, y: 0, bleed: 0, marks: false };
  }
  const slug = o.cropMarks ? SLUG_MM : 0;
  return { trim, page: [w + 2 * (BLEED_MM + slug), h + 2 * (BLEED_MM + slug)], x: slug, y: slug, bleed: BLEED_MM, marks: o.cropMarks };
}

/* ── drawing ──────────────────────────────────────────────────── */
type Ctx = { p: Palette; s: number; trim: [number, number]; sheet: Sheet };

function CropMarks({ sheet, trim }: { sheet: Sheet; trim: [number, number] }) {
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
    </Svg>
  );
}

function Divider({ c, width = 60 }: { c: Ctx; width?: number }) {
  const w = width * c.s, d = 3.2 * c.s;
  return (
    <Svg width={w} height={d * 2 + 2} style={{ marginVertical: 5 * c.s }}>
      <SvgLine x1={0} y1={d + 1} x2={w / 2 - d - 3} y2={d + 1} stroke={c.p.accent} strokeWidth={0.6} />
      <Path d={`M ${w / 2} 1 L ${w / 2 + d} ${d + 1} L ${w / 2} ${2 * d + 1} L ${w / 2 - d} ${d + 1} Z`} fill={c.p.accent} />
      <SvgLine x1={w / 2 + d + 3} y1={d + 1} x2={w} y2={d + 1} stroke={c.p.accent} strokeWidth={0.6} />
    </Svg>
  );
}

/** One card: background to the bleed, a double frame, content centred inside. */
function Card({ c, children }: { c: Ctx; children: React.ReactNode }) {
  const { sheet, trim, p } = c;
  const bleedW = trim[0] + 2 * sheet.bleed, bleedH = trim[1] + 2 * sheet.bleed;
  const frame = sheet.bleed + SAFE_MM * 0.55;
  const inner = sheet.bleed + SAFE_MM + 3;
  return (
    <Page size={[pt(sheet.page[0]), pt(sheet.page[1])]} style={{ backgroundColor: sheet.marks ? "#ffffff" : p.bg }}>
      <View style={{ position: "absolute", left: pt(sheet.x), top: pt(sheet.y), width: pt(bleedW), height: pt(bleedH), backgroundColor: p.bg }}>
        <View style={{ position: "absolute", left: pt(frame), top: pt(frame), right: pt(frame), bottom: pt(frame), borderWidth: 0.9, borderColor: p.accent }} />
        <View style={{ position: "absolute", left: pt(frame + 1.4), top: pt(frame + 1.4), right: pt(frame + 1.4), bottom: pt(frame + 1.4), borderWidth: 0.35, borderColor: p.accent }} />
        <View style={{
          position: "absolute", left: pt(inner), top: pt(inner), right: pt(inner), bottom: pt(inner),
          alignItems: "center", justifyContent: "center", color: p.ink, fontFamily: "Cormorant", fontWeight: 500, textAlign: "center",
        }}>
          {children}
        </View>
      </View>
      {sheet.marks && <CropMarks sheet={sheet} trim={trim} />}
    </Page>
  );
}

/** Phone numbers never break across lines. */
const keepNumbers = (l: string) => l.replace(/(?<=[\d+])\s+(?=\d)/g, "\u00a0");

const nameSize = (name: string, base: number) => base * Math.min(1, 13 / Math.max(name.length, 1));

function Kicker({ c, children, size = 7.2 }: { c: Ctx; children: React.ReactNode; size?: number }) {
  return <Text style={{ fontFamily: "Cinzel", fontWeight: 600, fontSize: size * c.s, letterSpacing: 1.6 * c.s, color: c.p.accent }}>{children}</Text>;
}

function Wording({ c, lines }: { c: Ctx; lines: Line[] }) {
  return (
    <>
      {lines.map((l, i) => (
        <Text key={i} style={l.name
          ? { fontWeight: 600, fontSize: 11.5 * c.s, marginVertical: 1.5 * c.s }
          : { fontStyle: "italic", fontSize: 10.5 * c.s, color: c.p.soft, lineHeight: 1.25 }}>
          {l.t}
        </Text>
      ))}
    </>
  );
}

function Front({ c, inv }: { c: Ctx; inv: Invitation }) {
  const f = inv.front;
  return (
    <Card c={c}>
      {f.invocation && <Kicker c={c}>{f.invocation}</Kicker>}
      {f.invocation && <Divider c={c} />}
      <View style={{ marginTop: 4 * c.s, alignItems: "center" }}><Wording c={c} lines={f.lead} /></View>
      <Text style={{ fontWeight: 700, fontSize: nameSize(f.first, 30) * c.s, marginTop: 9 * c.s, lineHeight: 1.05 }}>{f.first}</Text>
      <Text style={{ fontStyle: "italic", fontSize: 13 * c.s, color: c.p.accent, marginVertical: 2 * c.s }}>{f.joiner}</Text>
      <Text style={{ fontWeight: 700, fontSize: nameSize(f.second, 30) * c.s, lineHeight: 1.05 }}>{f.second}</Text>
      {f.secondOf && <Text style={{ fontStyle: "italic", fontSize: 9.5 * c.s, color: c.p.soft, marginTop: 3 * c.s }}>{f.secondOf}</Text>}
      {f.after.length > 0 && <View style={{ marginTop: 8 * c.s, alignItems: "center" }}><Wording c={c} lines={f.after} /></View>}
      <Divider c={c} />
      <Kicker c={c} size={8.5}>{f.date}</Kicker>
      {f.place && <Text style={{ fontSize: 10 * c.s, marginTop: 3 * c.s, color: c.p.soft }}>{f.place}</Text>}
      {f.enclosed && <Text style={{ fontStyle: "italic", fontSize: 8.5 * c.s, marginTop: 9 * c.s, color: c.p.soft }}>{f.enclosed}</Text>}
    </Card>
  );
}

function EventBlock({ c, e, width }: { c: Ctx; e: EventCard; width: string }) {
  return (
    <View style={{ width, alignItems: "center", paddingHorizontal: 4 * c.s, marginBottom: 9 * c.s }} wrap={false}>
      <Text style={{ fontWeight: 700, fontSize: 15 * c.s, lineHeight: 1.1 }}>{e.name}</Text>
      {e.sideLabel && <Kicker c={c} size={5.6}>{e.sideLabel}</Kicker>}
      <Text style={{ fontSize: 9.5 * c.s, marginTop: 2 * c.s }}>{e.date} · {e.time}</Text>
      <Text style={{ fontWeight: 600, fontSize: 10 * c.s, marginTop: 1.5 * c.s }}>{e.venue}</Text>
      <Text style={{ fontSize: 8.8 * c.s, color: c.p.soft }}>{e.address}</Text>
      {e.dressCode && <Text style={{ fontStyle: "italic", fontSize: 8.5 * c.s, color: c.p.soft, marginTop: 1 * c.s }}>Dress: {e.dressCode}</Text>}
    </View>
  );
}

function DetailsBlock({ c, d, qr }: { c: Ctx; d: Details; qr: string | null }) {
  const hasRsvp = d.rsvp.length > 0 || !!d.replyBy, hasComp = d.compliments.length > 0;
  const side = c.trim[0] >= 120 && (qr || (hasRsvp && hasComp)); // side by side when there's room
  // the QR is narrow; the text columns share the rest
  const textW = side ? (qr ? (hasRsvp && hasComp ? "38%" : "60%") : "50%") : "100%";
  const col = (width: string) => ({ width, alignItems: "center" as const, paddingHorizontal: 3 * c.s, marginTop: 6 * c.s });
  return (
    <View style={{ alignItems: "center", width: "100%" }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "flex-start", width: "100%" }}>
        {hasRsvp && (
          <View style={col(textW)}>
            <Kicker c={c} size={6.6}>R.S.V.P.</Kicker>
            {d.rsvp.map((l, i) => <Text key={i} style={{ fontSize: 9 * c.s, marginTop: i ? 1 * c.s : 2 * c.s }}>{keepNumbers(l)}</Text>)}
            {d.replyBy && <Text style={{ fontStyle: "italic", fontSize: 8.5 * c.s, color: c.p.soft, marginTop: 2 * c.s }}>{d.replyBy}</Text>}
          </View>
        )}
        {qr && (
          <View style={col(side ? "24%" : "100%")}>
            <View style={{ backgroundColor: "#ffffff", padding: 3 * c.s, borderRadius: 2 }}>
              <Image src={qr} style={{ width: 52 * c.s, height: 52 * c.s }} />
            </View>
            <Text style={{ fontStyle: "italic", fontSize: 7.5 * c.s, color: c.p.soft, marginTop: 3 * c.s }}>Scan for the wedding website &amp; RSVP</Text>
          </View>
        )}
        {hasComp && (
          <View style={col(textW)}>
            <Text style={{ fontStyle: "italic", fontSize: 9 * c.s, color: c.p.accent }}>With best compliments from</Text>
            {d.compliments.map((l, i) => <Text key={i} style={{ fontSize: 9 * c.s, marginTop: i ? 0 : 2 * c.s }}>{l}</Text>)}
          </View>
        )}
      </View>
      {d.note && <Text style={{ fontStyle: "italic", fontSize: 9.5 * c.s, marginTop: 8 * c.s, color: c.p.accent }}>{d.note}</Text>}
    </View>
  );
}

function Back({ c, inv, qr }: { c: Ctx; inv: Invitation; qr: string | null }) {
  const evs = inv.back.events;
  const d = inv.back.details;
  const hasDetails = d.rsvp.length || d.replyBy || d.compliments.length || d.note || qr;
  if (!evs.length && !hasDetails) return null;
  // shrink the type so a long programme still fits the back of the card
  const ratio = c.trim[0] / c.trim[1];
  const cols = (ratio > 1.15 && evs.length > 2) || (ratio > 0.95 && evs.length > 3) ? 2 : 1;
  const rows = Math.ceil(evs.length / cols);
  const usable = pt(c.trim[1] - 2 * (SAFE_MM + 3));
  const need = (evs.length ? 26 : 0) + rows * 74 + (hasDetails ? (qr ? 105 : 60) : 0);
  const k = Math.max(0.55, Math.min(1, usable / (need * c.s)));
  const cc = { ...c, s: c.s * k };
  return (
    <Card c={c}>
      {evs.length > 0 && <Kicker c={cc} size={8}>The Celebrations</Kicker>}
      {evs.length > 0 && <Divider c={cc} />}
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", width: "100%" }}>
        {evs.map((e) => <EventBlock key={e.id} c={cc} e={e} width={cols === 2 ? "50%" : "100%"} />)}
      </View>
      {hasDetails ? <DetailsBlock c={cc} d={d} qr={qr} /> : null}
    </Card>
  );
}

function Insert({ c, card }: { c: Ctx; card: InsertCard }) {
  const e = card.event;
  return (
    <Card c={c}>
      <Text style={{ fontWeight: 600, fontSize: 11 * c.s }}>{card.hosts}</Text>
      <Text style={{ fontStyle: "italic", fontSize: 10.5 * c.s, color: c.p.soft, marginTop: 2 * c.s }}>{card.request}</Text>
      <Text style={{ fontWeight: 700, fontSize: nameSize(e.name, 28) * c.s, marginTop: 8 * c.s, lineHeight: 1.05 }}>{e.name}</Text>
      {e.sideLabel && <Kicker c={c} size={6}>{e.sideLabel}</Kicker>}
      <Text style={{ fontStyle: "italic", fontSize: 10 * c.s, color: c.p.soft, marginTop: 6 * c.s }}>{card.occasion}</Text>
      {card.couple && <Text style={{ fontWeight: 600, fontSize: 13 * c.s, marginTop: 2 * c.s }}>{card.couple}</Text>}
      <Divider c={c} />
      <Kicker c={c} size={8}>{e.date}</Kicker>
      <Text style={{ fontSize: 10 * c.s, marginTop: 2 * c.s }}>{e.time}</Text>
      <Text style={{ fontWeight: 600, fontSize: 11.5 * c.s, marginTop: 7 * c.s }}>{e.venue}</Text>
      <Text style={{ fontSize: 9.5 * c.s, color: c.p.soft }}>{e.address}</Text>
      {e.dressCode && <Text style={{ fontStyle: "italic", fontSize: 9 * c.s, color: c.p.soft, marginTop: 5 * c.s }}>Dress: {e.dressCode}</Text>}
    </Card>
  );
}

/** The print-ready PDF: front, back (events and/or details), then one card per event. */
export async function renderInvitationPdf(inv: Invitation, o: InvitationOptions, theme: Theme): Promise<Buffer> {
  registerFonts();
  const sheet = sheetFor(o);
  const trim = sheet.trim;
  const c: Ctx = { p: paletteFor(theme, o.colours), s: Math.min(trim[0], trim[1]) / 127, trim, sheet };
  const qr = inv.back.details.qrUrl
    ? await QRCode.toDataURL(inv.back.details.qrUrl, { margin: 1, width: 360, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } })
    : null;
  const doc = (
    <Document title="Wedding invitation" creator="Nimantran" producer="Nimantran">
      <Front c={c} inv={inv} />
      <Back c={c} inv={inv} qr={qr} />
      {inv.inserts.map((card) => <Insert key={card.event.id} c={c} card={card} />)}
    </Document>
  );
  return renderToBuffer(doc);
}
