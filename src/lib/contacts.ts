import type { RsvpPerson } from "@/db/schema";

export type { RsvpPerson };

/** A family lists at most two people for RSVPs. */
export const MAX_CONTACTS = 2;

const PHONE = /(\+?\d[\d\s\-().]{5,}\d)/;

/** "Vikram Mehta +91 98200 11111" or "+91 98765 43210 (Rajesh)" → a contact. */
export function parseContactLine(line: string): RsvpPerson | null {
  const t = line.trim();
  if (!t) return null;
  const m = t.match(PHONE);
  if (!m || digits(m[1]).length < 7) return null;
  const name = t.replace(m[1], " ").replace(/[()\-:,–—|]+/g, " ").replace(/\s+/g, " ").trim();
  return { name, phone: m[1].trim(), whatsapp: true };
}

const digits = (s: string) => s.replace(/\D/g, "");

/** The number in international form, without "+": a 10-digit number is taken as Indian. */
export function intlDigits(phone: string): string {
  const d = digits(phone);
  if (phone.trim().startsWith("+")) return d;
  if (d.length === 10) return `91${d}`;
  if (d.length === 11 && d.startsWith("0")) return `91${d.slice(1)}`;
  return d;
}

/** Opens a WhatsApp chat for WhatsApp numbers, the dialler for the rest. */
export function contactHref(c: RsvpPerson): string {
  const d = intlDigits(c.phone);
  return c.whatsapp ? `https://wa.me/${d}` : `tel:+${d}`;
}

/** As printed on the card: "Vikram Mehta  +91 98200 11111". */
export const contactLine = (c: RsvpPerson) => [c.name, c.phone].filter(Boolean).join("  ");

/** The family's contacts: the new list, or what was typed in the older boxes. */
export function contactsOf(look: { rsvpPeople?: RsvpPerson[] | null; rsvpContacts?: string | null; contactPhone?: string | null }): RsvpPerson[] {
  if (look.rsvpPeople) return look.rsvpPeople.slice(0, MAX_CONTACTS);
  const fromLines = (look.rsvpContacts ?? "").split("\n").map(parseContactLine).filter((c): c is RsvpPerson => !!c);
  if (fromLines.length) return fromLines.slice(0, MAX_CONTACTS);
  const one = look.contactPhone ? parseContactLine(look.contactPhone) : null;
  return one ? [one] : [];
}
