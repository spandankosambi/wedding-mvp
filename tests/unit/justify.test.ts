import { describe, it, expect } from "vitest";
import { justify } from "@/lib/justify";

const DESK = { targetHeight: 260, gap: 14, mat: 12 };
const PHONE = { targetHeight: 170, gap: 8, mat: 8 };
const P = 0.75, L = 1.5, S = 1; // portrait, landscape, square

/** Sum of tile widths + gaps for a row — must equal the container width. */
function rowWidth(ratios: number[], row: { items: number[]; height: number }, o: typeof DESK) {
  return row.items.reduce((w, i) => w + ratios[i] * row.height + o.mat, 0) + o.gap * (row.items.length - 1);
}

describe("justify", () => {
  it("keeps every photo, in order", () => {
    const r = [P, P, L, P, S, P, 1.78];
    const rows = justify(r, 960, DESK);
    expect(rows.flatMap((x) => x.items)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("fills every row exactly, near the target height", () => {
    const r = [P, P, L, P, S, P, 1.78, P, L];
    for (const [w, o] of [[960, DESK], [342, PHONE]] as const) {
      const rows = justify(r, w, o);
      for (const row of rows.filter((x) => x.filled)) {
        expect(rowWidth(r, row, o)).toBeCloseTo(w, 3);
        expect(row.height).toBeLessThanOrEqual(o.targetHeight * 1.3);
        expect(row.height).toBeGreaterThan(o.targetHeight * 0.5);
      }
      expect(rows.filter((x) => !x.filled).length).toBeLessThanOrEqual(1);
    }
  });

  it("plans the rows together, so the last isn't a lone photo", () => {
    // the couple's 8: portraits, a landscape, squares — as in the screenshot
    const r = [P, 1.3, P, P, P, 1.33, P, 1.5];
    const rows = justify(r, 976, DESK);
    expect(rows.map((x) => x.items.length)).not.toContain(1);
    expect(rows.every((x) => x.filled)).toBe(true);
  });

  it("never lets one tall photo fill a phone screen on its own", () => {
    const r = [P, P, L, P, S, P, 1.78];
    const rows = justify(r, 342, PHONE);
    for (const row of rows) expect(row.height).toBeLessThanOrEqual(PHONE.targetHeight * 1.3);
  });

  it("a last row too short to fill stays at the target height, to be centred", () => {
    const rows = justify([P, P, P, P, P, P, P], 1400, DESK);
    const last = rows[rows.length - 1];
    expect(last.last).toBe(true);
    if (!last.filled) expect(last.height).toBe(DESK.targetHeight);
  });

  it("handles a single photo", () => {
    expect(justify([P], 960, DESK)).toEqual([{ items: [0], height: 260, last: true, filled: false }]);
  });
});
