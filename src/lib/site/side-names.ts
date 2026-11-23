/**
 * Each family is called by its child's first name — "Pooja's side",
 * "Spandan's family" — rather than "the bride's side", so the pages feel like
 * theirs. Browser-safe: server pages work these out and pass them to the
 * client pieces. Without names (or before they're known) it falls back to
 * "Bride" / "Groom".
 */
export type SideNames = Record<"bride" | "groom", string>;
export const DEFAULT_SIDE_NAMES: SideNames = { bride: "Bride", groom: "Groom" };

const firstName = (full: string | null | undefined) => (full ?? "").trim().split(/\s+/)[0] ?? "";

/** The two first names; if they're the same, the full names, so the families stay distinct. */
export function sideNamesOf(w: { brideName: string; groomName: string }): SideNames {
  const bride = firstName(w.brideName) || "Bride";
  const groom = firstName(w.groomName) || "Groom";
  if (bride.toLowerCase() !== groom.toLowerCase()) return { bride, groom };
  return { bride: w.brideName.trim() || "Bride", groom: w.groomName.trim() || "Groom" };
}
