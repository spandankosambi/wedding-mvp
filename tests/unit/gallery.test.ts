import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, migrateDb } from "@/db/client";
import { weddings } from "@/db/schema";
import { getLook } from "@/lib/looks";
import { galleryOf, setGalleryEnabled, appendPhoto, detachPhoto, movePhoto, canAddPhoto, MAX_GALLERY_PHOTOS } from "@/lib/gallery";

let weddingId: string;
const photo = (n: number) => ({ url: `https://blob.example.com/p${n}.jpg`, pathname: `weddings/x/gallery/p${n}.jpg`, width: 2000, height: 1500 });
// the bride's family's gallery (each family has its own)
const read = async () => galleryOf(await getLook(weddingId, "bride"));

beforeAll(async () => {
  await migrateDb();
  const [w] = await db.insert(weddings).values({ slug: "gal1", brideName: "A", groomName: "B", weddingDate: new Date("2027-01-29") }).returning();
  weddingId = w.id;
});

describe("gallery", () => {
  it("a wedding from before the gallery existed is shown with no photos", async () => {
    expect(galleryOf({ gallery: null })).toEqual({ enabled: true, photos: [] });
    expect(await read()).toEqual({ enabled: true, photos: [] });
  });
  it("can be switched off and on without losing photos", async () => {
    await appendPhoto(weddingId, "bride", photo(1));
    await setGalleryEnabled(weddingId, "bride", false);
    expect(await read()).toMatchObject({ enabled: false, photos: [photo(1)] });
    await setGalleryEnabled(weddingId, "bride", true);
    expect((await read()).enabled).toBe(true);
  });
  it("keeps photos in order and reorders them", async () => {
    await appendPhoto(weddingId, "bride", photo(2));
    await movePhoto(weddingId, "bride", photo(2).pathname, "up");
    expect((await read()).photos.map((p) => p.pathname)).toEqual([photo(2).pathname, photo(1).pathname]);
  });
  it("removes only a photo that is on this wedding", async () => {
    expect(await detachPhoto(weddingId, "bride", "weddings/other/gallery/nope.jpg")).toEqual({ ok: false, error: "photo not found" });
    const r = await detachPhoto(weddingId, "bride", photo(2).pathname);
    expect(r).toMatchObject({ ok: true, photo: photo(2) });
    expect((await read()).photos).toEqual([photo(1)]);
  });
  it("rejects malformed photos and caps the gallery", async () => {
    expect(await appendPhoto(weddingId, "bride", { ...photo(9), url: "not a url" })).toEqual({ ok: false, error: "invalid input" });
    for (let i = 10; (await read()).photos.length < MAX_GALLERY_PHOTOS; i++) await appendPhoto(weddingId, "bride", photo(i));
    expect((await canAddPhoto(weddingId, "bride")).ok).toBe(false);
    expect((await appendPhoto(weddingId, "bride", photo(99))).ok).toBe(false);
  });
});
