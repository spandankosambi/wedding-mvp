import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db, migrateDb } from "@/db/client";
import { weddings, users, sessions } from "@/db/schema";
import { accessFor, allows, seesSide, sidesOf, homeSide } from "@/lib/access";
import { addPerson, updatePerson, removePerson, listPeople, describe as describePerson } from "@/lib/people";
import { buildChecklist } from "@/lib/checklist";
import { getLook } from "@/lib/looks";

describe("access rules", () => {
  it("the couple and the admin do everything on both sides", () => {
    for (const role of ["couple", "admin"] as const) {
      const a = accessFor({ role, side: "bride", access: { site: "none", guests: "none", print: "none" } });
      expect(a.side).toBe("both");
      expect(allows(a, "site", "groom", "full") && allows(a, "guests", "bride", "full") && allows(a, "print", "groom", "full")).toBe(true);
      expect(a.manage).toBe(true);
    }
    expect(accessFor({ role: "couple", isOwner: true }).owner).toBe(true);
    expect(accessFor({ role: "couple" }).owner).toBe(false);
  });

  it("a committee member stays on their side, at their level", () => {
    const a = accessFor({ role: "committee", side: "bride", access: { site: "view", guests: "none", print: "none" } });
    expect(seesSide(a, "bride")).toBe(true);
    expect(seesSide(a, "groom")).toBe(false);
    expect(allows(a, "site", "bride")).toBe(true);           // may look
    expect(allows(a, "site", "bride", "full")).toBe(false);  // may not change
    expect(allows(a, "site", "groom")).toBe(false);          // never the other side
    expect(allows(a, "guests", "bride")).toBe(false);
    expect(a.manage || a.owner).toBe(false);
    expect(sidesOf(a)).toEqual(["bride"]);
    expect(homeSide(accessFor({ role: "committee", side: "groom", access: null }))).toBe("groom");
  });

  it("an old committee login keeps what it had: the guest list on both sides", () => {
    const a = accessFor({ role: "committee", side: "both", access: null });
    expect(allows(a, "guests", "groom", "full")).toBe(true);
    expect(allows(a, "site", "groom")).toBe(false);
    expect(allows(a, "print", "bride", "full")).toBe(false);
  });

  it("nonsense stored as access gives nothing", () => {
    const a = accessFor({ role: "committee", side: "everyone", access: { site: "admin", guests: 7, print: "view" } });
    expect([a.site, a.guests, a.print]).toEqual(["none", "none", "none"]);
    expect(a.side).toBe("both");
  });
});

let n = 0;
async function fixture() {
  n++;
  const [w] = await db.insert(weddings).values({ slug: `ppl-${n}`, brideName: "Pooja", groomName: "Spandan", weddingDate: new Date("2027-01-29T04:30:00Z") }).returning();
  const [owner] = await db.insert(users).values({ email: `owner${n}@example.com`, role: "couple", weddingId: w.id, isOwner: true }).returning();
  const [partner] = await db.insert(users).values({ email: `partner${n}@example.com`, role: "couple", weddingId: w.id }).returning();
  return { weddingId: w.id, owner: { userId: owner.id, owner: true }, partner: { userId: partner.id, owner: false }, n };
}
const friend = { name: "Friend", role: "committee", side: "bride", site: "view", guests: "none", print: "none" };

describe("people", () => {
  let fx: Awaited<ReturnType<typeof fixture>>;
  beforeAll(async () => { await migrateDb(); });
  beforeEach(async () => { fx = await fixture(); });

  it("adds a committee member on a side with a level per page", async () => {
    const r = await addPerson(fx.weddingId, fx.partner, ` Friend${fx.n}@Example.com `, friend);
    expect(r.ok).toBe(true);
    const p = (await listPeople(fx.weddingId)).find((x) => x.email === `friend${fx.n}@example.com`)!;
    expect(p).toMatchObject({ role: "committee", side: "bride", site: "view", guests: "none", print: "none", signedIn: false });
    expect(describePerson(p)).toBe("Bride's side: the dashboard and overview, Edit your site (view only)");
    // the owner is listed first
    expect((await listPeople(fx.weddingId))[0].isOwner).toBe(true);
  });

  it("refuses a bad email, a duplicate, and an address used by another wedding", async () => {
    expect((await addPerson(fx.weddingId, fx.owner, "not-an-email", friend)).ok).toBe(false);
    await addPerson(fx.weddingId, fx.owner, `dup${fx.n}@example.com`, friend);
    const again = await addPerson(fx.weddingId, fx.owner, `dup${fx.n}@example.com`, friend);
    expect(again).toMatchObject({ ok: false, error: expect.stringContaining("already has access") });
    const other = await fixture();
    const elsewhere = await addPerson(other.weddingId, other.owner, `dup${fx.n}@example.com`, friend);
    expect(elsewhere).toMatchObject({ ok: false, error: expect.stringContaining("another wedding") });
    expect((await addPerson(fx.weddingId, fx.owner, `x${fx.n}@example.com`, { ...friend, site: "owner" })).ok).toBe(false);
  });

  it("only the owner adds, changes or removes the bride or groom", async () => {
    expect((await addPerson(fx.weddingId, fx.partner, `third${fx.n}@example.com`, { ...friend, role: "couple" })).ok).toBe(false);
    expect((await addPerson(fx.weddingId, fx.owner, `third${fx.n}@example.com`, { ...friend, role: "couple" })).ok).toBe(true);
    const third = (await listPeople(fx.weddingId)).find((p) => p.email === `third${fx.n}@example.com`)!;
    expect(third).toMatchObject({ role: "couple", side: "both", site: "full", guests: "full", print: "full" });
    expect((await removePerson(fx.weddingId, fx.partner, third.id)).ok).toBe(false);
    expect((await updatePerson(fx.weddingId, fx.partner, third.id, friend)).ok).toBe(false);
    expect((await removePerson(fx.weddingId, fx.owner, third.id)).ok).toBe(true);
    // a partner can't promote a friend either
    await addPerson(fx.weddingId, fx.partner, `f${fx.n}@example.com`, friend);
    const f = (await listPeople(fx.weddingId)).find((p) => p.email === `f${fx.n}@example.com`)!;
    expect((await updatePerson(fx.weddingId, fx.partner, f.id, { ...friend, role: "couple" })).ok).toBe(false);
  });

  it("nobody changes themselves or the owner, or reaches into another wedding", async () => {
    expect((await removePerson(fx.weddingId, fx.owner, fx.owner.userId)).ok).toBe(false);
    expect((await updatePerson(fx.weddingId, fx.partner, fx.partner.userId, friend)).ok).toBe(false);
    expect((await removePerson(fx.weddingId, fx.partner, fx.owner.userId)).ok).toBe(false);
    const other = await fixture();
    await addPerson(other.weddingId, other.owner, `theirs${fx.n}@example.com`, friend);
    const theirs = (await listPeople(other.weddingId)).find((p) => p.email === `theirs${fx.n}@example.com`)!;
    expect((await removePerson(fx.weddingId, fx.owner, theirs.id)).ok).toBe(false);
    expect((await updatePerson(fx.weddingId, fx.owner, theirs.id, { ...friend, guests: "full" })).ok).toBe(false);
    expect((await listPeople(other.weddingId)).find((p) => p.id === theirs.id)!.guests).toBe("none");
  });

  it("changing access takes effect, and removing signs them out", async () => {
    await addPerson(fx.weddingId, fx.owner, `go${fx.n}@example.com`, friend);
    const p = (await listPeople(fx.weddingId)).find((x) => x.email === `go${fx.n}@example.com`)!;
    expect((await updatePerson(fx.weddingId, fx.owner, p.id, { ...friend, side: "both", guests: "full", print: "full" })).ok).toBe(true);
    expect((await listPeople(fx.weddingId)).find((x) => x.id === p.id)).toMatchObject({ side: "both", guests: "full", print: "full" });
    await db.insert(sessions).values({ sessionToken: `go-${fx.n}`, userId: p.id, expires: new Date(Date.now() + 86_400_000) });
    expect((await removePerson(fx.weddingId, fx.owner, p.id)).ok).toBe(true);
    expect(await db.select().from(sessions).where(eq(sessions.userId, p.id))).toHaveLength(0);
    expect((await listPeople(fx.weddingId)).some((x) => x.id === p.id)).toBe(false);
  });

  it("the checklist counts what's done for a side", async () => {
    const look = await getLook(fx.weddingId, "groom");
    const base = { side: "groom" as const, q: "", parents: null, look, publishedEvents: 0, families: 0, invited: 0, replied: 0 };
    expect(buildChecklist(base).filter((i) => i.done)).toHaveLength(0);
    const some = buildChecklist({ ...base, parents: "Kavita & Vikram", publishedEvents: 2, families: 3, look: { ...look, story: "We met at work", rsvpDeadline: new Date() } });
    expect(some.filter((i) => i.done).map((i) => i.id)).toEqual(["parents", "words", "events", "guests", "deadline"]);
    expect(some.find((i) => i.id === "wording")!.href).toBe("/couple/site?family=groom#wording");
  });
});
