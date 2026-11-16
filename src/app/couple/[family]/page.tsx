import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { weddings } from "@/db/schema";
import { requireAccess } from "@/lib/authz";
import { allows, seesSide } from "@/lib/access";
import { getChecklist } from "@/lib/checklist";
import { PortalFrame, Checklist } from "../PortalFrame";
import { fmtWeddingDate } from "@/lib/format";
import { asFamilySide, getLooks, namesFor, otherSide, sideName } from "@/lib/looks";
import { THEME_META } from "@/themes/catalog";
import { ShareCard } from "../ShareCard";
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
  const staff = await requireAccess("overview", family);
  const sp = await searchParams;
  let weddingId = staff.role === "admin" ? (sp.wedding ?? null) : staff.weddingId;
  if (staff.role === "admin" && !weddingId) {
    const [first] = await db.select().from(weddings).limit(1);
    weddingId = first?.id ?? null;
  }
  if (!weddingId) return <main className="p-10 text-sm text-neutral-500">No wedding assigned to this account.</main>;

  const [wedding] = await db.select().from(weddings).where(eq(weddings.id, weddingId));
  const [st, looks, checklist] = await Promise.all([weddingStats(weddingId, family), getLooks(weddingId), getChecklist(weddingId, family, staff.role === "admin")]);
  const canRsvp = allows(staff.access, "guests", family, "full");
  const look = looks[family];
  const coupleNames = namesFor(wedding, family).couple; // this family's name order
  const admin = staff.role === "admin";
  const q = (extra: string) => (admin ? `?wedding=${weddingId}&${extra}` : `?${extra}`);
  const meta = THEME_META[look.theme];
  const who = family === "bride" ? "bride" : "groom";

  return (
    <main className="portal-page">
      <PortalNav names={coupleNames} current={family} page="overview" weddingId={weddingId} admin={admin} access={staff.access} />
      <PortalFrame
        jump={[["share", "Link to share"], ["numbers", "Replies so far"], ["rsvp", "RSVP settings"], ...(staff.role === "couple" ? [["reset", "Reset"] as [string, string]] : [])]}
        right={<Checklist title={`${who === "bride" ? "Bride" : "Groom"}'s side: what's done`} items={checklist} />}
      >
      <header className="mb-6">
        <h1 className="portal-heading">{sideName(family)}</h1>
        <p className="portal-subheading mt-3">
          The link to share, replies so far and RSVP settings for the {who}&apos;s side — in the{" "}
          <span className="font-medium text-neutral-700">{meta.label}</span> look. Use the bar above to edit the site, work the guest list or print cards.
        </p>
      </header>

      {sp.saved && (
        <p className="mb-6 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">Saved.</p>
      )}
      {sp.error && (
        <p className="mb-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
          Couldn&apos;t save — {sp.error === "invalid input" ? "please check the fields." : sp.error}
        </p>
      )}

      <div className="mb-6" id="share">
        <ShareCard slug={wedding.slug} coupleNames={coupleNames} weddingDateText={fmtWeddingDate(wedding.weddingDate)} family={family} />
      </div>

      <div id="numbers" className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Families" value={st.families.length} />
        <Stat label="Guests" value={st.guests.length} />
        <Stat label="Response rate" value={`${st.responseRate}%`} sub={`${st.respondedCount} of ${st.families.length} families`} />
        <Stat label="Peak attendance" value={st.peak} sub="largest single event" />
      </div>

      <div className="mb-6">
        <SummaryCards summary={st.summary} />
      </div>

      <section id="rsvp" className="portal-panel p-6">
        <p className="portal-eyebrow">RSVP</p>
        <h2 className="mt-1 font-semibold">Who can reply to the {who}&apos;s side, and until when</h2>
        <form action={saveRsvpSettings} className="mt-5 space-y-4">
          <fieldset disabled={!canRsvp} className="portal-fieldset space-y-4">
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
          {canRsvp ? <SaveButton /> : <p className="text-xs text-neutral-500">Only people with full access to this guest list can change these.</p>}
          </fieldset>
        </form>
      </section>

      {/* only the couple themselves can reset; admins have their own tools */}
      {staff.role === "couple" && <div className="mt-6" id="reset"><DangerZone coupleNames={coupleNames} family={family} /></div>}

      {seesSide(staff.access, otherSide(family)) && (
      <p className="mt-8 text-center text-xs text-neutral-400">
        Looking for the other side? Open the{" "}
        <Link href={`/couple/${otherSide(family)}${admin ? `?wedding=${weddingId}` : ""}`} className="underline">{sideName(otherSide(family)).toLowerCase()}&apos;s section</Link>.
      </p>
      )}
      </PortalFrame>
    </main>
  );
}
