import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { families, weddings } from "@/db/schema";
import { requireRole } from "@/lib/auth/authz";
import { sideNamesOf } from "@/lib/site/side-names";
import { stateFor, type Profile } from "@/lib/rishta/profiles";
import { hostCounts, hostProfiles, purgeNow, reportsFor } from "@/lib/rishta/host";
import { REPORT_REASONS, ageIn, istToday } from "@/lib/rishta/rules";
import { Field } from "@/components/Field";
import { PortalNav } from "../PortalNav";
import { Stat } from "../stats";
import { ConfirmRemove } from "./ConfirmRemove";
import { approveRishtaAction, removeRishtaAction, resolveRishtaReportAction, setRishtaSwitchAction, setRishtaWindowAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rishta Corner", robots: { index: false, follow: false } };

const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const PHASE = { off: "Switched off", before: "Opens soon", open: "Open now", closed: "Closed" } as const;

/** The couple's view of Rishta Corner: counts, dates and the approval queue. Never who likes whom. */
export default async function HostRishtaPage({ searchParams }: { searchParams: Promise<{ wedding?: string; saved?: string; error?: string }> }) {
  const staff = await requireRole(["couple", "admin"]);
  const sp = await searchParams;
  const admin = staff.role === "admin";
  const weddingId = admin ? (sp.wedding ?? null) : staff.weddingId;
  if (!weddingId) return <main className="p-10 text-sm text-neutral-500">{admin ? "Open a wedding from All weddings first." : "No wedding is linked to this account."}</main>;
  const [w] = await db.select().from(weddings).where(eq(weddings.id, weddingId));
  if (!w) notFound();
  await purgeNow();
  const names = sideNamesOf(w);
  const { settings, phase } = await stateFor(weddingId);
  const hid = admin ? <input type="hidden" name="weddingId" value={weddingId} /> : null;

  const nav = <PortalNav sideNames={names} names={`${w.brideName} & ${w.groomName}`} weddingId={weddingId} admin={admin} access={staff.access} />;
  const flash = (
    <>
      {sp.saved && <p className="mb-6 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">{sp.saved}.</p>}
      {sp.error && <p className="mb-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">{sp.error}</p>}
    </>
  );
  const switchPanel = admin && (
    <form action={setRishtaSwitchAction} className="portal-panel mb-6 flex flex-wrap items-center justify-between gap-4 p-6">
      {hid}
      <div>
        <h2 className="font-semibold">Pilot switch</h2>
        <p className="mt-1 text-sm text-neutral-600">Only the One Tap Invites team sees this. Rishta Corner is {settings.enabled ? "on" : "off"} for this wedding.</p>
      </div>
      <input type="hidden" name="enabled" value={settings.enabled ? "" : "on"} />
      <button type="submit" className="portal-button">{settings.enabled ? "Switch off" : "Switch on"}</button>
    </form>
  );

  if (!settings.enabled) {
    return (
      <main className="portal-page">
        {nav}
        <div className="portal-shell">
          <h1 className="portal-heading">Rishta Corner</h1>
          <div className="mt-6">{flash}{switchPanel}</div>
          <section className="portal-panel p-6">
            <h2 className="font-semibold">Not switched on for your wedding yet</h2>
            <p className="mt-2 max-w-2xl text-sm text-neutral-600">
              Rishta Corner lets guests&apos; families start profiles for singles, who meet other singles at your wedding. It&apos;s in a small pilot. Ask the One Tap Invites team if you&apos;d like it.
            </p>
          </section>
        </div>
      </main>
    );
  }

  const [counts, { waiting, live }, reports] = await Promise.all([hostCounts(weddingId), hostProfiles(weddingId), admin ? reportsFor(weddingId) : Promise.resolve([])]);
  const famIds = [...new Set([...waiting, ...live].map((p) => p.familyId))];
  const famName = new Map((famIds.length ? await db.select({ id: families.id, name: families.name }).from(families).where(inArray(families.id, famIds)) : []).map((f) => [f.id, f.name]));
  const year = Number(istToday().slice(0, 4));
  const who = (p: Profile) => `${p.gender === "woman" ? "Woman" : "Man"}, ${ageIn(p.birthYear, year)}, would like to meet a ${p.lookingFor}`;

  return (
    <main className="portal-page">
      {nav}
      <div className="portal-shell">
        <header className="mb-8">
          <h1 className="portal-heading">Rishta Corner</h1>
          <p className="portal-subheading mt-3 max-w-2xl">
            Families start profiles from their own RSVP link; each single checks and publishes their own. You look at each one before other guests see it. You see counts, never who likes whom.
          </p>
        </header>
        {flash}
        {switchPanel}

        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Waiting for you" value={counts.waiting} sub="published, to check" />
          <Stat label="Live" value={counts.live} sub="seen by other singles" />
          <Stat label="Drafts" value={counts.drafts} sub="not published yet" />
          <Stat label="Matches" value={counts.matches} sub="both interested" />
        </div>

        <form action={setRishtaWindowAction} className="portal-panel mb-6 p-6">
          {hid}
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">When it&apos;s open</h2>
            <span className="portal-badge">{PHASE[phase]}</span>
          </div>
          <p className="mt-1 text-sm text-neutral-600">Profiles show only between these dates. The day after it closes, every profile and photo is deleted.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="Opens"><input type="date" name="opensOn" defaultValue={settings.opensOn} required className="portal-input" /></Field>
            <Field label="Closes"><input type="date" name="closesOn" defaultValue={settings.closesOn} required className="portal-input" /></Field>
            <button type="submit" className="portal-button-secondary">Save dates</button>
          </div>
          <p className="mt-3 text-xs text-neutral-500">Now: {day(settings.opensOn)} to {day(settings.closesOn)}.</p>
        </form>

        <section className="mb-6" aria-label="Waiting for you">
          <h2 className="mb-3 font-semibold">Waiting for you ({waiting.length})</h2>
          {waiting.length === 0 ? (
            <p className="portal-panel p-6 text-sm text-neutral-500">Nothing to check. New profiles appear here once a single publishes theirs.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {waiting.map((p) => (
                <article key={p.id} className="portal-panel p-5" aria-label={p.firstName}>
                  {p.photos.length > 0 && (
                    <div className="mb-4 flex gap-2 overflow-x-auto">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {p.photos.map((_, i) => <img key={i} src={`/rishta/photo/${p.id}/${i}`} alt={`${p.firstName}, photo ${i + 1}`} className="h-36 w-28 flex-none rounded-lg object-cover" />)}
                    </div>
                  )}
                  <h3 className="text-lg font-semibold break-words">{p.firstName}</h3>
                  <p className="mt-1 text-sm text-neutral-600">{who(p)}</p>
                  <p className="mt-1 text-sm text-neutral-600 break-words">{[p.city, p.profession, p.education].filter(Boolean).join(" · ")}</p>
                  {p.bio && <p className="mt-3 whitespace-pre-line text-sm break-words">{p.bio}</p>}
                  <p className="mt-3 text-xs text-neutral-500">From the {famName.get(p.familyId) ?? "a guest"} household</p>
                  <form action={approveRishtaAction} className="mt-4 grid gap-3">
                    {hid}
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="name" value={p.firstName} />
                    {p.relation && p.relationShown && (
                      <label className="flex items-start gap-2 text-sm">
                        <input type="checkbox" name="relationOk" defaultChecked className="mt-1" />
                        <span>Show &ldquo;{p.relation}&rdquo; on the profile (untick if it isn&apos;t right)</span>
                      </label>
                    )}
                    <button type="submit" className="portal-button justify-self-start">Approve</button>
                  </form>
                  <form action={removeRishtaAction} className="mt-3">{hid}<input type="hidden" name="id" value={p.id} /><input type="hidden" name="name" value={p.firstName} /><ConfirmRemove name={p.firstName} /></form>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="portal-panel mb-6 p-6" aria-label="Live">
          <h2 className="font-semibold">Live ({live.length})</h2>
          {live.length === 0 ? <p className="mt-2 text-sm text-neutral-500">No live profiles yet.</p> : (
            <ul className="mt-3 divide-y divide-stone-100">
              {live.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className="min-w-0 break-words text-sm"><strong>{p.firstName}</strong>, {ageIn(p.birthYear, year)} · {famName.get(p.familyId) ?? "a guest"} household</span>
                  <form action={removeRishtaAction}>{hid}<input type="hidden" name="id" value={p.id} /><input type="hidden" name="name" value={p.firstName} /><ConfirmRemove name={p.firstName} /></form>
                </li>
              ))}
            </ul>
          )}
        </section>

        {admin && (
          <section className="portal-panel p-6" aria-label="Reports">
            <h2 className="font-semibold">Reports ({reports.filter((r) => !r.resolvedAt).length} open)</h2>
            <p className="mt-1 text-sm text-neutral-600">Only the grievance officer sees these. Acknowledge within 24 hours; resolve within 15 days.</p>
            {reports.length === 0 ? <p className="mt-3 text-sm text-neutral-500">No reports.</p> : (
              <ul className="mt-3 divide-y divide-stone-100">
                {reports.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                    <span className="min-w-0 break-words">
                      <strong>{r.aboutName}</strong>: {REPORT_REASONS[r.reason as keyof typeof REPORT_REASONS] ?? r.reason}
                      {r.note && <span className="block text-neutral-600">{r.note}</span>}
                      <span className="block text-xs text-neutral-500">{r.at.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}{r.resolvedAt ? " · closed" : ""}</span>
                    </span>
                    {!r.resolvedAt && <form action={resolveRishtaReportAction}>{hid}<input type="hidden" name="id" value={r.id} /><button type="submit" className="portal-button-secondary">Mark resolved</button></form>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
