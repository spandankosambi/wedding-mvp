import Link from "next/link";
import { signOut } from "@/auth";

type Where = "dashboard" | "bride" | "groom";

/**
 * The bar across the top of every couple-side screen: where you are, the
 * two families' sections, and the way out. Committee members only work the
 * guest list, so they get the name and Sign out.
 */
export function PortalNav({ names, current, weddingId, admin = false, committee = false }: {
  names: string; current?: Where; weddingId?: string; admin?: boolean; committee?: boolean;
}) {
  const q = admin && weddingId ? `?wedding=${weddingId}` : "";
  const items: { id: Where; href: string; label: string }[] = [
    { id: "dashboard", href: `/couple${q}`, label: "Dashboard" },
    { id: "bride", href: `/couple/bride${q}`, label: "Bride's side" },
    { id: "groom", href: `/couple/groom${q}`, label: "Groom's side" },
  ];
  return (
    <div className="portal-nav">
      <div className="portal-nav-inner">
        <span className="portal-nav-brand">{names}</span>
        {!committee && (
          <nav aria-label="Sections" className="portal-nav-links">
            {items.map((i) => (
              <Link key={i.id} href={i.href} aria-current={current === i.id ? "page" : undefined}>{i.label}</Link>
            ))}
          </nav>
        )}
        <form action={async () => { "use server"; await signOut({ redirectTo: "/signin" }); }} className="ml-auto">
          <button type="submit" className="portal-nav-out">Sign out</button>
        </form>
      </div>
    </div>
  );
}
