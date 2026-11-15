"use client";

import { useEffect, useRef, useState } from "react";
import { ICONS, icon, iconFor, type IconId } from "@/lib/invitation/decor";
import { ICON_PX, isIconMask, maskCoverage, maskFromPixels } from "@/lib/icon-mask";
import { MotifSvg } from "@/components/MotifSvg";

const LABELS: Record<IconId, string> = {
  haldi: "Haldi bowl", mehendi: "Mehendi paisley", music: "Music", dandiya: "Dandiya", fire: "Sacred fire", rings: "Rings",
  drum: "Dhol", glass: "Glasses", diya: "Diya", thali: "Thali", kalash: "Kalash",
};
const INK = { accent: "#8a6a2f", accent2: "#c39a4a", hair: "#d6d0c4", ink: "#292723", bg: "#ffffff" };

const toB64 = (bytes: Uint8Array) => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };

/** Draws a mask in one colour, for the picker's preview. */
function MaskPreview({ mask, size = 24 }: { mask: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const bin = atob(mask), img = ctx.createImageData(ICON_PX, ICON_PX);
    for (let i = 0; i < bin.length; i++) { img.data[i * 4] = 0x8a; img.data[i * 4 + 1] = 0x6a; img.data[i * 4 + 2] = 0x2f; img.data[i * 4 + 3] = bin.charCodeAt(i); }
    ctx.putImageData(img, 0, 0);
  }, [mask]);
  return <canvas ref={ref} width={ICON_PX} height={ICON_PX} style={{ width: size, height: size }} aria-hidden />;
}

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
    setError(null);
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { setError("That file is over 2 MB — please use a smaller one."); return; }
    const url = URL.createObjectURL(f);
    try {
      const img = new Image();
      await new Promise<void>((ok, bad) => { img.onload = () => ok(); img.onerror = () => bad(new Error("load")); img.src = url; });
      const c = document.createElement("canvas");
      c.width = c.height = ICON_PX;
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      // fit the whole picture, with a little margin
      const w = img.naturalWidth || ICON_PX, h = img.naturalHeight || ICON_PX;
      const k = Math.min((ICON_PX - 8) / w, (ICON_PX - 8) / h);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, (ICON_PX - w * k) / 2, (ICON_PX - h * k) / 2, w * k, h * k);
      const m = maskFromPixels(ctx.getImageData(0, 0, ICON_PX, ICON_PX).data);
      const cover = maskCoverage(m);
      if (cover < 0.01 || cover > 0.85) {
        setError("That picture doesn't have a clear shape. Use a simple one-colour drawing on a plain or transparent background.");
        return;
      }
      setMask(toB64(m));
      setValue("custom");
    } catch {
      setError("Couldn't read that file. Please use an SVG, PNG or JPG.");
    } finally {
      URL.revokeObjectURL(url);
      if (file.current) file.current.value = "";
    }
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
            <MaskPreview mask={mask} />
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
