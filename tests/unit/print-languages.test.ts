import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { localize } from "@/lib/invitation/i18n";
import { renderInvitationPdf } from "@/lib/invitation/pdf";
import { invitationSchema } from "@/lib/invitation/options";
import { transliterate } from "@/lib/invitation/translit";

const w = { brideName: "Pooja Kumari", groomName: "Spandan Kosambi", weddingDate: new Date("2027-01-29T05:00:00Z"), city: "Pune", rsvpDeadline: new Date("2027-01-10T00:00:00Z"), brideParents: "Mr. Ramesh & Mrs. Sunita Kumari", groomParents: "Mr. Rajesh & Mrs. Manisha Kosambi" };
const mk = (id: string, name: string, iso: string, venue: string, address: string, dress: string | null, sortOrder: number) =>
  ({ id, name, side: "both" as const, startsAt: new Date(iso), timeZone: "Asia/Kolkata", venueName: venue, address, dressCode: dress, isPublished: true, sortOrder });
const evs = [
  mk("11111111-1111-4111-8111-111111111111", "Haldi", "2027-01-28T04:30:00Z", "Kosambi Residence", "Unique Enclave, Keshav Nagar, Hadapsar, Pune", "Yellows", 1),
  mk("22222222-2222-4222-8222-222222222222", "Garba", "2027-01-28T13:30:00Z", "Shubh Lawns", "Magarpatta, Pune", "Chaniya choli", 2),
  mk("33333333-3333-4333-8333-333333333333", "Pheras", "2027-01-29T05:00:00Z", "Shubh Lawns", "Magarpatta, Pune", null, 3),
];
const opts = (lang: "en" | "gu" | "hi", extra = {}) => invitationSchema.parse({
  version: "groom", lang, cover: true, monogram: true, invocation: "Shri Ganeshaya Namah",
  rsvpGroom: "Mrs. Manisha Kosambi 9427702237\nMr. Rajesh Kosambi 9876543210", complimentsGroom: "Kosambi Parivar", ...extra,
});

describe("spelling names and places", () => {
  it("writes Indian names the way they're read", () => {
    expect(transliterate("Pooja", "deva")).toBe("पूजा");
    expect(transliterate("Spandan Kosambi", "deva")).toBe("स्पंदन कोसंबी");
    expect(transliterate("Spandan Kosambi", "gujr")).toBe("સ્પંદન કોસંબી");
    expect(transliterate("Ananya", "deva")).toBe("अनन्या");
    expect(transliterate("Shri Ganeshaya Namah", "gujr")).toBe("શ્રી ગણેશાય નમઃ");
    expect(transliterate("Mrs. Manisha 9427702237", "gujr")).toBe("શ્રીમતી મનિશા 9427702237");
  });
});

describe("cards in Gujarati and Hindi", () => {
  it("English is untouched and has nothing to edit", () => {
    const { inv, fields } = localize(w, evs, opts("en"), "https://x.test", "en");
    expect(fields).toHaveLength(0);
    expect(inv.front.lead[1].t).toBe("request the pleasure of your company");
    expect(inv.cover.title).toBe("The Wedding of");
  });

  it("Gujarati: the standard phrases, dates in Gujarati numerals, names spelled out", () => {
    const { inv, fields } = localize(w, evs, opts("gu"), "https://x.test", "gu");
    expect(inv.front.lead[1].t).toContain("આમંત્રણ");
    expect(inv.front.lead[2].t).toBe("અમારા સુપુત્રના શુભ લગ્ન પ્રસંગે");
    expect(inv.front.first).toBe("સ્પંદન કોસંબી");
    expect(inv.front.date).toMatch(/[૦-૯]/);
    expect(inv.front.date).toContain("જાન્યુઆરી");
    expect(inv.back.events[0].name).toBe("હલદી");
    expect(inv.back.events[0].time).toBe("સવારે ૧૦:૦૦ વાગ્યે");
    expect(inv.back.details.rsvp[0]).toBe("શ્રીમતી મનિશા કોસંબી 9427702237");
    expect(inv.labels.compliments).toBe("સ્નેહાધીન");
    expect(inv.cover.title).toBe("શુભ લગ્ન");
    // every field has a stable key, its English and our draft
    const keys = fields.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(expect.arrayContaining(["hosts", "request", "first", "second", "date", "event.11111111-1111-4111-8111-111111111111.time", "rsvp.0", "label.rsvp", "cover.title"]));
  });

  it("the family's own words win over the draft, everywhere the line is printed", () => {
    const { inv } = localize(w, evs, opts("hi", { eventLayout: "separate" }), "https://x.test", "hi", {
      first: "स्पन्दन कोसम्बी", "event.33333333-3333-4333-8333-333333333333.name": "पाणिग्रहण", hosts: "",
    });
    expect(inv.front.first).toBe("स्पन्दन कोसम्बी");
    expect(inv.cover.first).toBe("स्पन्दन कोसम्बी");
    expect(inv.inserts.find((c) => c.event.id.startsWith("3333"))!.event.name).toBe("पाणिग्रहण");
    // an emptied box falls back to our draft rather than printing nothing
    expect(inv.front.lead[0].t).toBe("श्री रजेश एवं श्रीमती मनिशा कोसंबी");
    expect(inv.inserts[0].couple).toContain(" एवं ");
  });

  it("renders a PDF with a cover in each language", async () => {
    for (const lang of ["gu", "hi"] as const) {
      const o = opts(lang);
      const { inv } = localize(w, evs, o, "https://x.test", lang);
      const pdf = await renderInvitationPdf(inv, o, "raj-mahal");
      expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
      // cover + front + back
      expect((pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length).toBe(3);
      if (process.env.CARD_OUT) fs.writeFileSync(`${process.env.CARD_OUT}/card-${lang}.pdf`, pdf);
    }
  }, 60_000);
});
