import { Ornament } from "@/themes/ornaments";
import { MotifSvg } from "@/components/MotifSvg";
import type { Motif, Shape } from "@/lib/invitation/motifs";
import type { Decor } from "@/lib/site-decor";

const leaf = (x: number, y: number, len: number, deg: number, fat = 0.34) => {
  const a = (deg * Math.PI) / 180, dx = Math.sin(a), dy = Math.cos(a), w = len * fat;
  const tx = x + dx * len, ty = y + dy * len, mx = x + dx * len * 0.5, my = y + dy * len * 0.5;
  return `M ${x} ${y} Q ${mx - dy * w} ${my + dx * w} ${tx} ${ty} Q ${mx + dy * w} ${my - dx * w} ${x} ${y} Z`;
};
const dm = (cx: number, cy: number, r: number) => `M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z`;
const rules: Shape[] = [
  { k: "line", x1: 0, y1: 14, x2: 58, y2: 14, stroke: "hair", sw: 1 },
  { k: "line", x1: 102, y1: 14, x2: 160, y2: 14, stroke: "hair", sw: 1 },
];

const DIVIDERS: Record<Exclude<Decor["divider"], "theme">, Motif> = {
  lotus: { w: 160, h: 28, shapes: [
    ...rules,
    { k: "path", d: leaf(80, 24, 20, 180, 0.3), stroke: "accent", sw: 1.3 },
    { k: "path", d: leaf(80, 24, 17, 145, 0.32), stroke: "accent", sw: 1.2 },
    { k: "path", d: leaf(80, 24, 17, 215, 0.32), stroke: "accent", sw: 1.2 },
    { k: "path", d: leaf(80, 24, 14, 110, 0.34), stroke: "accent2", sw: 1.1 },
    { k: "path", d: leaf(80, 24, 14, 250, 0.34), stroke: "accent2", sw: 1.1 },
    { k: "circle", cx: 80, cy: 24, r: 1.6, fill: "accent2" },
  ] },
  paisley: { w: 160, h: 28, shapes: [
    ...rules,
    { k: "path", d: "M80 3 C 90 6 91 18 83 23 C 76 27 68 23 70 16 C 71 11 77 11 79 15 C 80 18 77 19.5 76 18", stroke: "accent", sw: 1.4 },
    { k: "circle", cx: 84, cy: 11, r: 1.2, fill: "accent2" },
    { k: "circle", cx: 64, cy: 14, r: 1.4, fill: "accent2" },
    { k: "circle", cx: 96, cy: 14, r: 1.4, fill: "accent2" },
  ] },
  diamonds: { w: 160, h: 28, shapes: [
    { k: "line", x1: 0, y1: 14, x2: 46, y2: 14, stroke: "hair", sw: 1 },
    { k: "line", x1: 114, y1: 14, x2: 160, y2: 14, stroke: "hair", sw: 1 },
    { k: "path", d: dm(80, 14, 7), fill: "accent" },
    { k: "path", d: dm(62, 14, 4.5), stroke: "accent2", sw: 1.2 },
    { k: "path", d: dm(98, 14, 4.5), stroke: "accent2", sw: 1.2 },
    { k: "circle", cx: 52, cy: 14, r: 1.3, fill: "accent" },
    { k: "circle", cx: 108, cy: 14, r: 1.3, fill: "accent" },
  ] },
};

/** The flourish between sections: the theme's own, or the family's pick. */
export function Divider({ theme, style = "theme", anim }: { theme: string; style?: Decor["divider"]; anim?: "load" | "scroll" }) {
  if (style === "theme") return <Ornament theme={theme} slot="divider" anim={anim} />;
  return <MotifSvg m={DIVIDERS[style]} className="mx-auto h-7 w-40" />;
}
