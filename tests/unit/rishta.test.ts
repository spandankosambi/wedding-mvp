import { describe, it, expect, beforeAll, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, migrateDb } from "@/db/client";
import { weddings, families, rishtaProfiles, rishtaConsents, rishtaInterests, rishtaReports, rishtaSettings } from "@/db/schema";

/* Rishta Corner's rules and data, end to end in the library. */

// capture passcodes instead of reading emails
const codes: Record<string, string> = {};
vi.mock("@/lib/email/mailer", async (orig) => {
  const real = await orig<typeof import("@/lib/email/mailer")>();
  return { ...real, sendRishtaCode: async (a: { to: string; code: string }) => { codes[a.to] = a.code; }, sendRishtaLink: async () => {} };
});

const R = await import("@/lib/rishta/rules");
const M = await import("@/lib/rishta/photo-meta");
const P = await import("@/lib/rishta/profiles");
const X = await import("@/lib/rishta/match");
const H = await import("@/lib/rishta/host");

const today = R.istToday();
const yr = Number(today.slice(0, 4));
const shift = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

describe("rules", () => {
  it("legal ages: 18 for women, 21 for men", () => {
    expect(R.oldEnough("woman", yr - 18, yr)).toBe(true);
    expect(R.oldEnough("woman", yr - 17, yr)).toBe(false);
    expect(R.oldEnough("man", yr - 21, yr)).toBe(true);
    expect(R.oldEnough("man", yr - 20, yr)).toBe(false);
  });
  it("each sees the other only if each is looking for the other", () => {
    expect(R.compatible({ gender: "woman", lookingFor: "man" }, { gender: "man", lookingFor: "woman" })).toBe(true);
    expect(R.compatible({ gender: "man", lookingFor: "woman" }, { gender: "man", lookingFor: "woman" })).toBe(false);
  });
  it("the default window: 10 days before to 3 after", () => {
    expect(R.defaultWindow(new Date("2027-01-29T10:00:00+05:30"))).toEqual({ opensOn: "2027-01-19", closesOn: "2027-02-01" });
    expect(R.windowState({ opensOn: "2027-01-19", closesOn: "2027-02-01" }, "2027-01-18")).toBe("before");
    expect(R.windowState({ opensOn: "2027-01-19", closesOn: "2027-02-01" }, "2027-02-01")).toBe("open");
    expect(R.windowState({ opensOn: "2027-01-19", closesOn: "2027-02-01" }, "2027-02-02")).toBe("closed");
  });
  it("only a Jeevansathi or Shaadi.com https link", () => {
    expect(R.allowedExternal("https://www.jeevansathi.com/profile/abc")).toBe(true);
    expect(R.allowedExternal("https://shaadi.com/x")).toBe(true);
    expect(R.allowedExternal("http://shaadi.com/x")).toBe(false);
    expect(R.allowedExternal("https://evil.com/?shaadi.com")).toBe(false);
    expect(R.allowedExternal("https://notshaadi.com/x")).toBe(false);
  });
});

describe("hidden data is removed from photos", () => {
  const b = (...xs: (number | string)[]) => new Uint8Array(xs.flatMap((x) => (typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : [x])));
  const has = (bytes: Uint8Array, s: string) => Buffer.from(bytes).includes(Buffer.from(s));
  it("JPEG: location (EXIF/XMP) and comments go; the picture stays", () => {
    const exif = b(0xff, 0xe1, 0x00, 0x0e, "Exif", 0, 0, "GPS123");
    const jfif = b(0xff, 0xe0, 0x00, 0x07, "JFIF", 0);
    const com = b(0xff, 0xfe, 0x00, 0x06, "home");
    const scan = b(0xff, 0xda, 0x00, 0x04, 1, 2, 9, 9, 9, 0xff, 0xd9);
    const out = M.stripPhotoMetadata(new Uint8Array([0xff, 0xd8, ...jfif, ...exif, ...com, ...scan]))!;
    expect(out.kind).toBe("jpeg");
    expect(has(out.bytes, "GPS123")).toBe(false);
    expect(has(out.bytes, "home")).toBe(false);
    expect(has(out.bytes, "JFIF")).toBe(true);
    expect(Array.from(out.bytes.slice(-11))).toEqual(Array.from(scan));
  });
  it("PNG: eXIf and text chunks go", () => {
    const chunk = (type: string, data: string) => { const d = b(data); return new Uint8Array([0, 0, 0, d.length, ...b(type), ...d, 1, 2, 3, 4]); };
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk("IHDR", "abcd"), ...chunk("eXIf", "GPSxy"), ...chunk("tEXt", "Where"), ...chunk("IDAT", "px"), ...chunk("IEND", "")]);
    const out = M.stripPhotoMetadata(png)!;
    expect(has(out.bytes, "GPSxy")).toBe(false);
    expect(has(out.bytes, "Where")).toBe(false);
    expect(has(out.bytes, "IDAT")).toBe(true);
  });
  it("WebP: EXIF/XMP chunks go and their flags are cleared", () => {
    const vp8x = new Uint8Array([...b("VP8X"), 10, 0, 0, 0, 0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const exif = new Uint8Array([...b("EXIF"), 4, 0, 0, 0, ...b("GPS!")]);
    const img = new Uint8Array([...b("VP8 "), 2, 0, 0, 0, 7, 7]);
    const body = [...vp8x, ...exif, ...img];
    const n = body.length + 4;
    const webp = new Uint8Array([...b("RIFF"), n & 255, n >> 8, 0, 0, ...b("WEBP"), ...body]);
    const out = M.stripPhotoMetadata(webp)!;
    expect(has(out.bytes, "GPS!")).toBe(false);
    expect(out.bytes[12 + 8] & 0x0c).toBe(0);
    expect(new DataView(out.bytes.buffer).getUint32(4, true)).toBe(out.bytes.length - 8);
  });
  it("anything else is refused (an SVG, an HTML page)", () => {
    expect(M.stripPhotoMetadata(b("<svg onload=alert(1)>"))).toBeNull();
    expect(M.stripPhotoMetadata(b("<!doctype html>"))).toBeNull();
  });
});

describe("profiles, matching and the host", () => {
  let wid: string, otherWid: string;
  const fam: Record<string, { id: string; weddingId: string }> = {};
  const tokens: Record<string, string> = {};
  const me = async (id: string) => (await db.select().from(rishtaProfiles).where(eq(rishtaProfiles.id, id)))[0];
  const draft = (f: string, o: Record<string, unknown>) => P.saveDraft(fam[f], { city: "Pune", education: "B.Tech", profession: "Engineer", bio: "Likes chai", familyContactName: "Papa", familyContactPhone: "98765 43210", ...o });
  async function openAndPublish(f: string, id: string) {
    await P.sendToSingle(fam[f], id, (t) => { tokens[id] = t; return `x/${t}`; }, "A & B");
    const p = (await P.byToken(tokens[id]))!;
    expect((await P.requestCode(p, "1.1.1.1")).ok).toBe(true);
    const v = await P.verifyCode(p, codes[p.email]);
    expect(v.ok).toBe(true);
    expect((await P.publish(await me(id), R.DECLARATIONS.map((d) => d.id), false)).ok).toBe(true);
    return v.ok ? v.session : "";
  }
  let asha: string, ravi: string, karan: string;

  beforeAll(async () => {
    process.env.EMAIL_MODE = "file";
    await migrateDb();
    const [w] = await db.insert(weddings).values({ slug: "rc1", brideName: "Ananya", groomName: "Arjun", weddingDate: new Date(`${shift(3)}T10:00:00+05:30`) }).returning();
    const [o] = await db.insert(weddings).values({ slug: "rc2", brideName: "X", groomName: "Y", weddingDate: new Date(`${shift(3)}T10:00:00+05:30`) }).returning();
    wid = w.id; otherWid = o.id;
    for (const [k, wd, side] of [["mehta", wid, "bride"], ["kapoor", wid, "groom"], ["shah", wid, "groom"], ["far", otherWid, "bride"]] as const) {
      const [f] = await db.insert(families).values({ weddingId: wd, name: k, side, email: "" }).returning();
      fam[k] = { id: f.id, weddingId: wd };
    }
  });

  it("nothing can be drafted until admin switches it on", async () => {
    expect(await draft("mehta", { firstName: "Asha", gender: "woman", lookingFor: "man", birthYear: yr - 26, email: "asha@site.org" })).toMatchObject({ ok: false });
    await P.setEnabled(wid, true);
    await P.setEnabled(otherWid, true);
    expect((await P.stateFor(wid)).phase).toBe("open");
  });

  it("a household drafts; only the single, with a passcode, can publish", async () => {
    const a = await draft("mehta", { firstName: "Asha", gender: "woman", lookingFor: "man", birthYear: yr - 26, email: "asha@site.org", relation: "Ananya's cousin", relationShown: "true" });
    expect(a.ok).toBe(true);
    asha = a.ok ? a.id : "";
    // another household can't touch it
    expect(await P.deleteDraft(fam.kapoor.id, asha)).toMatchObject({ ok: false });
    expect(await P.saveDraft(fam.kapoor, { firstName: "X", gender: "woman", lookingFor: "man", birthYear: 1990, email: "x@site.org" }, asha)).toMatchObject({ ok: false });
    // a wrong code, then the right one
    await P.sendToSingle(fam.mehta, asha, (t) => { tokens[asha] = t; return t; }, "A & B");
    const p = (await P.byToken(tokens[asha]))!;
    await P.requestCode(p, "2.2.2.2");
    expect(await P.verifyCode(p, codes["asha@site.org"] === "000000" ? "111111" : "000000")).toMatchObject({ ok: false });
    const v = await P.verifyCode(p, codes["asha@site.org"]);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(P.sessionProfileId(v.session)).toBe(asha);
    expect(P.sessionProfileId(v.session.replace(/.$/, "x"))).toBeNull();
    // now it's hers: the household can't change or delete it
    expect(await P.saveDraft(fam.mehta, { firstName: "Changed", gender: "woman", lookingFor: "man", birthYear: yr - 26, email: "asha@site.org" }, asha)).toMatchObject({ ok: false });
    // she must tick all three
    expect(await P.publish(await me(asha), ["me"], false)).toMatchObject({ ok: false });
    expect((await P.publish(await me(asha), R.DECLARATIONS.map((d) => d.id), true)).ok).toBe(true);
    expect(await me(asha)).toMatchObject({ status: "pending", marketingOptIn: true });
    expect(await db.select().from(rishtaConsents).where(eq(rishtaConsents.weddingId, wid))).toHaveLength(1);
  });

  it("under the legal age can't publish", async () => {
    const k = await draft("shah", { firstName: "Kid", gender: "man", lookingFor: "woman", birthYear: yr - 19, email: "kid@site.org" });
    if (!k.ok) throw new Error(k.error);
    await P.sendToSingle(fam.shah, k.id, (t) => { tokens[k.id] = t; return t; }, "A & B");
    const p = (await P.byToken(tokens[k.id]))!;
    await P.requestCode(p, "3.3.3.3");
    await P.verifyCode(p, codes["kid@site.org"]);
    expect(await P.publish(await me(k.id), R.DECLARATIONS.map((d) => d.id), false)).toMatchObject({ ok: false, error: expect.stringContaining("21") });
  });

  it("nobody sees anyone until the host approves", async () => {
    const r = await draft("kapoor", { firstName: "Ravi", gender: "man", lookingFor: "woman", birthYear: yr - 29, email: "ravi@site.org", externalUrl: "https://www.shaadi.com/profile/ravi" });
    if (!r.ok) throw new Error(r.error);
    ravi = r.id;
    await openAndPublish("kapoor", ravi);
    expect(await X.browse(await me(asha))).toEqual([]);
    expect((await H.hostProfiles(wid)).waiting.map((p) => p.firstName).sort()).toEqual(["Asha", "Ravi"]);
    expect((await H.approve(wid, asha, true)).ok).toBe(true);
    expect((await H.approve(wid, ravi, false)).ok).toBe(true);
    expect((await H.approve(otherWid, ravi, false)).ok).toBe(false); // another wedding's host
  });

  it("each sees only people they'd want to meet, with nothing private before a match", async () => {
    const k = await draft("shah", { firstName: "Karan", gender: "man", lookingFor: "woman", birthYear: yr - 30, email: "karan@site.org" });
    if (!k.ok) throw new Error(k.error);
    karan = k.id;
    await openAndPublish("shah", karan);
    await H.approve(wid, karan, false);
    const seen = await X.browse(await me(asha));
    expect(seen.map((c) => c.firstName).sort()).toEqual(["Karan", "Ravi"]);
    expect(JSON.stringify(seen)).not.toMatch(/ravi@site\.org|shaadi\.com|98765|Papa/);
    expect((await X.browse(await me(ravi))).map((c) => c.firstName)).toEqual(["Asha"]); // men don't see men
    expect((await X.browse(await me(ravi)))[0].relation).toBe("Ananya's cousin"); // shown and approved
  });

  it("a match, then contacts only when both agree to introduce the families", async () => {
    expect((await X.setInterest(await me(asha), ravi, true)).ok).toBe(true);
    expect(await X.matches(await me(asha))).toEqual([]); // one-sided: nothing, and Ravi isn't told
    expect((await X.setInterest(await me(ravi), asha, true)).ok).toBe(true);
    const [m] = await X.matches(await me(asha));
    expect(m).toMatchObject({ firstName: "Ravi", externalUrl: "https://www.shaadi.com/profile/ravi", family: null });
    await X.introduce(await me(asha), ravi);
    expect((await X.matches(await me(asha)))[0].family).toBeNull(); // only one side so far
    await X.introduce(await me(ravi), asha);
    expect((await X.matches(await me(asha)))[0].family).toEqual({ name: "Papa", phone: expect.stringContaining("9876543210") });
    expect(await H.hostCounts(wid)).toMatchObject({ live: 3, matches: 1 });
  });

  it("the host's view never includes who is interested in whom", async () => {
    const all = JSON.stringify({ c: await H.hostCounts(wid), p: await H.hostProfiles(wid) });
    expect(all).not.toMatch(/interest|introduce|fromId|toId/i);
  });

  it("someone from another wedding can't reach anyone here", async () => {
    const f = await draft("far", { firstName: "Far", gender: "man", lookingFor: "woman", birthYear: yr - 30, email: "far@site.org" });
    if (!f.ok) throw new Error(f.error);
    await openAndPublish("far", f.id);
    await H.approve(otherWid, f.id, false);
    expect(await X.browse(await me(f.id))).toEqual([]);
    expect(await X.setInterest(await me(f.id), asha, true)).toMatchObject({ ok: false });
    expect(await X.block(await me(f.id), asha)).toMatchObject({ ok: false });
    expect(await X.report(await me(f.id), asha, "harassment", "")).toMatchObject({ ok: false });
  });

  it("a block hides both ways and ends the match", async () => {
    await X.setInterest(await me(asha), karan, true);
    expect((await X.block(await me(karan), asha)).ok).toBe(true);
    expect((await X.browse(await me(asha))).map((c) => c.firstName)).toEqual(["Ravi"]);
    expect((await X.browse(await me(karan))).map((c) => c.firstName)).toEqual([]);
    expect(await db.select().from(rishtaInterests).where(and(eq(rishtaInterests.fromId, asha), eq(rishtaInterests.toId, karan)))).toHaveLength(0);
  });

  it("a serious report hides the profile at once until reviewed", async () => {
    expect((await X.report(await me(asha), ravi, "under_age", "looks young")).ok).toBe(true);
    expect((await me(ravi)).status).toBe("pending");
    const [r] = await H.reportsFor(wid);
    expect(r).toMatchObject({ aboutName: "Ravi", reason: "under_age" });
    expect((await H.resolveReport(otherWid, r.id)).ok).toBe(false);
    expect((await H.resolveReport(wid, r.id)).ok).toBe(true);
  });

  it("editing a published profile sends it back for another look", async () => {
    await H.approve(wid, ravi, false);
    expect((await P.updateMine(await me(ravi), { firstName: "Ravi", gender: "man", lookingFor: "woman", birthYear: yr - 29, bio: "New bio" })).ok).toBe(true);
    expect(await me(ravi)).toMatchObject({ status: "pending", bio: "New bio", approvedAt: null });
  });

  it("when the window closes everything goes; consent and reports go 180 days later", async () => {
    await db.update(rishtaSettings).set({ closesOn: shift(-1) }).where(eq(rishtaSettings.weddingId, wid));
    expect(await X.browse(await me(asha))).toEqual([]);
    const r = await H.purgeClosed();
    expect(r.profiles).toBeGreaterThanOrEqual(3);
    expect(await db.select().from(rishtaProfiles).where(eq(rishtaProfiles.weddingId, wid))).toHaveLength(0);
    expect(await db.select().from(rishtaConsents).where(eq(rishtaConsents.weddingId, wid))).not.toHaveLength(0);
    expect(await db.select().from(rishtaReports).where(eq(rishtaReports.weddingId, wid))).toHaveLength(1);
    await H.purgeClosed(shift(R.KEEP_DAYS + 1));
    expect(await db.select().from(rishtaConsents).where(eq(rishtaConsents.weddingId, wid))).toHaveLength(0);
    expect(await db.select().from(rishtaReports).where(eq(rishtaReports.weddingId, wid))).toHaveLength(0);
  });
});
