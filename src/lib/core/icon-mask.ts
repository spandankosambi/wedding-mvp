/**
 * A family's own celebration icon is kept as a mask: ICON_PX × ICON_PX opacity
 * values (one byte each), base64. No picture or SVG markup is stored — only
 * its shape — so it can be drawn in any theme's colour, on the site and on
 * the printed card. Browser-safe.
 */
export const ICON_PX = 96;
const BYTES = ICON_PX * ICON_PX;
const B64_LEN = Math.ceil(BYTES / 3) * 4;

export function isIconMask(v: string): boolean {
  return v.length === B64_LEN && /^[A-Za-z0-9+/]+={0,2}$/.test(v);
}

/**
 * The shape of a picture's pixels (RGBA): its transparency if it has any,
 * otherwise how dark each pixel is (a black drawing on white).
 */
export function maskFromPixels(rgba: Uint8ClampedArray): Uint8Array {
  const n = rgba.length / 4, out = new Uint8Array(n);
  let transparent = 0;
  for (let i = 0; i < n; i++) if (rgba[i * 4 + 3] < 250) transparent++;
  if (transparent > n * 0.02) {
    for (let i = 0; i < n; i++) out[i] = rgba[i * 4 + 3];
    return out;
  }
  // opaque: dark on light. Stretch the contrast so the paper drops out fully.
  let lo = 255, hi = 0;
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const l = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
    lum[i] = l; if (l < lo) lo = l; if (l > hi) hi = l;
  }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < n; i++) {
    const d = (hi - lum[i]) / span; // 0 = paper, 1 = ink
    out[i] = d < 0.12 ? 0 : Math.min(255, Math.round(((d - 0.12) / 0.6) * 255));
  }
  return out;
}

/** How much of the mask is drawn: an empty or solid upload isn't an icon. */
export function maskCoverage(mask: Uint8Array): number {
  let on = 0;
  for (const v of mask) if (v > 96) on++;
  return on / mask.length;
}
