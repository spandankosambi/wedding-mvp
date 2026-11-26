import type { Access } from "@/lib/auth/access";
import type { MeetingType, PlanSide } from "@/db/schema";
import type { SideNames } from "@/lib/site/side-names";

/* Who may reach which part of Plan. Pure, so pages, actions and tests share
   one set of rules.

   Every wedding has three spaces: "Both families", and one private space for
   each family. The couple (and admin, and any committee member who works both
   sides) reach all three; a committee member who works one family's side
   reaches Both families and their own family's space. */

export type Space = "both" | PlanSide;
const SPACES: readonly Space[] = ["both", "bride", "groom"];

/** The spaces this person may see and edit, in tab order. */
export function spacesFor(a: Access): Space[] {
  return a.side === "both" ? ["both", "bride", "groom"] : ["both", a.side];
}

export const canReach = (a: Access, s: Space) => spacesFor(a).includes(s);

/** Stored as null for Both families, else the family. */
export const sideOf = (s: Space): PlanSide | null => (s === "both" ? null : s);
export const spaceOf = (side: PlanSide | null): Space => side ?? "both";

export const asSpace = (v: unknown): Space | null => (SPACES.includes(v as Space) ? (v as Space) : null);

/** Only the item's creator, or the couple (and admin), may delete it. */
export function canDelete(a: Access, userId: string, createdBy: string | null): boolean {
  return a.role === "couple" || a.role === "admin" || (!!createdBy && createdBy === userId);
}

/** A meeting "with the other family" belongs in Both families only. */
export const meetingTypeAllowed = (s: Space, type: MeetingType) => type !== "other_family" || s === "both";

/** On screen each family is its child's first name, never "bride" or "groom". */
export function spaceLabel(s: Space, names: SideNames): string {
  return s === "both" ? "Both families" : `${names[s]}'s family`;
}
