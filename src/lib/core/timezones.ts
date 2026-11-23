/*
 * Time zones for celebrations. Most weddings are in India (IST); destination
 * weddings pick the zone where the celebration happens, so "7 pm" means 7 pm
 * there, in calendars, emails and on the site.
 *
 * Pure: used in the editor (browser) and on the server.
 */

export const DEFAULT_ZONE = "Asia/Kolkata";

/** [IANA zone, what people call it] — India first, then popular destinations */
export const ZONES: [string, string][] = [
  ["Asia/Kolkata", "India (IST)"],
  ["Asia/Dubai", "Dubai / UAE"],
  ["Asia/Muscat", "Oman"],
  ["Asia/Qatar", "Qatar"],
  ["Asia/Kathmandu", "Nepal"],
  ["Asia/Colombo", "Sri Lanka"],
  ["Indian/Maldives", "Maldives"],
  ["Indian/Mauritius", "Mauritius"],
  ["Asia/Bangkok", "Thailand"],
  ["Asia/Makassar", "Bali"],
  ["Asia/Singapore", "Singapore"],
  ["Asia/Kuala_Lumpur", "Malaysia"],
  ["Asia/Ho_Chi_Minh", "Vietnam"],
  ["Europe/Istanbul", "Turkey"],
  ["Europe/Athens", "Greece"],
  ["Europe/Rome", "Italy"],
  ["Europe/Paris", "France"],
  ["Europe/Madrid", "Spain"],
  ["Europe/Lisbon", "Portugal"],
  ["Europe/London", "UK"],
  ["Africa/Nairobi", "Kenya"],
  ["Africa/Johannesburg", "South Africa"],
  ["America/New_York", "US East (New York)"],
  ["America/Chicago", "US Central (Chicago)"],
  ["America/Los_Angeles", "US West (California)"],
  ["America/Toronto", "Canada (Toronto)"],
  ["America/Vancouver", "Canada (Vancouver)"],
  ["Australia/Sydney", "Australia (Sydney)"],
  ["Australia/Melbourne", "Australia (Melbourne)"],
  ["Pacific/Auckland", "New Zealand"],
];

export const isZone = (z: string) => ZONES.some(([id]) => id === z);

/* words in a venue or address → its zone; checked in order, first match wins */
const PLACES: [RegExp, string][] = [
  [/\b(dubai|abu dhabi|sharjah|ras al khaimah|fujairah|u\.?a\.?e\.?|emirates)\b/i, "Asia/Dubai"],
  [/\b(oman|muscat|salalah)\b/i, "Asia/Muscat"],
  [/\b(qatar|doha)\b/i, "Asia/Qatar"],
  [/\b(nepal|kathmandu|pokhara)\b/i, "Asia/Kathmandu"],
  [/\b(sri lanka|colombo|kandy|galle|bentota)\b/i, "Asia/Colombo"],
  [/\b(maldives|mal[eé])\b/i, "Indian/Maldives"],
  [/\b(mauritius)\b/i, "Indian/Mauritius"],
  [/\b(thailand|bangkok|phuket|krabi|pattaya|koh samui|chiang mai|hua hin)\b/i, "Asia/Bangkok"],
  [/\b(bali|ubud|seminyak|nusa dua|uluwatu|jimbaran)\b/i, "Asia/Makassar"],
  [/\b(singapore|sentosa)\b/i, "Asia/Singapore"],
  [/\b(malaysia|kuala lumpur|langkawi|penang)\b/i, "Asia/Kuala_Lumpur"],
  [/\b(vietnam|hanoi|ho chi minh|da nang|hoi an)\b/i, "Asia/Ho_Chi_Minh"],
  [/\b(turkey|t[uü]rkiye|istanbul|antalya|bodrum|cappadocia)\b/i, "Europe/Istanbul"],
  [/\b(greece|athens|santorini|mykonos|crete)\b/i, "Europe/Athens"],
  [/\b(italy|rome|florence|tuscany|venice|lake como|amalfi|milan)\b/i, "Europe/Rome"],
  [/\b(france|paris|nice|provence|cannes)\b/i, "Europe/Paris"],
  [/\b(spain|madrid|barcelona|seville|mallorca|ibiza)\b/i, "Europe/Madrid"],
  [/\b(portugal|lisbon|porto|algarve)\b/i, "Europe/Lisbon"],
  [/\b(england|london|scotland|edinburgh|united kingdom|u\.k\.)\b/i, "Europe/London"],
  [/\b(kenya|nairobi|mombasa)\b/i, "Africa/Nairobi"],
  [/\b(south africa|cape town|johannesburg)\b/i, "Africa/Johannesburg"],
  [/\b(new york|new jersey|boston|washington|florida|miami|atlanta)\b/i, "America/New_York"],
  [/\b(chicago|texas|dallas|houston)\b/i, "America/Chicago"],
  [/\b(california|los angeles|san francisco|san jose|seattle|las vegas)\b/i, "America/Los_Angeles"],
  [/\b(toronto|ontario|montreal)\b/i, "America/Toronto"],
  [/\b(vancouver|british columbia)\b/i, "America/Vancouver"],
  [/\b(sydney|new south wales)\b/i, "Australia/Sydney"],
  [/\b(melbourne|victoria, australia)\b/i, "Australia/Melbourne"],
  [/\b(new zealand|auckland|queenstown)\b/i, "Pacific/Auckland"],
];

/** The zone a venue/address is in, or null when it doesn't say (India, mostly). */
export function guessZone(...texts: (string | null | undefined)[]): string | null {
  const t = texts.filter(Boolean).join(" ");
  if (!t.trim()) return null;
  for (const [re, zone] of PLACES) if (re.test(t)) return zone;
  return null;
}

/** "India (IST)", "Dubai / UAE"… */
export const zoneLabel = (z: string) => ZONES.find(([id]) => id === z)?.[1] ?? z.replace(/_/g, " ");

/** For guests: nothing for India, "Dubai time" etc. elsewhere. */
export function zoneNote(z: string | null | undefined) {
  if (!z || z === DEFAULT_ZONE) return "";
  return `${zoneLabel(z).replace(/\s*\(.*\)$/, "").split(" / ")[0]} time`;
}

/** A wall-clock date and time in a zone → the moment it is. */
export function zonedDate(date: string, time: string, zone: string = DEFAULT_ZONE): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  // the zone's offset at (about) that moment, then once more in case it changed (summer time)
  let ms = asUtc - offset(zone, new Date(asUtc));
  ms = asUtc - offset(zone, new Date(ms));
  return new Date(ms);
}

/** The zone's offset from UTC, in ms, at a moment. */
function offset(zone: string, at: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(at).map((x) => [x.type, x.value]),
  );
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return wall - Math.floor(at.getTime() / 1000) * 1000;
}

/** A moment → the editor's date and time fields, in a zone. */
export function zonedParts(d: Date, zone: string = DEFAULT_ZONE): { date: string; time: string } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d).map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
