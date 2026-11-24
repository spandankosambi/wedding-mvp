import { overLimit, rateLimit } from "@/lib/auth/ratelimit";
import { env } from "@/config/env";

/* How often a sign-in link may be emailed. Checked where the email is
   actually sent (the Auth.js provider), so the sign-in page, /start and a
   direct POST to /api/auth all count against the same limits. */

const MIN = 60_000;

/** Too many sign-in links asked for; the page says "please wait a few minutes".
    Auth.js passes it on wrapped in its own AccessDenied error. */
export class SignInLimited extends Error {}

const limits = (email: string, ip: string) => {
  const e = email.trim().toLowerCase();
  return [
    { key: `signin-email-15m:${e}`, max: 3, windowMs: 15 * MIN },
    { key: `signin-email-day:${e}`, max: 10, windowMs: 24 * 60 * MIN },
    { key: `signin-ip-15m:${ip}`, max: 10, windowMs: 15 * MIN },
  ];
};
const exempt = (email: string) => env.relaxedTestLimits && email.trim().toLowerCase().endsWith("@example.com");

/** Counts this request; false once an address or a visitor has asked too often. */
export async function signInAllowed(email: string, ip: string): Promise<boolean> {
  if (exempt(email)) return true;
  const checks = await Promise.all(limits(email, ip).map(({ key, ...o }) => rateLimit(key, o)));
  return checks.every(Boolean);
}

/** After asking: was that request over a limit? Reads only, the same for any address. */
export async function signInWasLimited(email: string, ip: string): Promise<boolean> {
  if (exempt(email)) return false;
  const over = await Promise.all(limits(email, ip).map(({ key, ...o }) => overLimit(key, o)));
  return over.some(Boolean);
}
