import { type SideNames } from "@/lib/site/side-names";
import { EventSideField } from "../EventSideField";
import { EventIconField } from "../EventIconField";
import { type FamilySide } from "@/lib/site/looks";
import type { events } from "@/db/schema";
import { zonedParts, zoneNote } from "@/lib/core/timezones";
import { TimeZoneField } from "../TimeZoneField";
import { EVENT_PRESETS } from "@/lib/site/presets";
import { saveEventAction, addPresetEventAction, toggleEventAction, removeEventAction, moveEventAction, sortEventsAction } from "../actions";
import { Field } from "@/components/Field";

/** Edit your site: the celebrations list, each event's details, and adding one. */
export function EventsSection({ evs, hidden, family, sn, iconsOn, section, saved, wid, oneSide = false }: {
  evs: (typeof events.$inferSelect)[];
  /** how many are switched off */
  hidden: number;
  /** works one family's side only: may not make a common event one family's own */
  oneSide?: boolean;
  family: FamilySide;
  sn: SideNames;
  /** whether celebration icons are on (design touches) */
  iconsOn: boolean;
  /** the event to open, from the address (?section= or ?saved=) */
  section?: string;
  saved?: string;
  /** the hidden wedding and family fields every form carries */
  wid: React.ReactNode;
}) {
  return (
    <section id="events" className="portal-panel p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="portal-eyebrow">The celebrations</p>
          <h2 className="mt-1 font-semibold">
            {evs.length} event{evs.length === 1 ? "" : "s"}{hidden ? ` · ${hidden} hidden` : ""}
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            Common events are shared with the other family — a change here shows on both sites.
            Switch an event off to hide it from the site and the RSVP form without deleting it.
          </p>
        </div>
        {evs.length > 1 && (
          <form action={sortEventsAction}>{wid}<button className="portal-button-secondary" type="submit">Sort by date</button></form>
        )}
      </div>

      <div className="mt-6 space-y-4">
        {evs.map((e, i) => {
          const p = zonedParts(e.startsAt, e.timeZone);
          return (
            <details key={e.id} id={`event-${e.id}`} open={section === `event-${e.id}` || (saved === `event-${e.id}`)}
              className={`group rounded-xl border ${e.isPublished ? "border-neutral-200 bg-white" : "border-dashed border-neutral-300 bg-neutral-50"}`}>
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 p-4">
                <span className="w-6 text-xs tabular-nums text-neutral-400">{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0 flex-1">
                  <span className={`font-medium ${e.isPublished ? "" : "text-neutral-400 line-through decoration-neutral-300"}`}>{e.name}</span>
                  <span className="ml-2 rounded border border-neutral-200 px-1.5 py-0.5 text-xs text-neutral-600">
                    {e.side === "both" ? "Common" : "This family only"}
                  </span>
                  <span className="ml-2 text-xs text-neutral-400">{p.date} · {p.time}{zoneNote(e.timeZone) ? ` ${zoneNote(e.timeZone)}` : ""} · {e.venueName}</span>
                </span>
                {!e.isPublished && <span className="portal-badge">hidden</span>}
                <span className="text-xs text-neutral-400 group-open:hidden">edit ▾</span>
                <span className="hidden text-xs text-neutral-400 group-open:inline">close ▴</span>
              </summary>
              <div className="border-t border-neutral-100 p-4">
                <form action={saveEventAction} data-save-part={`event-${e.id}`} className="grid gap-4 md:grid-cols-2">
                  {wid}
                  <input type="hidden" name="id" value={e.id} />
                  <Field label="Name"><input name="name" defaultValue={e.name} required maxLength={60} className="portal-input" /></Field>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-[1.2fr_0.9fr_1.3fr_0.8fr]">
                    <Field label="Date"><input name="date" type="date" defaultValue={p.date} required className="portal-input" /></Field>
                    <Field label="Time"><input name="time" type="time" defaultValue={p.time} required className="portal-input" /></Field>
                    <Field label="Time zone"><TimeZoneField value={e.timeZone} eventName={e.name} /></Field>
                    <Field label="Duration (hours)">
                      <input name="durationHours" type="number" min={0.5} max={24} step={0.5} defaultValue={(e.durationMinutes ?? 180) / 60}
                        required aria-label={`Duration in hours for ${e.name}`} className="portal-input" title="For guests' calendar entries" />
                    </Field>
                  </div>
                  <Field label="Venue"><input name="venueName" defaultValue={e.venueName} required maxLength={120} className="portal-input" /></Field>
                  <Field label="Address" hint="end with the city"><input name="address" defaultValue={e.address} required maxLength={240} className="portal-input" /></Field>
                  <Field label="Map link" hint="Google Maps share link"><input name="mapUrl" type="url" defaultValue={e.mapUrl ?? ""} maxLength={500} placeholder="https://maps.app.goo.gl/…" className="portal-input" /></Field>
                  <Field label="Dress code"><input name="dressCode" defaultValue={e.dressCode ?? ""} maxLength={80} placeholder="Yellows / Traditional / Cocktail" className="portal-input" /></Field>
                  <Field label="A line about it" className="md:col-span-2"><input name="description" defaultValue={e.description ?? ""} maxLength={400} className="portal-input" /></Field>
                  <EventSideField initial={e.side} eventName={e.name} family={family} names={sn} locked={oneSide && e.side === "both"} />
                  <EventIconField initial={e.icon} initialImage={e.iconImage} eventName={e.name} enabled={iconsOn} />
                  <label className="flex items-center gap-2 text-sm md:col-span-2">
                    <input type="checkbox" name="isPublished" defaultChecked={e.isPublished} className="h-4 w-4" />
                    Show this event on the site and RSVP form
                  </label>
                </form>
                <div className="mt-3 flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
                  <form action={toggleEventAction}>{wid}<input type="hidden" name="id" value={e.id} /><input type="hidden" name="isPublished" value={e.isPublished ? "false" : "true"} />
                    <button type="submit" className="portal-button-secondary">{e.isPublished ? "Hide from site" : "Show on site"}</button></form>
                  <form action={moveEventAction}>{wid}<input type="hidden" name="id" value={e.id} /><input type="hidden" name="dir" value="up" />
                    <button type="submit" className="portal-button-secondary" disabled={i === 0}>↑ Move up</button></form>
                  <form action={moveEventAction}>{wid}<input type="hidden" name="id" value={e.id} /><input type="hidden" name="dir" value="down" />
                    <button type="submit" className="portal-button-secondary" disabled={i === evs.length - 1}>↓ Move down</button></form>
                  <form action={removeEventAction} className="ml-auto">{wid}<input type="hidden" name="id" value={e.id} />
                    <button type="submit" className="portal-button-secondary" style={{ color: "#b91c1c" }}>Delete</button></form>
                </div>
              </div>
            </details>
          );
        })}
      </div>

      <div className="mt-6 rounded-xl border border-dashed border-neutral-300 p-4">
        <p className="text-xs font-medium text-neutral-600">Add a celebration</p>
        <p className="mt-1 text-xs text-neutral-400">Tap one to add it with a sensible date, dress code and blurb — then edit the venue.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {EVENT_PRESETS.map((p) => (
            <form key={p.name} action={addPresetEventAction}>{wid}<input type="hidden" name="preset" value={p.name} />
              <button type="submit" className="portal-badge hover:border-neutral-400 hover:text-neutral-900">+ {p.name}</button></form>
          ))}
          <form action={addPresetEventAction}>{wid}<input type="hidden" name="preset" value="" />
            <button type="submit" className="portal-badge hover:border-neutral-400 hover:text-neutral-900">+ Something else</button></form>
        </div>
      </div>
    </section>
  );
}
