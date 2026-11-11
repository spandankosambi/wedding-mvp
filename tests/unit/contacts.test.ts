import { describe, it, expect } from "vitest";
import { contactHref, contactLine, contactsOf, parseContactLine } from "@/lib/contacts";

describe("RSVP contacts", () => {
  it("a WhatsApp number opens a chat; another number dials", () => {
    expect(contactHref({ name: "A", phone: "+91 98200 11111", whatsapp: true })).toBe("https://wa.me/919820011111");
    expect(contactHref({ name: "A", phone: "98200 11111", whatsapp: true })).toBe("https://wa.me/919820011111"); // Indian by default
    expect(contactHref({ name: "A", phone: "098200 11111", whatsapp: false })).toBe("tel:+919820011111");
    expect(contactHref({ name: "A", phone: "+1 (415) 555-0100", whatsapp: false })).toBe("tel:+14155550100");
  });
  it("reads what was typed in the older boxes", () => {
    expect(parseContactLine("Vikram Mehta +91 98200 11111")).toEqual({ name: "Vikram Mehta", phone: "+91 98200 11111", whatsapp: true });
    expect(parseContactLine("+91 98765 43210 (Rajesh)")).toEqual({ name: "Rajesh", phone: "+91 98765 43210", whatsapp: true });
    expect(parseContactLine("call the family")).toBeNull();
    expect(contactsOf({ rsvpContacts: "A 9820011111\nB 9820022222\nC 9820033333" }).map((c) => c.name)).toEqual(["A", "B"]); // two at most
    expect(contactsOf({ rsvpContacts: null, contactPhone: "+91 98765 43210 (Rajesh)" })).toHaveLength(1);
    expect(contactsOf({ rsvpPeople: [], contactPhone: "+91 98765 43210" })).toEqual([]); // the new list wins, even empty
  });
  it("prints name and number", () => {
    expect(contactLine({ name: "Vikram Mehta", phone: "+91 98200 11111", whatsapp: true })).toBe("Vikram Mehta  +91 98200 11111");
    expect(contactLine({ name: "", phone: "+91 98200 11111", whatsapp: true })).toBe("+91 98200 11111");
  });
});
