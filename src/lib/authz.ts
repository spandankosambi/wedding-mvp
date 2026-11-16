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

export async function requireRole(allowed: Role[]) {
  // Lazy import keeps this module loadable in vitest without pulling in NextAuth
  const { auth } = await import("@/auth");
  const session = await auth();
  const u = session?.user as SessionUser | undefined;
  if (!u?.role) redirect("/signin");
  // Signed in but wrong area (e.g. couple opening /admin): bounce to their own
  // dashboard rather than crashing the request with an unhandled throw.
  if (!allowed.includes(u.role)) redirect(ROLE_HOME[u.role]);
  return { userId: u.id, role: u.role, weddingId: u.weddingId ?? null, access: accessFor({ role: u.role, side: u.side, access: u.access, isOwner: u.isOwner }) };
}

export type Staff = Awaited<ReturnType<typeof requireRole>>;
const ANYONE: Role[] = ["committee", "couple", "admin"];

/** For pages: this person, if they may open that page of that family's section; otherwise back to the dashboard. */
export async function requireAccess(area: Area | "overview", side: FamilySide, need: "view" | "full" = "view"): Promise<Staff> {
  const staff = await requireRole(ANYONE);
  const ok = area === "overview" ? seesSide(staff.access, side) : allows(staff.access, area, side, need);
  if (!ok) redirect("/couple");
  return staff;
}

/** For actions: the same check, answering null instead of redirecting. */
export async function staffWith(area: Area, side: FamilySide, need: "view" | "full" = "full"): Promise<Staff | null> {
  const staff = await requireRole(ANYONE);
  return allows(staff.access, area, side, need) ? staff : null;
}
export type { Access };
