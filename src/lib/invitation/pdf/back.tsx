/* The back of the card (celebrations and details) and the event cards. */
import { iconPng } from "@/lib/core/icon-png";
import { View, Text, Image } from "@react-pdf/renderer";
import type { Invitation, EventCard, InsertCard, Details } from "../content";
import { icon } from "../decor";
import { topMotif, dividerMotif } from "../motifs";

import { Card, Ctx, Draw, Kicker, Photo, Tx, contentHeight, contentWidth, keepNumbers, nameSize } from "./primitives";

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

export function Back({ c, inv, qr, always = false }: { c: Ctx; inv: Invitation; qr: string | null; always?: boolean }) {
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

export function Insert({ c: base, card }: { c: Ctx; card: InsertCard }) {
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
