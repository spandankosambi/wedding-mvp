import { describe, it, expect } from "vitest";
import { invitationSchema, trimSize } from "@/lib/invitation/options";
import { buildInvitation, eventsFor, fileName, type CardEvent } from "@/lib/invitation/content";
import { renderInvitationPdf, sheetFor } from "@/lib/invitation/pdf";

const o = (over: Record<string, unknown> = {}) => invitationSchema.parse(over);
const d = (s: string) => new Date(s);
const wedding = { brideName: "Pooja", groomName: "Spandan", weddingDate: d("2027-01-29T04:30:00Z"), city: "Pune", rsvpDeadline: d("2027-01-10T00:00:00Z") };
const ev = (n: number, name: string, side: CardEvent["side"], isPublished = true): CardEvent => ({
  id: `00000000-0000-4000-8000-00000000000${n}`, name, side, startsAt: d("2027-01-27T04:30:00Z"),
  venueName: `${name} venue`, address: "Pune", dressCode: "Yellow", isPublished, sortOrder: n,
});
const events = [ev(1, "Haldi", "bride"), ev(2, "Haldi", "groom"), ev(3, "Sangeet", "both"), ev(4, "Wedding", "both"), ev(5, "Puja", "both", false)];
const parents = { brideParents: "Mr. & Mrs. Anil Kulkarni", groomParents: "Mr. & Mrs. Rajesh Kosambi" };

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
    const names = (v: "bride" | "groom" | "both") => eventsFor(events, o({ version: v })).map((e) => e.id.slice(-1));
    expect(names("bride")).toEqual(["1", "3", "4"]);
    expect(names("groom")).toEqual(["2", "3", "4"]);
    expect(names("both")).toEqual(["1", "2", "3", "4"]);
  });
  it("the couple's own pick wins, including none or a hidden event", () => {
    expect(eventsFor(events, o({ eventIds: [events[4].id, events[3].id] })).map((e) => e.name)).toEqual(["Wedding", "Puja"]);
    expect(eventsFor(events, o({ eventIds: [] }))).toEqual([]);
  });
});

describe("wording", () => {
  it("the bride's family invites to the wedding of their daughter", () => {
    const inv = buildInvitation(wedding, events, o({ version: "bride", ...parents }), "https://x/w/p");
    expect(inv.front.lead.map((l) => l.t)).toEqual(["Mr. & Mrs. Anil Kulkarni", "request the pleasure of your company", "at the wedding of their daughter"]);
    expect([inv.front.first, inv.front.joiner, inv.front.second, inv.front.secondOf]).toEqual(["Pooja", "with", "Spandan", "son of Mr. & Mrs. Rajesh Kosambi"]);
    expect(inv.front.date).toBe("29 January 2027");
  });
  it("the groom's family invites to the wedding of their son", () => {
    const inv = buildInvitation(wedding, events, o({ version: "groom", ...parents }), "https://x/w/p");
    expect(inv.front.lead[0]).toEqual({ t: "Mr. & Mrs. Rajesh Kosambi", name: true });
    expect(inv.front.lead[2].t).toBe("at the wedding of their son");
    expect([inv.front.first, inv.front.second, inv.front.secondOf]).toEqual(["Spandan", "Pooja", "daughter of Mr. & Mrs. Anil Kulkarni"]);
  });
  it("a joint card carries both families' blessings; without names it still reads well", () => {
    const joint = buildInvitation(wedding, events, o({ ...parents }), "https://x/w/p");
    expect(joint.front.lead.map((l) => l.t)).toEqual(["With the blessings of", parents.brideParents, "and", parents.groomParents, "together with their families"]);
    expect(joint.front.after.map((l) => l.t)).toEqual(["request the pleasure of your company", "at their wedding"]);
    const plain = buildInvitation(wedding, events, o({ version: "bride" }), "https://x/w/p");
    expect(plain.front.lead[0].t).toBe("The family of Pooja");
    expect(plain.front.secondOf).toBeNull();
  });
  it("events go on the back, or on a card each; side labels only on the joint card", () => {
    const back = buildInvitation(wedding, events, o(), "https://x/w/p");
    expect(back.back.events.map((e) => [e.name, e.sideLabel])).toEqual([["Haldi", "Bride's side"], ["Haldi", "Groom's side"], ["Sangeet", null], ["Wedding", null]]);
    expect(back.inserts).toEqual([]);
    const cards = buildInvitation(wedding, events, o({ version: "groom", eventLayout: "separate", ...parents }), "https://x/w/p");
    expect(cards.back.events).toEqual([]);
    expect(cards.inserts.map((i) => [i.hosts, i.event.name, i.event.sideLabel])).toEqual([
      [parents.groomParents, "Haldi", null], [parents.groomParents, "Sangeet", null], [parents.groomParents, "Wedding", null],
    ]);
    expect(cards.front.enclosed).toBe("Details of each celebration are enclosed");
  });
  it("RSVP, compliments, reply-by date and QR as asked", () => {
    const inv = buildInvitation(wedding, events, o({ rsvp: "Rajesh  +91 98220 12345\n\nSonu  +91 98765 43210", compliments: "Kosambi family", dressCode: false }), "https://x/w/p");
    expect(inv.back.details).toEqual({
      rsvp: ["Rajesh  +91 98220 12345", "Sonu  +91 98765 43210"], replyBy: "Kindly reply by 10 January 2027",
      compliments: ["Kosambi family"], note: null, qrUrl: "https://x/w/p",
    });
    expect(inv.back.events[0].dressCode).toBeNull();
    expect(buildInvitation(wedding, events, o({ qr: false, replyBy: false }), "u").back.details).toMatchObject({ qrUrl: null, replyBy: null });
    expect(fileName(o({ version: "both", size: "a5", eventLayout: "separate" }))).toBe("invitation-joint-a5-with-event-cards.pdf");
  });
});

describe("the PDF", () => {
  it("has the invitation, its back, and one page per event card", async () => {
    const opts = o({ version: "bride", eventLayout: "separate", size: "a5", ...parents, rsvp: "Rajesh  +91 98220 12345" });
    const pdf = await renderInvitationPdf(buildInvitation(wedding, events, opts, "https://x/w/p"), opts, "raj-mahal");
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF")).toBe(true);
    expect(text.match(/\/Type \/Page\b/g)).toHaveLength(2 + 3);
  }, 30_000);
});
