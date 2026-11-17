"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { weddings } from "@/db/schema";
import { requireRole } from "@/lib/authz";
import { appOrigin } from "@/lib/origin";
import { sendAccessEmail } from "@/lib/mailer";
import { rateLimit } from "@/lib/ratelimit";
import * as people from "@/lib/people";

type Out = { ok: true; note?: string } | { ok: false; error: string };

/* Only the couple (or the platform admin, naming the wedding) manage people. */
async function manager(requested: unknown) {
  const staff = await requireRole(["couple", "admin"]);
  const weddingId = staff.role === "admin" ? String(requested ?? "") : staff.weddingId;
  if (!weddingId || !staff.access.manage) return null;
  const [w] = await db.select().from(weddings).where(eq(weddings.id, weddingId));
  if (!w) return null;
  return { weddingId, coupleNames: `${w.brideName} & ${w.groomName}`, actor: { userId: staff.userId, owner: staff.access.owner } };
}

export async function addPersonAction(input: { weddingId?: string; email: string } & Record<string, unknown>): Promise<Out> {
  const m = await manager(input?.weddingId);
  if (!m) return { ok: false, error: "forbidden" };
  if (!rateLimit(`people-add:${m.actor.userId}`, { max: 20, windowMs: 10 * 60_000 })) return { ok: false, error: "Too many at once. Wait a few minutes, then try again." };
  const r = await people.addPerson(m.weddingId, m.actor, input.email, input);
  if (!r.ok) return r;
  revalidatePath("/couple/people");
  try {
    await sendAccessEmail({ to: r.person!.email, coupleNames: m.coupleNames, link: `${await appOrigin()}/signin`, what: people.describe(r.person!) });
    return { ok: true, note: `Added. We emailed ${r.person!.email} how to sign in.` };
  } catch {
    return { ok: true, note: `Added, but the email to ${r.person!.email} didn't go out. Ask them to sign in at the sign-in page with that address.` };
  }
}

export async function updatePersonAction(input: { weddingId?: string; userId: string } & Record<string, unknown>): Promise<Out> {
  const m = await manager(input?.weddingId);
  if (!m) return { ok: false, error: "forbidden" };
  const r = await people.updatePerson(m.weddingId, m.actor, String(input.userId ?? ""), input);
  revalidatePath("/couple/people");
  return r.ok ? { ok: true, note: "Saved." } : r;
}

/** The signed-in person's own name (their access stays as it is). */
export async function renameMeAction(input: { weddingId?: string; name: string }): Promise<Out> {
  const m = await manager(input?.weddingId);
  if (!m) return { ok: false, error: "forbidden" };
  const r = await people.renameSelf(m.weddingId, m.actor.userId, input?.name);
  revalidatePath("/couple/people");
  return r.ok ? { ok: true, note: "Saved." } : r;
}

export async function removePersonAction(input: { weddingId?: string; userId: string }): Promise<Out> {
  const m = await manager(input?.weddingId);
  if (!m) return { ok: false, error: "forbidden" };
  const r = await people.removePerson(m.weddingId, m.actor, String(input.userId ?? ""));
  revalidatePath("/couple/people");
  return r.ok ? { ok: true, note: "Removed. They can no longer sign in." } : r;
}
