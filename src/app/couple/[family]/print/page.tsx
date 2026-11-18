import { notFound } from "next/navigation";
import { sideNamesOf } from "@/lib/side-names";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { weddings, events } from "@/db/schema";
import { requireAccess } from "@/lib/authz";
import { getChecklist } from "@/lib/checklist";
import { PortalFrame, Checklist } from "../../PortalFrame";
import { eventForSide, eventLabel } from "@/lib/sides";
import { asFamilySide, getLooks, namesFor, otherSide, wordingOf } from "@/lib/looks";
import { seesSide } from "@/lib/access";
import { decorOf } from "@/lib/site-decor";
import { THEME_META } from "@/themes/catalog";
import { PortalNav } from "../../PortalNav";
import { PrintInvitation } from "../../PrintInvitation";

export const dynamic = "force-dynamic";

/** One family's printed cards: the questions, the design, a live preview, the PDF. */
export default async function PrintCards({
  params,
  searchParams,
}: {
  params: Promise<{ family: string }>;
  searchParams: Promise<{ wedding?: string }>;
}) {
  const family = asFamilySide((await params).family);
  if (!family) notFound();
  const staff = await requireAccess("print", family, "full");
  const sp = await searchParams;
  let weddingId = staff.role === "admin" ? (sp.wedding ?? null) : staff.weddingId;
  if (staff.role === "admin" && !weddingId) {
    const [first] = await db.select().from(weddings).limit(1);
    weddingId = first?.id ?? null;
  }
  if (!weddingId) return <main className="p-10 text-sm text-neutral-500">No wedding assigned to this account.</main>;

  const [wedding] = await db.select().from(weddings).where(eq(weddings.id, weddingId));
  const [looks, evs] = await Promise.all([
    getLooks(weddingId),
    db.select().from(events).where(eq(events.weddingId, weddingId)).orderBy(events.sortOrder),
  ]);
  const look = looks[family];
  const admin = staff.role === "admin";
  const sn = sideNamesOf(wedding); // "Pooja", "Spandan"
  const who = sn[family];

  return (
    <main className="portal-page">
      <PortalNav sideNames={sn} names={namesFor(wedding, family).couple} current={family} page="print" weddingId={weddingId} admin={admin} access={staff.access} />
      <PortalFrame key={family}
        roomy
        jump={[["print-options", "Card options"], ["print-preview", "Preview & download"]]}
        right={<Checklist title={`${who}'s side: what's done`} items={await getChecklist(weddingId, family, admin)} />}
      >
        <header className="mb-6">
          <h1 className="portal-heading">Print {who}&apos;s family&apos;s invitation cards</h1>
          <p className="portal-subheading mt-3 max-w-2xl">
            The traditional card as a print-ready PDF, in the <span className="font-medium text-neutral-700">{THEME_META[look.theme].label}</span>{" "}
            look and this family&apos;s wording. Answer the questions, watch the preview, then download.
          </p>
        </header>
        <PrintInvitation
          weddingId={weddingId}
          admin={admin}
          family={family}
          siteEditorHref={`/couple${admin ? `?wedding=${weddingId}` : ""}#details`}
          theme={look.theme}
          brideName={wedding.brideName}
          groomName={wedding.groomName}
          brideParents={wedding.brideParents}
          groomParents={wedding.groomParents}
          wording={wordingOf(look)}
          icons={decorOf(look).icons}
          wordingHref={`/couple/site?${admin ? `wedding=${weddingId}&` : ""}family=${family}#wording`}
          hasDeadline={!!look.rsvpDeadline}
          savedConfig={look.printConfig ?? null}
          partnerConfig={seesSide(staff.access, otherSide(family)) ? looks[otherSide(family)].printConfig ?? null : null}
          events={evs.filter((e) => eventForSide(e.side, family)).map((e) => ({ id: e.id, label: eventLabel(e, sn), side: e.side, isPublished: e.isPublished }))}
        />
      </PortalFrame>
    </main>
  );
}
