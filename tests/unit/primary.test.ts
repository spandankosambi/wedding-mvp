import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db, migrateDb } from "@/db/client";
import { weddings, families, guests, emailLog } from "@/db/schema";
import { syncHousehold } from "@/lib/primary";
import { whatsappNumber, whatsappInvite } from "@/lib/invites";
import { getFamilyByToken } from "@/lib/rsvp";

let n = 0, weddingId: string, familyId: string;
beforeAll(async () => { await migrateDb(); });
beforeEach(async () => {
  n++;
  const [w] = await db.insert(weddings).values({ slug: `pr-${n}`, brideName: "Pooja", groomName: "Spandan", weddingDate: new Date("2027-01-29T04:30:00Z"), city: "Pune" }).returning();
  weddingId = w.id;
  const [f] = await db.insert(families).values({ weddingId, name: "Wadiker Family", side: "groom", email: "" }).returning();
  familyId = f.id;
});

const fam = async () => (await db.select().from(families).where(eq(families.id, familyId)))[0];
const members = () => db.select().from(guests).where(eq(guests.familyId, familyId));

describe("primary adult", () => {
  it("defaults to the first adult, never a child", async () => {
    await db.insert(guests).values([
      { familyId, fullName: "Kid", ageGroup: "child" },
      { familyId, fullName: "Sonu", ageGroup: "adult", phone: "98765 43210" },
    ]);
    const p = await syncHousehold(familyId);
    expect(p?.fullName).toBe("Sonu");
    expect((await members()).filter((m) => m.isPrimary).map((m) => m.fullName)).toEqual(["Sonu"]);
  });

  it("keeps the household's contact equal to the primary's", async () => {
    await db.insert(guests).values([
      { familyId, fullName: "Masa", email: "masa@example.com", isPrimary: true },
      { familyId, fullName: "Tush", email: "tush@example.com", phone: "99999 11111" },
    ]);
    await syncHousehold(familyId);
    expect(await fam()).toMatchObject({ email: "masa@example.com", phone: null });
    // switch the primary
    const [masa, tush] = await members();
    await db.update(guests).set({ isPrimary: false }).where(eq(guests.id, masa.id));
    await db.update(guests).set({ isPrimary: true }).where(eq(guests.id, tush.id));
    await syncHousehold(familyId);
    expect(await fam()).toMatchObject({ email: "tush@example.com", phone: "99999 11111" });
  });

  it("repairs two primaries, or a child marked primary", async () => {
    await db.insert(guests).values([
      { familyId, fullName: "Kid", ageGroup: "child", isPrimary: true },
      { familyId, fullName: "Maya", ageGroup: "adult", isPrimary: true },
      { familyId, fullName: "Dev", ageGroup: "adult", isPrimary: true },
    ]);
    await syncHousehold(familyId);
    expect((await members()).filter((m) => m.isPrimary).map((m) => m.fullName)).toEqual(["Maya"]);
  });

  it("fills the primary's contact from a fallback only where it's missing", async () => {
    await db.insert(guests).values({ familyId, fullName: "Masa", phone: "90000 00000" });
    await syncHousehold(familyId, { email: "from-form@example.com", phone: "11111 11111" });
    expect((await members())[0]).toMatchObject({ email: "from-form@example.com", phone: "90000 00000" });
  });
});

describe("WhatsApp invite", () => {
  it("formats numbers for WhatsApp", () => {
    expect(whatsappNumber("98765 43210")).toBe("919876543210");
    expect(whatsappNumber("+91 98765-43210")).toBe("919876543210");
    expect(whatsappNumber("098765 43210")).toBe("919876543210");
    expect(whatsappNumber("+1 415 555 0100")).toBe("14155550100");
    expect(whatsappNumber("123")).toBeNull();
  });

  it("addresses the primary adult with a working personal link, and logs it", async () => {
    await db.insert(guests).values([{ familyId, fullName: "Sonu Wadiker", phone: "98765 43210", isPrimary: true }, { familyId, fullName: "Tush" }]);
    await syncHousehold(familyId);
    const r = await whatsappInvite(weddingId, familyId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.url.startsWith("https://wa.me/919876543210?text=")).toBe(true);
    const text = decodeURIComponent(r.url.split("?text=")[1]);
    expect(text).toContain("Namaste Sonu!");
    expect(text).toContain("Spandan & Pooja are getting married"); // a groom's-side household: his family's order
    expect(text).toContain("Wadiker Family");
    // the link opens the wedding site first; its RSVP button leads on
    expect(text).toContain(`/w/pr-${n}?invite=`);
    const token = text.match(/\?invite=([\w-]+)/)![1];
    expect((await getFamilyByToken(token))?.family.id).toBe(familyId);
    expect((await db.select().from(emailLog).where(eq(emailLog.familyId, familyId)))[0].status).toBe("whatsapp");
  });

  it("with no phone saved, lets WhatsApp ask for the contact", async () => {
    await db.insert(guests).values({ familyId, fullName: "Maya" });
    await syncHousehold(familyId);
    const r = await whatsappInvite(weddingId, familyId);
    expect(r).toMatchObject({ ok: true, to: null });
    if (r.ok) expect(r.url.startsWith("https://wa.me/?text=")).toBe(true);
  });

  it("won't share another wedding's family", async () => {
    const [w2] = await db.insert(weddings).values({ slug: `pr-x-${n}`, brideName: "C", groomName: "D", weddingDate: new Date() }).returning();
    expect(await whatsappInvite(w2.id, familyId)).toEqual({ ok: false, error: "family not found" });
  });
});
