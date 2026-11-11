import { Ornament } from "@/themes/ornaments";
import { fmtWeddingDate } from "@/lib/format";
import { Petals } from "./Petals";
import { Countdown } from "./Countdown";
import { Mark } from "@/themes/mark";
import { hostWords, wordingLines } from "@/lib/invitation/content";
import type { FamilySide } from "@/lib/looks";

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

/* Letter-by-letter reveal; --i continues across both names so the cascade
   reads as one gesture. The intact word stays available to screen readers. */
function Letters({ text, from }: { text: string; from: number }) {
  return (
    <span aria-label={text} role="text">
      {text.split("").map((ch, i) => (
        <span key={i} aria-hidden className="ltr" style={{ "--i": from + i } as React.CSSProperties}>
          {ch}
        </span>
      ))}
    </span>
  );
}

/**
 * Opens the way the family's printed card does: invocation and shloka, the
 * hosting parents inviting guests to their child's wedding, the couple, the
 * other child's parents — then the date and place.
 */
export function Hero({ wedding, city, side = "bride" }: { wedding: HeroWedding; city?: string; side?: FamilySide }) {
  const h = hostWords(wedding, side);
  const shloka = wordingLines(wedding.shloka);
  return (
    <section className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-6 py-20 text-center">
      <Petals />

      {/* watermark knot, drifts on scroll via --py from ScrollFx */}
      <span
        aria-hidden
        className="parallax pointer-events-none absolute left-1/2 top-1/2 select-none leading-none"
        style={{ color: "var(--ink)", opacity: 0.05 }}
      >
        <Mark size="min(78vw, 880px)" />
      </span>

      {wedding.invocation && (
        <p className="indic rise rise-1 text-sm md:text-base" style={{ color: "var(--accent)" }} data-testid="invocation">
          {wedding.invocation}
        </p>
      )}
      {shloka.length > 0 && (
        <p className="indic rise rise-1 mt-3 max-w-2xl text-lg leading-snug md:text-2xl" style={{ color: "var(--accent)" }} data-testid="shloka">
          {shloka.map((l, i) => <span key={i} className="block">{l}</span>)}
        </p>
      )}
      {(wedding.invocation || shloka.length > 0) && (
        <div className="rise rise-1 mt-6">
          <Ornament theme={wedding.theme} slot="hero" anim="load" />
        </div>
      )}

      {/* the hosting family's invitation, as on the card */}
      <div className="rise rise-2 mt-6 max-w-2xl" data-testid="hosts">
        <p className="font-display text-2xl md:text-3xl">{h.hosts}</p>
        {h.request.map((l) => (
          <p key={l} className="font-display mt-1 text-lg italic md:text-xl" style={{ color: "var(--ink-soft)" }}>{l}</p>
        ))}
      </div>

      <h1
        className="font-display mt-6 tracking-tight"
        style={{ fontSize: "clamp(3.25rem, 12vw, 9rem)", lineHeight: 0.95 }}
      >
        <Letters text={h.first} from={0} />
        <br />
        <em
          className="foil ltr weds"
          style={{ "--i": h.first.length + 1 } as React.CSSProperties}
        >
          {h.joiner}
        </em>
        <br />
        <Letters text={h.second} from={h.first.length + 3} />
      </h1>
      {h.secondOf && (
        <p className="font-display rise rise-3 mt-4 text-lg italic md:text-xl" style={{ color: "var(--ink-soft)" }}>{h.secondOf}</p>
      )}

      {!(wedding.invocation || shloka.length > 0) && (
        <div className="rise rise-3 mt-10">
          <Ornament theme={wedding.theme} slot="hero" anim="load" />
        </div>
      )}

      <p className="kicker rise rise-4 mt-10">
        {fmtWeddingDate(wedding.weddingDate)}{city ? ` · ${city}` : ""}
      </p>

      {wedding.heroTagline && (
        <p
          className="rise rise-4 mt-6 max-w-md text-base md:text-lg"
          style={{ color: "var(--ink-soft)" }}
        >
          {wedding.heroTagline}
        </p>
      )}
      {wedding.hashtag && (
        <p className="rise rise-4 mt-3 text-sm" style={{ color: "var(--ink-soft)" }}>#{wedding.hashtag}</p>
      )}

      <div className="rise rise-4 mt-8">
        <Countdown date={wedding.weddingDate} />
      </div>

      <span aria-hidden className="scroll-cue absolute bottom-8" />
    </section>
  );
}
