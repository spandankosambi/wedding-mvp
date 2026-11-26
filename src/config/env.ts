/*
 * Every setting the app reads, in one place. Values come from the
 * environment (Vercel's project settings live; .env.local on a laptop;
 * see .env.example for the full list). Nothing secret is ever written in
 * code. Read through `env`, not process.env, so each setting has one name,
 * one default and one check.
 *
 * Getters read on use, not at import, so tests can set a variable and see it.
 * Framework flags (NEXT_RUNTIME, NEXT_PHASE, VITEST) are not settings and are
 * read where they're needed.
 */

const read = (name: string): string | undefined => {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
};

export const env = {
  /** Neon Postgres. Unset locally: the embedded PGlite database is used. */
  get databaseUrl() { return read("DATABASE_URL"); },
  /** Signs sessions (Auth.js) and Rishta Corner's own short sessions. Required live. */
  get authSecret() {
    const v = read("AUTH_SECRET");
    if (v) return v;
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is not set");
    return "local-only-secret-not-for-production";
  },
  /** Fallback address for links built outside a request (seed, tests). */
  /** Where people write to us (the grievance officer); else the address emails come from. */
  get contactEmail() { return read("CONTACT_EMAIL") ?? read("EMAIL_FROM")?.match(/[^<\s]+@[^>\s]+/)?.[0] ?? null; },
  /** Vercel Cron sends this as a bearer token; unset means the cron route refuses. */
  get cronSecret() { return read("CRON_SECRET"); },
  get appUrl() { return read("APP_URL") ?? "http://localhost:3000"; },

  email: {
    /** "smtp" sends real mail; anything else records it in the outbox table. */
    get mode() { return read("EMAIL_MODE") === "smtp" ? ("smtp" as const) : ("file" as const); },
    get smtpUser() { return read("SMTP_USER"); },
    get smtpPass() { return read("SMTP_PASS"); },
    /** The From header, e.g. "One Tap Invites <onetapinvites@gmail.com>". */
    get from() { return read("EMAIL_FROM"); },
    /** The mail server. Unset: the well-known service in SMTP_SERVICE (Gmail
        by default). Moving to another provider is only these settings. */
    get smtpHost() { return read("SMTP_HOST"); },
    get smtpPort() { return Number(read("SMTP_PORT") ?? 465) || 465; },
    get smtpSecure() { return read("SMTP_SECURE") !== "false"; },
    get smtpService() { return read("SMTP_SERVICE") ?? "gmail"; },
    /** Most emails sent in any 24 hours (Gmail allows about 500). The last 50
        are kept for sign-in links; other mail waits in a queue instead. */
    get dailyBudget() { return Math.max(60, Number(read("EMAIL_DAILY_BUDGET") ?? 400) || 400); },
  },

  /** Browser tests only: the seeded @example.com accounts sign in many times a
      run, so sign-in limits skip them. Never applies to a production build. */
  get relaxedTestLimits() { return process.env.NODE_ENV !== "production" && read("RELAXED_TEST_LIMITS") === "1"; },

  /** Page tours start by themselves the first time someone opens a page.
      Browser tests turn this off ("0") so tours don't cover what they click. */
  get toursAutostart() { return read("TOURS_AUTOSTART") !== "0"; },

  /** Most new wedding sites that may be created in any hour, from /start. */
  get newSitesPerHour() { return Math.max(1, Number(read("NEW_SITES_PER_HOUR") ?? 20) || 20); },

  /** Vercel Blob, for photos. */
  get blobToken() { return read("BLOB_READ_WRITE_TOKEN"); },

  /** Azure Translator, for Gujarati and Hindi cards (optional). */
  translator: {
    get key() { return read("AZURE_TRANSLATOR_KEY"); },
    get region() { return read("AZURE_TRANSLATOR_REGION") ?? "centralindia"; },
  },

  /** Any OpenAI-compatible AI service, for the guest-list import (optional). */
  ai: {
    get key() { return read("AI_API_KEY"); },
    get baseUrl() { return read("AI_BASE_URL"); },
    get model() { return read("AI_MODEL"); },
    get visionModel() { return read("AI_VISION_MODEL"); },
  },
};

/**
 * What's missing or wrong for a live site, in plain words; empty when all is
 * well. Checked once at start-up (src/instrumentation.ts) and logged, so a
 * forgotten setting shows up in the logs at once rather than as a puzzling
 * failure later. Optional features (translator, AI) are not required.
 */
export function envProblems(): string[] {
  const out: string[] = [];
  if (!env.databaseUrl) out.push("DATABASE_URL is not set: the live site needs its database");
  if (!read("AUTH_SECRET")) out.push("AUTH_SECRET is not set: sign-in can't keep people signed in");
  if (env.email.mode !== "smtp") out.push("EMAIL_MODE is not 'smtp': emails are recorded, not sent");
  else if (!env.email.smtpUser || !env.email.smtpPass) out.push("SMTP_USER or SMTP_PASS is not set: emails can't be sent");
  if (!env.email.from) out.push("EMAIL_FROM is not set: emails have no sender name");
  if (!env.blobToken) out.push("BLOB_READ_WRITE_TOKEN is not set: photos can't be uploaded");
  return out;
}
