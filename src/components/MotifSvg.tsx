import type { Motif } from "@/lib/invitation/motifs";

export type MotifColours = { accent: string; accent2: string; hair: string; ink: string; bg: string };

/** The website's theme colours, for motifs drawn on a wedding site. */
export const THEME_VARS: MotifColours = {
  accent: "var(--accent)", accent2: "var(--accent-2)", hair: "var(--hairline)", ink: "var(--ink)", bg: "var(--bg)",
};

/** A motif (lib/invitation) drawn as inline SVG, `width` wide. Decorative. */
export function MotifSvg({ m, colours = THEME_VARS, width, className, style }: {
  m: Motif; colours?: MotifColours; width?: number | string; className?: string; style?: React.CSSProperties;
}) {
  const col = (k?: keyof MotifColours) => (k ? colours[k] : "none");
  return (
    <svg viewBox={`0 0 ${m.w} ${m.h}`} width={width} className={className} style={style} aria-hidden fill="none" strokeLinecap="round" strokeLinejoin="round">
      {m.shapes.map((s, i) => {
        const paint = { fill: col(s.fill), stroke: s.stroke ? col(s.stroke) : undefined, strokeWidth: s.sw, opacity: s.op };
        if (s.k === "circle") return <circle key={i} cx={s.cx} cy={s.cy} r={s.r} {...paint} />;
        if (s.k === "line") return <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={col(s.stroke ?? "hair")} strokeWidth={s.sw ?? 1} opacity={s.op} />;
        return <path key={i} d={s.d} {...paint} />;
      })}
    </svg>
  );
}
