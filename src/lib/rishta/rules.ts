/*
 * Rishta Corner's rules, kept pure so screens, actions and tests share them.
 * Introductions with intent to marry, vouched for by the host family; never
 * called "dating" anywhere.
 */
import type { RishtaGender } from "@/db/schema";

/** Legal marriage ages in India. */
const MIN_AGE: Record<RishtaGender, number> = { woman: 18, man: 21 };

/** Age from the birth year (we don't keep the full date of birth). */
export const ageIn = (birthYear: number, year: number) => year - birthYear;
export const oldEnough = (g: RishtaGender, birthYear: number, year: number) => ageIn(birthYear, year) >= MIN_AGE[g];

/** Each sees the other only if each is looking for the other. */
export const compatible = (a: { gender: RishtaGender; lookingFor: RishtaGender }, b: { gender: RishtaGender; lookingFor: RishtaGender }) =>
  a.lookingFor === b.gender && b.lookingFor === a.gender;

/** Today in India, as YYYY-MM-DD. */
export const istToday = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The default window: 10 days before the wedding to 3 days after. */
export function defaultWindow(weddingDate: Date): { opensOn: string; closesOn: string } {
  const day = istToday(weddingDate);
  return { opensOn: addDays(day, -10), closesOn: addDays(day, 3) };
}

/** Drafting is allowed before the window; browsing and interest only inside it; nothing after. */
export function windowState(w: { opensOn: string; closesOn: string }, today = istToday()): "before" | "open" | "closed" {
  if (today > w.closesOn) return "closed";
  return today < w.opensOn ? "before" : "open";
}

/** Data kept for the grievance officer is deleted this long after the window closes. */
export const KEEP_DAYS = 180;

/** What the single confirms when publishing (recorded with the notice version). */
export const NOTICE_VERSION = "2026-11-27";
export const DECLARATIONS = [
  { id: "me", text: "This is me, and everything on this profile is correct." },
  { id: "age", text: "I'm unmarried, and at least 18 (women) or 21 (men)." },
  { id: "consent", text: "I agree to be introduced to other singles at this wedding, as described above." },
] as const;

/** Only a Jeevansathi or Shaadi.com profile may be linked (no arbitrary links). */
export function allowedExternal(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /(^|\.)(jeevansathi\.com|shaadi\.com)$/i.test(u.hostname);
  } catch { return false; }
}

export const REPORT_REASONS = {
  no_consent: "This profile was made without the person agreeing",
  under_age: "This person looks under age",
  harassment: "Unwanted or upsetting behaviour",
  fake: "Fake or misleading profile",
  other: "Something else",
} as const;
export type ReportReason = keyof typeof REPORT_REASONS;
/** Reports that hide the profile at once, until the grievance officer reviews it. */
export const HIDES_AT_ONCE: ReportReason[] = ["no_consent", "under_age", "fake"];
