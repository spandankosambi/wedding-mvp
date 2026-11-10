"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { del } from "@vercel/blob";
import { db } from "@/db/client";
import { users, weddings } from "@/db/schema";
import { requireRole } from "@/lib/authz";
import { appOrigin } from "@/lib/origin";
import { rateLimit } from "@/lib/ratelimit";
import { sendConfirmEmail } from "@/lib/mailer";
import { photoStorageConfigured } from "@/lib/gallery";
import { createAction, carryOut, resetScopeSchema, resetItems, CONFIRM_MINUTES } from "@/lib/account";
import type { ResetScope } from "@/db/schema";

type Requested = { ok: true; email: string; minutes: number } | { ok: false; error: string };

/* Only the couple can delete or reset their own wedding, and only the link
   sent to their own login address carries it out. */
async function couple() {
  const staff = await requireRole(["couple"]);
  if (!staff.weddingId) return null;
  const [u] = await db.select().from(users).where(eq(users.id, staff.userId));
  const [w] = await db.select().from(weddings).where(eq(weddings.id, staff.weddingId));
  if (!u || !w) return null;
  return { userId: u.id, email: u.email, weddingId: w.id, coupleNames: `${w.brideName} & ${w.groomName}` };
}

async function request(kind: "delete" | "reset", scope?: ResetScope): Promise<Requested> {
  const c = await couple();
  if (!c) return { ok: false, error: "No wedding is linked to this login." };
  if (!rateLimit(`account-action:${c.userId}`, { max: 3, windowMs: 10 * 60_000 }))
    return { ok: false, error: "Too many requests. Wait a few minutes, then try again." };
  const { token } = await createAction(kind, c.weddingId, c.userId, scope);
  const link = `${await appOrigin()}/confirm/${token}`;
  try {
    await sendConfirmEmail({
      to: c.email, kind, coupleNames: c.coupleNames, link, minutes: CONFIRM_MINUTES,
      items: scope ? resetItems(scope) : undefined,
    });
  } catch {
    return { ok: false, error: "We couldn't send the confirmation email. Try again in a minute." };
  }
  return { ok: true, email: c.email, minutes: CONFIRM_MINUTES };
}

export async function requestDeleteWedding(): Promise<Requested> {
  return request("delete");
}

export async function requestResetWedding(input: unknown): Promise<Requested> {
  const parsed = resetScopeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose at least one thing to reset." };
  // the guest list takes its replies with it; a family's reset never touches committee logins
  const scope = { ...parsed.data, rsvps: parsed.data.rsvps || parsed.data.guests, ...(parsed.data.side && { committee: false }) };
  if (!resetItems(scope).length) return { ok: false, error: "Choose at least one thing to reset." };
  return request("reset", scope);
}

/** The final button on the page the email links to. */
export async function confirmAccountAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const r = await carryOut(token);
  if (!r.ok) redirect(`/confirm/${encodeURIComponent(token)}?error=${r.reason}`);
  if (photoStorageConfigured() && r.photoUrls.length) await del(r.photoUrls).catch(() => {});
  redirect(r.kind === "delete" ? "/confirm/deleted" : "/confirm/reset-done");
}
