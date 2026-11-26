import { describe, it, expect, beforeAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, migrateDb } from "@/db/client";
import { weddings, users, tourProgress } from "@/db/schema";
import { TOURS, stepsFor, autoStartFor, type TourId } from "@/lib/tours/tours";
import { hasSeenTour, markTour } from "@/lib/tours/progress";

let signedIn: Record<string, unknown> | null = null;
vi.mock("@/auth", () => ({ auth: async () => (signedIn ? { user: signedIn } : null) }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw Object.assign(new Error("redirect"), { to }); } }));
const { markTourAction } = await import("@/app/_tour/actions");

describe("the tours' wording", () => {
  const all = Object.entries(TOURS) as [TourId, (typeof TOURS)[TourId]][];
  it("every page has a short tour: 3 to 7 steps", () => {
    for (const [, steps] of all) { expect(steps.length).toBeGreaterThanOrEqual(3); expect(steps.length).toBeLessThanOrEqual(7); }
  });
  it("short, sentence-case titles and bodies a phone card can hold", () => {
    for (const [, steps] of all) for (const s of steps) {
      expect(s.title.length).toBeLessThanOrEqual(40);
      expect(s.body.length).toBeLessThanOrEqual(220);
      expect(s.title[0]).toBe(s.title[0].toUpperCase());
      expect(s.title).not.toMatch(/\b[A-Z]{3,}\b/); // no shouting
      expect(s.body.endsWith(".")).toBe(true);
    }
  });
});

describe("who sees which steps", () => {
  it("a committee member never gets the couple-only steps", () => {
    const titles = stepsFor("overview", "committee").map((s) => s.title);
    expect(titles).not.toContain("Bring in your helpers");
    expect(titles).not.toContain("Names, date and city");
    expect(stepsFor("overview", "couple").map((s) => s.title)).toContain("Bring in your helpers");
  });
  it("starts by itself only the first time, never for admin, never when switched off", () => {
    expect(autoStartFor({ enabled: true, role: "couple", seen: false })).toBe(true);
    expect(autoStartFor({ enabled: true, role: "committee", seen: false })).toBe(true);
    expect(autoStartFor({ enabled: true, role: "couple", seen: true })).toBe(false);
    expect(autoStartFor({ enabled: true, role: "admin", seen: false })).toBe(false);
    expect(autoStartFor({ enabled: false, role: "couple", seen: false })).toBe(false);
  });
});

describe("progress is saved to the person", () => {
  let u: string, other: string;
  beforeAll(async () => {
    await migrateDb();
    const [w] = await db.insert(weddings).values({ slug: "tour1", brideName: "A", groomName: "B", weddingDate: new Date("2030-11-20") }).returning();
    [{ id: u }, { id: other }] = await db.insert(users).values([
      { email: "t1@site.org", role: "couple", weddingId: w.id },
      { email: "t2@site.org", role: "committee", weddingId: w.id, side: "bride" },
    ]).returning();
  });
  it("once seen, seen everywhere; finishing after skipping is just an update", async () => {
    expect(await hasSeenTour(u, "overview")).toBe(false);
    await markTour(u, "overview", "skipped");
    expect(await hasSeenTour(u, "overview")).toBe(true);
    await markTour(u, "overview", "finished");
    expect((await db.select().from(tourProgress).where(eq(tourProgress.userId, u)))).toMatchObject([{ tour: "overview", how: "finished" }]);
    expect(await hasSeenTour(other, "overview")).toBe(false); // someone else's is their own
  });
  it("the action marks only the signed-in person, and refuses unknown tours", async () => {
    signedIn = { id: other, role: "committee", weddingId: null, side: "bride", access: null };
    expect(await markTourAction({ tour: "guests", how: "finished" })).toEqual({ ok: true });
    expect(await hasSeenTour(other, "guests")).toBe(true);
    expect(await hasSeenTour(u, "guests")).toBe(false);
    expect(await markTourAction({ tour: "not-a-tour", how: "finished" })).toEqual({ ok: false });
    expect(await markTourAction({ tour: "guests", how: "deleted" })).toEqual({ ok: false });
  });
  it("signed out: sent to sign in", async () => {
    signedIn = null;
    await expect(markTourAction({ tour: "overview", how: "finished" })).rejects.toMatchObject({ to: "/signin" });
  });
});
