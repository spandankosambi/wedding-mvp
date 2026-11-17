import { BRAND, SITE_URL } from "@/lib/brand";
import { BrandSymbolSmall } from "@/components/BrandLogo";

/**
 * The small line at the foot of every guest-facing page: who made the
 * invitation, with a way to the main site (to reach us, or make one).
 */
export function MadeWith({ className = "" }: { className?: string }) {
  return (
    <p className={`made-with text-xs leading-relaxed ${className}`} style={{ color: "var(--ink-soft, #7a756c)" }} data-testid="made-with">
      <BrandSymbolSmall size={12} color="currentColor" className="mr-1 inline-block align-[-1px]" />
      Invitation made with{" "}
      <a href={`${SITE_URL}/?from=invite`} target="_blank" rel="noopener" className="underline underline-offset-4">{BRAND}</a>
      <span aria-hidden> · </span>
      <a href={`${SITE_URL}/?from=invite#contact`} target="_blank" rel="noopener" className="underline underline-offset-4">Questions? Contact us</a>
    </p>
  );
}
