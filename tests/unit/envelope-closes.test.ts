import { describe, it, expect } from "vitest";
import { envelopeFor, flatSheet, type Die } from "@/lib/invitation/envelope";
import { CARD_SIZES } from "@/lib/invitation/options";

/*
 * Fold the cut-and-fold template on paper, in numbers: every flap is
 * reflected over its fold line onto the back of the front panel, and every
 * point of the back must sit under at least one flap. (A printed copy of the
 * first version showed two open triangles beside the top flap's point.)
 */
type Pt = [number, number];
const inside = ([x, y]: Pt, poly: Pt[]) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};

function openings(d: Die) {
  const L = d.side, R = d.side + d.W, T = d.top, B = d.top + d.H, mid = d.side + d.W / 2;
  // the flaps as the template draws them, each folded over its edge of the panel
  const topFlap: Pt[] = ([[L, T], [mid - 9, 4], [mid + 9, 4], [R, T]] as Pt[]).map(([x, y]) => [x, 2 * T - y]);
  const bottomFlap: Pt[] = ([[L, B], [R, B], [R - d.inset, B + d.bottom], [L + d.inset, B + d.bottom]] as Pt[]).map(([x, y]) => [x, 2 * B - y]);
  const right: Pt[] = ([[R, T], [R + d.side, T + d.taper], [R + d.side, B - d.taper], [R, B]] as Pt[]).map(([x, y]) => [2 * R - x, y]);
  const left: Pt[] = ([[L, T], [L - d.side, T + d.taper], [L - d.side, B - d.taper], [L, B]] as Pt[]).map(([x, y]) => [2 * L - x, y]);
  const open: Pt[] = [];
  for (let x = L + 1.5; x <= R - 1.5; x += 1) {
    for (let y = T + 1.5; y <= B - 1.5; y += 1) {
      const p: Pt = [x, y];
      if (![topFlap, bottomFlap, right, left].some((f) => inside(p, f))) open.push([Math.round(x - L), Math.round(y - T)]);
    }
  }
  return open;
}

describe("the cut-and-fold envelope closes", () => {
  for (const s of CARD_SIZES) {
    for (const eventLayout of ["together", "folded"] as const) {
      it(`${s.id}${eventLayout === "folded" ? " folded" : ""}`, () => {
        const env = envelopeFor({ size: s.id, orientation: "portrait", eventLayout });
        const fit = flatSheet(env.mm);
        const open = openings(fit.die);
        expect(open.slice(0, 5), `${env.name} on ${fit.label}: ${open.length} open points`).toEqual([]);
        expect(fit.die.width + 10).toBeLessThanOrEqual(fit.mm[0]);
        expect(fit.die.height + 10).toBeLessThanOrEqual(fit.mm[1]);
      });
    }
  }
  it("the first version (the printed C5 on A3) did not", () => {
    const old: Die = { W: 229, H: 162, top: 82, side: 29, bottom: 94, taper: 19, inset: 14, width: 287, height: 338 };
    expect(openings(old).length).toBeGreaterThan(1000);
  });
  it("a custom card's envelope closes too", () => {
    const env = envelopeFor({ size: "custom", orientation: "portrait", customWidthMm: 120, customHeightMm: 200 });
    expect(openings(flatSheet(env.mm).die)).toEqual([]);
  });
});
