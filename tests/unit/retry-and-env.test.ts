import { describe, it, expect, vi, afterEach } from "vitest";
import { withRetry } from "@/lib/core/retry";
import { env, envProblems } from "@/config/env";

describe("withRetry", () => {
  it("tries again after a hiccup and returns the answer", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let n = 0;
    const out = await withRetry(async () => { if (++n < 3) throw new Error("fetch failed"); return "ok"; }, { firstWaitMs: 1 });
    expect(out).toBe("ok");
    expect(n).toBe(3);
  });
  it("passes on the last failure", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(withRetry(async () => { throw new Error("down"); }, { tries: 2, firstWaitMs: 1 })).rejects.toThrow("down");
  });
});

describe("settings", () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });
  it("reads on use, trims, and gives defaults", () => {
    process.env.AZURE_TRANSLATOR_REGION = "";
    process.env.APP_URL = " https://x.test ";
    expect(env.translator.region).toBe("centralindia");
    expect(env.appUrl).toBe("https://x.test");
  });
  it("lists what a live site is missing, in plain words", () => {
    for (const k of ["DATABASE_URL", "AUTH_SECRET", "EMAIL_MODE", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM", "BLOB_READ_WRITE_TOKEN"]) delete process.env[k];
    expect(envProblems()).toEqual([
      "DATABASE_URL is not set: the live site needs its database",
      "AUTH_SECRET is not set: sign-in can't keep people signed in",
      "EMAIL_MODE is not 'smtp': emails are recorded, not sent",
      "EMAIL_FROM is not set: emails have no sender name",
      "BLOB_READ_WRITE_TOKEN is not set: photos can't be uploaded",
    ]);
    Object.assign(process.env, { DATABASE_URL: "postgres://x", AUTH_SECRET: "s", EMAIL_MODE: "smtp", SMTP_USER: "u", SMTP_PASS: "p", EMAIL_FROM: "f", BLOB_READ_WRITE_TOKEN: "b" });
    expect(envProblems()).toEqual([]);
  });
});
