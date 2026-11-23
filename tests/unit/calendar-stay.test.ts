import { describe, it, expect } from "vitest";
import { icsFile, googleCalendarLink, maskEmail } from "@/lib/email/calendar";
import { stayGroups } from "@/lib/guests/stay-groups";

const haldi = { id: "e1", name: "Haldi, at home", startsAt: new Date("2027-03-03T04:30:00Z"), venueName: "Sharma House", address: "12 MG Road; Pune", mapUrl: "https://maps.google.com/?q=x", dressCode: "Yellow" };

describe("calendar file", () => {
  it("one entry per celebration, three hours long, with the text escaped and lines folded", () => {
    const ics = icsFile([haldi, { ...haldi, id: "e2", name: "Wedding" }], { couple: "Pooja & Spandan", link: "https://onetapinvites.com/rsvp/abc" });
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("DTSTART:20270303T043000Z");
    expect(ics).toContain("DTEND:20270303T073000Z");
    const flat = ics.replace(/\r\n /g, "");
    expect(flat).toContain("SUMMARY:Haldi\\, at home · Pooja & Spandan");
    expect(flat).toContain(String.raw`12 MG Road\; Pune`);
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
  it("Google Calendar link carries the times and place", () => {
    const u = new URL(googleCalendarLink(haldi, "Pooja & Spandan"));
    expect(u.searchParams.get("dates")).toBe("20270303T043000Z/20270303T073000Z");
    expect(u.searchParams.get("location")).toBe("Sharma House, 12 MG Road; Pune");
  });
  it("email shown partly hidden", () => {
    expect(maskEmail("spandan@gmail.com")).toBe("sp•••••@gmail.com");
    expect(maskEmail("ab@x.com")).toBe("a•••@x.com");
  });
});

describe("stay groups", () => {
  const stays = [{ name: "Taj", note: "Check-in 2pm", url: "https://maps/taj" }, { name: "Hyatt", note: "" }];
  it("hotel, then rooms in number order, rooms not set last", () => {
    const g = stayGroups([
      { fullName: "A", details: { hotel: "Hyatt", room: "12" } },
      { fullName: "B", details: { hotel: "Taj", room: "" } },
      { fullName: "C", details: { hotel: "Taj", room: "9" } },
      { fullName: "D", details: { hotel: "Taj", room: "10" } },
      { fullName: "E", details: null },
    ], stays);
    expect(g.map((x) => x.hotel)).toEqual(["Taj", "Hyatt"]);
    expect(g[0].rooms).toEqual([{ room: "9", names: ["C"] }, { room: "10", names: ["D"] }, { room: "", names: ["B"] }]);
    expect(g[0].map).toBe("https://maps/taj");
  });
  it("one hotel on the site: everyone is in it by default", () => {
    expect(stayGroups([{ fullName: "A", details: null }], [stays[0]])[0].hotel).toBe("Taj");
  });
});

import { zonedDate, zonedParts, guessZone, zoneNote } from "@/lib/core/timezones";
import { fmtEventTime } from "@/lib/core/format";

describe("time zones", () => {
  it("7 pm in Dubai is 3 pm UTC; in India it's 1:30 pm UTC; and back again", () => {
    expect(zonedDate("2027-01-28", "19:00", "Asia/Dubai").toISOString()).toBe("2027-01-28T15:00:00.000Z");
    expect(zonedDate("2027-01-28", "19:00", "Asia/Kolkata").toISOString()).toBe("2027-01-28T13:30:00.000Z");
    expect(zonedParts(new Date("2027-01-28T15:00:00Z"), "Asia/Dubai")).toEqual({ date: "2027-01-28", time: "19:00" });
  });
  it("summer time in London is handled", () => {
    expect(zonedDate("2027-07-10", "18:00", "Europe/London").toISOString()).toBe("2027-07-10T17:00:00.000Z");
  });
  it("guesses the zone from the venue; India says nothing", () => {
    expect(guessZone("Atlantis The Palm", "Crescent Rd, Dubai")).toBe("Asia/Dubai");
    expect(guessZone("Ayana Resort", "Jimbaran, Bali")).toBe("Asia/Makassar");
    expect(guessZone("Taj Lake Palace", "Udaipur, Rajasthan")).toBeNull();
    expect(zoneNote("Asia/Kolkata")).toBe("");
    expect(fmtEventTime(new Date("2027-01-28T15:00:00Z"), "Asia/Dubai")).toBe("7:00 pm Dubai time");
  });
});
