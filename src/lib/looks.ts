import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { weddings, weddingSides, type GalleryInfo, type TravelInfo } from "@/db/schema";

/**
 * The bride's family and the groom's each have their own look for the one
 * wedding site — theme, words, photos, travel. See `weddingSides`.
 */

export type FamilySide = "bride" | "groom";
export const FAMILY_SIDES: readonly FamilySide[] = ["bride", "groom"];
export type Look = typeof weddingSides.$inferSelect;

export const otherSide = (s: FamilySide): FamilySide => (s === "bride" ? "groom" : "bride");
export const sideName = (s: FamilySide) => (s === "bride" ? "Bride's family" : "Groom's family");
export function asFamilySide(v: unknown): FamilySide | null {
  return v === "bride" || v === "groom" ? v : null;
}

/** Both looks, creating any that don't exist yet from the wedding's own values. */
export async function getLooks(weddingId: string): Promise<Record<FamilySide, Look>> {
  let rows = await db.select().from(weddingSides).where(eq(weddingSides.weddingId, weddingId));
  if (rows.length < 2) {
    const [w] = await db.select().from(weddings).where(eq(weddings.id, weddingId));
    if (!w) throw new Error("wedding not found");
    const start = { theme: w.theme, heroTagline: w.heroTagline, story: w.story, hashtag: w.hashtag, contactPhone: w.contactPhone, travel: w.travel, gallery: w.gallery };
    await db.insert(weddingSides).values(FAMILY_SIDES.map((side) => ({ weddingId, side, ...start }))).onConflictDoNothing();
    rows = await db.select().from(weddingSides).where(eq(weddingSides.weddingId, weddingId));
  }
  return {
    bride: rows.find((r) => r.side === "bride")!,
    groom: rows.find((r) => r.side === "groom")!,
  };
}

export async function getLook(weddingId: string, side: FamilySide): Promise<Look> {
  return (await getLooks(weddingId))[side];
}

/** The wedding as one family presents it: their look over the shared details. */
export function withLook<W extends { theme: Look["theme"]; heroTagline: string | null; story: string | null; hashtag: string | null; contactPhone: string | null; travel: TravelInfo | null; gallery: GalleryInfo | null }>(w: W, look: Look): W {
  return { ...w, theme: look.theme, heroTagline: look.heroTagline, story: look.story, hashtag: look.hashtag, contactPhone: look.contactPhone, travel: look.travel, gallery: look.gallery };
}

export type LookPatch = Partial<Pick<Look, "theme" | "heroTagline" | "story" | "hashtag" | "contactPhone" | "travel" | "gallery">>;

export async function updateLook(weddingId: string, side: FamilySide, patch: LookPatch) {
  await getLooks(weddingId); // make sure the row exists
  await db.update(weddingSides).set({ ...patch, updatedAt: new Date() })
    .where(and(eq(weddingSides.weddingId, weddingId), eq(weddingSides.side, side)));
}

/* ── "Same as your partner": copy one part of the other family's look ── */

export type LookPart = "theme" | "words" | "travel" | "gallery";

/** Whether the other family has filled this part in (so copying it means something). */
export function hasPart(look: Look, part: LookPart): boolean {
  switch (part) {
    case "theme": return true;
    case "words": return !!(look.heroTagline || look.story || look.hashtag || look.contactPhone);
    case "travel": return !!(look.travel?.stays?.length || look.travel?.gettingThere);
    case "gallery": return !!look.gallery?.photos?.length;
  }
}

/** Whether this part is already the same on both sides. */
export function samePart(a: Look, b: Look, part: LookPart): boolean {
  switch (part) {
    case "theme": return a.theme === b.theme;
    case "words": return a.heroTagline === b.heroTagline && a.story === b.story && a.hashtag === b.hashtag && a.contactPhone === b.contactPhone;
    case "travel": return JSON.stringify(a.travel ?? null) === JSON.stringify(b.travel ?? null);
    case "gallery": return JSON.stringify(a.gallery?.photos ?? []) === JSON.stringify(b.gallery?.photos ?? []) && (a.gallery?.enabled ?? true) === (b.gallery?.enabled ?? true);
  }
}

export async function copyFromPartner(weddingId: string, side: FamilySide, part: LookPart): Promise<{ ok: boolean; error?: string }> {
  const looks = await getLooks(weddingId);
  const from = looks[otherSide(side)];
  if (!hasPart(from, part)) return { ok: false, error: "nothing to copy yet" };
  const patch: LookPatch =
    part === "theme" ? { theme: from.theme }
    : part === "words" ? { heroTagline: from.heroTagline, story: from.story, hashtag: from.hashtag, contactPhone: from.contactPhone }
    : part === "travel" ? { travel: from.travel }
    : { gallery: from.gallery }; // the photos themselves are shared, not duplicated
  await updateLook(weddingId, side, patch);
  return { ok: true };
}

/** Whether a stored photo is still used by either family (so its file must stay). */
export async function photoInUse(weddingId: string, pathname: string): Promise<boolean> {
  const looks = await getLooks(weddingId);
  return FAMILY_SIDES.some((s) => looks[s].gallery?.photos?.some((p) => p.pathname === pathname));
}
