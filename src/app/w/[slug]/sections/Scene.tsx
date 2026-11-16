/* An animated backdrop behind the opening, drawn with simple shapes in the
   theme's own colours. Server-rendered with fixed pseudo-random values; all
   motion is CSS (and stops under reduced motion or the "Still" setting).
   Layers carry --depth: ScrollFx moves them at different speeds on scroll. */

type Kind = "night" | "garden" | "palace";
const r2 = (n: number) => Number(n.toFixed(2));
// a small deterministic generator, so server and browser draw the same sky
function seeded(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s % 10000) / 10000; };
}

const STAR = "M0 -1 L0.22 -0.22 L1 0 L0.22 0.22 L0 1 L-0.22 0.22 L-1 0 L-0.22 -0.22 Z";

function Night() {
  const rnd = seeded(7);
  const stars = Array.from({ length: 34 }, () => ({ x: r2(rnd() * 100), y: r2(rnd() * 62), s: r2(0.5 + rnd() * 1.3), d: r2(rnd() * 5), t: r2(2.4 + rnd() * 3.2) }));
  const lanterns = [{ x: 9, d: 0, t: 26 }, { x: 24, d: 9, t: 31 }, { x: 78, d: 4, t: 28 }, { x: 91, d: 14, t: 34 }];
  return (
    <>
      <svg className="scene-layer" style={{ "--depth": 0.06 } as React.CSSProperties} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
        {stars.map((s, i) => (
          <g key={i} transform={`translate(${s.x} ${s.y}) scale(${s.s})`}>
            <path d={STAR} className="scene-twinkle" fill={i % 3 === 0 ? "var(--accent-2)" : "var(--accent)"} style={{ animationDelay: `-${s.d}s`, animationDuration: `${s.t}s` }} />
          </g>
        ))}
      </svg>
      <svg className="scene-layer scene-moon" style={{ "--depth": 0.14 } as React.CSSProperties} viewBox="0 0 100 100" preserveAspectRatio="xMaxYMin meet">
        <g className="scene-bob">
          <circle cx="84" cy="15" r="9.5" fill="var(--accent)" opacity="0.14" />
          <path d="M86 7.5 a8 8 0 1 0 6.5 12.4 a6.4 6.4 0 1 1 -6.5 -12.4 Z" fill="var(--accent)" opacity="0.9" />
        </g>
      </svg>
      <svg className="scene-layer" style={{ "--depth": 0.2 } as React.CSSProperties} viewBox="0 0 100 100" preserveAspectRatio="none">
        {[{ y: 22, w: 26, t: 70, d: 0 }, { y: 38, w: 20, t: 95, d: 30 }, { y: 12, w: 16, t: 82, d: 55 }].map((c, i) => (
          <g key={i} className="scene-drift" style={{ animationDuration: `${c.t}s`, animationDelay: `-${c.d}s` }}>
            <g transform={`translate(0 ${c.y})`} fill="var(--ink)" opacity="0.07">
              <ellipse cx={c.w * 0.5} cy="3" rx={c.w * 0.5} ry="2.2" />
              <ellipse cx={c.w * 0.36} cy="1.6" rx={c.w * 0.22} ry="2.4" />
              <ellipse cx={c.w * 0.62} cy="1" rx={c.w * 0.26} ry="2.8" />
            </g>
          </g>
        ))}
      </svg>
      <div className="scene-layer" style={{ "--depth": 0.3 } as React.CSSProperties}>
        {lanterns.map((l, i) => (
          <span key={i} className="scene-lantern" style={{ left: `${l.x}%`, animationDuration: `${l.t}s`, animationDelay: `-${l.d}s` }}>
            <svg viewBox="0 0 20 28" width="100%" height="100%">
              <path d="M5 3 H15 L18 20 Q10 24 2 20 Z" fill="var(--accent)" opacity="0.55" />
              <path d="M7 5 H13 L15 18 Q10 21 5 18 Z" fill="var(--accent-2)" opacity="0.5" className="scene-flicker" />
              <rect x="7" y="22.5" width="6" height="2" rx="0.8" fill="var(--accent)" opacity="0.6" />
            </svg>
          </span>
        ))}
      </div>
    </>
  );
}

const LEAF = "M0 0 C 3 -3.5 8 -3.5 11 0 C 8 3.5 3 3.5 0 0 Z";

function Vine({ flip }: { flip?: boolean }) {
  // a hanging vine: a curved stem with leaves either side
  const leaves = Array.from({ length: 9 }, (_, i) => ({ t: (i + 1) / 10, side: i % 2 ? 1 : -1 }));
  return (
    <svg className={`scene-vine ${flip ? "scene-vine-r" : ""}`} viewBox="0 0 60 120" preserveAspectRatio="xMidYMin meet">
      <g className="scene-sway" style={{ animationDelay: flip ? "-2.5s" : "0s" }}>
        <path d="M30 0 C 22 30 38 60 28 118" fill="none" stroke="var(--accent)" strokeWidth="0.9" opacity="0.7" />
        {leaves.map((l, i) => {
          const y = r2(l.t * 112), x = r2(30 + Math.sin(l.t * 5.2) * 6);
          return <path key={i} d={LEAF} transform={`translate(${x} ${y}) rotate(${l.side > 0 ? 28 : 152}) scale(${r2(1.5 - l.t * 0.5)})`} fill={i % 3 ? "var(--accent)" : "var(--accent-2)"} opacity="0.62" />;
        })}
        <circle cx="28" cy="118" r="2.6" fill="var(--accent-2)" opacity="0.8" />
      </g>
    </svg>
  );
}

function Garden() {
  const rnd = seeded(21);
  const leaves = Array.from({ length: 10 }, () => ({ x: r2(rnd() * 100), d: r2(rnd() * 18), t: r2(13 + rnd() * 10), s: r2(0.7 + rnd() * 0.8) }));
  return (
    <>
      <div className="scene-layer" style={{ "--depth": 0.1 } as React.CSSProperties}>
        <Vine /><Vine flip />
        <span className="scene-vine-mid"><Vine /></span>
        <span className="scene-vine-mid scene-vine-mid-r"><Vine flip /></span>
      </div>
      <div className="scene-layer" style={{ "--depth": 0.22 } as React.CSSProperties}>
        {leaves.map((l, i) => (
          <span key={i} className="scene-leaf" style={{ left: `${l.x}%`, animationDuration: `${l.t}s`, animationDelay: `-${l.d}s`, width: `${l.s * 16}px`, color: i % 2 ? "var(--accent)" : "var(--accent-2)" }}>
            <svg viewBox="0 -4 11 8" width="100%"><path d={LEAF} fill="currentColor" opacity="0.6" /></svg>
          </span>
        ))}
        {[{ x: 14, y: 58, d: 0 }, { x: 80, y: 34, d: 3 }, { x: 62, y: 72, d: 6 }].map((b, i) => (
          <span key={i} className="scene-butterfly" style={{ left: `${b.x}%`, top: `${b.y}%`, animationDelay: `-${b.d}s` }}>
            <svg viewBox="-12 -9 24 18" width="100%">
              <g className="scene-flap"><path d="M0 0 C -4 -9 -12 -8 -10 -1 C -12 5 -4 7 0 0 Z" fill="var(--accent-2)" opacity="0.75" /></g>
              <g className="scene-flap scene-flap-r"><path d="M0 0 C 4 -9 12 -8 10 -1 C 12 5 4 7 0 0 Z" fill="var(--accent)" opacity="0.75" /></g>
              <path d="M0 -4 V5" stroke="var(--ink)" strokeWidth="0.8" opacity="0.5" />
            </svg>
          </span>
        ))}
      </div>
    </>
  );
}

function Palace() {
  // a skyline of domes and arches along the bottom, two rows deep
  const dome = (x: number, w: number, h: number) =>
    `M${x} 100 V${r2(100 - h * 0.45)} C ${x} ${r2(100 - h * 0.8)} ${r2(x + w * 0.2)} ${r2(100 - h * 0.86)} ${r2(x + w / 2)} ${r2(100 - h)} C ${r2(x + w * 0.8)} ${r2(100 - h * 0.86)} ${x + w} ${r2(100 - h * 0.8)} ${x + w} ${r2(100 - h * 0.45)} V100 Z`;
  const back = [[2, 12, 20], [16, 9, 15], [27, 16, 27], [45, 10, 17], [57, 16, 27], [75, 9, 15], [86, 12, 20]];
  const front = [[-3, 14, 13], [13, 11, 10], [26, 10, 12], [38, 24, 18], [64, 10, 12], [76, 11, 10], [89, 14, 13]];
  const lamps = [8, 19, 31, 50, 69, 81, 92];
  return (
    <>
      <svg className="scene-layer" style={{ "--depth": 0.05 } as React.CSSProperties} viewBox="0 0 100 100" preserveAspectRatio="xMidYMax meet">
        <circle cx="50" cy="72" r="20" fill="var(--accent)" opacity="0.1" className="scene-glow" />
        <circle cx="50" cy="72" r="12" fill="var(--accent)" opacity="0.14" className="scene-glow" />
      </svg>
      <svg className="scene-layer scene-skyline" style={{ "--depth": 0.12 } as React.CSSProperties} viewBox="0 0 100 100" preserveAspectRatio="none">
        {back.map(([x, w, h], i) => <path key={i} d={dome(x, w, h)} fill="var(--ink)" opacity="0.12" />)}
      </svg>
      <svg className="scene-layer scene-skyline" style={{ "--depth": 0.2 } as React.CSSProperties} viewBox="0 0 100 100" preserveAspectRatio="none">
        {front.map(([x, w, h], i) => <path key={i} d={dome(x, w, h)} fill="var(--ink)" opacity="0.2" />)}
        {lamps.map((x, i) => (
          <g key={i} transform={`translate(${x} ${i % 2 ? 93.5 : 95})`}>
            <path d="M0 -2.2 C 0.9 -0.9 0.9 0 0 0.7 C -0.9 0 -0.9 -0.9 0 -2.2 Z" fill="var(--accent)" className="scene-flicker" style={{ animationDelay: `-${i * 0.37}s` }} />
            <path d="M-1.2 0.9 H1.2 Q0 2.4 -1.2 0.9 Z" fill="var(--accent-2)" opacity="0.8" />
          </g>
        ))}
      </svg>
    </>
  );
}

export function Scene({ kind }: { kind: Kind | "none" }) {
  if (kind === "none") return null;
  return (
    <div aria-hidden className={`scene scene-${kind}`} data-testid="scene" data-scene={kind}>
      {kind === "night" ? <Night /> : kind === "garden" ? <Garden /> : <Palace />}
    </div>
  );
}
