import Link from "next/link";
import { signOut } from "@/auth";
import { allows, seesSide, type Access } from "@/lib/access";
import { BrandLogo, BrandSymbol } from "@/components/BrandLogo";
import { BRAND } from "@/lib/brand";

type Section = "dashboard" | "bride" | "groom" | "people";
type Page = "overview" | "site" | "guests" | "print";

/**
 * The one line across the top of every couple-side screen: the couple's
 * names (which lead to the dashboard), a switch between the two families,
 * then — inside a family — its pages. Switching family keeps you on the same
 * kind of page. Only the families and pages this person has access to appear.
 */
export function PortalNav({ names, current, page, weddingId, admin = false, access }: {
  names: string; current?: Section; page?: Page;
  weddingId?: string; admin?: boolean; access: Access;
}) {
  const w = admin && weddingId ? `wedding=${weddingId}` : "";
  const q = (extra = "") => { const s = [w, extra].filter(Boolean).join("&"); return s ? `?${s}` : ""; };
  const family = current === "bride" || current === "groom" ? current : null;
  const href = (f: "bride" | "groom", p: Page) =>
    p === "site" ? `/couple/site${q(`family=${f}`)}`
    : p === "guests" ? `/committee${q(`family=${f}`)}`
    : p === "print" ? `/couple/${f}/print${q()}`
    : `/couple/${f}${q()}`;
  const open = (f: "bride" | "groom", p: Page) =>
    p === "overview" || allows(access, p, f, p === "print" ? "full" : "view");
  const labels: [Page, string][] = [["overview", "Overview"], ["site", "Edit your site"], ["guests", "Guest list"], ["print", "Print cards"]];
  const sides = (["bride", "groom"] as const).filter((f) => seesSide(access, f));
  return (
    <div className="portal-nav">
      <div className="portal-nav-inner">
        {/* our logo first (the symbol alone on a phone), then the couple's names */}
        <Link href="/" className="portal-nav-logo" aria-label={`${BRAND} home`} title={BRAND}>
          <BrandLogo height={26} label={BRAND} className="portal-nav-logo-full" />
          <BrandSymbol size={26} className="portal-nav-logo-mark" />
        </Link>
        <span className="portal-nav-divider" aria-hidden="true" />
        <Link href={`/couple${q()}`} className="portal-nav-brand" title="Go to the dashboard" aria-current={current === "dashboard" ? "page" : undefined}>{names}</Link>
        <nav aria-label="Sections" className="portal-nav-sides">
          {admin && <Link href="/admin" className="portal-nav-admin">All weddings</Link>}
          <span className="portal-nav-switch">
            {sides.map((f) => {
              const p = family && page && open(f, page) ? page : "overview";
              return (
                <Link key={f} href={href(f, p)} aria-current={current === f ? "page" : undefined}>
                  {f === "bride" ? "Bride" : "Groom"}<span className="portal-nav-wide">&apos;s side</span>
                </Link>
              );
            })}
          </span>
        </nav>
        {family && (
          <nav aria-label={family === "bride" ? "Bride's side pages" : "Groom's side pages"} className="portal-nav-pages">
            {labels.filter(([id]) => open(family, id)).map(([id, label]) => (
              <Link key={id} href={href(family, id)} aria-current={page === id ? "page" : undefined}>{label}</Link>
            ))}
          </nav>
        )}
        {access.manage && (
          <Link href={`/couple/people${q()}`} className="portal-nav-people" aria-current={current === "people" ? "page" : undefined}>People</Link>
        )}
        <form action={async () => { "use server"; await signOut({ redirectTo: "/signin" }); }} className="portal-nav-form">
          <button type="submit" className="portal-nav-out">Sign out</button>
        </form>
      </div>
    </div>
  );
}
