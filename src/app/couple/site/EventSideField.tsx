"use client";

import { useState } from "react";
import type { Side } from "@/lib/sides";

/**
 * "Common for bride & groom", ticked by default. Unticked, the event is one
 * side's own (say the bride's Haldi at her home) and only that side's
 * families can be invited to it. Posts as `side` with the event form.
 */
export function EventSideField({ initial, eventName }: { initial: Side; eventName: string }) {
  const [common, setCommon] = useState(initial === "both");
  const [own, setOwn] = useState<"bride" | "groom">(initial === "groom" ? "groom" : "bride");

  return (
    <div className="md:col-span-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
      <input type="hidden" name="side" value={common ? "both" : own} />
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={common}
          onChange={(e) => setCommon(e.target.checked)}
          aria-label={`${eventName} is common for bride and groom`}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          Common for bride &amp; groom
          <span className="block text-xs text-neutral-500">
            Untick when each side holds its own (e.g. a separate Haldi at each home) — add one event per side.
          </span>
        </span>
      </label>
      {!common && (
        <div className="mt-3 flex flex-wrap items-center gap-2 pl-6 text-sm" role="radiogroup" aria-label={`Whose ${eventName} is this?`}>
          <span className="text-neutral-600">This one is for the</span>
          {(["bride", "groom"] as const).map((s) => (
            <label key={s} className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${own === s ? "border-stone-800 bg-stone-800 text-white" : "border-neutral-300 bg-white text-neutral-600"}`}>
              <input type="radio" checked={own === s} onChange={() => setOwn(s)} className="sr-only" />
              {s === "bride" ? "Bride's side" : "Groom's side"}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
