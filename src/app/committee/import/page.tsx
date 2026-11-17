import { SideNamesProvider } from "@/components/SideNames";
import { PortalNav } from "../../couple/PortalNav";
import { sideNamesOf } from "@/lib/side-names";
import { namesFor } from "@/lib/looks";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { weddings, events } from "@/db/schema";
import { requireRole } from "@/lib/authz";
import { allows, homeSide } from "@/lib/access";
import { redirect } from "next/navigation";
import { PortalFrame } from "../../couple/PortalFrame";
import { aiConfigured } from "@/lib/ai";
import { ImportWizard } from "./ImportWizard";
import { asFamilySide, sideName } from "@/lib/looks";

export const dynamic = "force-dynamic";

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ wedding?: string; mode?: string; family?: string }>;
}) {
  const staff = await requireRole(["committee", "couple", "admin"]);
  const params = await searchParams;
  let weddingId = staff.role === "admin" ? (params.wedding ?? null) : staff.weddingId;
  if (staff.role === "admin" && !weddingId) {
    const [first] = await db.select().from(weddings).limit(1);
    weddingId = first?.id ?? null;
  }
  if (!weddingId) {
    return <main className="p-10 text-sm text-neutral-500">No wedding assigned to this account.</main>;
  }

  const [wedding] = await db.select().from(weddings).where(eq(weddings.id, weddingId));
  const evs = await db.select({ id: events.id, name: events.name, sortOrder: events.sortOrder })
    .from(events).where(eq(events.weddingId, weddingId)).orderBy(events.sortOrder);

  const family = asFamilySide(params.family) ?? homeSide(staff.access);
  if (!allows(staff.access, "guests", family, "full")) redirect("/couple");
  const backHref = `/committee?${new URLSearchParams({ ...(staff.role === "admin" ? { wedding: weddingId } : {}), family })}`;

  return (
    <main className="portal-page">
      <PortalNav sideNames={sideNamesOf(wedding)} names={namesFor(wedding, family).couple} current={family} page="guests" weddingId={weddingId} admin={staff.role === "admin"} access={staff.access} />
      <PortalFrame>
        <header className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
          <div className="max-w-2xl">
            <h1 className="portal-heading">Import the {family}&apos;s family&apos;s guest list</h1>
            <p className="portal-subheading mt-3">
              Bring the guest list in whatever shape it arrives: a spreadsheet, a photo of a handwritten list, a document, a pasted message, or typed straight in. You review every line before anything is saved, and households already on the list are merged rather than duplicated.
            </p>
          </div>
          <Link href={backHref} className="portal-button-secondary">← Back to guest list</Link>
        </header>

        <SideNamesProvider names={sideNamesOf(wedding)}>
        <ImportWizard
          weddingId={weddingId}
          events={evs}
          backHref={backHref}
          initialMode={params.mode === "direct" ? "direct" : params.mode === "scan" ? "scan" : null}
          aiConfigured={aiConfigured()}
          family={family}
        />
        </SideNamesProvider>
      </PortalFrame>
    </main>
  );
}
