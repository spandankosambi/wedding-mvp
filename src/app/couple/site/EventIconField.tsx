"use client";

import { useRef, useState } from "react";
import { ICONS, icon, iconFor, type IconId } from "@/lib/invitation/decor";
import { isIconMask } from "@/lib/icon-mask";
import { MaskCanvas, maskFromFile } from "@/components/MaskUpload";
import { MotifSvg } from "@/components/MotifSvg";

const LABELS: Record<IconId, string> = {
  haldi: "Haldi bowl", mehendi: "Mehendi paisley", music: "Music", dandiya: "Dandiya", fire: "Sacred fire", rings: "Rings",
  drum: "Dhol", glass: "Glasses", diya: "Diya", thali: "Thali", kalash: "Kalash",
};
const INK = { accent: "#8a6a2f", accent2: "#c39a4a", hair: "#d6d0c4", ink: "#292723", bg: "#ffffff" };

/**
 * The celebration's icon: picked from its name, chosen from the set, or the
 * family's own upload (PRO). An upload is reduced to its shape in the browser
 * and drawn in the theme's colour on the site and the printed cards.
 */
export function EventIconField({ initial, initialImage, eventName, enabled }: {
  initial: string | null; initialImage: string | null; eventName: string; enabled: boolean;
}) {
  const [mask, setMask] = useState<string>(initialImage && isIconMask(initialImage) ? initialImage : "");
  const [value, setValue] = useState<IconId | "custom" | "">(
    initial === "custom" && mask ? "custom" : ICONS.includes(initial as IconId) ? (initial as IconId) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement | null>(null);
  const auto = iconFor(eventName);
  const options: (IconId | "")[] = ["", ...ICONS];

  async function onFile(f: File | undefined) {
    const r = await maskFromFile(f);
    if (file.current) file.current.value = "";
    setError(r.error ?? null);
    if (r.mask) { setMask(r.mask); setValue("custom"); }
  }

  const tile = (on: boolean) => `flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs bg-white ${on ? "ring-2 ring-stone-800" : "ring-1 ring-neutral-200 hover:ring-neutral-400"}`;
  return (
    <fieldset className="md:col-span-2">
      <legend className="text-xs font-medium text-neutral-600">
        Icon <span className="font-normal text-neutral-400">— {enabled ? "shown beside this event on your site and printed cards" : "shown once you tick “Celebration icons” under Design touches"}</span>
      </legend>
      <input type="hidden" name="icon" value={value} />
      <input type="hidden" name="iconImage" value={mask} />
      <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Icon for ${eventName}`}>
        {options.map((id) => {
          const on = value === id;
          const label = id ? LABELS[id] : `Automatic (${LABELS[auto]})`;
          return (
            <button key={id || "auto"} type="button" role="radio" aria-checked={on} aria-label={label} title={label} onClick={() => setValue(id)} className={tile(on)}>
              <MotifSvg m={icon(id || auto)} colours={INK} width={24} />
              {!id && <span className={on ? "font-medium text-stone-900" : "text-neutral-600"}>Automatic</span>}
            </button>
          );
        })}
        {mask && (
          <button type="button" role="radio" aria-checked={value === "custom"} aria-label="Your own icon" title="Your own icon" onClick={() => setValue("custom")} className={tile(value === "custom")}>
            <MaskCanvas mask={mask} />
            <span className={value === "custom" ? "font-medium text-stone-900" : "text-neutral-600"}>Yours</span>
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-800">PRO</span>
        <label className="cursor-pointer font-medium text-stone-800 underline underline-offset-2">
          {mask ? "Replace your own icon" : "Upload your own icon"}
          <input ref={file} type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp" className="sr-only" aria-label={`Upload your own icon for ${eventName}`}
            onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {mask && (
          <button type="button" className="text-neutral-500 underline underline-offset-2 hover:text-red-700"
            onClick={() => { setMask(""); if (value === "custom") setValue(""); }}>
            Remove it
          </button>
        )}
        <span className="text-neutral-500">SVG or PNG, one colour, plain or transparent background. It&apos;s redrawn in your theme&apos;s colour.</span>
      </div>
      {error && <p className="mt-1 text-xs text-red-700" role="alert">{error}</p>}
    </fieldset>
  );
}
