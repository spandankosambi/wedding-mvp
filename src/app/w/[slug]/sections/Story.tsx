import { SectionHeader } from "./SectionHeader";
import { Ornament } from "@/themes/ornaments";

/** Shorter stories set large; longer ones smaller, so the whole story fits one screen. */
export function storySize(story: string): "l" | "m" | "s" | "xs" {
  const n = story.length;
  return n <= 280 ? "l" : n <= 550 ? "m" : n <= 900 ? "s" : "xs";
}

export function Story({ theme, story, no = "01" }: { theme: string; story: string | null; no?: string }) {
  if (!story) return null;
  const paras = story.split(/\n\s*\n|\n/).map((p) => p.trim()).filter(Boolean);
  return (
    <section className="mx-auto max-w-5xl px-6 py-14 md:py-20">
      <SectionHeader no={no} title="Our Story" />
      <div className="grid gap-6 md:grid-cols-12 md:gap-10">
        <p className="kicker reveal md:col-span-3 md:pt-4" data-fx="left">
          How we met
        </p>
        <blockquote className="story-passage reveal md:col-span-9" data-fx="right">
          <span aria-hidden className="story-quote font-display">&ldquo;</span>
          <div className="story-text font-display" data-size={storySize(story)} data-testid="story">
            {paras.map((p, i) => <p key={i}>{p}</p>)}
          </div>
        </blockquote>
      </div>
      <div className="reveal mt-12 md:mt-14">
        <Ornament theme={theme} slot="divider" anim="scroll" />
      </div>
    </section>
  );
}
