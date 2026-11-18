"use client";

import { useState } from "react";
import Link from "next/link";
import { stayDetailsAction } from "./actions";
import { stayGroups } from "@/lib/stay-groups";
import type { Row } from "./FamilyTable";

type Stay = { name: string; note: string; url?: string };

/**
 * Who sleeps where: each hotel, its rooms, and the guests in each room, on
 * one page. Below, everyone still without a hotel or room, and a button per
 * household to send its primary contact their stay details.
 */
export function StayView({
  weddingId,
  family,
  rows,
  stays,
  guestListHref,
  readOnly = false,
}: {
  weddingId: string;
  family: "bride" | "groom";
  rows: Row[];
  stays: Stay[];
  /** the Guests view, where hotels and rooms are filled in */
  guestListHref: string;
  readOnly?: boolean;
}) {
  const hotels = [...new Set(stays.map((s) => s.name.trim()).filter(Boolean))];
  const staying = rows.filter((r) => r.showTravel);
  const people = staying.flatMap((r) => r.members.map((m) => ({ ...m, household: r.name })));
  const hotelOf = (d: Record<string, string>) => d?.hotel?.trim() || (hotels.length === 1 ? hotels[0] : "");

  // every hotel on the site, plus any typed in for a guest that isn't (renamed since)
  const names = [...hotels, ...new Set(people.map((p) => hotelOf(p.details)).filter((h) => h && !hotels.some((x) => x.toLowerCase() === h.toLowerCase())))];
  const byHotel = names.map((h) => {
    const here = people.filter((p) => hotelOf(p.details).toLowerCase() === h.toLowerCase());
    const rooms = new Map<string, typeof here>();
    for (const p of here) {
      const room = p.details?.room?.trim() ?? "";
      rooms.set(room, [...(rooms.get(room) ?? []), p]);
    }
    const sorted = [...rooms.entries()].sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, undefined, { numeric: true })));
    return { name: h, stay: stays.find((s) => s.name.trim().toLowerCase() === h.toLowerCase()), guests: here.length, rooms: sorted };
  });
  const noHotel = people.filter((p) => !hotelOf(p.details));
  const roomCount = byHotel.reduce((n, h) => n + h.rooms.filter(([r]) => r).length, 0);
  const placed = people.filter((p) => hotelOf(p.details) && p.details?.room?.trim()).length;

  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  async function send(r: Row, via: "whatsapp" | "email") {
    setFlash(null);
    setBusy(`${r.id}:${via}`);
    // the tab is opened inside the click so browsers don't block it
    const tab = via === "whatsapp" ? window.open("", "_blank") : null;
    const res = await stayDetailsAction({ weddingId, familyId: r.id, via });
    setBusy(null);
    if (!res.ok) { tab?.close(); setFlash(`Couldn't send to ${r.name}: ${res.error}`); return; }
    if (res.via === "whatsapp") {
      if (tab) tab.location.href = res.url; else window.location.href = res.url;
      setFlash(res.to ? `WhatsApp opened for ${r.name}` : `WhatsApp opened for ${r.name}: no phone saved, pick the contact`);
    } else {
      setFlash(`Stay details emailed to ${res.to}`);
    }
  }

  if (!hotels.length && !byHotel.length) {
    return (
      <div className="portal-panel p-8 text-center" data-testid="stay-empty">
        <p className="text-base font-medium">No hotels yet</p>
        <p className="mt-2 text-sm text-neutral-500">Add the hotels in Travel &amp; Stay, then choose each guest&apos;s hotel and room in the Guests view.</p>
        <Link href={`/couple/site?family=${family}#travel`} className="portal-button mt-5 inline-flex">Add hotels</Link>
      </div>
    );
  }

  return (
    <div data-testid="stay-view">
      <p className="mb-5 text-sm text-neutral-600">
        <b className="text-neutral-900">{placed}</b> of {people.length} guest{people.length === 1 ? "" : "s"} have a room · {roomCount} room{roomCount === 1 ? "" : "s"} across {byHotel.length} hotel{byHotel.length === 1 ? "" : "s"}.{" "}
        <Link href={guestListHref} className="portal-link">Fill in hotels and rooms in the Guests view →</Link>
      </p>

      <div className="grid gap-5 lg:grid-cols-2">
        {byHotel.map((h) => (
          <section key={h.name} className="portal-panel p-5" aria-label={h.name} data-testid="stay-hotel">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-lg font-semibold tracking-tight">{h.name}</h3>
              <span className="text-xs text-neutral-500">{h.guests} guest{h.guests === 1 ? "" : "s"} · {h.rooms.filter(([r]) => r).length} room{h.rooms.filter(([r]) => r).length === 1 ? "" : "s"}</span>
            </div>
            {h.stay?.note && <p className="mt-1 text-sm text-neutral-500">{h.stay.note}</p>}
            {h.stay?.url && <a href={h.stay.url} target="_blank" rel="noreferrer" className="portal-link mt-1 inline-block text-sm">Map ↗</a>}
            {!h.stay && <p className="mt-1 text-xs text-amber-700">Not on your Travel &amp; Stay list.</p>}
            {h.rooms.length ? (
              <table className="mt-4 w-full text-sm">
                <tbody>
                  {h.rooms.map(([room, guests]) => (
                    <tr key={room || "none"} className="border-t border-neutral-100 align-top">
                      <th scope="row" className={`w-28 py-2 pr-3 text-left font-medium ${room ? "text-neutral-900" : "text-amber-700"}`}>
                        {room ? `Room ${room}` : "Room not set"}
                      </th>
                      <td className="py-2">
                        <ul className="space-y-0.5">
                          {guests.map((g) => (
                            <li key={g.id}>{g.fullName} <span className="text-xs text-neutral-400">· {g.household}</span></li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mt-4 text-sm text-neutral-400">Nobody here yet.</p>
            )}
          </section>
        ))}
      </div>

      {noHotel.length > 0 && (
        <section className="portal-panel mt-5 p-5" aria-label="No hotel yet" data-testid="stay-unplaced">
          <h3 className="font-semibold">No hotel yet · {noHotel.length}</h3>
          <p className="mt-2 text-sm text-neutral-600">{noHotel.map((g) => g.fullName).join(", ")}</p>
        </section>
      )}

      <section className="mt-10" aria-label="Send stay details" id="send-stay">
        <h3 className="text-lg font-semibold tracking-tight">Send stay details</h3>
        <p className="mt-1 text-sm text-neutral-500">Each household&apos;s primary contact gets their hotel, rooms, map link and directions, by WhatsApp or email.</p>
        {flash && <p role="status" className="mt-3 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm">{flash}</p>}
        <div className="portal-table-wrap mt-4 overflow-x-auto">
          <table className="portal-table w-full text-sm">
            <thead>
              <tr><th className="text-left">Household</th><th className="text-left">Primary contact</th><th className="text-left">Staying at</th>{!readOnly && <th className="text-left">Send</th>}</tr>
            </thead>
            <tbody>
              {staying.map((r) => {
                const groups = stayGroups(r.members, stays);
                const primary = r.members.find((m) => m.isPrimary);
                const email = (primary?.email ?? r.email ?? "").trim();
                return (
                  <tr key={r.id} data-testid="stay-household">
                    <td className="font-medium">{r.name}</td>
                    <td className="text-neutral-600">{primary?.fullName ?? "—"}</td>
                    <td className="text-neutral-600">
                      {groups.length ? groups.map((g) => `${g.hotel}${g.rooms.some((x) => x.room) ? ` (${g.rooms.filter((x) => x.room).map((x) => x.room).join(", ")})` : ""}`).join("; ") : <span className="text-neutral-400">No hotel yet</span>}
                    </td>
                    {!readOnly && (
                      <td className="whitespace-nowrap">
                        <button type="button" disabled={!groups.length || !!busy} onClick={() => send(r, "whatsapp")}
                          className="portal-link mr-4 disabled:opacity-40" style={{ color: "#128c7e" }} aria-label={`Send stay details to ${r.name} on WhatsApp`}>
                          {busy === `${r.id}:whatsapp` ? "Opening…" : "WhatsApp"}
                        </button>
                        <button type="button" disabled={!groups.length || !email || !!busy} onClick={() => send(r, "email")}
                          title={email ? undefined : "No email saved for the primary contact"}
                          className="portal-link disabled:opacity-40" aria-label={`Email stay details to ${r.name}`}>
                          {busy === `${r.id}:email` ? "Sending…" : "Email"}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {!staying.length && (
                <tr><td colSpan={4} className="py-6 text-center text-neutral-400">No households are shown Travel &amp; Stay yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
