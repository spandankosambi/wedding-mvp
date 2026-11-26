"use client";
import { useEffect, useState } from "react";
import { BRAND } from "@/lib/core/brand";

/*
 * Shown the moment you click through to another signed-in page, while it
 * loads: our ripple, its rings spreading out from the dot like a tap, with a
 * line about what's on its way that changes every couple of seconds. The
 * ripple is pure CSS (see .page-loading in globals.css), so it appears
 * instantly; with "reduce motion" on it sits still.
 */

/* What each page is getting ready. Change the wording here. */
export const LOADING_LINES = {
  dashboard: ["Tallying the RSVPs…", "Counting families on both sides…", "Lining up the celebrations…"],
  family: ["Polishing your invitation link…", "Checking who has replied…", "Setting out the RSVP cards…"],
  site: ["Stringing the marigolds…", "Mixing your colours…", "Laying out the invitation…"],
  print: ["Warming up the printing press…", "Pressing gold onto the cards…", "Folding every envelope…"],
  guests: ["Counting the chairs…", "Opening the guest book…", "Finding everyone a seat…"],
  import: ["Clearing a table for your spreadsheet…", "Sharpening the pencils…"],
  people: ["Gathering your helpers…", "Checking who holds which keys…"],
  plan: ["Opening the to-do list…", "Finding what's due this week…"],
  admin: ["Opening the back office…", "Dusting off the ledgers…"],
} as const;

export function PageLoading({ page }: { page: keyof typeof LOADING_LINES }) {
  const lines = LOADING_LINES[page];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % lines.length), 1800);
    return () => clearInterval(t);
  }, [lines.length]);
  return (
    <div className="page-loading" role="status" aria-live="polite">
      <svg viewBox="0 0 120 120" width="72" height="72" aria-hidden="true">
        <circle className="page-loading-ring r3" cx="60" cy="60" r="44" />
        <circle className="page-loading-ring r2" cx="60" cy="60" r="30" />
        <circle className="page-loading-ring r1" cx="60" cy="60" r="16" />
        <circle className="page-loading-dot" cx="60" cy="60" r="9" />
      </svg>
      <span key={i} className="page-loading-text">{lines[i]}</span>
      <span className="sr-only">{BRAND} is loading the page</span>
    </div>
  );
}
