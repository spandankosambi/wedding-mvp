import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, migrateDb } from "@/db/client";
import { weddings, weddingSides } from "@/db/schema";
import { copyFromPartner, getLooks, hasPart, namesFor, photoInUse, samePart, updateLook, withLook } from "@/lib/looks";

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

describe("each family's name order", () => {
  const w = { brideName: "Pooja", groomName: "Spandan", brideParents: "Mr & Mrs Shah", groomParents: null };
  it("the bride's family puts the bride first", () => {
    expect(namesFor(w, "bride")).toEqual({ first: "Pooja", second: "Spandan", couple: "Pooja & Spandan", firstParents: "Mr & Mrs Shah", secondParents: null });
  });
  it("the groom's family puts the groom first, with his parents", () => {
    expect(namesFor(w, "groom")).toEqual({ first: "Spandan", second: "Pooja", couple: "Spandan & Pooja", firstParents: null, secondParents: "Mr & Mrs Shah" });
  });
});

describe("RSVP settings per family", () => {
  it("a new family look starts from the wedding's settings, and withLook applies its own", async () => {
    const [w] = await db.insert(weddings).values({
      slug: `lk-r-${Date.now()}`, brideName: "A", groomName: "B", weddingDate: new Date("2027-01-29T04:30:00Z"), rsvpOpen: false,
    }).returning();
    const looks = await getLooks(w.id);
    expect(looks.groom.rsvpOpen).toBe(false);
    await updateLook(w.id, "groom", { rsvpOpen: true });
    expect(withLook(w, (await getLooks(w.id)).groom).rsvpOpen).toBe(true);
    expect(withLook(w, (await getLooks(w.id)).bride).rsvpOpen).toBe(false);
  });
});

describe("same as your partner: the invitation wording", () => {
  it("copies all five lines once the other family has any", async () => {
    const [w] = await db.insert(weddings).values({ slug: `lk-w-${Date.now()}`, brideName: "A", groomName: "B", weddingDate: new Date("2027-01-29T04:30:00Z") }).returning();
    let looks = await getLooks(w.id);
    expect(hasPart(looks.groom, "wording")).toBe(false);
    await updateLook(w.id, "groom", { shloka: "वक्रतुण्ड महाकाय", closingLine: "Your blessings are our gifts" });
    looks = await getLooks(w.id);
    expect(hasPart(looks.groom, "wording")).toBe(true);
    expect(samePart(looks.bride, looks.groom, "wording")).toBe(false);
    expect((await copyFromPartner(w.id, "bride", "wording")).ok).toBe(true);
    looks = await getLooks(w.id);
    expect(looks.bride).toMatchObject({ shloka: "वक्रतुण्ड महाकाय", closingLine: "Your blessings are our gifts", invocation: null });
    expect(withLook(w, looks.bride).shloka).toBe("वक्रतुण्ड महाकाय");
  });
});

