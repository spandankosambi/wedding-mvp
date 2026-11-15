import Link from "next/link";
import { signOut } from "@/auth";

type Section = "dashboard" | "bride" | "groom";
type Page = "overview" | "site" | "guests" | "print";

/**
 * The one bar across the top of every couple-side screen. It shows where you
 * are and takes you anywhere: the sections (Dashboard, each family), then —
 * inside a family — its pages, then on the long site editor the parts of
 * that page. Committee members only work a guest list, so they get the name
 * and Sign out.
 */
export function PortalNav({ names, current, page, jump, weddingId, admin = false, committee = false }: {
  names: string; current?: Section; page?: Page;
  /** parts of the current page to jump to: [element id, label] */
  jump?: [string, string][];
  weddingId?: string; admin?: boolean; committee?: boolean;
}) {
  const w = admin && weddingId ? `wedding=${weddingId}` : "";
  const q = (extra = "") => { const s = [w, extra].filter(Boolean).join("&"); return s ? `?${s}` : ""; };
  const sections: { id: Section; href: string; label: string }[] = [
    { id: "dashboard", href: `/couple${q()}`, label: "Dashboard" },
    { id: "bride", href: `/couple/bride${q()}`, label: "Bride's side" },
    { id: "groom", href: `/couple/groom${q()}`, label: "Groom's side" },
  ];
  const family = current === "bride" || current === "groom" ? current : null;
  const pages: { id: Page; href: string; label: string }[] = family ? [
    { id: "overview", href: `/couple/${family}${q()}`, label: "Overview" },
    { id: "site", href: `/couple/site${q(`family=${family}`)}`, label: "Edit your site" },
    { id: "guests", href: `/committee${q(`family=${family}`)}`, label: "Guest list" },
    { id: "print", href: `/couple/${family}/print${q()}`, label: "Print cards" },
  ] : [];
  return (
    <div className="portal-nav">
      <div className="portal-nav-inner">
        <span className="portal-nav-brand">{names}</span>
        {!committee && (
          <nav aria-label="Sections" className="portal-nav-links">
            {admin && <Link href="/admin">All weddings</Link>}
            {sections.map((i) => (
              <Link key={i.id} href={i.href} aria-current={current === i.id ? (page && page !== "overview" ? "true" : "page") : undefined}>{i.label}</Link>
            ))}
          </nav>
        )}
        <form action={async () => { "use server"; await signOut({ redirectTo: "/signin" }); }} className="ml-auto">
          <button type="submit" className="portal-nav-out">Sign out</button>
        </form>
      </div>
      {!committee && pages.length > 0 && (
        <nav aria-label={family === "bride" ? "Bride's side pages" : "Groom's side pages"} className="portal-nav-pages">
          <div className="portal-nav-row">
            {pages.map((p) => (
              <Link key={p.id} href={p.href} aria-current={page === p.id ? "page" : undefined}>{p.label}</Link>
            ))}
          </div>
        </nav>
      )}
      {jump && jump.length > 0 && (
        <nav aria-label="Jump to" className="portal-nav-jump">
          <div className="portal-nav-row">
            <span className="portal-nav-jump-label">On this page</span>
            {jump.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
          </div>
        </nav>
      )}
    </div>
  );
}
