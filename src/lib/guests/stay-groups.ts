/* Pure (no database): used on the page and by the server. */

export type StayGroup = { hotel: string; note: string; map: string | null; rooms: { room: string; names: string[] }[] };
/** Hotel → room → names, for one household (hotels in the site's order). */
export function stayGroups(
  members: { fullName: string; details: Record<string, string> | null }[],
  stays: { name: string; note: string; url?: string }[],
): StayGroup[] {
  const hotels = [...new Set(stays.map((s) => s.name.trim()).filter(Boolean))];
  const out = new Map<string, Map<string, string[]>>();
  for (const m of members) {
    const hotel = m.details?.hotel?.trim() || (hotels.length === 1 ? hotels[0] : "");
    if (!hotel) continue;
    const room = m.details?.room?.trim() ?? "";
    const rooms = out.get(hotel) ?? new Map<string, string[]>();
    rooms.set(room, [...(rooms.get(room) ?? []), m.fullName]);
    out.set(hotel, rooms);
  }
  const order = (h: string) => { const i = hotels.findIndex((x) => x.toLowerCase() === h.toLowerCase()); return i < 0 ? 999 : i; };
  return [...out.entries()].sort((a, b) => order(a[0]) - order(b[0])).map(([hotel, rooms]) => {
    const s = stays.find((x) => x.name.trim().toLowerCase() === hotel.toLowerCase());
    return {
      hotel, note: s?.note?.trim() ?? "", map: s?.url ?? null,
      rooms: [...rooms.entries()].sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, undefined, { numeric: true })))
        .map(([room, names]) => ({ room, names })),
    };
  });
}
