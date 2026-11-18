"use client";

import { useEffect, useRef, useState } from "react";
import { ZONES, guessZone, zoneLabel } from "@/lib/timezones";

/**
 * The celebration's time zone, beside its time. Typing a venue or address
 * abroad switches it to that place (until you pick one yourself); a saved
 * event whose venue looks like elsewhere gets a one-tap suggestion.
 */
export function TimeZoneField({ value, eventName }: { value: string; eventName: string }) {
  const select = useRef<HTMLSelectElement>(null);
  const picked = useRef(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    const form = select.current?.form;
    if (!form) return;
    const where = () => {
      const v = (n: string) => (form.elements.namedItem(n) as HTMLInputElement | null)?.value ?? "";
      return guessZone(v("venueName"), v("address"));
    };
    const set = (z: string) => {
      const el = select.current!;
      if (el.value === z) return;
      el.value = z;
      el.dispatchEvent(new Event("change", { bubbles: true })); // the page's Save notices
    };
    // a saved event whose place says otherwise: suggest, don't change it by itself
    const g = where();
    setHint(g && g !== select.current!.value ? g : null);
    const onType = (e: Event) => {
      const n = (e.target as HTMLInputElement).name;
      if (n !== "venueName" && n !== "address") return;
      const z = where();
      if (!picked.current && z) { set(z); setHint(null); }
    };
    form.addEventListener("input", onType);
    return () => form.removeEventListener("input", onType);
  }, []);

  return (
    <>
      <select
        ref={select}
        name="timeZone"
        defaultValue={value}
        onChange={(e) => { if (e.isTrusted || e.nativeEvent.isTrusted) picked.current = true; setHint(null); }}
        aria-label={`Time zone for ${eventName}`}
        className="portal-input"
      >
        {ZONES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
      {hint && (
        <button type="button" className="mt-1 text-left text-xs font-medium text-[#b23a26] underline underline-offset-2"
          onClick={() => {
            const el = select.current!;
            el.value = hint;
            el.dispatchEvent(new Event("change", { bubbles: true }));
            setHint(null);
          }}>
          Venue looks like {zoneLabel(hint)}: use that time?
        </button>
      )}
    </>
  );
}
