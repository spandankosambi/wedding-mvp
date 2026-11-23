/*
 * Small SVG path builders shared by the card motifs, the decorations and the
 * website's dividers. Coordinates are rounded to 0.01 so paths stay short.
 */

/** a number rounded to two decimals, for path data */
export const f = (n: number) => Math.round(n * 100) / 100;

/** a pointed leaf from (x,y), `len` long, pointing at `deg` (0 = down); `fat` is its width as a share of its length */
export const leaf = (x: number, y: number, len: number, deg: number, fat = 0.32) => {
  const a = (deg * Math.PI) / 180, dx = Math.sin(a), dy = Math.cos(a), w = len * fat;
  const tx = x + dx * len, ty = y + dy * len, mx = x + dx * len * 0.5, my = y + dy * len * 0.5;
  return `M ${f(x)} ${f(y)} Q ${f(mx - dy * w)} ${f(my + dx * w)} ${f(tx)} ${f(ty)} Q ${f(mx + dy * w)} ${f(my - dx * w)} ${f(x)} ${f(y)} Z`;
};

/** a diamond centred on (cx,cy), `r` from centre to each point */
export const diamond = (cx: number, cy: number, r: number) =>
  `M ${f(cx)} ${f(cy - r)} L ${f(cx + r)} ${f(cy)} L ${f(cx)} ${f(cy + r)} L ${f(cx - r)} ${f(cy)} Z`;
