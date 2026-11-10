import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, migrateDb } from "@/db/client";
import { weddings, weddingSides } from "@/db/schema";
import { copyFromPartner, getLooks, hasPart, photoInUse, samePart, updateLook, withLook } from "@/lib/looks";

let weddingId: string;
beforeAll(async () => {
  await migrateDb();
  const [w] = await db.insert(weddings).values({
    slug: `lk-${Date.now()}`, brideName: "Pooja", groomName: "Spandan", weddingDate: new Date("2027-01-29T04:30:00Z"),
    theme: "neel-chhapa", heroTagline: "One big yes", travel: { stays: [{ name: "Taj", note: "" }], gettingThere: "" },
  }).returning();
  weddingId = w.id;
});

describe("each family's look", () => {
  it("both families start from the site as it was", async () => {
    const looks = await getLooks(weddingId);
    expect(looks.bride).toMatchObject({ theme: "neel-chhapa", heroTagline: "One big yes" });
    expect(looks.groom).toMatchObject({ theme: "neel-chhapa", heroTagline: "One big yes" });
    expect(await db.select().from(weddingSides).where(eq(weddingSides.weddingId, weddingId))).toHaveLength(2);
  });

  it("each family changes its own without touching the other", async () => {
    await updateLook(weddingId, "groom", { theme: "raj-mahal", story: "Baraat at dawn", heroTagline: null });
    const { bride, groom } = await getLooks(weddingId);
    expect(groom).toMatchObject({ theme: "raj-mahal", story: "Baraat at dawn" });
    expect(bride).toMatchObject({ theme: "neel-chhapa", story: null });
    const [w] = await db.select().from(weddings).where(eq(weddings.id, weddingId));
    expect(withLook(w, groom)).toMatchObject({ brideName: "Pooja", theme: "raj-mahal", story: "Baraat at dawn" });
  });

  it("'same as your partner' copies one part, once the other family has filled it in", async () => {
    let { bride, groom } = await getLooks(weddingId);
    expect(hasPart(groom, "words")).toBe(true);
    expect(hasPart(groom, "gallery")).toBe(false);
    expect(samePart(bride, groom, "theme")).toBe(false);
    expect(await copyFromPartner(weddingId, "bride", "gallery")).toEqual({ ok: false, error: "nothing to copy yet" });
    expect((await copyFromPartner(weddingId, "bride", "theme")).ok).toBe(true);
    expect((await copyFromPartner(weddingId, "bride", "words")).ok).toBe(true);
    ({ bride, groom } = await getLooks(weddingId));
    expect(bride).toMatchObject({ theme: "raj-mahal", story: "Baraat at dawn", heroTagline: null });
    expect(samePart(bride, groom, "words")).toBe(true);
    // still each family's own afterwards
    await updateLook(weddingId, "bride", { story: "Mehendi by the lake" });
    expect((await getLooks(weddingId)).groom.story).toBe("Baraat at dawn");
  });

  it("a photo both families use isn't deleted when one removes it", async () => {
    const photo = { url: "https://blob.example.com/a.jpg", pathname: "weddings/x/a.jpg", width: 10, height: 10 };
    await updateLook(weddingId, "groom", { gallery: { enabled: true, photos: [photo] } });
    await copyFromPartner(weddingId, "bride", "gallery");
    await updateLook(weddingId, "groom", { gallery: { enabled: true, photos: [] } });
    expect(await photoInUse(weddingId, photo.pathname)).toBe(true);
    await updateLook(weddingId, "bride", { gallery: { enabled: true, photos: [] } });
    expect(await photoInUse(weddingId, photo.pathname)).toBe(false);
  });
});
