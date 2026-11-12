import { describe, it, expect } from "vitest";
import { invitationSchema, trimSize } from "@/lib/invitation/options";
import { buildInvitation, eventsFor, fileName, type CardEvent } from "@/lib/invitation/content";
import { renderInvitationPdf, sheetFor } from "@/lib/invitation/pdf";

const o = (over: Record<string, unknown> = {}) => invitationSchema.parse(over);
const d = (s: string) => new Date(s);
const parents = { brideParents: "Mr. & Mrs. Anil Kulkarni", groomParents: "Mr. & Mrs. Rajesh Kosambi" };
// parents' names come from the couple's site, not the print dialog
const wedding = { brideName: "Pooja", groomName: "Spandan", weddingDate: d("2027-01-29T04:30:00Z"), city: "Pune", rsvpDeadline: d("2027-01-10T00:00:00Z"), ...parents };
const noParents = { ...wedding, brideParents: null, groomParents: null };
const ev = (n: number, name: string, side: CardEvent["side"], isPublished = true): CardEvent => ({
  id: `00000000-0000-4000-8000-00000000000${n}`, name, side, startsAt: d("2027-01-27T04:30:00Z"),
  venueName: `${name} venue`, address: "Pune", dressCode: "Yellow", isPublished, sortOrder: n,
});
const events = [ev(1, "Haldi", "bride"), ev(2, "Haldi", "groom"), ev(3, "Sangeet", "both"), ev(4, "Wedding", "both"), ev(5, "Puja", "both", false)];

describe("card sizes", () => {
  it("uses standard trim sizes, turned for landscape", () => {
    expect(trimSize(o())).toEqual([127, 178]);
    expect(trimSize(o({ size: "a5", orientation: "landscape" }))).toEqual([210, 148]);
    expect(trimSize(o({ size: "custom", customWidthMm: 200, customHeightMm: 100 }))).toEqual([100, 200]);
  });
  it("needs both sides of a custom size, within limits", () => {
    expect(invitationSchema.safeParse({ size: "custom", customWidthMm: 120 }).success).toBe(false);
    expect(invitationSchema.safeParse({ size: "custom", customWidthMm: 50, customHeightMm: 120 }).success).toBe(false);
  });
  it("adds 3 mm bleed for a print shop, crop marks on request, or centres the card on A4 at home", () => {
    expect(sheetFor(o())).toMatchObject({ page: [133, 184], bleed: 3, marks: false });
    expect(sheetFor(o({ cropMarks: true })).page).toEqual([151, 202]);
    expect(sheetFor(o({ output: "home" }))).toMatchObject({ page: [210, 297], marks: true });
    expect(sheetFor(o({ output: "home", size: "a4" }))).toMatchObject({ page: [210, 297], marks: false, bleed: 0 });
  });
});

describe("which events", () => {
  it("each version shows common events plus its own side's, from the site", () => {
    const names = (v: "bride" | "groom") => eventsFor(events, o({ version: v })).map((e) => e.id.slice(-1));
    expect(names("bride")).toEqual(["1", "3", "4"]);
    expect(names("groom")).toEqual(["2", "3", "4"]);
  });
  it("there are only the bride's family's and the groom's family's cards", () => {
    expect(invitationSchema.safeParse({ version: "both" }).success).toBe(false);
    expect(o().version).toBe("bride");
  });
  it("the couple's own pick wins, including none or a hidden event", () => {
    expect(eventsFor(events, o({ eventIds: [events[4].id, events[3].id] })).map((e) => e.name)).toEqual(["Wedding", "Puja"]);
    expect(eventsFor(events, o({ eventIds: [] }))).toEqual([]);
  });
});

describe("wording", () => {
  it("the bride's family invites to the wedding of their daughter", () => {
    const inv = buildInvitation(wedding, events, o({ version: "bride" }), "https://x/w/p");
    expect(inv.front.lead.map((l) => l.t)).toEqual(["Mr. & Mrs. Anil Kulkarni", "request the pleasure of your company", "at the wedding of their daughter"]);
    expect([inv.front.first, inv.front.joiner, inv.front.second, inv.front.secondOf]).toEqual(["Pooja", "with", "Spandan", "son of Mr. & Mrs. Rajesh Kosambi"]);
    expect(inv.front.date).toBe("29 January 2027");
  });
  it("the groom's family invites to the wedding of their son", () => {
    const inv = buildInvitation(wedding, events, o({ version: "groom" }), "https://x/w/p");
    expect(inv.front.lead[0]).toEqual({ t: "Mr. & Mrs. Rajesh Kosambi", name: true });
    expect(inv.front.lead[2].t).toBe("at the wedding of their son");
    expect([inv.front.first, inv.front.second, inv.front.secondOf]).toEqual(["Spandan", "Pooja", "daughter of Mr. & Mrs. Anil Kulkarni"]);
  });
  it("without parents' names on the site it still reads well", () => {
    const plain = buildInvitation(noParents, events, o({ version: "bride" }), "https://x/w/p");
    expect(plain.front.lead[0].t).toBe("The family of Pooja");
    expect(plain.front.secondOf).toBeNull();
  });
  it("events go on the back, or on a card each; an event from the other side says whose it is", () => {
    const back = buildInvitation(wedding, events, o({ version: "bride", eventIds: [events[1].id, events[2].id, events[3].id] }), "https://x/w/p");
    expect(back.back.events.map((e) => [e.name, e.sideLabel])).toEqual([["Haldi", "Groom's side"], ["Sangeet", null], ["Wedding", null]]);
    expect(back.inserts).toEqual([]);
    const cards = buildInvitation(wedding, events, o({ version: "groom", eventLayout: "separate" }), "https://x/w/p");
    expect(cards.back.events).toEqual([]);
    expect(cards.inserts.map((i) => [i.hosts, i.event.name, i.event.sideLabel, i.couple])).toEqual([
      [parents.groomParents, "Haldi", null, "Spandan & Pooja"], [parents.groomParents, "Sangeet", null, "Spandan & Pooja"], [parents.groomParents, "Wedding", null, "Spandan & Pooja"],
    ]);
    expect(cards.front.enclosed).toBe("Details of each celebration are enclosed");
  });
  it("prints the hosting family's own RSVP contacts and compliments", () => {
    const words = { rsvpBride: "Anil  +91 98220 12345\n\nSunita +91 98765 43210", rsvpGroom: "Rajesh +91 90000 00000", complimentsBride: "Kulkarni family", complimentsGroom: "Kosambi family", dressCode: false };
    const bride = buildInvitation(wedding, events, o({ version: "bride", ...words }), "https://x/w/p");
    expect(bride.back.details).toEqual({
      rsvp: ["Anil +91 98220 12345", "Sunita +91 98765 43210"], replyBy: "Kindly reply by 10 January 2027",
      compliments: ["Kulkarni family"], note: null, qrUrl: "https://x/w/p",
    });
    expect(bride.back.events[0].dressCode).toBeNull();
    const groom = buildInvitation(wedding, events, o({ version: "groom", ...words }), "https://x/w/p");
    expect(groom.back.details).toMatchObject({ rsvp: ["Rajesh +91 90000 00000"], compliments: ["Kosambi family"] });
    expect(buildInvitation(wedding, events, o({ qr: false, replyBy: false }), "u").back.details).toMatchObject({ qrUrl: null, replyBy: null });
    expect(fileName(o({ version: "groom", size: "a5", eventLayout: "separate" }))).toBe("invitation-groom-a5-with-event-cards.pdf");
  });
  it("the arch frame is only for portrait cards", async () => {
    const { isPortrait } = await import("@/lib/invitation/options");
    expect(isPortrait(o())).toBe(true);
    expect(isPortrait(o({ orientation: "landscape" }))).toBe(false);
    expect(isPortrait(o({ size: "6x6" }))).toBe(false);
  });
});

describe("the PDF", () => {
  it("has the invitation, its back, and one page per event card", async () => {
    const opts = o({ version: "bride", eventLayout: "separate", size: "a5", rsvpBride: "Rajesh  +91 98220 12345" });
    const pdf = await renderInvitationPdf(buildInvitation(wedding, events, opts, "https://x/w/p"), opts, "raj-mahal");
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF")).toBe(true);
    expect(text.match(/\/Type \/Page\b/g)).toHaveLength(2 + 3);
  }, 30_000);
});

describe("design", () => {
  it("splits Hindi, Marathi and Sanskrit from English so each prints in its own face", async () => {
    const { scriptRuns } = await import("@/lib/invitation/motifs");
    expect(scriptRuns("Spandan (स्पंदन) & Pooja")).toEqual([
      { text: "Spandan (", deva: false }, { text: "स्पंदन", deva: true }, { text: ") & Pooja", deva: false },
    ]);
    expect(scriptRuns("॥ श्री गणेशाय नमः ॥")).toEqual([{ text: "॥ श्री गणेशाय नमः ॥", deva: true }]);
  });
  it("suggests monogram letters with the hosting side first", async () => {
    const { defaultMonogram } = await import("@/lib/invitation/options");
    expect(defaultMonogram("Pooja", "Spandan", "groom")).toBe("S | P");
    expect(defaultMonogram("Pooja", "Spandan", "bride")).toBe("P | S");
  });
  it("takes only a real image as the photo", () => {
    expect(invitationSchema.safeParse({ photo: "data:image/jpeg;base64,/9j/AAAA" }).success).toBe(true);
    expect(invitationSchema.safeParse({ photo: "javascript:alert(1)" }).success).toBe(false);
  });
  it("draws every design option, with Devanagari, into the PDF", async () => {
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    for (const theme of ["raj-mahal", "ivory-editorial", "gulaab-rococo", "mehfil-noor", "pichwai-bagh", "neel-chhapa"] as const) {
      const opts = o({
        frame: "arch", toran: true, patternBorder: true, monogram: true, monogramStyle: "wreath", nameFont: "script", fill: "fuller",
        photo: png, photoPlace: theme === "raj-mahal" ? "back" : "front", invocation: "॥ श्री गणेशाय नमः ॥", shloka: "वक्रतुण्ड महाकाय",
      });
      const pdf = await renderInvitationPdf(buildInvitation(wedding, events, opts, "https://x/w/p"), opts, theme);
      const text = pdf.toString("latin1");
      expect(text.match(/\/Type \/Page\b/g)).toHaveLength(2);
      expect(text).toContain("Tiro");
      expect(text).toContain("GreatVibes");
    }
  }, 120_000);
});

describe("more design: borders, symbols, patterns, icons", () => {
  it("picks an icon from the celebration's name", async () => {
    const { iconFor } = await import("@/lib/invitation/decor");
    expect([iconFor("Haldi"), iconFor("Mehendi Night"), iconFor("Garba & Dandiya"), iconFor("Sangeet"), iconFor("Pheras"), iconFor("Reception"), iconFor("Ganesh Puja"), iconFor("Something else")])
      .toEqual(["haldi", "mehendi", "dandiya", "music", "fire", "glass", "diya", "kalash"]);
  });
  it("a celebration's chosen icon wins over the one its name suggests", async () => {
    const { iconOf } = await import("@/lib/invitation/decor");
    expect(iconOf({ name: "Sangeet", icon: "drum" })).toBe("drum");
    expect(iconOf({ name: "Sangeet", icon: null })).toBe("music");
    expect(iconOf({ name: "Sangeet", icon: "not-an-icon" })).toBe("music");
    const inv = buildInvitation(wedding, events.map((e, i) => (i ? e : { ...e, icon: "thali" })), o({}), "https://x.test/w/a");
    expect(inv.back.events[0].icon).toBe("thali");
  });
  it("renders every border, symbol and pattern", async () => {
    const { BORDER_STYLES, SYMBOLS, PATTERNS } = await import("@/lib/invitation/decor");
    const n = Math.max(BORDER_STYLES.length, SYMBOLS.length, PATTERNS.length);
    for (let i = 0; i < n; i++) {
      const opts = o({ patternBorder: true, borderStyle: BORDER_STYLES[i % BORDER_STYLES.length], symbol: SYMBOLS[i % SYMBOLS.length], pattern: PATTERNS[i % PATTERNS.length], icons: true });
      const pdf = await renderInvitationPdf(buildInvitation(wedding, events, opts, "https://x.test/w/a"), opts, "raj-mahal");
      expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    }
  }, 120_000);
});

