import { describe, it, expect, beforeAll } from "vitest";
import { migrateDb } from "@/db/client";
import { signInAllowed, signInWasLimited } from "@/lib/auth/signin-limits";

beforeAll(async () => { await migrateDb(); });

describe("sign-in link limits", () => {
  it("3 per address per 15 minutes (capitals don't make a new address)", async () => {
    for (let i = 0; i < 3; i++) expect(await signInAllowed("asha@site.org", `ip-a${i}`)).toBe(true);
    expect(await signInAllowed("ASHA@site.org", "ip-a9")).toBe(false);
    expect(await signInAllowed("ravi@site.org", "ip-a9")).toBe(true); // someone else is fine
  });
  it("10 per visitor per 15 minutes, across any addresses", async () => {
    for (let i = 0; i < 10; i++) expect(await signInAllowed(`p${i}@site.org`, "ip-b")).toBe(true);
    expect(await signInAllowed("p99@site.org", "ip-b")).toBe(false);
  });
  it("test accounts are not exempt unless the test-only setting is on", async () => {
    for (let i = 0; i < 3; i++) await signInAllowed("couple@example.com", `ip-c${i}`);
    expect(await signInAllowed("couple@example.com", "ip-c9")).toBe(false);
  });
  it("checking afterwards counts nothing, and says the same for any address", async () => {
    expect(await signInWasLimited("fresh@site.org", "ip-d")).toBe(false);
    for (let i = 0; i < 3; i++) await signInAllowed("fresh@site.org", "ip-d");
    expect(await signInWasLimited("fresh@site.org", "ip-d")).toBe(false); // 3 is still within the limit
    expect(await signInWasLimited("fresh@site.org", "ip-d")).toBe(false); // and asking didn't add one
    await signInAllowed("fresh@site.org", "ip-d");
    expect(await signInWasLimited("fresh@site.org", "ip-d")).toBe(true);
  });
});
