import { buildInvitation, type CardEvent, type CardWedding, type Invitation } from "./content";
import type { InvitationOptions } from "./options";
import { transliterate, hasLatin, type Script } from "./translit";
import { zoneLabel, zoneNote } from "@/lib/core/timezones";

/*
 * The printed cards in another language. Every piece of text on the cards
 * has a stable key, its English wording, and an automatic first draft in the
 * chosen language: the standard phrases written out properly, dates and
 * times in that language, names and places spelled in its script. The family
 * corrects any of it on the "Card wording" page; their words are kept per
 * language and used only on the printed cards, never on the website.
 */

import type { CardLang, OtherLang } from "./langs";
const SCRIPT: Record<OtherLang, Script> = { gu: "gujr", hi: "deva" };
const LOCALE: Record<OtherLang, string> = { gu: "gu-IN-u-nu-gujr", hi: "hi-IN-u-nu-deva" };

/** What a family has changed, per language: key → their words. */
/* ── the standard phrases ─────────────────────────────────────── */
const P = {
  gu: {
    request: "આપને સહકુટુંબ પધારવા ભાવભર્યું આમંત્રણ પાઠવે છે",
    weddingDaughter: "અમારી સુપુત્રીના શુભ લગ્ન પ્રસંગે",
    weddingSon: "અમારા સુપુત્રના શુભ લગ્ન પ્રસંગે",
    joiner: "સંગ",
    sonOf: (x: string) => `${x}ના સુપુત્ર`,
    daughterOf: (x: string) => `${x}ની સુપુત્રી`,
    familyOf: (x: string) => `${x}નો પરિવાર`,
    enclosedOne: "પ્રસંગની વિગતો સાથે બીડેલ છે",
    enclosedMany: "દરેક પ્રસંગની વિગતો સાથે બીડેલ છે",
    insertRequest: "આપને પધારવા ભાવભર્યું આમંત્રણ પાઠવે છે",
    occasion: "શુભ લગ્ન પ્રસંગ નિમિત્તે",
    and: "અને",
    replyBy: (d: string) => `${d} સુધીમાં જવાબ આપવા વિનંતી`,
    side: (x: string) => `${x} પક્ષ`,
    labels: { celebrations: "શુભ પ્રસંગો", rsvp: "સંપર્ક", scan: "જવાબ આપવા સ્કેન કરો", compliments: "સ્નેહાધીન", dress: "પહેરવેશ" },
    envelope: { title: "શુભ લગ્ન", to: "પ્રતિ,", prefix: "શ્રી / શ્રીમતી", family: "સહ પરિવાર", from: "નિમંત્રક:" },
    dayParts: ["રાત્રે", "સવારે", "બપોરે", "સાંજે"],
    oclock: "વાગ્યે",
    time: "સમય",
  },
  hi: {
    request: "आपको सपरिवार सादर आमंत्रित करते हैं",
    weddingDaughter: "अपनी सुपुत्री के शुभ विवाह के पावन अवसर पर",
    weddingSon: "अपने सुपुत्र के शुभ विवाह के पावन अवसर पर",
    joiner: "संग",
    sonOf: (x: string) => `${x} के सुपुत्र`,
    daughterOf: (x: string) => `${x} की सुपुत्री`,
    familyOf: (x: string) => `${x} का परिवार`,
    enclosedOne: "समारोह का विवरण संलग्न है",
    enclosedMany: "प्रत्येक समारोह का विवरण संलग्न है",
    insertRequest: "आपको सादर आमंत्रित करते हैं",
    occasion: "शुभ विवाह के उपलक्ष्य में",
    and: "एवं",
    replyBy: (d: string) => `कृपया ${d} तक उत्तर दें`,
    side: (x: string) => `${x} पक्ष`,
    labels: { celebrations: "शुभ कार्यक्रम", rsvp: "संपर्क", scan: "उत्तर देने हेतु स्कैन करें", compliments: "दर्शनाभिलाषी", dress: "परिधान" },
    envelope: { title: "शुभ विवाह", to: "प्रति,", prefix: "श्री / श्रीमती", family: "सपरिवार", from: "निमंत्रक:" },
    dayParts: ["रात", "सुबह", "दोपहर", "शाम"],
    oclock: "बजे",
    time: "समय",
  },
} as const;

/** The usual Indian celebrations by name (Gujarati, Hindi); others are spelled out. */
const EVENTS: Record<string, [string, string]> = {
  haldi: ["હલદી", "हल्दी"], pithi: ["પીઠી", "पीठी"], mehendi: ["મહેંદી", "मेहंदी"], mehndi: ["મહેંદી", "मेहंदी"],
  sangeet: ["સંગીત સંધ્યા", "संगीत संध्या"], garba: ["ગરબા", "गरबा"], "dandiya": ["દાંડિયા રાસ", "डांडिया रास"],
  pheras: ["હસ્તમેળાપ", "फेरे"], phera: ["હસ્તમેળાપ", "फेरे"], wedding: ["લગ્ન", "विवाह"], "the wedding": ["લગ્ન", "विवाह"],
  reception: ["સ્વાગત સમારોહ", "स्वागत समारोह"], engagement: ["સગાઈ", "सगाई"], "ring ceremony": ["સગાઈ", "सगाई"],
  "ganesh puja": ["ગણેશ સ્થાપન", "गणेश पूजन"], "ganesh sthapana": ["ગણેશ સ્થાપન", "गणेश स्थापना"], mameru: ["મામેરું", "मामेरा"],
  "grah shanti": ["ગ્રહ શાંતિ", "ग्रह शांति"], "mandap muhurat": ["મંડપ મુહૂર્ત", "मंडप मुहूर्त"], baraat: ["જાન", "बारात"],
  "jaan": ["જાન", "बारात"], tilak: ["તિલક", "तिलक"], "roka": ["રોકા", "रोका"], cocktail: ["કોકટેલ", "कॉकटेल"],
  "sufi night": ["સૂફી સંધ્યા", "सूफ़ी संध्या"], "vidaai": ["વિદાય", "विदाई"], vidai: ["વિદાય", "विदाई"],
  "chooda": ["ચૂડા", "चूड़ा"], "satak": ["સત્ક", "सत्क"], "dinner": ["ભોજન", "भोजन"], "lunch": ["ભોજન", "भोजन"],
  "puja": ["પૂજા", "पूजा"], "griha pravesh": ["ગૃહ પ્રવેશ", "गृह प्रवेश"], "welcome lunch": ["સ્વાગત ભોજન", "स्वागत भोज"],
};

const spell = (s: string, l: OtherLang) => transliterate(s, SCRIPT[l]);
const eventName = (name: string, l: OtherLang, tx: (s: string) => string) => {
  const k = name.trim().toLowerCase();
  const hit = EVENTS[k] ?? EVENTS[k.replace(/s$/, "")];
  return hit ? hit[l === "gu" ? 0 : 1] : tx(name);
};

/** "Friday, 29 January 2027" in the language, with its own numerals. */
function langDate(d: Date, l: OtherLang, zone?: string | null, year = true) {
  return new Intl.DateTimeFormat(LOCALE[l], { timeZone: zone || "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", ...(year ? { year: "numeric" } : {}) }).format(d);
}
/** "સાંજે ૭:૦૦ વાગ્યે", "शाम 7:00 बजे" (+ "Dubai time" in the language, abroad) */
function langTime(d: Date, l: OtherLang, zone?: string | null) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone || "Asia/Kolkata", hour: "numeric", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const h = +parts.find((p) => p.type === "hour")!.value, m = parts.find((p) => p.type === "minute")!.value;
  const part = h < 5 || h >= 20 ? 0 : h < 12 ? 1 : h < 16 ? 2 : 3;
  const h12 = ((h + 11) % 12) + 1;
  const num = new Intl.NumberFormat(LOCALE[l], { useGrouping: false });
  const clock = `${num.format(h12)}:${m.split("").map((c) => num.format(+c)).join("")}`;
  const note = zoneNote(zone) ? ` (${spell(zoneLabel(zone!).replace(/\s*\(.*\)$/, "").split(" / ")[0], l)} ${P[l].time})` : "";
  return `${P[l].dayParts[part]} ${clock} ${P[l].oclock}${note}`;
}

/** "Mrs. Manisha Kosambi 9427702237": the name spelled out, the number kept. */
function contactLine(line: string, nm: (s: string) => string) {
  const m = line.match(/(\+?\d[\d\s\-().]{5,}\d)\s*$/);
  if (!m) return nm(line);
  return `${nm(line.slice(0, m.index).replace(/[\s\-–:,]+$/, ""))} ${m[1]}`;
}

/* ── the fields ───────────────────────────────────────────────── */

export { type CardField } from "./i18n-types";
import type { CardField } from "./i18n-types";
import type { Machine } from "./machine";

type Ctx = { w: CardWedding; all: CardEvent[]; o: InvitationOptions; l: OtherLang };

/**
 * The cards' text in a language: the invitation with every line replaced by
 * the family's words (from `text`) or our draft, plus the list of fields the
 * wording page shows. English returns the invitation as it is.
 */
export function localize(w: CardWedding, all: CardEvent[], o: InvitationOptions, siteUrl: string, lang: CardLang, text: Record<string, string> = {}, mt?: Machine): { inv: Invitation; fields: CardField[] } {
  const inv = buildInvitation(w, all, o, siteUrl);
  if (lang === "en") return { inv, fields: [] };
  const l = lang;
  const c: Ctx = { w, all, o, l };
  const fields: CardField[] = [];
  const seen = new Set<string>();
  /** record a field once, and return the words to print */
  const put = (f: Omit<CardField, "check"> & { check?: boolean }) => {
    if (!seen.has(f.key)) { seen.add(f.key); fields.push({ ...f, check: f.check ?? false }); }
    const mine = text[f.key];
    return mine !== undefined && mine.trim() !== "" ? mine : f.auto;
  };
  const ph = P[l];
  /** names and blessings, spelled out; free text, translated (Azure when on, else our rules) */
  const nm = (s: string) => mt?.get("name", s) ?? spell(s, l);
  const tx = (s: string) => mt?.get("text", s) ?? spell(s, l);
  const fromBride = o.version === "bride";
  const bp = w.brideParents?.trim() || null, gp = w.groomParents?.trim() || null;
  const hostsEn = inv.front.lead[0]?.t ?? "";
  const hostsAuto = (fromBride ? bp : gp) ? tx(hostsEn) : ph.familyOf(nm(fromBride ? w.brideName : w.groomName));

  /* front */
  const f = inv.front;
  if (f.invocation) f.invocation = put({ key: "invocation", group: "front", label: "Invocation", en: f.invocation, auto: nm(f.invocation) });
  f.shloka = f.shloka.map((s, i) => put({ key: `shloka.${i}`, group: "front", label: `Blessing, line ${i + 1}`, en: s, auto: nm(s), check: hasLatin(s) }));
  const hosts = put({ key: "hosts", group: "front", label: "The hosting family", en: hostsEn, auto: hostsAuto });
  const request = put({ key: "request", group: "front", label: "The invitation", en: inv.front.lead[1]?.t ?? "", auto: ph.request, long: true });
  const wedding = put({ key: "weddingOf", group: "front", label: "The occasion", en: inv.front.lead[2]?.t ?? "", auto: fromBride ? ph.weddingDaughter : ph.weddingSon, long: true });
  f.lead = [{ t: hosts, name: true }, { t: request }, { t: wedding }];
  const first = put({ key: "first", group: "front", label: "First name", en: f.first, auto: nm(f.first) });
  const second = put({ key: "second", group: "front", label: "Second name", en: f.second, auto: nm(f.second) });
  f.first = first; f.second = second;
  f.joiner = put({ key: "joiner", group: "front", label: "Between the names", en: f.joiner, auto: ph.joiner });
  if (f.secondOf) {
    const parents = fromBride ? gp! : bp!;
    f.secondOf = put({ key: "secondOf", group: "front", label: "Parents of the second name", en: f.secondOf, auto: fromBride ? ph.sonOf(tx(parents)) : ph.daughterOf(tx(parents)) });
  }
  f.date = put({ key: "date", group: "front", label: "Wedding date", en: f.date, auto: langDate(w.weddingDate, l, null) });
  if (f.place) f.place = put({ key: "place", group: "front", label: "City", en: f.place, auto: nm(f.place) });
  if (f.enclosed) f.enclosed = put({ key: "enclosed", group: "front", label: "Event cards enclosed", en: f.enclosed, auto: inv.inserts.length === 1 ? ph.enclosedOne : ph.enclosedMany });

  /* celebrations: the same words on the back and on their own cards */
  const raw = new Map(c.all.map((e) => [e.id, e]));
  const evFields = (e: Invitation["back"]["events"][number]) => {
    const src = raw.get(e.id)!;
    const head = `${src.name}: `;
    e.name = put({ key: `event.${e.id}.name`, group: "celebrations", label: `${src.name}`, en: e.name, auto: eventName(e.name, l, tx) });
    e.date = put({ key: `event.${e.id}.date`, group: "celebrations", label: `${head}date`, en: e.date, auto: langDate(src.startsAt, l, src.timeZone) });
    e.time = put({ key: `event.${e.id}.time`, group: "celebrations", label: `${head}time`, en: e.time, auto: langTime(src.startsAt, l, src.timeZone) });
    e.venue = put({ key: `event.${e.id}.venue`, group: "celebrations", label: `${head}venue`, en: e.venue, auto: tx(e.venue) });
    e.address = put({ key: `event.${e.id}.address`, group: "celebrations", label: `${head}address`, en: e.address, auto: tx(e.address), long: true });
    if (e.dressCode) e.dressCode = put({ key: `event.${e.id}.dress`, group: "celebrations", label: `${head}dress`, en: e.dressCode, auto: tx(e.dressCode), check: true });
    if (e.sideLabel) {
      const who = src.side === "groom" ? w.groomName : w.brideName;
      e.sideLabel = put({ key: `event.${e.id}.side`, group: "celebrations", label: `${head}whose`, en: e.sideLabel, auto: ph.side(nm(who.split(/\s+/)[0])) });
    }
  };
  inv.back.events.forEach(evFields);
  inv.inserts.forEach((card) => {
    evFields(card.event);
    card.hosts = hosts;
    card.request = put({ key: "insertRequest", group: "celebrations", label: "Event card: the invitation", en: card.request, auto: ph.insertRequest, long: true });
    card.occasion = put({ key: "insertOccasion", group: "celebrations", label: "Event card: the occasion", en: card.occasion, auto: ph.occasion, long: true });
    card.couple = `${first} ${ph.and} ${second}`;
  });

  /* details */
  const d = inv.back.details;
  d.rsvp = d.rsvp.map((s, i) => put({ key: `rsvp.${i}`, group: "details", label: `Contact ${i + 1}`, en: s, auto: contactLine(s, nm) }));
  if (d.replyBy && w.rsvpDeadline) {
    d.replyBy = put({ key: "replyBy", group: "details", label: "Reply by", en: d.replyBy, auto: ph.replyBy(new Intl.DateTimeFormat(LOCALE[l], { day: "numeric", month: "long", year: "numeric" }).format(w.rsvpDeadline)) });
  }
  d.compliments = d.compliments.map((s, i) => put({ key: `compliments.${i}`, group: "details", label: `Compliments, line ${i + 1}`, en: s, auto: tx(s) }));
  if (d.note) d.note = put({ key: "note", group: "details", label: "Closing line", en: d.note, auto: tx(d.note), long: true, check: true });

  /* headings and envelope */
  const lb = inv.labels;
  (Object.keys(lb) as (keyof typeof lb)[]).forEach((k) => {
    lb[k] = put({ key: `label.${k}`, group: "headings", label: ({ celebrations: "Heading over the celebrations", rsvp: "Heading over the contacts", scan: "Under the QR code", compliments: "Heading over the compliments", dress: "Before each dress code" })[k], en: lb[k], auto: ph.labels[k] });
  });
  const ev = inv.envelope, pe = ph.envelope;
  inv.envelope = {
    ...ev,
    title: put({ key: "envelope.title", group: "headings", label: "Envelope: heading", en: ev.title, auto: pe.title }),
    to: put({ key: "envelope.to", group: "headings", label: "Envelope: before the guest's name", en: ev.to, auto: pe.to }),
    prefix: put({ key: "envelope.prefix", group: "headings", label: "Envelope: title before the name", en: ev.prefix, auto: pe.prefix }),
    family: put({ key: "envelope.family", group: "headings", label: "Envelope: after the name", en: ev.family, auto: pe.family }),
    from: put({ key: "envelope.from", group: "headings", label: "Folded card: before the hosts", en: ev.from, auto: pe.from }),
    fromName: hosts, fromPlace: f.place,
    first, second, joiner: ph.and, date: f.date,
  };
  return { inv, fields };
}
