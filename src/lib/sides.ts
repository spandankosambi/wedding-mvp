/**
 * Events can be common to both families or one side's own (the bride's Haldi
 * at her home, the groom's at his). Browser-safe: the guest list, the couple's
 * editor and the guest-facing pages all use these.
 */
export type Side = "bride" | "groom" | "both";

/** Whether a household on `familySide` can be invited to an event on `eventSide`. */
export function eventForSide(eventSide: Side, familySide: Side): boolean {
  return eventSide === "both" || familySide === "both" || eventSide === familySide;
}

/** "Bride's side" / "Groom's side" for a one-side event; null when common. */
export function sideLabel(side: Side): string | null {
  return side === "bride" ? "Bride's side" : side === "groom" ? "Groom's side" : null;
}

/** An event's name for lists where two can share a name: "Haldi · Bride". */
export function eventLabel(e: { name: string; side: Side }): string {
  return e.side === "both" ? e.name : `${e.name} · ${e.side === "bride" ? "Bride" : "Groom"}`;
}
