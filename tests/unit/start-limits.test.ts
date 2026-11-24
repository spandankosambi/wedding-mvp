import { describe, it, expect, beforeAll, vi } from "vitest";
import { db, migrateDb } from "@/db/client";
import { weddings } from "@/db/schema";

/* /start emails a sign-in link to whatever address is typed: per visitor,
   per address and a cap on new sites an hour, all in the shared store. */
let ip = "1.1.1.1";
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": ip }) }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw Object.assign(new Error("redirect"), { to }); } }));
vi.mock("@/auth", () => ({ signIn: async () => undefined }));
const { startWeddingAction } = await import("@/app/start/actions");

const form = (email: string) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ brideName: "Mira", groomName: "Dev", you: "bride", weddingDate: "2031-04-18", city: "Pune", email, theme: "raj-mahal" })) f.set(k, v);
  return f;
};
/** "sent" when it went through (redirected to the check-your-inbox page), else the message */
const start = async (email: string) => {
  try { return (await startWeddingAction({}, form(email))).error; } catch (e) { return (e as { to?: string }).to ? "sent" : String(e); }
};

beforeAll(async () => { await migrateDb(); });

describe("/start limits", () => {
  it("at most 2 tries a day for one address", async () => {
    ip = "2.2.2.1"; expect(await start("mira@site.org")).toBe("sent");
    ip = "2.2.2.2"; expect(await start("MIRA@site.org")).toBe("sent");
    ip = "2.2.2.3"; expect(await start("mira@site.org")).toMatch(/already sent a sign-in link to that address today/);
  });
  it("at most 5 tries per visitor in 10 minutes", async () => {
    ip = "3.3.3.3";
    for (let i = 0; i < 5; i++) await start(`v${i}@site.org`);
    expect(await start("v9@site.org")).toMatch(/too fast/);
  });
  it("a cap on new sites an hour (a setting)", async () => {
    process.env.NEW_SITES_PER_HOUR = "3";
    const made = (await db.select().from(weddings)).length;
    if (made < 3) await db.insert(weddings).values(Array.from({ length: 3 - made }, (_, i) => ({ slug: `cap-${i}`, brideName: "A", groomName: "B", weddingDate: new Date("2031-01-01") })));
    ip = "4.4.4.4";
    expect(await start("late@site.org")).toMatch(/Lots of couples are signing up right now/);
    delete process.env.NEW_SITES_PER_HOUR;
  });
});
