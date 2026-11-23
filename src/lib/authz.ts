import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";

import { accessFor, allows, seesSide, type Access, type Area, type Role } from "@/lib/access";
import type { FamilySide } from "@/lib/looks";
export type { Role };

// Where each role lands: when they open a door that isn't theirs, and where
// /go sends them after a magic link (which cannot know their role in advance).
export const ROLE_HOME: Record<Role, string> = {
  admin: "/admin",
  couple: "/couple",
  committee: "/couple", // the dashboard; their pages follow from their access
};

// No self-signup: only pre-provisioned staff emails may sign in
export async function isProvisionedStaff(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  return !!existing;
}

type SessionUser = { id: string; role?: Role; weddingId?: string | null; side?: string | null; access?: unknown; isOwner?: boolean };

/* Who's signed in, looked up once per page load however many parts of the
   page ask (React's per-request cache; outside a page render it simply runs). */
const currentSession = cache(async () => {
  // Lazy import keeps this module loadable in vitest without pulling in NextAuth
  const { auth } = await import("@/auth");
  return auth();
});

export async function requireRole(allowed: Role[]) {
  const session = await currentSession();
  const u = session?.user as SessionUser | undefined;
  if (!u?.role) redirect("/signin");
  // Signed in but wrong area (e.g. couple opening /admin): bounce to their own
  // dashboard rather than crashing the request with an unhandled throw.
  if (!allowed.includes(u.role)) redirect(ROLE_HOME[u.role]);
  return { userId: u.id, role: u.role, weddingId: u.weddingId ?? null, access: accessFor({ role: u.role, side: u.side, access: u.access, isOwner: u.isOwner }) };
}

type Staff = Awaited<ReturnType<typeof requireRole>>;
const ANYONE: Role[] = ["committee", "couple", "admin"];

/** For pages: this person, if they may open that page of that family's section; otherwise back to the dashboard. */
export async function requireAccess(area: Area | "overview", side: FamilySide, need: "view" | "full" = "view"): Promise<Staff> {
  const staff = await requireRole(ANYONE);
  const ok = area === "overview" ? seesSide(staff.access, side) : allows(staff.access, area, side, need);
  if (!ok) redirect("/couple");
  return staff;
}


/**
 * Who may change a wedding's guest list: an admin names the wedding, everyone
 * else is pinned to their own, and it takes full access to the guest list.
 * null when they may not. Used by every guest-list and import action.
 */
export async function guestListScope(requested: string): Promise<{ weddingId: string; access: Access } | null> {
  const staff = await requireRole(["committee", "couple", "admin"]);
  const weddingId = staff.role === "admin" ? requested : staff.weddingId;
  if (!weddingId || staff.access.guests !== "full") return null;
  return { weddingId, access: staff.access };
}
