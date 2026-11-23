"use client";

import { type Motif, type Palette } from "@/lib/invitation/motifs";

/* The small controls on the Print cards page: choice cards, tick-boxes, design thumbnails. */
export const label = "text-xs font-medium uppercase tracking-wide text-neutral-500";

export function Choice<T extends string>({ name, value, current, onPick, title, hint, disabled = false }: {
  name: string; value: T; current: T; onPick: (v: T) => void; title: string; hint?: string; disabled?: boolean;
}) {
  const on = value === current && !disabled;
  return (
    <label className={`flex gap-2 rounded-xl border p-3 text-sm transition-colors ${disabled ? "cursor-not-allowed border-neutral-200 bg-neutral-50 opacity-60" : on ? "cursor-pointer border-stone-800 bg-white shadow-sm" : "cursor-pointer border-neutral-200 bg-white/60 hover:border-neutral-300"}`}>
      <input type="radio" name={name} checked={on} disabled={disabled} onChange={() => onPick(value)} className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        <span className="font-medium text-neutral-800">{title}</span>
        {hint && <span className="mt-0.5 block text-xs text-neutral-500">{hint}</span>}
      </span>
    </label>
  );
}

export function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </label>
  );
}

/** A picture choice in a radio group (borders, symbols, patterns). */
export function Thumb({ label, on, bg, onPick, children }: { label: string; on: boolean; bg: string; onPick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={on} aria-label={label} onClick={onPick}
      className={`flex flex-col items-center gap-1 rounded-xl p-1.5 text-[11px] ${on ? "ring-2 ring-stone-800" : "ring-1 ring-neutral-200 hover:ring-neutral-400"}`}>
      <span className="grid place-items-center rounded-lg p-1.5" style={{ background: bg }}>{children}</span>
      <span className={on ? "font-medium text-stone-900" : "text-neutral-600"}>{label}</span>
    </button>
  );
}

/** A motif drawn in the page, for the monogram picker. */
/** A motif drawn in the card's own palette, for the design thumbnails. */
export function PaletteMotif({ m, p, size, text, textY, textSize }: { m: Motif; p: Palette; size: number; text?: string; textY?: number; textSize?: number }) {
  const col = (k?: string) => (k ? (p as Record<string, string>)[k] : "none");
  return (
    <svg viewBox={`0 0 ${m.w} ${m.h}`} width={size} height={(size * m.h) / m.w} aria-hidden>
      {m.shapes.map((s, i) => {
        const paint = { fill: col(s.fill), stroke: s.stroke ? col(s.stroke) : undefined, strokeWidth: s.sw, opacity: s.op };
        if (s.k === "circle") return <circle key={i} cx={s.cx} cy={s.cy} r={s.r} {...paint} />;
        if (s.k === "line") return <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={col(s.stroke ?? "hair")} strokeWidth={s.sw ?? 1} opacity={s.op} />;
        return <path key={i} d={s.d} {...paint} />;
      })}
      {text && (
        <text x={50} y={(textY ?? 50) + (textSize ?? 18) * 0.36} textAnchor="middle" fontFamily="Georgia, serif" fontSize={(textSize ?? 18) * Math.min(1, 5 / Math.max(text.replace(/\s/g, "").length, 2))} fill={p.accent} letterSpacing={1}>
          {text}
        </text>
      )}
    </svg>
  );
}

/** Shrink a photo in the browser so it uploads quickly and prints sharp enough. */
