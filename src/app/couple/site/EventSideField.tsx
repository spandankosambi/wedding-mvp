"use client";

import { useState } from "react";
import type { Side } from "@/lib/sides";

/**
 * "Common for both families", ticked by default. Unticked, the event is this
 * family's own (say the bride's Haldi at her home): it shows only in this
 * family's section and site, and only their households can be invited to it.
 * Posts as `side` with the event form.
 */
export function EventSideField({ initial, eventName, family }: { initial: Side; eventName: string; family: "bride" | "groom" }) {
  const [common, setCommon] = useState(initial === "both");
  const own = family === "bride" ? "the bride's family's" : "the groom's family's";
  return (
    <div className="md:col-span-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
      <input type="hidden" name="side" value={common ? "both" : family} />
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={common}
          onChange={(e) => setCommon(e.target.checked)}
          aria-label={`${eventName} is common for both families`}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          Common for both families
          <span className="block text-xs text-neutral-500">
            {common
              ? "Shown on both families' sites and in both sections. Untick if each family holds its own (e.g. a separate Haldi at each home)."
              : `Only ${own} event — the other family adds its own.`}
          </span>
        </span>
      </label>
    </div>
  );
}
