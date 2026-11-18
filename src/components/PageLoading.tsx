import { BRAND } from "@/lib/brand";

/*
 * Shown the moment you click through to another signed-in page, while it
 * loads: our ripple, its rings spreading out from the dot like a tap. Pure
 * CSS (see .page-loading in globals.css), so it appears instantly and costs
 * nothing; with "reduce motion" on it simply sits still.
 */
export function PageLoading() {
  return (
    <div className="page-loading" role="status" aria-live="polite">
      <svg viewBox="0 0 120 120" width="72" height="72" aria-hidden="true">
        <circle className="page-loading-ring r3" cx="60" cy="60" r="44" />
        <circle className="page-loading-ring r2" cx="60" cy="60" r="30" />
        <circle className="page-loading-ring r1" cx="60" cy="60" r="16" />
        <circle className="page-loading-dot" cx="60" cy="60" r="9" />
      </svg>
      <span className="page-loading-text">Loading…</span>
      <span className="sr-only">{BRAND} is loading the page</span>
    </div>
  );
}
