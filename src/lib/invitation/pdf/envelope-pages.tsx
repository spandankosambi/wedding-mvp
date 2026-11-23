/* The cut-and-fold envelope: its front, the seal, and the sheet with cut and fold lines. */
import { Page, View, Text, Svg, Line as SvgLine, Path } from "@react-pdf/renderer";
import type { Invitation } from "../content";
import { envelopeFor, flatSheet } from "../envelope";
import { topMotif, dividerMotif, cornerMotif } from "../motifs";

import { Crest, Ctx, Draw, Kicker, Tx, pt } from "./primitives";

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
export function EnvelopePages({ c, inv }: { c: Ctx; inv: Invitation }) {
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
