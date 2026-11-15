"use client";

import { useEffect, useRef } from "react";
import { ICON_PX, maskCoverage, maskFromPixels } from "@/lib/icon-mask";

const toB64 = (bytes: Uint8Array) => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };

/**
 * Reduces an uploaded picture (SVG, PNG, JPG) to its shape, in the browser:
 * a mask that's redrawn in the theme's colour. Nothing else of the file is kept.
 */
export async function maskFromFile(f: File | undefined): Promise<{ mask?: string; error?: string }> {
  if (!f) return {};
  if (f.size > 2 * 1024 * 1024) return { error: "That file is over 2 MB — please use a smaller one." };
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
      return { error: "That picture doesn't have a clear shape. Use a simple one-colour drawing on a plain or transparent background." };
    }
    return { mask: toB64(m) };
  } catch {
    return { error: "Couldn't read that file. Please use an SVG, PNG or JPG." };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Draws a mask in one colour (a hex like "#8a6a2f"). */
export function MaskCanvas({ mask, colour = "#8a6a2f", size = 24 }: { mask: string; colour?: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(colour);
    const [r, g, b] = m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0x8a, 0x6a, 0x2f];
    const bin = atob(mask), img = ctx.createImageData(ICON_PX, ICON_PX);
    for (let i = 0; i < bin.length && i < ICON_PX * ICON_PX; i++) { img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = bin.charCodeAt(i); }
    ctx.putImageData(img, 0, 0);
  }, [mask, colour]);
  return <canvas ref={ref} width={ICON_PX} height={ICON_PX} style={{ width: size, height: size }} aria-hidden />;
}
