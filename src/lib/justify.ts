/**
 * Justified photo rows (the Flickr / Google Photos layout). Photos keep their
 * order and aspect ratio; each row is filled edge to edge at one shared
 * height. Rows are planned together, not one at a time: the breaks are chosen
 * so every row lands as close to `targetHeight` as the photos allow (no row
 * swells past `maxScale` × the target), and the last row is filled too
 * whenever it can be — so 8 photos come out 3 · 3 · 2, not 4 · 3 · 1 with a
 * lonely photo at the end. A last row that can't fill the width without
 * swelling stays at the target height and `filled: false` (the gallery
 * centres it).
 *
 * `mat` is the frame around each photo (both sides together), `gap` the space
 * between frames. Returned `height` is the photo's own height, frame excluded.
 */
export type JustifiedRow = { items: number[]; height: number; last: boolean; filled: boolean };

type Opts = { targetHeight: number; gap: number; mat: number; maxScale?: number };

export function justify(ratios: number[], width: number, { targetHeight, gap, mat, maxScale = 1.3 }: Opts): JustifiedRow[] {
  const n = ratios.length;
  if (!n) return [];
  const maxH = targetHeight * maxScale;
  const prefix = [0];
  for (const r of ratios) prefix.push(prefix[prefix.length - 1] + r);
  // the height at which photos [i, j) exactly fill the width
  const fit = (i: number, j: number) => (width - gap * (j - i - 1) - mat * (j - i)) / (prefix[j] - prefix[i]);

  // how far a row is from ideal, in pixels² of height
  const cost = (i: number, j: number) => {
    const h = fit(i, j);
    if (j === n && h > maxH) {
      // a short last row: centred at the target height; the emptier, the worse
      const used = (prefix[j] - prefix[i]) * targetHeight + mat * (j - i) + gap * (j - i - 1);
      const empty = Math.max(0, width - used) / width;
      return (empty * targetHeight) ** 2 * 1.5;
    }
    if (h > maxH || h < targetHeight * 0.4) return Infinity; // too tall, or too many squeezed in
    return (h - targetHeight) ** 2;
  };

  // best[j]: least total cost to lay out photos [0, j); from[j]: where its last row starts
  const best = new Array<number>(n + 1).fill(Infinity);
  const from = new Array<number>(n + 1).fill(0);
  best[0] = 0;
  for (let j = 1; j <= n; j++) {
    for (let i = j - 1; i >= 0; i--) {
      if (fit(i, j) < targetHeight * 0.4) break; // adding more only makes it shorter
      const c = best[i] + cost(i, j);
      if (c < best[j]) { best[j] = c; from[j] = i; }
    }
    if (best[j] === Infinity) { best[j] = best[j - 1] + cost(j - 1, j); from[j] = j - 1; } // a lone, very tall photo
  }

  const rows: JustifiedRow[] = [];
  for (let j = n; j > 0; j = from[j]) {
    const i = from[j];
    const h = fit(i, j);
    const last = j === n;
    if (last && h > maxH) rows.unshift({ items: range(i, j), height: targetHeight, last, filled: false });
    else rows.unshift({ items: range(i, j), height: Math.min(h, maxH), last, filled: h <= maxH });
  }
  return rows;
}

const range = (a: number, b: number) => Array.from({ length: b - a }, (_, i) => a + i);
