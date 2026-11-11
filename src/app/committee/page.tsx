import { namesFor } from "@/lib/looks";
import { PortalNav } from "../couple/PortalNav";
import { SummaryCards } from "../couple/SummaryCards";
import Link from "next/link";
import { and, eq, inArray, desc } from "drizzle-orm";
import { db } from "@/db/client";
import { weddings, events, families, guests, eventInvites, rsvps, emailLog } from "@/db/schema";
import { requireRole } from "@/lib/authz";
import { getRsvpSummary } from "@/lib/rsvp";
import { showsTravel } from "@/lib/travel";
import { eventForSide, eventLabel } from "@/lib/sides";
import { asFamilySide, sideName, type FamilySide } from "@/lib/looks";
import { FamilyTable } from "./FamilyTable";
import { GuestTable } from "./GuestTable";

export const dynamic = "force-dynamic";

export default async function CommitteePage({
  searchParams,
}: {
  searchParams: Promise<{ wedding?: string; view?: string; family?: string }>;
}) {
  const staff = await requireRole(["committee", "couple", "admin"]);
  const sp = await searchParams;
  const requested = sp.wedding;
  const view = sp.view === "guests" ? "guests" : "families";
  // each family keeps its own guest list
  const family: FamilySide = asFamilySide(sp.family) ?? "bride";
  let weddingId = staff.role === "admin" ? (requested ?? null) : staff.weddingId;
  if (staff.role === "admin" && !weddingId) {
    const [first] = await db.select().from(weddings).limit(1);
    weddingId = first?.id ?? null;
  }
  if (!weddingId) {
    return <main className="p-10 text-sm text-neutral-500">No wedding assigned to this account.</main>;
  }

  const [wedding] = await db.select().from(weddings).where(eq(weddings.id, weddingId));
  const coupleHref = staff.role === "admin" ? `/couple?wedding=${weddingId}` : "/couple";
  const sectionHref = staff.role === "admin" ? `/couple/${family}?wedding=${weddingId}` : `/couple/${family}`;
  // this family's events (common + its own) and its households
  const evs = (await db.select().from(events).where(eq(events.weddingId, weddingId)).orderBy(events.sortOrder))
    .filter((e) => eventForSide(e.side, family));
  const summary = await getRsvpSummary(weddingId, family);
  const fams = await db.select().from(families)
    .where(and(eq(families.weddingId, weddingId), eq(families.side, family))).orderBy(families.createdAt);
  const link = (over: { family?: FamilySide; view?: "families" | "guests" }) => {
    const v = over.view ?? view, f = over.family ?? family;
    const q = new URLSearchParams({ ...(staff.role === "admin" ? { wedding: weddingId } : {}), family: f, ...(v === "guests" ? { view: "guests" } : {}) });
    return `/committee?${q}`;
  };
  const famIds = fams.map((f) => f.id);
  const [allGuests, allInvites, allRsvps, allLogs] = famIds.length
    ? await Promise.all([
        db.select().from(guests).where(inArray(guests.familyId, famIds)).orderBy(guests.seq),
        db.select().from(eventInvites).where(inArray(eventInvites.familyId, famIds)),
        db.select().from(rsvps).where(inArray(rsvps.familyId, famIds)),
        db.select().from(emailLog).where(inArray(emailLog.familyId, famIds)).orderBy(desc(emailLog.sentAt)),
      ])
    : [[], [], [], []];

  const rows = fams.map((f) => ({
    id: f.id,
    name: f.name,
    side: f.side,
    relation: f.relation,
    email: f.email,
    phone: f.phone,
    diet: f.diet,
    source: f.source,
    members: allGuests.filter((g) => g.familyId === f.id)
      .map((g) => ({ id: g.id, fullName: g.fullName, ageGroup: g.ageGroup, details: g.details ?? {}, email: g.email, phone: g.phone, isPrimary: g.isPrimary })),
    eventIds: allInvites.filter((i) => i.familyId === f.id).map((i) => i.eventId),
    // "every event" means every event open to their side
    showTravel: showsTravel(f.showTravel, allInvites.filter((i) => i.familyId === f.id).map((i) => i.eventId),
      evs.filter((e) => eventForSide(e.side, f.side)).map((e) => e.id)),
    rsvpByEvent: Object.fromEntries(
      allRsvps.filter((r) => r.familyId === f.id)
        .map((r) => [r.eventId, { status: r.status, headcount: r.headcount, note: r.note, guestIds: r.guestIds ?? null }]),
    ) as Record<string, { status: "attending" | "declined"; headcount: number; note: string | null; guestIds: string[] | null }>,
    lastEmail: (() => {
      const l = allLogs.find((x) => x.familyId === f.id);
      return l ? { type: l.type, status: l.status, sentAt: l.sentAt.toISOString() } : null;
    })(),
  }));

  return (
    <main className="portal-page">
      <PortalNav names={namesFor(wedding, family).couple} current={family} weddingId={weddingId} admin={staff.role === "admin"} committee={staff.role === "committee"} />
      <div className="portal-shell">
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <div className="max-w-2xl">
          {/* couples and admins arrive here from their dashboard; give them the way back.
              Committee members live here — /couple isn't theirs, so no link. */}
          {staff.role === "committee" ? (
            <p className="portal-eyebrow">Guest operations</p>
          ) : (
            <p className="portal-eyebrow">
              {staff.role === "admin" && (
                <><Link href="/admin" className="hover:text-stone-950">All weddings</Link><span className="mx-1 text-stone-300">/</span></>
              )}
              <Link href={coupleHref} className="hover:text-stone-950">Dashboard</Link>
              <span className="mx-1 text-stone-300">/</span>
              <Link href={sectionHref} className="hover:text-stone-950">{sideName(family)}</Link>
              <span className="mx-1 text-stone-300">/</span> guest list
            </p>
          )}
          <h1 className="portal-heading mt-2">{sideName(family)}&apos;s guest list</h1>
          <p className="portal-subheading mt-3">
            The {family === "bride" ? "bride" : "groom"}&apos;s households, their invitations and event headcounts. Their invitations open the {family === "bride" ? "bride" : "groom"}&apos;s family&apos;s site.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {staff.role !== "committee" && (
            <Link href={sectionHref} className="portal-button-secondary">← Back to {sideName(family).toLowerCase()}</Link>
          )}
          <a href={`/w/${wedding.slug}?side=${family}`} className="portal-button-secondary" target="_blank" rel="noreferrer">
            View wedding site ↗
          </a>
        </div>
      </header>

      {/* per-event summary strip */}
      <div className="mb-8"><SummaryCards summary={summary} /></div>

      {/* whose list: the bride's family or the groom's */}
      <nav className="mb-4 mr-3 inline-flex rounded-lg border border-neutral-200 bg-white p-1 text-sm" aria-label="Family">
        {(["bride", "groom"] as const).map((f) => (
          <Link key={f} href={link({ family: f })} aria-current={family === f ? "page" : undefined}
            className={`rounded-md px-4 py-1.5 font-medium ${family === f ? "bg-stone-800 text-white" : "text-neutral-600 hover:text-neutral-900"}`}>
            {sideName(f)}
          </Link>
        ))}
      </nav>

      {/* Families ⇄ Guests: same data, two ways to work through it */}
      <nav className="mb-4 inline-flex rounded-lg border border-neutral-200 bg-white p-1 text-sm" aria-label="View">
        {(["families", "guests"] as const).map((v) => {
          return (
            <Link key={v} href={link({ view: v })} aria-current={view === v ? "page" : undefined}
              className={`rounded-md px-4 py-1.5 font-medium ${view === v ? "bg-stone-800 text-white" : "text-neutral-600 hover:text-neutral-900"}`}>
              {v === "families" ? `Families · ${rows.length}` : `Guests · ${allGuests.length}`}
            </Link>
          );
        })}
      </nav>

      {view === "families" ? (
        <FamilyTable
          weddingId={weddingId}
          family={family}
          importHref={`/committee/import?${new URLSearchParams({ ...(staff.role === "admin" ? { wedding: weddingId } : {}), family })}`}
          events={evs.map((e) => ({ id: e.id, name: eventLabel(e), side: e.side }))}
          rows={rows}
        />
      ) : (
        <GuestTable
          weddingId={weddingId}
          family={family}
          events={evs.map((e) => ({ id: e.id, name: eventLabel(e), side: e.side }))}
          rows={rows}
          columns={wedding.guestColumns ?? []}
        />
      )}
      </div>
    </main>
  );
}
