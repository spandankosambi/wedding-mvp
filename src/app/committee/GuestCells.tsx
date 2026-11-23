"use client";

import { useState } from "react";
import type { GuestColumn } from "@/db/schema";
import { setGuestDetailAction } from "./actions";
import { safeCall } from "@/lib/core/safe-call";

/** One row per person: their family, their answer per event, and the
    wedding's extra columns (Stay, Room no.…) edited right in the table. */

/** A guest's hotel and room, saved with the page's floating Save. */
export function StayCells({ weddingId, guestId, hotels, family, hotel, room, guestName }: {
  weddingId: string; guestId: string; hotels: string[]; family: "bride" | "groom"; hotel: string; room: string; guestName: string;
}) {
  // saved with the page's floating Save: one small form per guest, which the
  // room box (in the next cell) joins through form=…
  const formId = `stay-${guestId}`;
  const fallback = hotels.length === 1 ? hotels[0] : "";
  const [value, setValue] = useState(hotel || fallback);
  // a hotel since removed from the site still shows for the guests who have it
  const options = hotel && !hotels.includes(hotel) ? [...hotels, hotel] : hotels;
  const noHotel = !value;
  return (
    <>
      <td>
        {options.length ? (
          <form id={formId} data-save-part={formId} onSubmit={(e) => e.preventDefault()}>
            <input type="hidden" name="weddingId" value={weddingId} />
            <input type="hidden" name="guestId" value={guestId} />
            <select
              name="hotel"
              // uncontrolled, so the page knows which hotel was saved (a
              // controlled select hides that, and every row looked changed)
              defaultValue={hotel || fallback}
              onChange={(e) => setValue(e.target.value)}
              aria-label={`Hotel for ${guestName}`}
              className="w-full rounded-md border bg-white px-1.5 py-1 text-sm"
              style={{ borderColor: "#c7c0b4", minWidth: "9rem" }}
            >
              {hotels.length !== 1 && <option value="">Choose…</option>}
              {options.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </form>
        ) : (
          <span className="px-2 text-xs text-neutral-500">
            No hotels yet ·{" "}
            <a href={`/couple/site?family=${family}&focus=hotel#travel`} className="font-medium text-neutral-900 underline underline-offset-2">Add here</a>
          </span>
        )}
      </td>
      <td>
        <input
          form={options.length ? formId : undefined}
          name="room"
          defaultValue={room}
          disabled={noHotel}
          maxLength={40}
          aria-label={`Room No. for ${guestName}`}
          placeholder={noHotel ? "Pick a hotel first" : "e.g. 204"}
          title={noHotel ? "Choose the hotel first, then type the room" : undefined}
          className="w-full rounded-md border bg-white px-2 py-1 text-sm placeholder:text-neutral-400 disabled:cursor-not-allowed disabled:bg-neutral-50"
          style={{ borderColor: "#c7c0b4", minWidth: "7rem", maxWidth: "9rem" }}
        />
      </td>
    </>
  );
}

/** An editable cell: saves when you leave it, if it changed. */
/** One custom column's value for a guest, saved as soon as it changes. */
export function DetailCell({ weddingId, guestId, column, initial, guestName }: {
  weddingId: string; guestId: string; column: GuestColumn; initial: string; guestName: string;
}) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");

  async function commit() {
    if (value.trim() === saved.trim()) return;
    setState("saving");
    const r = await safeCall(() => setGuestDetailAction({ weddingId, guestId, columnId: column.id, value }));
    if (r.ok) { setSaved(value.trim()); setState("idle"); } else setState("error");
  }

  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      maxLength={200}
      aria-label={`${column.label} for ${guestName}`}
      placeholder="—"
      className="w-full rounded-md border bg-transparent px-2 py-1 text-sm"
      style={{ borderColor: state === "error" ? "#dc2626" : "transparent", minWidth: "7rem", opacity: state === "saving" ? 0.6 : 1 }}
      onFocus={(e) => { e.currentTarget.style.borderColor = "#d9d5cd"; }}
      onBlurCapture={(e) => { if (state !== "error") e.currentTarget.style.borderColor = "transparent"; }}
    />
  );
}
