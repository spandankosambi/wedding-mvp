import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { weddings, events, families, emailLog, rsvps } from "@/db/schema";
import { eventForSide } from "@/lib/sides";
import { getLooks, hasPart, type FamilySide, type Look } from "@/lib/looks";

/* "What's done" for one family's side: the steps from an empty section to
   invitations out and replies coming in. Shown beside every couple page. */

export type ChecklistItem = { id: string; label: string; done: boolean; href: string };

export function buildChecklist(d: {
  side: FamilySide; q: string; // q: "wedding=…&" for the platform admin, else ""
  parents: string | null; look: Look; publishedEvents: number;
  families: number; invited: number; replied: number;
}): ChecklistItem[] {
  const site = (hash: string) => `/couple/site?${d.q}family=${d.side}#${hash}`;
  const list = `/committee?${d.q}family=${d.side}`;
  return [
    { id: "parents", label: "Parents' names added", done: !!d.parents?.trim(), href: `/couple${d.q ? `?${d.q.slice(0, -1)}` : ""}#details` },
    { id: "wording", label: "Invitation wording written", done: hasPart(d.look, "wording"), href: site("wording") },
    { id: "words", label: "Tagline or story added", done: hasPart(d.look, "words"), href: site("words") },
    { id: "events", label: "Celebrations on the site", done: d.publishedEvents > 0, href: site("events") },
    { id: "travel", label: "Travel & stay filled in", done: hasPart(d.look, "travel"), href: site("travel") },
    { id: "gallery", label: "Photos uploaded", done: hasPart(d.look, "gallery"), href: site("gallery") },
    { id: "guests", label: "Guests added", done: d.families > 0, href: list },
    { id: "deadline", label: "Reply-by date set", done: !!d.look.rsvpDeadline, href: `/couple/${d.side}${d.q ? `?${d.q.slice(0, -1)}` : ""}#rsvp` },
    { id: "invited", label: "Invitations sent", done: d.invited > 0, href: list },
    { id: "replied", label: "First replies in", done: d.replied > 0, href: list },
  ];
}

export async function getChecklist(weddingId: string, side: FamilySide, admin = false): Promise<ChecklistItem[]> {
  const [[w], looks, evs, fams] = await Promise.all([
    db.select().from(weddings).where(eq(weddings.id, weddingId)),
    getLooks(weddingId),
    db.select({ side: events.side, isPublished: events.isPublished }).from(events).where(eq(events.weddingId, weddingId)),
    db.select({ id: families.id }).from(families).where(and(eq(families.weddingId, weddingId), eq(families.side, side))),
  ]);
  const ids = fams.map((f) => f.id);
  const [sent, answered] = ids.length
    ? await Promise.all([
        db.selectDistinct({ id: emailLog.familyId }).from(emailLog).where(inArray(emailLog.familyId, ids)),
        db.selectDistinct({ id: rsvps.familyId }).from(rsvps).where(inArray(rsvps.familyId, ids)),
      ])
    : [[], []];
  return buildChecklist({
    side, q: admin ? `wedding=${weddingId}&` : "",
    parents: side === "bride" ? w?.brideParents ?? null : w?.groomParents ?? null,
    look: looks[side],
    publishedEvents: evs.filter((e) => e.isPublished && eventForSide(e.side, side)).length,
    families: ids.length, invited: sent.length, replied: answered.length,
  });
}
