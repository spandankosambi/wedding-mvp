import Link from "next/link";
import { sideNamesOf } from "@/lib/site/side-names";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { weddings } from "@/db/schema";
import { requireRole } from "@/lib/auth/authz";
import { istParts } from "@/lib/site/editor";
import { getLooks, sideName } from "@/lib/site/looks";
import { sidesOf } from "@/lib/auth/access";
import { sharePath } from "@/lib/site/share";
import { getChecklist } from "@/lib/site/checklist";
import { PortalFrame, Checklist, ChecklistTable } from "./PortalFrame";
import { THEME_META } from "@/themes/catalog";
import { SummaryCards } from "./SummaryCards";
import { PortalNav } from "./PortalNav";
import { DangerZone } from "./danger/DangerZone";
import { FloatingSave } from "@/components/FloatingSave";
import { saveDetailsAction } from "./site/actions";
import { Stat, weddingStats } from "./stats";
import { Field } from "@/components/Field";
import { PageTour } from "@/app/_tour/PageTour";
import { settingsFor } from "@/lib/rishta/profiles";
import { hostCounts } from "@/lib/rishta/host";

export const dynamic = "force-dynamic";


/**
 * The couple's dashboard: the numbers that matter, the details both families
 * share, and a door into each family's own section (site, guests, cards).
 */
export default async function CouplePage({
  searchParams,
}: {
  searchParams: Promise<{ wedding?: string; saved?: string; error?: string }>;
}) {
  const staff = await requireRole(["committee", "couple", "admin"]);
  const sp = await searchParams;
  let weddingId = staff.role === "admin" ? (sp.wedding ?? null) : staff.weddingId;
  if (staff.role === "admin" && !weddingId) {
    const [first] = await db.select().from(weddings).limit(1);
    weddingId = first?.id ?? null;
  }
  if (!weddingId) {
    return <main className="p-10 text-sm text-neutral-500">No wedding assigned to this account.</main>;
  }

  const [wedding] = await db.select().from(weddings).where(eq(weddings.id, weddingId));
  // someone who works one family's side sees that side's numbers only
  const mySides = sidesOf(staff.access);
  const one = mySides.length === 1 ? mySides[0] : null;
  const [both, bride, groom, looks, lists] = await Promise.all([
    weddingStats(weddingId), weddingStats(weddingId, "bride"), weddingStats(weddingId, "groom"), getLooks(weddingId),
    Promise.all(mySides.map((s) => getChecklist(weddingId!, s, staff.role === "admin"))),
  ]);
  const bySide = { bride, groom };
  const sn = sideNamesOf(wedding); // "Pooja", "Spandan"
  const all = one ? bySide[one] : both;
  const coupleNames = `${wedding.brideName} & ${wedding.groomName}`;
  const adminQ = staff.role === "admin" ? `?wedding=${weddingId}` : "";
  const wid = staff.role === "admin" ? <input type="hidden" name="weddingId" value={weddingId} /> : null;
  const attending = all.guests.length;
  // Rishta Corner: the couple's (and admin's) door to it, once it's switched on
  // (admin always sees it, to switch it on during the pilot)
  const rishtaOn = staff.role !== "committee" && (await settingsFor(weddingId)).enabled;
  const rishta = rishtaOn || staff.role === "admin" ? { on: rishtaOn, ...(await hostCounts(weddingId)) } : null;

  return (
    <main className="portal-page">
      <PortalNav sideNames={sn} names={coupleNames} current="dashboard" weddingId={weddingId} admin={staff.role === "admin"} access={staff.access} />
      <PageTour id="overview" />
      <PortalFrame
        jump={[["numbers", "The numbers"], ["families", one ? "Your section" : "The two families"], ...(staff.access.manage ? [["details", "Shared details"], ["people", "People & access"]] as [string, string][] : [])]}
        right={mySides.length > 1
          ? <ChecklistTable names={sn} sides={mySides.map((side, i) => ({ side, items: lists[i] }))} />
          : <>{mySides.map((s, i) => <Checklist key={s} title={`${sn[s]}'s side: what's done`} items={lists[i]} />)}</>}
      >
      <header className="mb-8">
        <h1 className="portal-heading">Your wedding at a glance</h1>
        <p className="portal-subheading mt-3 max-w-2xl">
          {one ? `The ${one}'s side: its replies so far and the way into its section.` : "Both families together. Each family designs its own site, guest list and printed cards in its section below."}
        </p>
      </header>

      {sp.saved && (
        <p className="mb-6 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">Saved.</p>
      )}
      {sp.error && (
        <p className="mb-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
          Couldn&apos;t save — {sp.error === "invalid input" ? "please check the fields (names and the date are required)." : sp.error}
        </p>
      )}

      {/* ── key numbers ─────────────────────────────────────────── */}
      <div id="numbers" className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Families invited" value={all.families.length} sub={one ? undefined : `${bride.families.length} ${sn.bride}'s · ${groom.families.length} ${sn.groom}'s`} />
        <Stat label="Guests" value={attending} sub={one ? undefined : `${bride.guests.length} ${sn.bride}'s · ${groom.guests.length} ${sn.groom}'s`} />
        <Stat label="Response rate" value={`${all.responseRate}%`} sub={`${all.respondedCount} of ${all.families.length} families`} />
        <Stat label="Peak attendance" value={all.peak} sub="largest single event" />
      </div>

      <div className="mb-8">
        <SummaryCards summary={all.summary} />
      </div>

      {/* ── the two families ────────────────────────────────────── */}
      <div id="families" className="mb-8 grid gap-4 md:grid-cols-2">
        {mySides.map((side) => {
          const st = bySide[side];
          const meta = THEME_META[looks[side].theme];
          return (
            <section key={side} className="overflow-hidden rounded-xl border border-neutral-200 bg-white" aria-label={sideName(side, sn)}>
              <div className="flex items-center justify-between gap-3 px-6 py-4" style={{ background: meta.bg, color: meta.ink }}>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.25em] opacity-70">{meta.label}</p>
                  <h2 className="mt-1 text-lg font-semibold">{sideName(side, sn)}</h2>
                </div>
                <div className="flex gap-1.5">
                  {meta.dots.map((c) => <span key={c} className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ background: c }} />)}
                </div>
              </div>
              <div className="p-6">
                <dl className="grid grid-cols-3 gap-3 text-sm">
                  <div><dt className="text-xs text-neutral-500">Families</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{st.families.length}</dd></div>
                  <div><dt className="text-xs text-neutral-500">Guests</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{st.guests.length}</dd></div>
                  <div><dt className="text-xs text-neutral-500">Replied</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{st.responseRate}%</dd></div>
                </dl>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Link href={`/couple/${side}${adminQ}`} className="portal-button">Open {sn[side]}&apos;s section →</Link>
                  <a href={sharePath(wedding.slug, side, looks[side].shareKey)} target="_blank" rel="noreferrer" className="portal-button-secondary">View site ↗</a>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {rishta && (
        <section className="portal-panel mb-8 flex flex-wrap items-center justify-between gap-4 p-6" aria-label="Rishta Corner">
          <div>
            <h2 className="font-semibold">Rishta Corner</h2>
            <p className="mt-1 text-sm text-neutral-600">
              {!rishta.on ? "Switched off for this wedding. Open it to switch it on." : <>{rishta.waiting ? `${rishta.waiting} profile${rishta.waiting === 1 ? "" : "s"} waiting for you to check` : "Nothing waiting for you"} · {rishta.live} live · {rishta.matches} match{rishta.matches === 1 ? "" : "es"}</>}
            </p>
          </div>
          <Link href={`/couple/rishta${adminQ}`} className="portal-button-secondary">Open Rishta Corner</Link>
        </section>
      )}

      {staff.access.manage && (<>
      {/* ── shared details ──────────────────────────────────────── */}
      <div className="grid gap-6">
        <section id="details" className="portal-panel p-6">
          <p className="portal-eyebrow">Shared by both families</p>
          <h2 className="mt-1 font-semibold">Names, date, city, parents</h2>
          <form action={saveDetailsAction} data-save-part="details" className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {wid}
            <Field label="Bride's name"><input name="brideName" defaultValue={wedding.brideName} required maxLength={60} className="portal-input" /></Field>
            <Field label="Groom's name"><input name="groomName" defaultValue={wedding.groomName} required maxLength={60} className="portal-input" /></Field>
            <Field label="Wedding day"><input name="weddingDate" type="date" defaultValue={istParts(wedding.weddingDate).date} required className="portal-input" /></Field>
            <Field label="City"><input name="city" defaultValue={wedding.city ?? ""} maxLength={80} placeholder="Mumbai" className="portal-input" /></Field>
            <Field label="Bride's parents" hint="on cards and the site"><input name="brideParents" defaultValue={wedding.brideParents ?? ""} maxLength={160} placeholder="Sunita & Rajesh Sharma" className="portal-input" /></Field>
            <Field label="Groom's parents"><input name="groomParents" defaultValue={wedding.groomParents ?? ""} maxLength={160} placeholder="Kavita & Vikram Mehta" className="portal-input" /></Field>
          </form>
        </section>

      </div>

      <section id="people" className="portal-panel mt-6 p-6">
        <p className="portal-eyebrow">People &amp; access</p>
        <h2 className="mt-1 font-semibold">Who can sign in, and what they can do</h2>
        <p className="mt-2 max-w-2xl text-sm text-neutral-600">
          Give family and friends their own sign-in, on {sn.bride}&apos;s side, {sn.groom}&apos;s side or both, and choose what each may see or change.
        </p>
        <Link href={`/couple/people${adminQ}`} className="portal-button mt-4">Manage people</Link>
      </section>
      </>)}

      {/* only the couple themselves can delete; each family resets its own part in its section */}
      {staff.role === "couple" && staff.access.owner && <div className="mt-8"><DangerZone coupleNames={coupleNames} /></div>}
      </PortalFrame>
      {staff.access.manage && <FloatingSave key={JSON.stringify(sp)} action={saveDetailsAction} failedPart={sp.error ? "details" : undefined} />}
    </main>
  );
}
