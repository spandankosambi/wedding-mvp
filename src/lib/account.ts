import { z } from "zod";
import { FAMILY_SIDES, getLooks, otherSide, photoInUse, sideName, updateLook, type FamilySide, type LookPatch } from "@/lib/looks";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/db/client";
import {
  weddings, events, families, rsvps, users, verificationTokens, accountActions, type ResetScope,
} from "@/db/schema";
import { generateInviteToken, hashToken } from "@/lib/tokens";
import { starterEvents } from "@/lib/presets";
import { galleryOf } from "@/lib/gallery";

/* Deleting or resetting a wedding is destructive, so it takes two steps:
   the couple asks on their dashboard, and only the link emailed to their
   login address carries it out. Pure DB logic; the server actions wrap it. */

export const CONFIRM_MINUTES = 30;

export const resetScopeSchema = z.object({
  guests: z.boolean(), rsvps: z.boolean(), events: z.boolean(),
  photos: z.boolean(), content: z.boolean(), committee: z.boolean(),
  side: z.enum(["bride", "groom"]).optional(),
}).refine((s) => Object.values(s).some(Boolean), "choose at least one thing to reset");

/** In the couple's words — used on the confirmation page and in the email. */
export const RESET_LABELS: Record<Exclude<keyof ResetScope, "side">, string> = {
  guests: "Guest list — every family and guest, their invitations and replies",
  rsvps: "RSVP answers — every reply, keeping the guest list",
  events: "Celebrations — back to just the wedding day",
  photos: "Gallery photos",
  content: "Site text and look — story, tagline, parents, travel, hashtag, contact, theme, RSVP settings",
  committee: "Committee logins — everyone else who can sign in to this wedding",
};

/** One family's reset: the same choices, minus committee logins (they serve both). */
export const SIDE_RESET_LABELS: Record<Exclude<keyof ResetScope, "side" | "committee">, string> = {
  guests: "Guest list — this family's households and guests, their invitations and replies",
  rsvps: "RSVP answers — this family's replies, keeping its guest list",
  events: "This family's own celebrations — the common ones stay",
  photos: "This family's gallery photos",
  content: "This family's site text and look — story, tagline, travel, hashtag, contact, theme, RSVP settings",
};

/** What a reset request will erase, in the couple's words. */
export function resetItems(scope: ResetScope): string[] {
  if (scope.side) {
    const keys = Object.keys(SIDE_RESET_LABELS) as (keyof typeof SIDE_RESET_LABELS)[];
    return keys.filter((k) => scope[k]).map((k) => `${sideName(scope.side!)}: ${SIDE_RESET_LABELS[k]}`);
  }
  const keys = Object.keys(RESET_LABELS) as (keyof typeof RESET_LABELS)[];
  return keys.filter((k) => scope[k]).map((k) => RESET_LABELS[k]);
}

export async function createAction(
  kind: "delete" | "reset", weddingId: string, userId: string, scope?: ResetScope,
): Promise<{ token: string; expiresAt: Date }> {
  const { token, tokenHash } = generateInviteToken();
  const expiresAt = new Date(Date.now() + CONFIRM_MINUTES * 60_000);
  // a newer request replaces any older one still waiting
  await db.delete(accountActions).where(and(eq(accountActions.userId, userId), isNull(accountActions.usedAt)));
  await db.insert(accountActions).values({ tokenHash, kind, weddingId, userId, scope: kind === "reset" ? scope ?? null : null, expiresAt });
  return { token, expiresAt };
}

export type PendingAction = {
  id: string; kind: "delete" | "reset"; scope: ResetScope | null; weddingId: string; userId: string;
  coupleNames: string; slug: string; email: string;
};

/** A valid, unused, unexpired request for this token — or why not. */
export async function findAction(token: string): Promise<{ ok: true; action: PendingAction } | { ok: false; reason: "invalid" | "used" | "expired" }> {
  if (!token || token.length < 20) return { ok: false, reason: "invalid" };
  const [a] = await db.select().from(accountActions).where(eq(accountActions.tokenHash, hashToken(token)));
  if (!a) return { ok: false, reason: "invalid" };
  if (a.usedAt) return { ok: false, reason: "used" };
  if (a.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };
  const [w] = await db.select().from(weddings).where(eq(weddings.id, a.weddingId));
  const [u] = await db.select().from(users).where(eq(users.id, a.userId));
  if (!w || !u) return { ok: false, reason: "invalid" };
  return {
    ok: true,
    action: {
      id: a.id, kind: a.kind, scope: a.scope ?? null, weddingId: w.id, userId: u.id,
      coupleNames: `${w.brideName} & ${w.groomName}`, slug: w.slug, email: u.email,
    },
  };
}

/** Removes the wedding and everyone and everything on it. Returns the photo
    URLs so the caller can delete the stored files. */
export async function deleteWedding(weddingId: string): Promise<{ photoUrls: string[] }> {
  const [w] = await db.select().from(weddings).where(eq(weddings.id, weddingId));
  if (!w) return { photoUrls: [] };
  const looks = await getLooks(weddingId);
  const photoUrls = [...new Set([...galleryOf(w).photos, ...FAMILY_SIDES.flatMap((s) => galleryOf(looks[s]).photos)].map((p) => p.url))];
  const staff = await db.select({ email: users.email }).from(users).where(eq(users.weddingId, weddingId));
  if (staff.length) await db.delete(verificationTokens).where(inArray(verificationTokens.identifier, staff.map((s) => s.email)));
  // logins first (they point at the wedding); their sessions go with them
  await db.delete(users).where(eq(users.weddingId, weddingId));
  // events, families, guests, invitations, replies, email log and pending requests cascade
  await db.delete(weddings).where(eq(weddings.id, weddingId));
  return { photoUrls };
}

/** Wipes the chosen parts, keeping the couple's login, names, date, city and
    web address. Returns removed photo URLs for file cleanup. */
export async function resetWedding(weddingId: string, scope: ResetScope, keepUserId: string): Promise<{ photoUrls: string[] }> {
  const [w] = await db.select().from(weddings).where(eq(weddings.id, weddingId));
  if (!w) return { photoUrls: [] };
  if (scope.side) return resetSide(weddingId, scope.side, scope);
  let photoUrls: string[] = [];

  if (scope.guests) {
    await db.delete(families).where(eq(families.weddingId, weddingId)); // guests, invites, replies cascade
  } else if (scope.rsvps) {
    const ids = (await db.select({ id: families.id }).from(families).where(eq(families.weddingId, weddingId))).map((f) => f.id);
    if (ids.length) await db.delete(rsvps).where(inArray(rsvps.familyId, ids));
  }

  if (scope.events) {
    await db.delete(events).where(eq(events.weddingId, weddingId)); // their invitations and replies cascade
    await db.insert(events).values(starterEvents(w.weddingDate, w.city ?? "To be announced").map((e) => ({ ...e, weddingId })));
  }

  const patch: Partial<typeof weddings.$inferInsert> = {};
  if (scope.photos) {
    const g = galleryOf(w);
    photoUrls = g.photos.map((p) => p.url);
    patch.gallery = scope.content ? null : { enabled: g.enabled, photos: [] };
  }
  if (scope.content) {
    Object.assign(patch, {
      heroTagline: "Two families, one big yes.", story: null, brideParents: null, groomParents: null,
      hashtag: null, contactPhone: null, travel: null, theme: "ivory-editorial" as const,
      rsvpOpen: true, rsvpDeadline: null,
    });
    if (!scope.photos) patch.gallery = { enabled: true, photos: galleryOf(w).photos };
  }
  if (Object.keys(patch).length) await db.update(weddings).set(patch).where(eq(weddings.id, weddingId));

  // and each family's own look
  const looks = await getLooks(weddingId);
  for (const side of FAMILY_SIDES) {
    const g = galleryOf(looks[side]);
    const lp: LookPatch = {};
    if (scope.photos) {
      photoUrls.push(...g.photos.map((p) => p.url));
      lp.gallery = { enabled: scope.content ? true : g.enabled, photos: [] };
    }
    if (scope.content) {
      Object.assign(lp, { heroTagline: "Two families, one big yes.", story: null, hashtag: null, contactPhone: null, travel: null, theme: "ivory-editorial" as const, rsvpOpen: true, rsvpDeadline: null });
      if (!scope.photos) lp.gallery = { enabled: true, photos: g.photos };
    }
    if (Object.keys(lp).length) await updateLook(weddingId, side, lp);
  }
  photoUrls = [...new Set(photoUrls)];

  if (scope.committee) {
    const others = await db.select({ id: users.id, email: users.email }).from(users)
      .where(and(eq(users.weddingId, weddingId), ne(users.id, keepUserId), eq(users.role, "committee")));
    if (others.length) {
      await db.delete(verificationTokens).where(inArray(verificationTokens.identifier, others.map((o) => o.email)));
      await db.delete(users).where(inArray(users.id, others.map((o) => o.id)));
    }
  }
  return { photoUrls };
}

/** Wipes the chosen parts of one family's section. The other family's
    guests, own celebrations, photos and look, and the common celebrations,
    stay. Returns the photo URLs no longer used by either family. */
export async function resetSide(weddingId: string, side: FamilySide, scope: ResetScope): Promise<{ photoUrls: string[] }> {
  const theirs = (await db.select({ id: families.id }).from(families)
    .where(and(eq(families.weddingId, weddingId), eq(families.side, side)))).map((f) => f.id);
  if (scope.guests) {
    if (theirs.length) await db.delete(families).where(inArray(families.id, theirs)); // guests, invites, replies cascade
  } else if (scope.rsvps) {
    if (theirs.length) await db.delete(rsvps).where(inArray(rsvps.familyId, theirs));
  }

  if (scope.events) {
    // only this family's own; their invitations and replies cascade
    await db.delete(events).where(and(eq(events.weddingId, weddingId), eq(events.side, side)));
  }

  const looks = await getLooks(weddingId);
  const look = looks[side];
  const g = galleryOf(look);
  const lp: LookPatch = {};
  let removed: string[] = [];
  if (scope.photos) {
    removed = g.photos.map((p) => p.pathname);
    lp.gallery = { enabled: scope.content ? true : g.enabled, photos: [] };
  }
  if (scope.content) {
    Object.assign(lp, {
      heroTagline: "Two families, one big yes.", story: null, hashtag: null, contactPhone: null, travel: null,
      theme: "ivory-editorial" as const, rsvpOpen: true, rsvpDeadline: null,
    });
    if (!scope.photos) lp.gallery = { enabled: true, photos: g.photos };
    // hotels this family shared become the other family's own
    const other = looks[otherSide(side)];
    if (other.travel?.stays?.some((st) => st.common)) {
      await updateLook(weddingId, otherSide(side), { travel: { ...other.travel, stays: other.travel.stays.map(({ common: _c, ...st }) => st) } });
    }
  }
  if (Object.keys(lp).length) await updateLook(weddingId, side, lp);

  // a photo the other family also shows keeps its file
  const photoUrls: string[] = [];
  for (const pathname of removed) {
    if (!(await photoInUse(weddingId, pathname))) photoUrls.push(g.photos.find((p) => p.pathname === pathname)!.url);
  }
  return { photoUrls };
}

/** Carry out a confirmed request exactly once. */
export async function carryOut(token: string): Promise<
  { ok: true; kind: "delete" | "reset"; photoUrls: string[] } | { ok: false; reason: "invalid" | "used" | "expired" }
> {
  const found = await findAction(token);
  if (!found.ok) return found;
  const a = found.action;
  // claim it first, so a double-click or a second tab can't run it twice
  const claimed = await db.update(accountActions).set({ usedAt: new Date() })
    .where(and(eq(accountActions.id, a.id), isNull(accountActions.usedAt))).returning();
  if (!claimed.length) return { ok: false, reason: "used" };

  if (a.kind === "delete") return { ok: true, kind: "delete", ...(await deleteWedding(a.weddingId)) };
  const scope = resetScopeSchema.safeParse(a.scope);
  if (!scope.success) return { ok: false, reason: "invalid" };
  return { ok: true, kind: "reset", ...(await resetWedding(a.weddingId, scope.data, a.userId)) };
}
