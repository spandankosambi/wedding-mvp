/**
 * Events can be common to both families or one side's own (the bride's Haldi
 * at her home, the groom's at his). Browser-safe: the guest list, the couple's
 * editor and the guest-facing pages all use these.
 */
import { DEFAULT_SIDE_NAMES, type SideNames } from "@/lib/site/side-names";

export type Side = "bride" | "groom" | "both";

/** Whether a household on `familySide` can be invited to an event on `eventSide`. */
export function eventForSide(eventSide: Side, familySide: Side): boolean {
  return eventSide === "both" || familySide === "both" || eventSide === familySide;
}

/** "Pooja's side" for a one-side event; null when common. */
export function sideLabel(side: Side, names: SideNames = DEFAULT_SIDE_NAMES): string | null {
  return side === "both" ? null : `${names[side]}'s side`;
}

/** An event's name for lists where two can share a name: "Haldi · Pooja". */
export function eventLabel(e: { name: string; side: Side }, names: SideNames = DEFAULT_SIDE_NAMES): string {
  return e.side === "both" ? e.name : `${e.name} · ${names[e.side]}`;
}
