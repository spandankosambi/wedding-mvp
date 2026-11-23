/* The invitation's front: the symbol, the hosts, the couple, the date. */
import { iconPng } from "@/lib/core/icon-png";
import { View, Text, Image } from "@react-pdf/renderer";
import type { Invitation } from "../content";
import { symbol, isGlyph, SYMBOL_GLYPHS, type DrawnSymbol } from "../decor";
import { topMotif, dividerMotif } from "../motifs";

import { Card, Crest, Ctx, Draw, Kicker, Photo, Tx, Wording, contentHeight, contentWidth, nameSize } from "./primitives";

/* ── front ────────────────────────────────────────────────────── */

export function Front({ c: base, inv }: { c: Ctx; inv: Invitation }) {
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
