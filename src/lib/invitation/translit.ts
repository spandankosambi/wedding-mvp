/*
 * Roman → Devanagari / Gujarati spelling, for a first draft of names, places
 * and venues on a printed card in Hindi or Gujarati. It follows how Indian
 * names are usually written in English ("Pooja" → पूजा, "Spandan" → स्पंदन),
 * so it's a starting point the family corrects, not a translation.
 *
 * Gujarati letters sit at the same places as Devanagari ones, 0x180 further
 * on, so everything is spelled in Devanagari and shifted for Gujarati.
 *
 * Pure: runs in the browser and on the server.
 */

export type Script = "deva" | "gujr";

const V: Record<string, [string, string]> = {
  // vowel: [on its own, as a sign after a consonant]
  a: ["अ", ""], aa: ["आ", "ा"], i: ["इ", "ि"], ee: ["ई", "ी"], ii: ["ई", "ी"], u: ["उ", "ु"],
  oo: ["ऊ", "ू"], uu: ["ऊ", "ू"], e: ["ए", "े"], ai: ["ऐ", "ै"], ei: ["ऐ", "ै"], o: ["ओ", "ो"], au: ["औ", "ौ"],
  ou: ["औ", "ौ"], ri: ["ऋ", "ृ"],
};
const C: Record<string, string> = {
  ksh: "क्ष", chh: "छ", shr: "श्र", gny: "ज्ञ", gy: "ज्ञ", jn: "ज्ञ",
  kh: "ख", gh: "घ", ch: "च", jh: "झ", th: "थ", dh: "ध", ph: "फ", bh: "भ", sh: "श", tr: "त्र",
  k: "क", g: "ग", c: "क", j: "ज", t: "त", d: "द", n: "न", p: "प", f: "फ", b: "ब", m: "म",
  y: "य", r: "र", l: "ल", v: "व", w: "व", s: "स", h: "ह", z: "ज़", q: "क", x: "क्स",
};
const VKEYS = Object.keys(V).sort((a, b) => b.length - a.length);
// "ri" only as a vowel at the start ("Rishi" is still री…): keep it out of mid-word matching
const CKEYS = Object.keys(C).sort((a, b) => b.length - a.length);
const STOPS = new Set("kgcjtdpbfqxz".split(""));
const VIRAMA = "्", ANUSVARA = "ं";

/** Common English words on cards, already in the script (Devanagari). */
const WORDS: Record<string, string> = {
  mr: "श्री", "mr.": "श्री", shri: "श्री", shree: "श्री", sri: "श्री", mrs: "श्रीमती", "mrs.": "श्रीमती", smt: "श्रीमती", "smt.": "श्रीमती",
  ms: "सुश्री", "ms.": "सुश्री", dr: "डॉ.", "dr.": "डॉ.", late: "स्व.", "lt.": "स्व.", and: "&", family: "परिवार",
  road: "रोड", rd: "रोड", "rd.": "रोड", street: "स्ट्रीट", hotel: "होटल", resort: "रिसॉर्ट", temple: "मंदिर", lawns: "लॉन्स", lawn: "लॉन",
  ballroom: "बॉलरूम", banquet: "बैंक्वेट", hall: "हॉल", garden: "गार्डन", gardens: "गार्डन्स", palace: "पैलेस", club: "क्लब",
  residence: "निवास", house: "हाउस", farm: "फ़ार्म", farms: "फ़ार्म्स", party: "पार्टी", plot: "प्लॉट", west: "पश्चिम", east: "पूर्व",
  north: "उत्तर", south: "दक्षिण", near: "पास", opp: "सामने", "opp.": "सामने", the: "", of: "", at: "", grand: "ग्रैंड", regal: "रीगल",
  mumbai: "मुंबई", pune: "पुणे", delhi: "दिल्ली", "new": "नई", ahmedabad: "अहमदाबाद", surat: "सूरत", vadodara: "वडोदरा", baroda: "बड़ौदा",
  rajkot: "राजकोट", jaipur: "जयपुर", udaipur: "उदयपुर", jodhpur: "जोधपुर", bengaluru: "बेंगलुरु", bangalore: "बेंगलुरु", kolkata: "कोलकाता",
  chennai: "चेन्नई", hyderabad: "हैदराबाद", goa: "गोवा", indore: "इंदौर", bhopal: "भोपाल", lucknow: "लखनऊ", nagpur: "नागपुर",
  gujarat: "गुजरात", maharashtra: "महाराष्ट्र", rajasthan: "राजस्थान", india: "भारत", dubai: "दुबई", iskcon: "इस्कॉन",
  hare: "हरे", krishna: "कृष्ण", ganesh: "गणेश", ganesha: "गणेश", taj: "ताज", hyatt: "हयात", marriott: "मैरियट", leela: "लीला",
  sharma: "शर्मा", patel: "पटेल", shah: "शाह", mehta: "मेहता", gupta: "गुप्ता", kapoor: "कपूर", iyer: "अय्यर", desai: "देसाई", joshi: "जोशी",
  agarwal: "अग्रवाल", jain: "जैन", singh: "सिंह", kumar: "कुमार", kumari: "कुमारी", rao: "राव", reddy: "रेड्डी", nair: "नायर",
  pooja: "पूजा", puja: "पूजा", krishnan: "कृष्णन", chaudhary: "चौधरी", trivedi: "त्रिवेदी", pandya: "पंड्या", bhatt: "भट्ट",
  namah: "नमः", namaha: "नमः", ganeshaya: "गणेशाय", vivah: "विवाह", shubh: "शुभ",
};

const isVowelStart = (s: string, i: number) => VKEYS.some((v) => s.startsWith(v, i));

/** One word of letters → Devanagari. */
function word(w: string): string {
  const s = w.toLowerCase();
  const known = WORDS[s];
  if (known !== undefined) return known;
  let out = "";
  let i = 0;
  let prevConsonant = false;
  while (i < s.length) {
    // a consonant
    const ck = CKEYS.find((k) => s.startsWith(k, i));
    if (ck) {
      const next = i + ck.length;
      // n / m before a stop: a nasal dot over the letter before (स्पंदन, कोसंबी)
      if ((ck === "n" || ck === "m") && next < s.length && !isVowelStart(s, next) && STOPS.has(s[next]) && out) {
        if (prevConsonant) { /* keep the inherent vowel */ }
        out += ANUSVARA;
        prevConsonant = false;
        i = next;
        continue;
      }
      if (prevConsonant) out += VIRAMA; // a cluster: स्प, र्ज
      out += C[ck];
      prevConsonant = true;
      i = next;
      continue;
    }
    // a vowel
    const vk = VKEYS.find((k) => s.startsWith(k, i));
    if (vk) {
      let next = i + vk.length;
      const atEnd = next >= s.length;
      let [alone, sign] = V[vk];
      // names end long: Pooja → पूजा, Kumari → कुमारी
      if (atEnd && prevConsonant && vk === "a" && s.length > 2) [alone, sign] = V.aa;
      if (atEnd && prevConsonant && vk === "i") [alone, sign] = V.ee;
      // "a" before "a" etc. already covered by the longest match
      out += prevConsonant ? sign : alone;
      prevConsonant = false;
      i = next;
      next = i;
      continue;
    }
    // anything else (apostrophe, a stray mark): keep it
    out += s[i];
    prevConsonant = false;
    i++;
  }
  return out;
}

const toGujarati = (deva: string) =>
  Array.from(deva).map((ch) => {
    const cp = ch.codePointAt(0)!;
    // ज़ (with nukta) has no Gujarati letter: plain ઝ
    if (cp === 0x093c) return "";
    if (cp >= 0x0901 && cp <= 0x096f && cp !== 0x0964 && cp !== 0x0965) return String.fromCodePoint(cp + 0x180);
    return ch;
  }).join("");

/** Gujarati has its own word for a few that differ from Hindi. */
const GU_WORDS: Record<string, string> = { "परिवार": "પરિવાર", "पास": "પાસે", "सामने": "સામે", "भारत": "ભારત", "नई": "નવી", "पश्चिम": "પશ્ચિમ", "पूर्व": "પૂર્વ" };

/** A line of English-letter text → the script; anything already in an Indian script, and digits, stay as they are. */
export function transliterate(text: string, script: Script): string {
  return text
    .split(/([A-Za-z][A-Za-z.']*)/)
    .map((part) => {
      if (!/^[A-Za-z]/.test(part)) return part;
      const trail = /\.$/.test(part) && !WORDS[part.toLowerCase()] ? "." : "";
      const core = trail ? part.slice(0, -1) : part;
      let d = word(core.replace(/'/g, ""));
      if (script === "gujr") d = GU_WORDS[d] ?? toGujarati(d);
      return d + trail;
    })
    .join("")
    // "Rajesh & Manisha": the word for "and" a card would use
    .replace(/\s&\s/g, script === "gujr" ? " તથા " : " एवं ")
    .replace(/\s{2,}/g, " ")
    .replace(/^\s+|\s+$/g, "");
}

/** Has English letters that still need putting into the script. */
export const hasLatin = (s: string) => /[A-Za-z]/.test(s);
