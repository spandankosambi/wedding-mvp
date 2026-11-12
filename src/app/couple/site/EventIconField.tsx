"use client";

import { useState } from "react";
import { ICONS, icon, iconFor, type IconId } from "@/lib/invitation/decor";
import { MotifSvg } from "@/components/MotifSvg";

const LABELS: Record<IconId, string> = {
  haldi: "Haldi bowl", mehendi: "Mehendi paisley", music: "Music", dandiya: "Dandiya", fire: "Sacred fire", rings: "Rings",
  drum: "Dhol", glass: "Glasses", diya: "Diya", thali: "Thali", kalash: "Kalash",
};
const INK = { accent: "#8a6a2f", accent2: "#c39a4a", hair: "#d6d0c4", ink: "#292723", bg: "#ffffff" };

/** The celebration's icon: picked from its name unless the family chooses one. */
export function EventIconField({ initial, eventName, enabled }: { initial: string | null; eventName: string; enabled: boolean }) {
  const [value, setValue] = useState<IconId | "">(ICONS.includes(initial as IconId) ? (initial as IconId) : "");
  const auto = iconFor(eventName);
  const options: (IconId | "")[] = ["", ...ICONS];
  return (
    <fieldset className="md:col-span-2">
      <legend className="text-xs font-medium text-neutral-600">
        Icon <span className="font-normal text-neutral-400">— {enabled ? "shown beside this event on your site and printed cards" : "shown once you tick “Celebration icons” under Design touches"}</span>
      </legend>
      <input type="hidden" name="icon" value={value} />
      <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Icon for ${eventName}`}>
        {options.map((id) => {
          const on = value === id;
          const label = id ? LABELS[id] : `Automatic (${LABELS[auto]})`;
          return (
            <button key={id || "auto"} type="button" role="radio" aria-checked={on} aria-label={label} title={label} onClick={() => setValue(id)}
              className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs ${on ? "bg-white ring-2 ring-stone-800" : "bg-white ring-1 ring-neutral-200 hover:ring-neutral-400"}`}>
              <MotifSvg m={icon(id || auto)} colours={INK} width={24} />
              {!id && <span className={on ? "font-medium text-stone-900" : "text-neutral-600"}>Automatic</span>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
