import { z } from "zod";
import type { GalleryInfo, GalleryPhoto } from "@/db/schema";
import { getLook, updateLook, type FamilySide } from "@/lib/looks";

/* Each family's Gallery section: an on/off switch and their own photos.
   Files live in Vercel Blob (public, unguessable URLs — the same exposure as
   the wedding site itself); this module only keeps the list on the wedding. */

export const MAX_GALLERY_PHOTOS = 15;
/** Photos are resized in the browser before upload, so real ones land well
    under this; it guards against a raw upload that skipped the resize. */
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Weddings created before the gallery existed have `null`: shown, no photos. */
export function galleryOf(w: { gallery: GalleryInfo | null }): GalleryInfo {
  return { enabled: w.gallery?.enabled ?? true, photos: w.gallery?.photos ?? [] };
}

export const photoStorageConfigured = () => !!process.env.BLOB_READ_WRITE_TOKEN;

async function current(weddingId: string, side: FamilySide): Promise<GalleryInfo | null> {
  try {
    return galleryOf(await getLook(weddingId, side));
  } catch {
    return null;
  }
}
const save = (weddingId: string, side: FamilySide, gallery: GalleryInfo) => updateLook(weddingId, side, { gallery });

export async function setGalleryEnabled(weddingId: string, side: FamilySide, enabled: boolean) {
  const g = await current(weddingId, side);
  if (!g) return { ok: false as const, error: "wedding not found" };
  await save(weddingId, side, { ...g, enabled });
  return { ok: true as const };
}

const photoSchema = z.object({
  url: z.string().url().max(1000),
  pathname: z.string().min(1).max(400),
  width: z.number().int().min(1).max(20000),
  height: z.number().int().min(1).max(20000),
});

export async function canAddPhoto(weddingId: string, side: FamilySide) {
  const g = await current(weddingId, side);
  if (!g) return { ok: false as const, error: "wedding not found" };
  if (g.photos.length >= MAX_GALLERY_PHOTOS) return { ok: false as const, error: `the gallery holds up to ${MAX_GALLERY_PHOTOS} photos` };
  return { ok: true as const };
}

export async function appendPhoto(weddingId: string, side: FamilySide, photo: GalleryPhoto) {
  const parsed = photoSchema.safeParse(photo);
  if (!parsed.success) return { ok: false as const, error: "invalid input" };
  const g = await current(weddingId, side);
  if (!g) return { ok: false as const, error: "wedding not found" };
  if (g.photos.length >= MAX_GALLERY_PHOTOS) return { ok: false as const, error: `the gallery holds up to ${MAX_GALLERY_PHOTOS} photos` };
  await save(weddingId, side, { ...g, photos: [...g.photos, parsed.data] });
  return { ok: true as const };
}

/** Drops the photo from the list and returns it, so the caller can delete the
    stored file. Only photos already on this wedding can be removed. */
export async function detachPhoto(weddingId: string, side: FamilySide, pathname: string) {
  const g = await current(weddingId, side);
  if (!g) return { ok: false as const, error: "wedding not found" };
  const photo = g.photos.find((p) => p.pathname === pathname);
  if (!photo) return { ok: false as const, error: "photo not found" };
  await save(weddingId, side, { ...g, photos: g.photos.filter((p) => p.pathname !== pathname) });
  return { ok: true as const, photo };
}

export async function movePhoto(weddingId: string, side: FamilySide, pathname: string, dir: "up" | "down") {
  const g = await current(weddingId, side);
  if (!g) return { ok: false as const, error: "wedding not found" };
  const i = g.photos.findIndex((p) => p.pathname === pathname);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= g.photos.length) return { ok: true as const };
  const photos = [...g.photos];
  [photos[i], photos[j]] = [photos[j], photos[i]];
  await save(weddingId, side, { ...g, photos });
  return { ok: true as const };
}
