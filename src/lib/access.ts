import type { FamilySide } from "@/lib/looks";

/* Who may do what. The couple (and the platform admin) do everything on both
   sides. A committee member belongs to one family's side (or both) and has a
   level on each page; the dashboard and a family's overview are always
   theirs to see. Pure, so pages, actions and tests share one set of rules. */

export type Level = "none" | "view" | "full";
export type Area = "site" | "guests" | "print";
export type Reach = FamilySide | "both";
export type Role = "admin" | "couple" | "committee";
export type Access = {
  role: Role;
  side: Reach;
  site: Level;
  guests: Level;
  print: Level; // "none" | "full": a card is printed or it isn't
  /** adds, changes and removes people */
  manage: boolean;
  /** signed the wedding up: may remove the other partner and delete the wedding */
  owner: boolean;
};
export type Grant = { site: Level; guests: Level; print: "none" | "full" };

/** What a committee login had before access could be set: the guest list. */
export const LEGACY_GRANT: Grant = { site: "none", guests: "full", print: "none" };
export const AREAS: readonly Area[] = ["site", "guests", "print"];
export const AREA_LABELS: Record<Area, string> = { site: "Edit your site", guests: "Guest list", print: "Print cards" };
export const LEVEL_LABELS: Record<Level, string> = { none: "No access", view: "View only", full: "Full access" };
export const REACH_LABELS: Record<Reach, string> = { bride: "Bride's side", groom: "Groom's side", both: "Both sides" };

const LEVELS: readonly Level[] = ["none", "view", "full"];
const level = (v: unknown, allowed: readonly Level[] = LEVELS): Level =>
  allowed.includes(v as Level) ? (v as Level) : "none";

export function accessFor(u: { role: Role; side?: string | null; access?: unknown; isOwner?: boolean | null }): Access {
  if (u.role !== "committee") {
    return { role: u.role, side: "both", site: "full", guests: "full", print: "full", manage: true, owner: u.role === "admin" || !!u.isOwner };
  }
  const g = (u.access && typeof u.access === "object" ? u.access : LEGACY_GRANT) as Record<string, unknown>;
  return {
    role: "committee",
    side: u.side === "bride" || u.side === "groom" ? u.side : "both",
    site: level(g.site), guests: level(g.guests), print: level(g.print, ["none", "full"]),
    manage: false, owner: false,
  };
}

export const seesSide = (a: Access, side: FamilySide) => a.side === "both" || a.side === side;
export const sidesOf = (a: Access): FamilySide[] => (a.side === "both" ? ["bride", "groom"] : [a.side]);
/** The family a person lands in when a page isn't told which. */
export const homeSide = (a: Access): FamilySide => (a.side === "groom" ? "groom" : "bride");

/** May this person see (or, with need "full", change) a page of a family's section? */
export function allows(a: Access, area: Area, side: FamilySide, need: "view" | "full" = "view"): boolean {
  if (!seesSide(a, side)) return false;
  const l = a[area];
  return need === "full" ? l === "full" : l !== "none";
}
