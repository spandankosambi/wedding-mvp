/* Falling marigold petals over the hero. Server-rendered with fixed
   pseudo-random values (SSR-stable); motion lives in CSS keyframes and
   dies under prefers-reduced-motion. */

const PETALS = [
  { x: 4, sz: 13, dur: 16, delay: 0, drift: 5, spin: 320, o: 0.5, alt: false },
  { x: 12, sz: 10, dur: 21, delay: 6, drift: -4, spin: 260, o: 0.4, alt: true },
  { x: 21, sz: 15, dur: 14, delay: 11, drift: 6, spin: 380, o: 0.55, alt: false },
  { x: 30, sz: 9, dur: 23, delay: 3, drift: -3, spin: 220, o: 0.35, alt: true },
  { x: 38, sz: 12, dur: 18, delay: 14, drift: 4, spin: 300, o: 0.45, alt: false },
  { x: 47, sz: 16, dur: 13, delay: 8, drift: -6, spin: 400, o: 0.5, alt: true },
  { x: 55, sz: 10, dur: 22, delay: 1, drift: 3, spin: 240, o: 0.4, alt: false },
  { x: 63, sz: 14, dur: 15, delay: 12, drift: -5, spin: 340, o: 0.55, alt: true },
  { x: 71, sz: 11, dur: 20, delay: 5, drift: 6, spin: 280, o: 0.4, alt: false },
  { x: 79, sz: 13, dur: 17, delay: 9, drift: -4, spin: 360, o: 0.5, alt: true },
  { x: 87, sz: 9, dur: 24, delay: 2, drift: 3, spin: 230, o: 0.35, alt: false },
  { x: 94, sz: 15, dur: 14, delay: 15, drift: -6, spin: 390, o: 0.55, alt: true },
];

type Falling = "petals" | "marigold" | "sparkles" | "diyas" | "none";

const SHAPES: Record<Exclude<Falling, "none">, React.ReactNode> = {
  petals: <path d="M10 0 C 15.5 5.5 15.5 14 10 20 C 4.5 14 4.5 5.5 10 0 Z" />,
  marigold: (
    <>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((k) => (
        <circle key={k} cx={10 + Math.cos((k / 8) * Math.PI * 2) * 5.2} cy={10 + Math.sin((k / 8) * Math.PI * 2) * 5.2} r="3.6" />
      ))}
      <circle cx="10" cy="10" r="3.4" opacity="0.6" />
    </>
  ),
  sparkles: <path d="M10 0 L12.2 7.8 L20 10 L12.2 12.2 L10 20 L7.8 12.2 L0 10 L7.8 7.8 Z" />,
  diyas: (
    <>
      <path d="M10 1 C 13 5 13 8 10 10.5 C 7 8 7 5 10 1 Z" />
      <path d="M2 12 H18 C 17 17 14 19 10 19 C 6 19 3 17 2 12 Z" opacity="0.75" />
    </>
  ),
};

/** What drifts over the opening screen: the family's choice. */
export function Petals({ kind = "petals" }: { kind?: Falling }) {
  if (kind === "none") return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" data-falling={kind}>
      {PETALS.map((p, i) => (
        <span
          key={i}
          className={`petal petal-${kind}`}
          style={
            {
              "--x": `${p.x}%`,
              "--sz": `${kind === "petals" ? p.sz : kind === "sparkles" ? p.sz * 0.8 : p.sz * 1.25}px`,
              "--dur": `${kind === "diyas" ? p.dur * 1.5 : p.dur}s`,
              "--delay": `-${p.delay}s`,
              "--drift": `${p.drift}vw`,
              "--spin": `${kind === "diyas" ? 0 : kind === "marigold" ? p.spin / 2 : p.spin}deg`,
              "--o": kind === "petals" ? p.o : Math.min(0.85, p.o + 0.2),
              color: p.alt ? "var(--accent-2)" : "var(--accent)",
            } as React.CSSProperties
          }
        >
          <svg viewBox="0 0 20 20" width="100%" height="100%" fill="currentColor">{SHAPES[kind]}</svg>
        </span>
      ))}
    </div>
  );
}
