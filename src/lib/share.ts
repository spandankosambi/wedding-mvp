import { randomInt, timingSafeEqual } from "node:crypto";

/* A family's shared link carries a short code (?k=…). With it, a guest sees
   the whole invitation; without it, only the couple's names and the date.
   The code is per family, so each side's link opens only its own section, and
   a family can swap it for a new one if a link travels too far. Personal
   invitation links (?invite=…) carry their own token and never need it. */

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no look-alikes (0/o, 1/l/i)

export function newShareKey(length = 8): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** Does the code a visitor arrived with open this family's link? */
export function keyOpens(look: { shareKey: string | null }, given: unknown): boolean {
  if (!look.shareKey || typeof given !== "string" || !given) return false;
  const a = Buffer.from(look.shareKey), b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** "/w/slug?side=groom&k=…" (add "/rsvp" for the reply form). */
export function sharePath(slug: string, side: "bride" | "groom", key: string | null, page: "" | "/rsvp" = ""): string {
  return `/w/${slug}${page}?side=${side}${key ? `&k=${encodeURIComponent(key)}` : ""}`;
}
