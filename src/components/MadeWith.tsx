import { BRAND, SITE_URL } from "@/lib/brand";

/**
 * The small line at the foot of every guest-facing page: who made the
 * invitation, with a way to the main site (to reach us, or make one).
 */
export function MadeWith({ className = "" }: { className?: string }) {
  return (
    <p className={`made-with text-xs leading-relaxed ${className}`} style={{ color: "var(--ink-soft, #7a756c)" }} data-testid="made-with">
      Invitation made with{" "}
      <a href={`${SITE_URL}/?from=invite`} target="_blank" rel="noopener" className="underline underline-offset-4">{BRAND}</a>
      <span aria-hidden> · </span>
      <a href={`${SITE_URL}/?from=invite#contact`} target="_blank" rel="noopener" className="underline underline-offset-4">Questions? Contact us</a>
    </p>
  );
}
