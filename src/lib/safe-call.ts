/*
 * For screens that call the server. A server function reports problems it
 * expects as a result ({ ok: false, error }), which each screen shows. An
 * unexpected failure — a dropped connection, a server error — would
 * otherwise throw: a button left spinning, or the whole page swapped for the
 * error screen and what someone typed lost. safeCall turns it into the same
 * kind of result, so the screen shows "couldn't reach the server" and keeps
 * the form as it was.
 */

import { unstable_rethrow } from "next/navigation";

export const UNREACHABLE = "Couldn't reach the server. Please check your connection and try again.";

export type CallFailed = { ok: false; error: string };

export async function safeCall<T>(fn: () => Promise<T>): Promise<T | CallFailed> {
  try {
    return await fn();
  } catch (e) {
    unstable_rethrow(e); // Next's own redirects and not-founds go on as they should
    console.error("[server call failed]", e);
    return { ok: false, error: UNREACHABLE };
  }
}
