import { describe, it, expect, beforeAll, vi, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db, migrateDb } from "@/db/client";
import { weddings, events } from "@/db/schema";
import { cleanMapsUrl, expandMapLink, fixShortMapLinks, isShortMapLink } from "@/lib/maplinks";
import { upsertEvent, istParts } from "@/lib/editor";

const SHORT = "https://maps.app.goo.gl/wzeibw5ZMuSb6JDt9";
const LONG = "https://www.google.com/maps/place/Asodit+Banquets/@18.5211581,73.930755,17z/data=!3m1!4b1!4m6!3m5!1s0x3bc2c1f4f4f5ace3:0x2f37f00b9034706a!8m2!3d18.5211581!4d73.930755!16s%2Fg%2F11g81f21j8?entry=tts&g_ep=EgoyMDI2MTEwNC4wIOC7DCoASAFQAw%3D%3D&skid=d7ab3a73";
const CLEAN = "https://www.google.com/maps/place/Asodit+Banquets/@18.5211581,73.930755,17z/data=!3m1!4b1!4m6!3m5!1s0x3bc2c1f4f4f5ace3:0x2f37f00b9034706a!8m2!3d18.5211581!4d73.930755!16s%2Fg%2F11g81f21j8";

/** Google's short-link server, as seen from a server that can reach it. */
const google = (async (url: string) => {
  if (String(url) === SHORT) return new Response(null, { status: 302, headers: { Location: LONG } });
  return new Response("not found", { status: 404 });
}) as unknown as typeof fetch;

describe("map links", () => {
  it("knows a Google Maps short link", () => {
    expect(isShortMapLink(SHORT)).toBe(true);
    expect(isShortMapLink("https://goo.gl/maps/abc123")).toBe(true);
    expect(isShortMapLink(CLEAN)).toBe(false);
    expect(isShortMapLink("https://goo.gl/abc")).toBe(false);
    expect(isShortMapLink("not a url")).toBe(false);
  });
  it("swaps a short link for the full Google Maps address, without the share tracking", async () => {
    expect(await expandMapLink(SHORT, google)).toBe(CLEAN);
    expect(cleanMapsUrl(LONG)).toBe(CLEAN);
  });
  it("leaves anything else, or a link it can't follow right now, as pasted", async () => {
    expect(await expandMapLink(CLEAN, google)).toBe(CLEAN);
    const down = (async () => { throw new Error("timed out"); }) as unknown as typeof fetch;
    expect(await expandMapLink(SHORT, down)).toBe(SHORT);
    const elsewhere = (async () => new Response(null, { status: 302, headers: { Location: "https://evil.example/x" } })) as unknown as typeof fetch;
    expect(await expandMapLink(SHORT, elsewhere)).toBe(SHORT);
  });
});

describe("stored links", () => {
  let weddingId: string;
  beforeAll(async () => {
    await migrateDb();
    const [w] = await db.insert(weddings).values({ slug: `ml-${Date.now()}`, brideName: "P", groomName: "S", weddingDate: new Date("2027-01-29T04:30:00Z") }).returning();
    weddingId = w.id;
  });
  afterEach(() => vi.unstubAllGlobals());

  it("saving an event stores the full address", async () => {
    vi.stubGlobal("fetch", google);
    const p = istParts(new Date("2027-01-29T04:30:00Z"));
    const r = await upsertEvent(weddingId, { name: "Wedding", date: p.date, time: p.time, venueName: "Asodit Banquets", address: "Magarpatta, Pune", mapUrl: SHORT });
    expect(r.ok).toBe(true);
    const [e] = await db.select().from(events).where(eq(events.id, r.id!));
    expect(e.mapUrl).toBe(CLEAN);
  });

  it("links saved earlier are fixed the first time the site is shown", async () => {
    vi.stubGlobal("fetch", google);
    const [e] = await db.insert(events).values({ weddingId, name: "Sangeet", startsAt: new Date(), venueName: "V", address: "A", mapUrl: SHORT }).returning();
    const travel = { stays: [{ name: "Hotel", note: "", url: SHORT }, { name: "Other", note: "", url: "https://hotel.example" }], gettingThere: "" };
    const fixed = await fixShortMapLinks(weddingId, [e], travel);
    expect(fixed.eventUrls.get(e.id)).toBe(CLEAN);
    expect(fixed.travel?.stays.map((s) => s.url)).toEqual([CLEAN, "https://hotel.example"]);
    expect((await db.select().from(events).where(eq(events.id, e.id)))[0].mapUrl).toBe(CLEAN);
    expect((await db.select().from(weddings).where(eq(weddings.id, weddingId)))[0].travel?.stays[0].url).toBe(CLEAN);
  });
});
