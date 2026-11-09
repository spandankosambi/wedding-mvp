import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { weddings, families, guests, eventInvites, rsvps, emailLog } from "@/db/schema";
import { generateInviteToken, tokenExpiry } from "@/lib/tokens";
import { sendInvite } from "@/lib/mailer";
import { appOrigin } from "@/lib/origin";
import { fmtWeddingDate } from "@/lib/format";

export type InviteType = "invite" | "resend" | "remind";

/** Where an invitation points: the couple's wedding site, personalised for
    this household (greeting, and an RSVP button that opens their own RSVP
    page). Plain /rsvp/<token> links keep working too. */
export function inviteUrl(origin: string, slug: string, token: string) {
  return `${origin}/w/${slug}?invite=${token}`;
}

export type IssueResult = { familyId: string; ok: boolean; error?: string };

// Hash-only token storage means every send mints a fresh link — we cannot
// recover the original token to re-use it for reminders. Acceptable: the old
// link works only until this overwrite, and each mail carries a working one.
export async function issueInvites(
  weddingId: string,
  familyIds: string[],
  type: InviteType,
): Promise<IssueResult[]> {
  const [wedding] = await db.select().from(weddings).where(eq(weddings.id, weddingId));
  if (!wedding) return familyIds.map((familyId) => ({ familyId, ok: false, error: "wedding not found" }));
  const coupleNames = `${wedding.brideName} & ${wedding.groomName}`;
  const appUrl = await appOrigin();

  const results: IssueResult[] = [];
  for (const familyId of familyIds) {
    const [family] = await db.select().from(families)
      .where(and(eq(families.id, familyId), eq(families.weddingId, weddingId)));
    if (!family) {
      results.push({ familyId, ok: false, error: "family not in wedding" });
      continue;
    }
    // Imported households may arrive without an email (WhatsApp-only lists);
    // nothing to send to until the committee adds one.
    if (!family.email.trim()) {
      results.push({ familyId, ok: false, error: "no email" });
      continue;
    }

    if (type === "remind") {
      const invites = await db.select().from(eventInvites).where(eq(eventInvites.familyId, familyId));
      const responses = await db.select().from(rsvps).where(eq(rsvps.familyId, familyId));
      const respondedIds = new Set(responses.map((r) => r.eventId));
      if (invites.length > 0 && invites.every((i) => respondedIds.has(i.eventId))) {
        results.push({ familyId, ok: false, error: "already responded" });
        continue;
      }
    }

    const { token, tokenHash } = generateInviteToken();
    await db.update(families)
      .set({ inviteTokenHash: tokenHash, tokenExpiresAt: tokenExpiry(wedding.weddingDate) })
      .where(eq(families.id, familyId));

    const res = await sendInvite({
      familyId,
      to: family.email,
      familyName: family.name,
      coupleNames,
      rsvpUrl: inviteUrl(appUrl, wedding.slug, token),
      theme: wedding.theme,
      type: type === "remind" ? "reminder" : type,
    });
    results.push(res.ok ? { familyId, ok: true } : { familyId, ok: false, error: res.error });
  }
  return results;
}

/** WhatsApp wants the full international number, digits only. Indian
    numbers are often saved without the 91; add it to a bare 10-digit one. */
export function whatsappNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = `91${d}`;
  return d.length >= 8 ? d : null;
}

/**
 * The household's invitation as a WhatsApp message to their primary adult:
 * mints a fresh personal link to the wedding site (like a resend, the previous link stops
 * working), logs it as sent, and returns a wa.me link that opens the chat
 * with the message typed. No phone saved → WhatsApp asks who to send it to.
 */
export async function whatsappInvite(weddingId: string, familyId: string): Promise<
  { ok: true; url: string; to: string | null } | { ok: false; error: string }
> {
  const [wedding] = await db.select().from(weddings).where(eq(weddings.id, weddingId));
  const [family] = await db.select().from(families).where(and(eq(families.id, familyId), eq(families.weddingId, weddingId)));
  if (!wedding || !family) return { ok: false, error: "family not found" };
  const [primary] = await db.select().from(guests).where(and(eq(guests.familyId, familyId), eq(guests.isPrimary, true)));

  const { token, tokenHash } = generateInviteToken();
  await db.update(families)
    .set({ inviteTokenHash: tokenHash, tokenExpiresAt: tokenExpiry(wedding.weddingDate) })
    .where(eq(families.id, familyId));
  await db.insert(emailLog).values({ familyId, type: "invite", status: "whatsapp" });

  const link = inviteUrl(await appOrigin(), wedding.slug, token);
  const first = primary?.fullName.trim().split(/\s+/)[0];
  const text = [
    `${first ? `Namaste ${first}!` : "Namaste!"}`,
    "",
    `${wedding.brideName} & ${wedding.groomName} are getting married on ${fmtWeddingDate(wedding.weddingDate)}${wedding.city ? ` in ${wedding.city}` : ""}, and would love to celebrate with ${family.name}.`,
    "",
    `See the celebrations and RSVP here: ${link}`,
  ].join("\n");
  const number = whatsappNumber(primary?.phone ?? family.phone);
  return { ok: true, url: `https://wa.me/${number ?? ""}?text=${encodeURIComponent(text)}`, to: number };
}
