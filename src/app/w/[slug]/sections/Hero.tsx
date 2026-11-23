import { Fragment } from "react";
import { Ornament } from "@/themes/ornaments";
import { fmtWeddingDate } from "@/lib/core/format";
import { Petals } from "./Petals";
import { Scene } from "./Scene";
import { Countdown } from "./Countdown";
import { Mark } from "@/themes/mark";
import { hostWords, wordingLines } from "@/lib/invitation/content";
import type { FamilySide } from "@/lib/site/looks";
import { cornerMotif, toranMotif } from "@/lib/invitation/motifs";
import { MotifSvg } from "@/components/MotifSvg";
import { DEFAULT_DECOR, type Decor } from "@/lib/site/site-decor";
import type { Theme } from "@/themes/catalog";

type HeroWedding = {
  brideName: string;
  groomName: string;
  theme: string;
  weddingDate: Date;
  heroTagline: string | null;
  brideParents?: string | null;
  groomParents?: string | null;
  hashtag?: string | null;
  invocation?: string | null;
  shloka?: string | null;
};

/* Words of a name and where each starts, so the letter count runs on
   across the gap between first and last name. */
function words(text: string) {
  let start = 0;
  return text.trim().split(/\s+/).map((word) => {
    const w = { word, start };
    start += word.length + 1;
    return w;
  });
}

/* Letter-by-letter reveal; --i continues across both names so the cascade
   reads as one gesture. The intact word stays available to screen readers. */
function Letters({ text, from }: { text: string; from: number }) {
  return (
    <span aria-label={text} role="text">
      {words(text).map(({ word, start }, w) => (
        /* Each letter is its own inline block, and a block holding only a
           space collapses to nothing, so words are grouped and a real space
           sits between them (which also lets a long name wrap there). */
        <Fragment key={w}>
          {w > 0 && " "}
          <span aria-hidden className="whitespace-nowrap">
            {word.split("").map((ch, i) => (
              <span key={i} className="ltr" style={{ "--i": from + start + i } as React.CSSProperties}>
                {ch}
              </span>
            ))}
          </span>
        </Fragment>
      ))}
    </span>
  );
}

/**
 * Opens the way the family's printed card does: invocation and shloka, the
 * hosting parents inviting guests to their child's wedding, the couple, the
 * other child's parents — then the date and place.
 */
export function Hero({ wedding, city, side = "bride", decor = DEFAULT_DECOR }: { wedding: HeroWedding; city?: string; side?: FamilySide; decor?: Decor }) {
  const h = hostWords(wedding, side);
  const shloka = wordingLines(wedding.shloka);
  const top = !!(wedding.invocation || shloka.length);
  /* Sized from the screen's height as well as its width (see .hero in
     globals.css) so everything from the invocation to the countdown fits one
     screen, on a laptop and on a phone. */
  return (
    <section className={`hero relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-6 text-center ${decor.toran ? "has-toran" : ""}`}>
      <Scene kind={decor.scene} />
      <Petals kind={decor.falling} />
      {decor.toran && (
        <div className="hero-toran" aria-hidden data-testid="site-toran">
          <MotifSvg m={toranMotif(300, 1)} className="t-narrow" />
          <MotifSvg m={toranMotif(900, 1)} className="t-wide" />
        </div>
      )}
      {decor.corners && ([[false, false], [true, false], [false, true], [true, true]] as const).filter(([, fy]) => !decor.toran || fy).map(([fx, fy], i) => (
        <span key={i} aria-hidden className="hero-corner" data-testid="site-corner"
          style={{ [fx ? "right" : "left"]: "clamp(8px, 1.6vw, 20px)", [fy ? "bottom" : "top"]: "clamp(8px, 1.6vw, 20px)" }}>
          <MotifSvg m={cornerMotif(wedding.theme as Theme, fx, fy)} />
        </span>
      ))}

      {/* watermark knot, drifts on scroll via --py from ScrollFx */}
      <span
        aria-hidden
        className="parallax pointer-events-none absolute left-1/2 top-1/2 select-none leading-none"
        style={{ color: "var(--ink)", opacity: 0.05 }}
      >
        <Mark size="min(78vw, 880px)" />
      </span>

      {wedding.invocation && (
        <p className="indic hero-invocation rise rise-1" style={{ color: "var(--accent)" }} data-testid="invocation">
          {wedding.invocation}
        </p>
      )}
      {shloka.length > 0 && (
        <p className="indic hero-shloka rise rise-1 max-w-2xl" style={{ color: "var(--accent)" }} data-testid="shloka">
          {shloka.map((l, i) => <span key={i} className="block">{l}</span>)}
        </p>
      )}
      <div className={`hero-orn rise rise-1 ${top ? "" : "order-last"}`}>
        <Ornament theme={wedding.theme} slot="hero" anim="load" />
      </div>

      {/* the hosting family's invitation, as on the card */}
      <div className="hero-hosts rise rise-2 max-w-2xl" data-testid="hosts">
        <p className="font-display hero-host">{h.hosts}</p>
        {h.request.map((l) => (
          <p key={l} className="font-display hero-line italic" style={{ color: "var(--ink-soft)" }}>{l}</p>
        ))}
      </div>

      <h1 className="font-display hero-names tracking-tight">
        <Letters text={h.first} from={0} />
        <br />
        <em className="foil ltr weds" style={{ "--i": h.first.length + 1 } as React.CSSProperties}>
          {h.joiner}
        </em>
        <br />
        <Letters text={h.second} from={h.first.length + 3} />
      </h1>
      {h.secondOf && (
        <p className="font-display hero-line hero-of rise rise-3 italic" style={{ color: "var(--ink-soft)" }}>{h.secondOf}</p>
      )}

      <p className="kicker hero-date rise rise-4">
        {fmtWeddingDate(wedding.weddingDate)}{city ? ` · ${city}` : ""}
      </p>
      {wedding.heroTagline && (
        <p className="hero-tag rise rise-4 max-w-md" style={{ color: "var(--ink-soft)" }}>
          {wedding.heroTagline}
        </p>
      )}
      {wedding.hashtag && (
        <p className="hero-hash rise rise-4" style={{ color: "var(--ink-soft)" }}>#{wedding.hashtag}</p>
      )}

      <div className="hero-count rise rise-4" data-testid="countdown">
        <Countdown date={wedding.weddingDate} />
      </div>

      <span aria-hidden className="scroll-cue absolute bottom-6" />
    </section>
  );
}
