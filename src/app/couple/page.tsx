import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { weddings } from "@/db/schema";
import { requireRole } from "@/lib/authz";
import { istParts } from "@/lib/editor";
import { FAMILY_SIDES, getLooks, sideName } from "@/lib/looks";
import { THEME_META } from "@/themes/catalog";
import { SummaryCards } from "./SummaryCards";
import { DangerZone } from "./danger/DangerZone";
import { SaveButton } from "./site/SaveButton";
import { saveDetails, saveRsvpSettings } from "./site/actions";
import { Stat, weddingStats } from "./stats";

export const dynamic = "force-dynamic";

const Field = ({ label, hint, children, className = "" }: { label: string; hint?: string; children: React.ReactNode; className?: string }) => (
  <label className={`block ${className}`}>
    <span className="text-xs font-medium text-neutral-600">{label}</span>
    {hint && <span className="ml-2 text-xs text-neutral-400">{hint}</span>}
    <div className="mt-1.5">{children}</div>
  </label>
);

/**
 * The couple's dashboard: the numbers that matter, the details both families
 * share, and a door into each family's own section (site, guests, cards).
 */
export default async function CouplePage({
  searchParams,
}: {
  searchParams: Promise<{ wedding?: string; saved?: string; error?: string }>;
}) {
  const staff = await requireRole(["couple", "admin"]);
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
  const [all, bride, groom, looks] = await Promise.all([
    weddingStats(weddingId), weddingStats(weddingId, "bride"), weddingStats(weddingId, "groom"), getLooks(weddingId),
  ]);
  const bySide = { bride, groom };
  const coupleNames = `${wedding.brideName} & ${wedding.groomName}`;
  const adminQ = staff.role === "admin" ? `?wedding=${weddingId}` : "";
  const wid = staff.role === "admin" ? <input type="hidden" name="weddingId" value={weddingId} /> : null;
  const attending = all.guests.length;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-xl font-semibold">{coupleNames} — your wedding at a glance</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Both families together. Each family designs its own site, guest list and printed cards in its section below.
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
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Families invited" value={all.families.length} sub={`${bride.families.length} bride's · ${groom.families.length} groom's`} />
        <Stat label="Guests" value={attending} sub={`${bride.guests.length} bride's · ${groom.guests.length} groom's`} />
        <Stat label="Response rate" value={`${all.responseRate}%`} sub={`${all.respondedCount} of ${all.families.length} families`} />
        <Stat label="Peak attendance" value={all.peak} sub="largest single event" />
      </div>

      <div className="mb-8">
        <SummaryCards summary={all.summary} />
      </div>

      {/* ── the two families ────────────────────────────────────── */}
      <div className="mb-8 grid gap-4 md:grid-cols-2">
        {FAMILY_SIDES.map((side) => {
          const st = bySide[side];
          const meta = THEME_META[looks[side].theme];
          return (
            <section key={side} className="overflow-hidden rounded-xl border border-neutral-200 bg-white" aria-label={sideName(side)}>
              <div className="flex items-center justify-between gap-3 px-6 py-4" style={{ background: meta.bg, color: meta.ink }}>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.25em] opacity-70">{meta.label}</p>
                  <h2 className="mt-1 text-lg font-semibold">{sideName(side)}</h2>
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
                  <Link href={`/couple/${side}${adminQ}`} className="portal-button">Open {side === "bride" ? "bride" : "groom"}&apos;s section →</Link>
                  <a href={`/w/${wedding.slug}?side=${side}`} target="_blank" rel="noreferrer" className="portal-button-secondary">View site ↗</a>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {/* ── shared details ──────────────────────────────────────── */}
      <div className="grid gap-6 md:grid-cols-2">
        <section id="details" className="portal-panel p-6">
          <p className="portal-eyebrow">Shared by both families</p>
          <h2 className="mt-1 font-semibold">Names, date, city, parents</h2>
          <form action={saveDetails} className="mt-5 grid gap-4 sm:grid-cols-2">
            {wid}
            <Field label="Bride's name"><input name="brideName" defaultValue={wedding.brideName} required maxLength={60} className="portal-input" /></Field>
            <Field label="Groom's name"><input name="groomName" defaultValue={wedding.groomName} required maxLength={60} className="portal-input" /></Field>
            <Field label="Wedding day"><input name="weddingDate" type="date" defaultValue={istParts(wedding.weddingDate).date} required className="portal-input" /></Field>
            <Field label="City"><input name="city" defaultValue={wedding.city ?? ""} maxLength={80} placeholder="Mumbai" className="portal-input" /></Field>
            <Field label="Bride's parents" hint="on cards and the site"><input name="brideParents" defaultValue={wedding.brideParents ?? ""} maxLength={160} placeholder="Sunita & Rajesh Sharma" className="portal-input" /></Field>
            <Field label="Groom's parents"><input name="groomParents" defaultValue={wedding.groomParents ?? ""} maxLength={160} placeholder="Kavita & Vikram Mehta" className="portal-input" /></Field>
            <div className="sm:col-span-2"><SaveButton /></div>
          </form>
        </section>

        <section id="rsvp" className="portal-panel p-6">
          <p className="portal-eyebrow">RSVP</p>
          <h2 className="mt-1 font-semibold">Who can reply, and until when</h2>
          <form action={saveRsvpSettings} className="mt-5 space-y-4">
            {wid}
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="rsvpOpen" defaultChecked={wedding.rsvpOpen} className="mt-0.5 h-4 w-4" />
              <span>
                <span className="font-medium">Accept RSVPs from the shared links</span>
                <span className="block text-xs text-neutral-500">Off = the site shows the family contact instead of the form. Personal invitation links keep working.</span>
              </span>
            </label>
            <Field label="Reply-by date" hint="optional; the form closes at midnight IST">
              <input name="rsvpDeadline" type="date" defaultValue={wedding.rsvpDeadline ? istParts(wedding.rsvpDeadline).date : ""} className="portal-input md:max-w-xs" />
            </Field>
            <SaveButton />
          </form>
        </section>
      </div>

      {/* only the couple themselves can reset or delete; admins have their own tools */}
      {staff.role === "couple" && <div className="mt-8"><DangerZone coupleNames={coupleNames} /></div>}
    </main>
  );
}
