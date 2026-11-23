/* Pure helpers for per-guest attendance — safe to use in the browser. */

export type GuestAnswer = "yes" | "no" | "none" | "unknown";

/** One guest's answer for one event, from their family's row. */
export function guestAnswer(
  row: { status: "attending" | "declined"; headcount: number; guestIds: string[] | null } | undefined,
  guestId: string,
  familySize: number,
): GuestAnswer {
  if (!row) return "none";
  if (row.status === "declined") return "no";
  if (row.guestIds) return row.guestIds.includes(guestId) ? "yes" : "no";
  return row.headcount >= familySize ? "yes" : "unknown";
}

/** For a bare number from a guest's own form: everyone if it covers the whole
    household, else unknown who. */
export function attendeesFromCount(headcount: number, memberIds: string[]): string[] | null {
  return memberIds.length > 0 && headcount >= memberIds.length ? memberIds : null;
}
