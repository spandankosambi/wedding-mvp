/**
 * Whether a household's invitation shows the wedding site's Travel & Stay
 * section. The committee can tick or untick it per family; until they do
 * (`choice` is null), it's shown exactly when the family is invited to every
 * event of the wedding. Browser-safe: the guest list uses it too.
 */
export function showsTravel(
  choice: boolean | null | undefined,
  invitedEventIds: readonly string[],
  allEventIds: readonly string[],
): boolean {
  if (choice != null) return choice;
  return invitesAll(invitedEventIds, allEventIds);
}

/** Invited to every one of the wedding's events (and there is at least one). */
export function invitesAll(invitedEventIds: readonly string[], allEventIds: readonly string[]): boolean {
  return allEventIds.length > 0 && allEventIds.every((id) => invitedEventIds.includes(id));
}
