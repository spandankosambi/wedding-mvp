import { SheetTools } from "./SheetTools";
import { SideNamesProvider } from "@/components/SideNames";
import { namesFor } from "@/lib/site/looks";
import { sideNamesOf } from "@/lib/site/side-names";
import { PortalNav } from "../couple/PortalNav";
import { SummaryCards } from "../couple/SummaryCards";
import Link from "next/link";
import { and, eq, inArray, desc } from "drizzle-orm";
import { db } from "@/db/client";
import { weddings, events, families, guests, eventInvites, rsvps, emailLog } from "@/db/schema";
import { requireRole } from "@/lib/auth/authz";
import { allows, homeSide } from "@/lib/auth/access";
import { sharePath } from "@/lib/site/share";
import { getLook } from "@/lib/site/looks";
import { redirect } from "next/navigation";
import { PortalFrame } from "../couple/PortalFrame";
import { getRsvpSummary } from "@/lib/guests/rsvp";
import { showsTravel } from "@/lib/guests/travel";
import { eventForSide } from "@/lib/site/sides";
import { asFamilySide, sideName, type FamilySide } from "@/lib/site/looks";
import { FamilyTable } from "./FamilyTable";
import { StayView } from "./StayView";
import { GuestTable } from "./GuestTable";
import { FloatingSave } from "@/components/FloatingSave";
import { saveStaysAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function CommitteePage({
  searchParams,
}: {
  searchParams: Promise<{ wedding?: string; view?: string; family?: string }>;
}) {
  const staff = await requireRole(["committee", "couple", "admin"]);
  const sp = await searchParams;
  const requested = sp.wedding;
  const view = sp.view === "guests" ? "guests" : sp.view === "stay" ? "stay" : "families";
  // each family keeps its own guest list
  const family: FamilySide = asFamilySide(sp.family) ?? homeSide(staff.access);
  if (!allows(staff.access, "guests", family)) redirect("/couple");
  const readOnly = staff.access.guests !== "full";
  let weddingId = staff.role === "admin" ? (requested ?? null) : staff.weddingId;
  if (staff.role === "admin" && !weddingId) {
    const [first] = await db.select().from(weddings).limit(1);
    weddingId = first?.id ?? null;
  }
  if (!weddingId) {
    return <main className="p-10 text-sm text-neutral-500">No wedding assigned to this account.</main>;
  }

  const [wedding] = await db.select().from(weddings).where(eq(weddings.id, weddingId));
  // this family's events (common + its own) and its households
  const evs = (await db.select().from(events).where(eq(events.weddingId, weddingId)).orderBy(events.sortOrder))
    .filter((e) => eventForSide(e.side, family));
  const summary = await getRsvpSummary(weddingId, family);
  const fams = await db.select().from(families)
    .where(and(eq(families.weddingId, weddingId), eq(families.side, family))).orderBy(families.createdAt);
  const link = (over: { family?: FamilySide; view?: "families" | "guests" | "stay" }) => {
    const v = over.view ?? view, f = over.family ?? family;
    const q = new URLSearchParams({ ...(staff.role === "admin" ? { wedding: weddingId } : {}), family: f, ...(v !== "families" ? { view: v } : {}) });
    return `/committee?${q}`;
  };
  const famIds = fams.map((f) => f.id);
  // shared-link replies that may be a household already on this side's list
  const matchIds = [...new Set(fams.map((f) => f.possibleMatchFamilyId).filter((id): id is string => !!id))];
  const matchNames = new Map(matchIds.length
    ? (await db.select({ id: families.id, name: families.name }).from(families)
        .where(and(eq(families.weddingId, weddingId), eq(families.side, family), inArray(families.id, matchIds)))).map((f) => [f.id, f.name])
    : []);
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
    possibleMatch: f.possibleMatchFamilyId
      ? { name: matchNames.get(f.possibleMatchFamilyId) ?? "a household on your list", by: f.possibleMatchBy === "email" ? "email" as const : "phone" as const }
      : null,
    members: allGuests.filter((g) => g.familyId === f.id)
      .map((g) => ({ id: g.id, fullName: g.fullName, ageGroup: g.ageGroup, details: g.details ?? {}, email: g.email, phone: g.phone, isPrimary: g.isPrimary })),
    eventIds: allInvites.filter((i) => i.familyId === f.id).map((i) => i.eventId),
    // "every event" means every event open to their side
    showTravel: showsTravel(f.showTravel, allInvites.filter((i) => i.familyId === f.id).map((i) => i.eventId),
      evs.filter((e) => eventForSide(e.side, f.side)).map((e) => e.id)),
    staySent: f.staySent ?? null,
    rsvpByEvent: Object.fromEntries(
      allRsvps.filter((r) => r.familyId === f.id)
        .map((r) => [r.eventId, { status: r.status, headcount: r.headcount, note: r.note, guestIds: r.guestIds ?? null }]),
    ) as Record<string, { status: "attending" | "declined"; headcount: number; note: string | null; guestIds: string[] | null }>,
    lastEmail: (() => {
      const l = allLogs.find((x) => x.familyId === f.id);
      return l ? { type: l.type, status: l.status, sentAt: l.sentAt.toISOString() } : null;
    })(),
    // the latest invitation by each route (logs come newest first)
    inviteSent: (() => {
      const logs = allLogs.filter((x) => x.familyId === f.id);
      const wa = logs.find((x) => x.status === "whatsapp");
      const em = logs.find((x) => x.status !== "whatsapp");
      return {
        whatsappAt: wa?.sentAt.toISOString() ?? null,
        email: em ? { at: em.sentAt.toISOString(), type: em.type, ok: em.status === "sent", queued: em.status === "queued" } : null,
      };
    })(),
  }));

  // the hotels on this family's site (its own and the common ones), for the Guests view's Hotel column
  const look = await getLook(weddingId, family);
  const hotels = [...new Set((look.travel?.stays ?? []).map((s) => s.name.trim()).filter(Boolean))];
  const sn = sideNamesOf(wedding); // "Pooja", "Spandan"
  return (
    <main className="portal-page">
      <PortalNav sideNames={sn} names={namesFor(wedding, family).couple} current={family} page="guests" weddingId={weddingId} admin={staff.role === "admin"} access={staff.access} />
      <PortalFrame key={family} jump={[["replies", "Replies so far"], ["list", "The list"]]}>
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <div className="max-w-2xl">
          <h1 className="portal-heading">{sideName(family, sn)}&apos;s guest list</h1>
          <p className="portal-subheading mt-3">
            {sn[family]}&apos;s households, their invitations and event headcounts. Their invitations open {sn[family]}&apos;s family&apos;s site.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <SheetTools weddingId={weddingId} admin={staff.role === "admin"} family={family} canEdit={!readOnly} />
          <a href={sharePath(wedding.slug, family, look.shareKey)} className="portal-button-secondary" target="_blank" rel="noreferrer">
            View wedding site ↗
          </a>
        </div>
      </header>

      {/* per-event summary strip */}
      <div className="mb-8" id="replies"><SummaryCards summary={summary} /></div>

      {/* Families ⇄ Guests: same data, two ways to work through it */}
      <nav id="list" className="mb-4 inline-flex rounded-lg border border-neutral-200 bg-white p-1 text-sm" aria-label="View">
        {(["families", "guests", "stay"] as const).map((v) => {
          return (
            <Link key={v} href={link({ view: v })} aria-current={view === v ? "page" : undefined}
              className={`rounded-md px-4 py-1.5 font-medium ${view === v ? "bg-stone-800 text-white" : "text-neutral-600 hover:text-neutral-900"}`}>
              {v === "families" ? `Families · ${rows.length}` : v === "guests" ? `Guests · ${allGuests.length}` : "Hotels & rooms"}
            </Link>
          );
        })}
      </nav>

      <SideNamesProvider names={sn}>
      {view === "families" ? (
        <FamilyTable
          weddingId={weddingId}
          family={family}
          importHref={`/committee/import?${new URLSearchParams({ ...(staff.role === "admin" ? { wedding: weddingId } : {}), family })}`}
          events={evs.map((e) => ({ id: e.id, name: e.name, side: e.side }))}
          rows={rows}
          readOnly={readOnly}
        />
      ) : view === "stay" ? (
        <StayView
          weddingId={weddingId}
          family={family}
          rows={rows}
          stays={(look.travel?.stays ?? []).map((s) => ({ name: s.name, note: s.note, url: s.url }))}
          guestListHref={link({ view: "guests" })}
          readOnly={readOnly}
        />
      ) : (
        <GuestTable
          weddingId={weddingId}
          family={family}
          events={evs.map((e) => ({ id: e.id, name: e.name, side: e.side }))}
          rows={rows}
          columns={wedding.guestColumns ?? []}
          hotels={hotels}
          readOnly={readOnly}
        />
      )}
      </SideNamesProvider>
      </PortalFrame>
      {/* the Guests view's hotels and rooms are saved together, with one button */}
      {view === "guests" && !readOnly && <FloatingSave key={family} action={saveStaysAction} batch label="Save hotels & rooms" />}
    </main>
  );
}
