import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { weddings, families, guests, events, eventInvites, type StaySent } from "@/db/schema";
import { getLook, namesFor } from "@/lib/site/looks";
import { stayGroups, type StayGroup } from "@/lib/guests/stay-groups";
import { showsTravel } from "@/lib/guests/travel";
import { eventForSide } from "@/lib/site/sides";
import { whatsappNumber } from "@/lib/guests/invites";
import { sendStayEmail } from "@/lib/email/mailer";

/*
 * "Where you're staying", for one household's primary contact: each hotel
 * their guests are in, its note and map link, and who is in which room.
 */

function stayMessage(o: { greeting: string; couple: string; groups: StayGroup[]; gettingThere?: string }) {
  const lines = [o.greeting, "", `Here's where you're staying for ${o.couple}'s wedding:`];
  for (const g of o.groups) {
    lines.push("", `🏨 ${g.hotel}`);
    if (g.note) lines.push(g.note);
    if (g.map) lines.push(`Map: ${g.map}`);
    for (const r of g.rooms) lines.push(`${r.room ? `Room ${r.room}` : "Room to be confirmed"}: ${r.names.join(", ")}`);
  }
  if (o.gettingThere?.trim()) lines.push("", "Getting there", o.gettingThere.trim());
  lines.push("", "See you soon!");
  return lines.join("\n");
}

type Result =
  | { ok: true; via: "whatsapp"; url: string; to: string | null; at: string }
  | { ok: true; via: "email"; to: string; at: string }
  | { ok: false; error: string };

export async function sendStayDetails(weddingId: string, familyId: string, via: "whatsapp" | "email"): Promise<Result> {
  const [wedding] = await db.select().from(weddings).where(eq(weddings.id, weddingId));
  const [family] = await db.select().from(families).where(and(eq(families.id, familyId), eq(families.weddingId, weddingId)));
  if (!wedding || !family) return { ok: false, error: "Household not found." };
  const side = family.side === "groom" ? "groom" : "bride";
  const [members, invites, evs, look] = await Promise.all([
    db.select().from(guests).where(eq(guests.familyId, familyId)).orderBy(guests.seq),
    db.select().from(eventInvites).where(eq(eventInvites.familyId, familyId)),
    db.select().from(events).where(eq(events.weddingId, weddingId)),
    getLook(weddingId, side),
  ]);
  const shown = showsTravel(family.showTravel, invites.map((i) => i.eventId), evs.filter((e) => eventForSide(e.side, family.side)).map((e) => e.id));
  if (!shown) return { ok: false, error: "This household isn't shown Travel & Stay." };
  const groups = stayGroups(members, look.travel?.stays ?? []);
  if (!groups.length) return { ok: false, error: "Nobody in this household has a hotel yet." };

  const primary = members.find((m) => m.isPrimary);
  const first = primary?.fullName.trim().split(/\s+/)[0];
  const couple = namesFor(wedding, side).couple;
  const text = stayMessage({ greeting: first ? `Namaste ${first}!` : `Namaste ${family.name}!`, couple, groups, gettingThere: look.travel?.gettingThere });

  const mark = (patch: StaySent) =>
    db.update(families).set({ staySent: { ...(family.staySent ?? {}), ...patch } }).where(eq(families.id, familyId));
  const at = new Date().toISOString();

  if (via === "whatsapp") {
    const number = whatsappNumber(primary?.phone ?? family.phone);
    // we can't see the message go out of WhatsApp; this is when it was opened, ready to send
    await mark({ whatsappAt: at, whatsappTo: number });
    return { ok: true, via, url: `https://wa.me/${number ?? ""}?text=${encodeURIComponent(text)}`, to: number, at };
  }
  const to = (primary?.email ?? family.email ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { ok: false, error: "No email saved for this household's primary contact." };
  await sendStayEmail({ to, familyName: family.name, coupleNames: couple, groups, gettingThere: look.travel?.gettingThere ?? "" });
  await mark({ emailAt: at, emailTo: to });
  return { ok: true, via, to, at };
}
