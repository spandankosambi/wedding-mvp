import { describe, it, expect, beforeAll, vi } from "vitest";
import { migrateDb } from "@/db/client";
import { rateLimit, visitorIp } from "@/lib/auth/ratelimit";

beforeAll(async () => { await migrateDb(); });

describe("rateLimit (shared store)", () => {
  it("allows up to max hits then blocks within the window", async () => {
    for (let i = 0; i < 5; i++) expect(await rateLimit("k1", { max: 5 })).toBe(true);
    expect(await rateLimit("k1", { max: 5 })).toBe(false);
  });

  it("tracks keys independently", async () => {
    expect(await rateLimit("k2", { max: 1 })).toBe(true);
    expect(await rateLimit("k3", { max: 1 })).toBe(true);
    expect(await rateLimit("k2", { max: 1 })).toBe(false);
  });

  it("starts over once the window has passed", async () => {
    expect(await rateLimit("k4", { max: 1, windowMs: 200 })).toBe(true);
    expect(await rateLimit("k4", { max: 1, windowMs: 200 })).toBe(false);
    await new Promise((r) => setTimeout(r, 250));
    expect(await rateLimit("k4", { max: 1, windowMs: 200 })).toBe(true);
  });

  it("holds across separate servers: a fresh copy of the code sees the same count", async () => {
    expect(await rateLimit("k5", { max: 2 })).toBe(true);
    expect(await rateLimit("k5", { max: 2 })).toBe(true);
    // a new copy of the module, like another Vercel server, with nothing in memory
    vi.resetModules();
    const other = await import("@/lib/auth/ratelimit");
    expect(other.rateLimit).not.toBe(rateLimit);
    expect(await other.rateLimit("k5", { max: 2 })).toBe(false);
  });

  it("counts requests arriving at the same moment exactly", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => rateLimit("k6", { max: 5 })));
    expect(results.filter(Boolean)).toHaveLength(5);
  });
});

describe("visitorIp", () => {
  const h = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });
  it("prefers Vercel's own header, which visitors can't set", () => {
    expect(visitorIp(h({ "x-vercel-forwarded-for": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }))).toBe("1.2.3.4");
  });
  it("falls back to x-real-ip, then the first x-forwarded-for value", () => {
    expect(visitorIp(h({ "x-real-ip": "5.6.7.8", "x-forwarded-for": "9.9.9.9" }))).toBe("5.6.7.8");
    expect(visitorIp(h({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }))).toBe("9.9.9.9");
  });
  it("is 'local' with no header (on a laptop)", () => expect(visitorIp(h({}))).toBe("local"));
});
