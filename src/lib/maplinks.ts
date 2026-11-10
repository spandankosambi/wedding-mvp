import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { events, weddings, type TravelInfo } from "@/db/schema";
import { updateLook, type FamilySide } from "@/lib/looks";

/**
 * Google Maps "share" links (maps.app.goo.gl/…) are short links that bounce
 * to google.com/maps. Some networks and internet providers can't reach the
 * short-link domain even though Google Maps itself loads fine, so a guest
 * tapping "View map" just sees "This site can't be reached". We store the
 * full google.com/maps address instead.
 */

const SHORT_HOSTS = ["maps.app.goo.gl", "goo.gl", "g.co"];

export function isShortMapLink(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.hostname === "maps.app.goo.gl") return true;
    return SHORT_HOSTS.includes(u.hostname) && /^\/(maps|kgs)\b/.test(u.pathname);
  } catch {
    return false;
  }
}

function isGoogleMaps(url: string): boolean {
  try {
    const u = new URL(url);
    return /^(www\.|maps\.)?google\.[a-z.]+$/.test(u.hostname) && (u.hostname.startsWith("maps.") || u.pathname.startsWith("/maps"));
  } catch {
    return false;
  }
}

/** Drops the share-tracking bits Google adds, keeping the place itself. */
export function cleanMapsUrl(url: string): string {
  const u = new URL(url);
  for (const k of ["g_ep", "entry", "skid", "g_st", "shorturl"]) u.searchParams.delete(k);
  return u.toString();
}

/** The full Google Maps address behind a short link; anything else (or a
    link that can't be followed right now) comes back unchanged. */
export async function expandMapLink(url: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  if (!isShortMapLink(url)) return url;
  let current = url;
  try {
    for (let hop = 0; hop < 4; hop++) {
      const res = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(5000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Nimantran link check)" },
      });
      const next = res.headers.get("location");
      if (!next) break;
      current = new URL(next, current).toString();
      if (isGoogleMaps(current)) return cleanMapsUrl(current);
    }
  } catch {
    /* unreachable from here too: keep what the couple pasted */
  }
  return url;
}

/**
 * Links saved before this change: expand any short ones the first time the
 * site is shown, and store the result so it only happens once.
 */
export async function fixShortMapLinks(
  weddingId: string,
  evs: { id: string; mapUrl: string | null }[],
  travel: TravelInfo | null,
  /** whose look the travel belongs to */
  side?: FamilySide,
): Promise<{ eventUrls: Map<string, string>; travel: TravelInfo | null }> {
  const eventUrls = new Map<string, string>();
  await Promise.all(evs.map(async (e) => {
    if (!e.mapUrl || !isShortMapLink(e.mapUrl)) return;
    const full = await expandMapLink(e.mapUrl);
    if (full === e.mapUrl) return;
    eventUrls.set(e.id, full);
    await db.update(events).set({ mapUrl: full }).where(and(eq(events.id, e.id), eq(events.weddingId, weddingId)));
  }));

  let fixedTravel = travel;
  if (travel?.stays?.some((s) => s.url && isShortMapLink(s.url))) {
    const stays = await Promise.all(travel.stays.map(async (s) => (s.url && isShortMapLink(s.url) ? { ...s, url: await expandMapLink(s.url) } : s)));
    if (stays.some((s, i) => s.url !== travel.stays[i].url)) {
      fixedTravel = { ...travel, stays };
      if (side) await updateLook(weddingId, side, { travel: fixedTravel });
      else await db.update(weddings).set({ travel: fixedTravel }).where(eq(weddings.id, weddingId));
    }
  }
  return { eventUrls, travel: fixedTravel };
}
