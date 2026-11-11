import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { weddings, events } from "@/db/schema";
import { requireRole } from "@/lib/authz";
import { eventForSide, eventLabel } from "@/lib/sides";
import { fmtWeddingDate } from "@/lib/format";
import { asFamilySide, getLooks, namesFor, otherSide, sideName, wordingOf } from "@/lib/looks";
import { THEME_META } from "@/themes/catalog";
import { ShareCard } from "../ShareCard";
import { PrintInvitation } from "../PrintInvitation";
import { NonResponders } from "../NonResponders";
import { SummaryCards } from "../SummaryCards";
import { Stat, weddingStats } from "../stats";
import { SaveButton } from "../site/SaveButton";
import { saveRsvpSettings } from "../site/actions";
import { PortalNav } from "../PortalNav";
import { DangerZone } from "../danger/DangerZone";
import { istParts } from "@/lib/editor";

export const dynamic = "force-dynamic";

/**
 * One family's section: its own site, guest list and printed cards, and the
 * link it shares with its guests.
 */
export default async function FamilySection({
  params,
  searchParams,
}: {
  params: Promise<{ family: string }>;
  searchParams: Promise<{ wedding?: string; saved?: string; error?: string }>;
}) {
  const family = asFamilySide((await params).family);
  if (!family) notFound();
  const staff = await requireRole(["couple", "admin"]);
  const sp = await searchParams;
  let weddingId = staff.role === "admin" ? (sp.wedding ?? null) : staff.weddingId;
  if (staff.role === "admin" && !weddingId) {
    const [first] = await db.select().from(weddings).limit(1);
    weddingId = first?.id ?? null;
  }
  if (!weddingId) return <main className="p-10 text-sm text-neutral-500">No wedding assigned to this account.</main>;

  const [wedding] = await db.select().from(weddings).where(eq(weddings.id, weddingId));
  const [st, looks, evs] = await Promise.all([
    weddingStats(weddingId, family),
    getLooks(weddingId),
    db.select().from(events).where(eq(events.weddingId, weddingId)).orderBy(events.sortOrder),
  ]);
  const look = looks[family];
  const coupleNames = namesFor(wedding, family).couple; // this family's name order
  const admin = staff.role === "admin";
  const q = (extra: string) => (admin ? `?wedding=${weddingId}&${extra}` : `?${extra}`);
  const meta = THEME_META[look.theme];
  const who = family === "bride" ? "bride" : "groom";

  return (
    <main className="portal-page">
      <PortalNav names={coupleNames} current={family} weddingId={weddingId} admin={admin} />
      <div className="portal-shell">
      <header className="mb-6">
        <p className="portal-eyebrow">
          <Link href={`/couple${admin ? `?wedding=${weddingId}` : ""}`} className="hover:text-stone-950">Dashboard</Link>
          <span className="mx-1 text-stone-300">/</span> {sideName(family)}
        </p>
        <h1 className="portal-heading mt-2">{sideName(family)}</h1>
        <p className="portal-subheading mt-3">
          The {who}&apos;s side&apos;s own site, guests and printed cards — in the{" "}
          <span className="font-medium text-neutral-700">{meta.label}</span> look.
        </p>
      </header>

      {/* the three things a family does here */}
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <div className="portal-panel portal-action">
          <p className="portal-eyebrow">1 · Design</p>
          <p>The look, design touches, invitation wording, celebrations, travel and photos guests see.</p>
          <Link href={`/couple/site${q(`family=${family}`)}`} className="portal-button">Edit your site</Link>
        </div>
        <div className="portal-panel portal-action">
          <p className="portal-eyebrow">2 · Invite</p>
          <p>Add or import households, choose their events, send invitations and track replies.</p>
          <Link href={`/committee${q(`family=${family}`)}`} className="portal-button">Guest list &amp; invites</Link>
        </div>
        <div className="portal-panel portal-action">
          <p className="portal-eyebrow">3 · Print</p>
          <p>The traditional card as a print-ready PDF, in this family&apos;s look and wording.</p>
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
            wordingHref={`/couple/site?${admin ? `wedding=${weddingId}&` : ""}family=${family}#wording`}
            hasDeadline={!!look.rsvpDeadline}
            events={evs.filter((e) => eventForSide(e.side, family)).map((e) => ({ id: e.id, label: eventLabel(e), side: e.side, isPublished: e.isPublished }))}
          />
        </div>
      </div>


      {sp.saved && (
        <p className="mb-6 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">Saved.</p>
      )}
      {sp.error && (
        <p className="mb-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
          Couldn&apos;t save — {sp.error === "invalid input" ? "please check the fields." : sp.error}
        </p>
      )}

      <div className="mb-6">
        <ShareCard slug={wedding.slug} coupleNames={coupleNames} weddingDateText={fmtWeddingDate(wedding.weddingDate)} family={family} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Families" value={st.families.length} />
        <Stat label="Guests" value={st.guests.length} />
        <Stat label="Response rate" value={`${st.responseRate}%`} sub={`${st.respondedCount} of ${st.families.length} families`} />
        <Stat label="Peak attendance" value={st.peak} sub="largest single event" />
      </div>

      <div className="mb-6">
        <SummaryCards summary={st.summary} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <NonResponders families={st.nonResponders.map((f) => ({ id: f.id, name: f.name, relation: f.relation, side: f.side }))} />

        <section className="rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="font-semibold">The {who}&apos;s guest list</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Add families, import a spreadsheet or send invites in the{" "}
            <Link href={`/committee${q(`family=${family}`)}`} className="underline">guest list</Link>.
          </p>
          {st.families.length === 0 ? (
            <p className="mt-4 text-sm text-neutral-400">No families yet.</p>
          ) : (
            <ul className="mt-4 space-y-1.5">
              {st.families.map((f) => (
                <li key={f.id} className="text-sm">
                  <span className="font-medium">{f.name}</span>
                  <span className="text-neutral-500">
                    {" "}— {st.guests.filter((g) => g.familyId === f.id).map((g) => g.fullName.split(" ")[0]).join(", ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section id="rsvp" className="portal-panel mt-6 p-6">
        <p className="portal-eyebrow">RSVP</p>
        <h2 className="mt-1 font-semibold">Who can reply to the {who}&apos;s side, and until when</h2>
        <form action={saveRsvpSettings} className="mt-5 space-y-4">
          {admin && <input type="hidden" name="weddingId" value={weddingId} />}
          <input type="hidden" name="family" value={family} />
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="rsvpOpen" defaultChecked={look.rsvpOpen} className="mt-0.5 h-4 w-4" />
            <span>
              <span className="font-medium">Accept RSVPs from this family&apos;s shared link</span>
              <span className="block text-xs text-neutral-500">Off = the {who}&apos;s site shows the family contact instead of the form. Personal invitation links keep working.</span>
            </span>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-neutral-600">Reply-by date</span>
            <span className="ml-2 text-xs text-neutral-400">optional; the form closes at midnight IST</span>
            <div className="mt-1.5">
              <input name="rsvpDeadline" type="date" defaultValue={look.rsvpDeadline ? istParts(look.rsvpDeadline).date : ""} className="portal-input md:max-w-xs" />
            </div>
          </label>
          <SaveButton />
        </form>
      </section>

      {/* only the couple themselves can reset; admins have their own tools */}
      {staff.role === "couple" && <div className="mt-6"><DangerZone coupleNames={coupleNames} family={family} /></div>}

      <p className="mt-8 text-center text-xs text-neutral-400">
        Looking for the other side? Open the{" "}
        <Link href={`/couple/${otherSide(family)}${admin ? `?wedding=${weddingId}` : ""}`} className="underline">{sideName(otherSide(family)).toLowerCase()}&apos;s section</Link>.
      </p>
      </div>
    </main>
  );
}
