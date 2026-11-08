import { describe, it, expect } from "vitest";
import { justify } from "@/lib/justify";

const DESK = { targetHeight: 260, gap: 16, mat: 20 };
const PHONE = { targetHeight: 210, gap: 8, mat: 10 };
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

  it("fills every row but the last exactly, near the target height", () => {
    const r = [P, P, L, P, S, P, 1.78, P, L];
    for (const [w, o] of [[960, DESK], [342, PHONE]] as const) {
      const rows = justify(r, w, o);
      for (const row of rows.filter((x) => !x.last)) {
        expect(rowWidth(r, row, o)).toBeCloseTo(w, 3);
        expect(row.height).toBeLessThanOrEqual(o.targetHeight * 1.25);
        expect(row.height).toBeGreaterThan(o.targetHeight * 0.5);
      }
    }
  });

  it("never lets one tall photo fill a phone screen on its own", () => {
    const r = [P, P, L, P, S, P, 1.78];
    const rows = justify(r, 342, PHONE);
    for (const row of rows) expect(row.height).toBeLessThanOrEqual(PHONE.targetHeight * 1.25);
  });

  it("leaves a short last row at the target height, not stretched", () => {
    const rows = justify([P, P, P, P, P], 960, DESK);
    const last = rows[rows.length - 1];
    expect(last.last).toBe(true);
    expect(last.height).toBe(DESK.targetHeight);
  });

  it("handles a single photo", () => {
    expect(justify([P], 960, DESK)).toEqual([{ items: [0], height: 260, last: true }]);
  });
});
