import { and, eq, inArray, ne, or } from "drizzle-orm";
import { db } from "@/db/client";
import { rishtaBlocks, rishtaInterests, rishtaProfiles, rishtaReports } from "@/db/schema";
import { rateLimit } from "@/lib/auth/ratelimit";
import { stateFor, type Profile, type Result } from "@/lib/rishta/profiles";
import { HIDES_AT_ONCE, ageIn, compatible, istToday, type ReportReason, REPORT_REASONS } from "@/lib/rishta/rules";

/*
 * Who sees whom. A live single sees other live singles at the same wedding
 * whom they'd want to meet and who'd want to meet them, during the window,
 * minus anyone either has blocked. "Interested" is private; two of them make
 * a match. Contact details appear only after both choose "Introduce our
 * families". The host never sees any of this.
 */

/** What another single may see before a match: no email, link or contacts. */
export type Card = {
  id: string; firstName: string; age: number; city: string; education: string; profession: string; bio: string;
  relation: string | null; photoCount: number; interested: boolean;
};
export type Match = Card & {
  externalUrl: string | null; introduceMine: boolean; introduceTheirs: boolean;
  family: { name: string | null; phone: string | null } | null;
};

const year = () => Number(istToday().slice(0, 4));
const card = (p: Profile, interested: boolean): Card => ({
  id: p.id, firstName: p.firstName, age: ageIn(p.birthYear, year()), city: p.city, education: p.education, profession: p.profession, bio: p.bio,
  relation: p.relationShown && p.relationApproved ? p.relation : null, photoCount: p.photos.length, interested,
});

async function blockedWith(meId: string): Promise<Set<string>> {
  const rows = await db.select().from(rishtaBlocks).where(or(eq(rishtaBlocks.fromId, meId), eq(rishtaBlocks.toId, meId)));
  return new Set(rows.map((r) => (r.fromId === meId ? r.toId : r.fromId)));
}

/** Can `me` act towards `other` at all right now? (same wedding, both live, open, compatible, no block) */
async function reachable(me: Profile, otherId: string): Promise<Profile | null> {
  if (me.status !== "live") return null;
  if ((await stateFor(me.weddingId)).phase !== "open") return null;
  const [o] = await db.select().from(rishtaProfiles)
    .where(and(eq(rishtaProfiles.id, otherId), eq(rishtaProfiles.weddingId, me.weddingId), eq(rishtaProfiles.status, "live"), ne(rishtaProfiles.id, me.id)));
  if (!o || !compatible(me, o)) return null;
  if ((await blockedWith(me.id)).has(o.id)) return null;
  return o;
}

/** Its owner, or a single who may see its card right now. (The hosts are checked by the caller.) */
export async function photoVisibleTo(me: Profile, targetId: string): Promise<boolean> {
  return me.id === targetId || !!(await reachable(me, targetId));
}

/** Everyone `me` may see, newest first; empty unless `me` is live and the window is open. */
export async function browse(me: Profile): Promise<Card[]> {
  if (me.status !== "live" || (await stateFor(me.weddingId)).phase !== "open") return [];
  const others = await db.select().from(rishtaProfiles)
    .where(and(eq(rishtaProfiles.weddingId, me.weddingId), eq(rishtaProfiles.status, "live"), ne(rishtaProfiles.id, me.id)));
  const blocked = await blockedWith(me.id);
  const mine = new Set((await db.select({ toId: rishtaInterests.toId }).from(rishtaInterests).where(eq(rishtaInterests.fromId, me.id))).map((r) => r.toId));
  return others
    .filter((o) => compatible(me, o) && !blocked.has(o.id))
    .sort((a, b) => (b.approvedAt?.getTime() ?? 0) - (a.approvedAt?.getTime() ?? 0))
    .map((o) => card(o, mine.has(o.id)));
}

/** Private "Interested" (or take it back, before it's a match). At most 20 a day. */
export async function setInterest(me: Profile, otherId: string, on: boolean): Promise<Result> {
  const o = await reachable(me, otherId);
  if (!o) return { ok: false, error: "That profile isn't available." };
  if (!on) {
    await db.delete(rishtaInterests).where(and(eq(rishtaInterests.fromId, me.id), eq(rishtaInterests.toId, o.id)));
    return { ok: true };
  }
  if (!(await rateLimit(`rishta-interest:${me.id}`, { max: 20, windowMs: 86_400_000 }))) return { ok: false, error: "That's a lot for one day. Take a breath and come back tomorrow." };
  await db.insert(rishtaInterests).values({ fromId: me.id, toId: o.id }).onConflictDoNothing();
  return { ok: true };
}

/** Mutual interests, with what each side has agreed to share. */
export async function matches(me: Profile): Promise<Match[]> {
  if (me.status !== "live") return [];
  const out = await db.select().from(rishtaInterests).where(eq(rishtaInterests.fromId, me.id));
  if (!out.length) return [];
  const back = await db.select().from(rishtaInterests)
    .where(and(inArray(rishtaInterests.fromId, out.map((r) => r.toId)), eq(rishtaInterests.toId, me.id)));
  const blocked = await blockedWith(me.id);
  const ids = back.map((r) => r.fromId).filter((id) => !blocked.has(id));
  if (!ids.length) return [];
  const people = await db.select().from(rishtaProfiles)
    .where(and(inArray(rishtaProfiles.id, ids), eq(rishtaProfiles.weddingId, me.weddingId), eq(rishtaProfiles.status, "live")));
  return people.map((o) => {
    const mine = out.find((r) => r.toId === o.id)!.introduce;
    const theirs = back.find((r) => r.fromId === o.id)!.introduce;
    return {
      ...card(o, true), externalUrl: o.externalUrl, introduceMine: mine, introduceTheirs: theirs,
      // contacts only once both sides have agreed
      family: mine && theirs ? { name: o.familyContactName, phone: o.familyContactPhone } : null,
    };
  });
}

/** "Introduce our families": this side agrees. Needs a match, and a family contact to share. */
export async function introduce(me: Profile, otherId: string): Promise<Result> {
  const m = (await matches(me)).find((x) => x.id === otherId);
  if (!m) return { ok: false, error: "You can do this once you've both shown interest." };
  if (!me.familyContactPhone) return { ok: false, error: "Add a family contact (a parent's name and phone) to your profile first." };
  await db.update(rishtaInterests).set({ introduce: true }).where(and(eq(rishtaInterests.fromId, me.id), eq(rishtaInterests.toId, otherId)));
  return { ok: true };
}

/** Block: neither sees the other again, and any interest either way is gone. */
export async function block(me: Profile, otherId: string): Promise<Result> {
  const [o] = await db.select({ id: rishtaProfiles.id }).from(rishtaProfiles)
    .where(and(eq(rishtaProfiles.id, otherId), eq(rishtaProfiles.weddingId, me.weddingId), ne(rishtaProfiles.id, me.id)));
  if (!o) return { ok: false, error: "That profile isn't available." };
  await db.insert(rishtaBlocks).values({ fromId: me.id, toId: o.id }).onConflictDoNothing();
  await db.delete(rishtaInterests).where(or(
    and(eq(rishtaInterests.fromId, me.id), eq(rishtaInterests.toId, o.id)),
    and(eq(rishtaInterests.fromId, o.id), eq(rishtaInterests.toId, me.id)),
  ));
  return { ok: true };
}

/** Report to the grievance officer; also blocks. Serious reasons hide the profile at once. */
export async function report(me: Profile, otherId: string, reason: string, note: string): Promise<Result> {
  if (!(reason in REPORT_REASONS)) return { ok: false, error: "Choose a reason." };
  const [o] = await db.select().from(rishtaProfiles)
    .where(and(eq(rishtaProfiles.id, otherId), eq(rishtaProfiles.weddingId, me.weddingId), ne(rishtaProfiles.id, me.id)));
  if (!o) return { ok: false, error: "That profile isn't available." };
  if (!(await rateLimit(`rishta-report:${me.id}`, { max: 10, windowMs: 86_400_000 }))) return { ok: false, error: "Please wait before sending another report." };
  await db.insert(rishtaReports).values({ weddingId: me.weddingId, profileId: o.id, reporterId: me.id, aboutName: o.firstName, reason, note: note.trim().slice(0, 1000) || null });
  if (HIDES_AT_ONCE.includes(reason as ReportReason) && o.status === "live") {
    await db.update(rishtaProfiles).set({ status: "pending", approvedAt: null }).where(eq(rishtaProfiles.id, o.id));
  }
  await block(me, o.id);
  return { ok: true };
}
