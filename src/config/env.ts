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
  /** Fallback address for links built outside a request (seed, tests). */
  get appUrl() { return read("APP_URL") ?? "http://localhost:3000"; },

  email: {
    /** "smtp" sends real mail; anything else records it in the outbox table. */
    get mode() { return read("EMAIL_MODE") === "smtp" ? ("smtp" as const) : ("file" as const); },
    get smtpUser() { return read("SMTP_USER"); },
    get smtpPass() { return read("SMTP_PASS"); },
    /** The From header, e.g. "One Tap Invites <onetapinvites@gmail.com>". */
    get from() { return read("EMAIL_FROM"); },
  },

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
