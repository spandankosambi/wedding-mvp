/**
 * Justified photo rows (the Flickr / Google Photos layout). Photos keep their
 * order and aspect ratio; each row is filled edge to edge at one shared
 * height, chosen as close to `targetHeight` as the photos allow. A row never
 * grows past ~1.25× the target, so one tall photo can't swell to fill a phone
 * screen on its own; the last row stays at the target height and left-aligned.
 *
 * `mat` is the frame around each photo (both sides together), `gap` the space
 * between frames. Returned `height` is the photo's own height, frame excluded.
 */
export type JustifiedRow = { items: number[]; height: number; last: boolean };

export function justify(
  ratios: number[],
  width: number,
  { targetHeight, gap, mat }: { targetHeight: number; gap: number; mat: number },
): JustifiedRow[] {
  const rows: JustifiedRow[] = [];
  // the height at which items [from, to) exactly fill the width
  const fit = (from: number, to: number) => {
    let sum = 0;
    for (let i = from; i < to; i++) sum += ratios[i];
    const k = to - from;
    return (width - gap * (k - 1) - mat * k) / sum;
  };

  let start = 0;
  for (let i = 0; i < ratios.length; i++) {
    const h = fit(start, i + 1);
    if (h > targetHeight) continue; // row still too tall: take another photo
    // closing here makes the row a bit short; closing one earlier makes it a
    // bit tall. Keep whichever is nearer the target, within reason.
    if (i > start) {
      const hPrev = fit(start, i);
      if (hPrev <= targetHeight * 1.25 && hPrev - targetHeight < targetHeight - h) {
        rows.push({ items: range(start, i), height: hPrev, last: false });
        start = i;
        // the photo we didn't take starts the next row — re-check it alone
        if (fit(start, i + 1) <= targetHeight) {
          rows.push({ items: [i], height: fit(start, i + 1), last: false });
          start = i + 1;
        }
        continue;
      }
    }
    rows.push({ items: range(start, i + 1), height: h, last: false });
    start = i + 1;
  }
  if (start < ratios.length) {
    rows.push({ items: range(start, ratios.length), height: Math.min(targetHeight, fit(start, ratios.length)), last: true });
  }
  return rows;
}

const range = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => a + i);
