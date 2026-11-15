import Link from "next/link";
import { signOut } from "@/auth";

type Section = "dashboard" | "bride" | "groom";
type Page = "overview" | "site" | "guests" | "print";

/**
 * The one line across the top of every couple-side screen: the couple's
 * names (which lead to the dashboard), a switch between the two families,
 * then — inside a family — its pages. Switching family keeps you on the same
 * kind of page. Committee members only work a guest list, so they get the
 * names and Sign out.
 */
export function PortalNav({ names, current, page, weddingId, admin = false, committee = false }: {
  names: string; current?: Section; page?: Page;
  weddingId?: string; admin?: boolean; committee?: boolean;
}) {
  const w = admin && weddingId ? `wedding=${weddingId}` : "";
  const q = (extra = "") => { const s = [w, extra].filter(Boolean).join("&"); return s ? `?${s}` : ""; };
  const family = current === "bride" || current === "groom" ? current : null;
  const href = (f: "bride" | "groom", p: Page) =>
    p === "site" ? `/couple/site${q(`family=${f}`)}`
    : p === "guests" ? `/committee${q(`family=${f}`)}`
    : p === "print" ? `/couple/${f}/print${q()}`
    : `/couple/${f}${q()}`;
  const labels: [Page, string][] = [["overview", "Overview"], ["site", "Edit your site"], ["guests", "Guest list"], ["print", "Print cards"]];
  return (
    <div className="portal-nav">
      <div className="portal-nav-inner">
        {committee
          ? <span className="portal-nav-brand">{names}</span>
          : <Link href={`/couple${q()}`} className="portal-nav-brand" title="Go to the dashboard" aria-current={current === "dashboard" ? "page" : undefined}>{names}</Link>}
        {!committee && (
          <nav aria-label="Sections" className="portal-nav-sides">
            {admin && <Link href="/admin" className="portal-nav-admin">All weddings</Link>}
            <span className="portal-nav-switch">
              {(["bride", "groom"] as const).map((f) => (
                <Link key={f} href={href(f, family ? page ?? "overview" : "overview")} aria-current={current === f ? "page" : undefined}>
                  {f === "bride" ? "Bride" : "Groom"}<span className="portal-nav-wide">&apos;s side</span>
                </Link>
              ))}
            </span>
          </nav>
        )}
        {!committee && family && (
          <nav aria-label={family === "bride" ? "Bride's side pages" : "Groom's side pages"} className="portal-nav-pages">
            {labels.map(([id, label]) => (
              <Link key={id} href={href(family, id)} aria-current={page === id ? "page" : undefined}>{label}</Link>
            ))}
          </nav>
        )}
        <form action={async () => { "use server"; await signOut({ redirectTo: "/signin" }); }} className="portal-nav-form">
          <button type="submit" className="portal-nav-out">Sign out</button>
        </form>
      </div>
    </div>
  );
}
