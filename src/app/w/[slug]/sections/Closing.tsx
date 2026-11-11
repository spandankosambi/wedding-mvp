import { Divider } from "./Divider";
import type { Decor } from "@/lib/site-decor";

/** The card's last words: the closing line and "with best compliments from". */
export function Closing({ theme, closingLine, compliments, divider }: { theme: string; closingLine: string | null; compliments: string[]; divider?: Decor["divider"] }) {
  if (!closingLine && compliments.length === 0) return null;
  return (
    <section className="px-6 py-20 text-center md:py-24" data-testid="closing">
      <div className="reveal">
        <Divider theme={theme} style={divider} />
      </div>
      {closingLine && (
        <p className="font-display reveal mx-auto mt-8 max-w-2xl text-2xl italic md:text-4xl">{closingLine}</p>
      )}
      {compliments.length > 0 && (
        <div className="reveal mx-auto mt-10 max-w-xl">
          <p className="kicker">With best compliments from</p>
          {compliments.map((c, i) => <p key={i} className="font-display mt-2 text-lg md:text-xl">{c}</p>)}
        </div>
      )}
    </section>
  );
}
