/* The folded card: one sheet, two panels a side; cover, crest, invitation, celebrations. */
import { Page, View, Image } from "@react-pdf/renderer";
import type { Invitation } from "../content";
import { sheetFor } from "../options";
import { topMotif, dividerMotif } from "../motifs";

import { Card, Crest, CropMarks, Ctx, Draw, Kicker, Tx, contentHeight, contentWidth, pt } from "./primitives";
import { Front } from "./front";
import { Back } from "./back";

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
export function FoldedPages({ c, inv, qr }: { c: Ctx; inv: Invitation; qr: string | null }) {
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
