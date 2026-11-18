import { BRAND, SITE_URL } from "@/lib/brand";
import { BrandSymbolSmall } from "@/components/BrandLogo";
import { GuestFeedback } from "@/components/GuestFeedback";

/**
 * The small line at the foot of every guest-facing page: who made the
 * invitation, with a way to the main site, and below it a way to write to us.
 */
export function MadeWith({ className = "" }: { className?: string }) {
  return (
    <div className={`made-with text-xs leading-relaxed ${className}`} style={{ color: "var(--ink-soft, #7a756c)" }} data-testid="made-with">
      <p>
        <BrandSymbolSmall size={12} color="currentColor" className="mr-1 inline-block align-[-1px]" />
        Invitation made with{" "}
        <a href={`${SITE_URL}/?from=invite`} target="_blank" rel="noopener" className="underline underline-offset-4">{BRAND}</a>
      </p>
      <div className="mt-1.5"><GuestFeedback /></div>
    </div>
  );
}
