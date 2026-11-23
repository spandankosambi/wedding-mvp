import { eq } from "drizzle-orm";
import { sideNamesOf } from "@/lib/site/side-names";
import { db } from "@/db/client";
import { weddings } from "@/db/schema";
import { requireRole } from "@/lib/auth/authz";
import { listPeople } from "@/lib/auth/people";
import { PortalNav } from "../PortalNav";
import { PortalFrame } from "../PortalFrame";
import { PeopleManager } from "./PeopleManager";

export const dynamic = "force-dynamic";

/** Who can sign in to this wedding, on which side, and what each may do. */
export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ wedding?: string }> }) {
  const staff = await requireRole(["couple", "admin"]);
  const sp = await searchParams;
  let weddingId = staff.role === "admin" ? (sp.wedding ?? null) : staff.weddingId;
  if (staff.role === "admin" && !weddingId) {
    const [first] = await db.select().from(weddings).limit(1);
    weddingId = first?.id ?? null;
  }
  if (!weddingId) return <main className="p-10 text-sm text-neutral-500">No wedding assigned to this account.</main>;
  const [w] = await db.select().from(weddings).where(eq(weddings.id, weddingId));
  const people = await listPeople(weddingId);

  return (
    <main className="portal-page">
      <PortalNav sideNames={sideNamesOf(w)} names={`${w.brideName} & ${w.groomName}`} current="people" weddingId={weddingId} admin={staff.role === "admin"} access={staff.access} />
      <PortalFrame jump={[["add", "Add a person"], ["list", "Everyone with access"], ["levels", "What the levels mean"]]}>
        <header className="mb-8">
          <h1 className="portal-heading">People &amp; access</h1>
          <p className="portal-subheading mt-3 max-w-2xl">
            Give family and friends their own sign-in. Put each person on {sideNamesOf(w).bride}&apos;s side, {sideNamesOf(w).groom}&apos;s side or both,
            and choose what they may see or change. Everyone signs in with their own email; there are no passwords to share.
          </p>
        </header>
        <PeopleManager sideNames={sideNamesOf(w)} weddingId={weddingId} admin={staff.role === "admin"} people={people} meId={staff.userId} owner={staff.access.owner} />
        <section id="levels" className="portal-panel mt-6 p-6 text-sm text-neutral-600">
          <p className="portal-eyebrow">What the levels mean</p>
          <ul className="mt-3 space-y-2">
            <li><b className="text-neutral-800">Couple</b> — everything on both sides, including this page.</li>
            <li><b className="text-neutral-800">Committee</b> — the dashboard and overview of their side, plus whatever you allow below.</li>
            <li><b className="text-neutral-800">Edit your site</b> — <i>View only</i> shows the site settings without letting them change anything; <i>Full access</i> lets them edit the look, wording, celebrations, travel and photos.</li>
            <li><b className="text-neutral-800">Guest list</b> — <i>View only</i> shows households and replies; <i>Full access</i> lets them add and import guests, send invitations and record replies.</li>
            <li><b className="text-neutral-800">Print cards</b> — whether they can make and download the printed cards.</li>
            <li>Someone on one side never sees the other side&apos;s section. Choose <i>Both sides</i> to give them the same access on both.</li>
          </ul>
        </section>
      </PortalFrame>
    </main>
  );
}
