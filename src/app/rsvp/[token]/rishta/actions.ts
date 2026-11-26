"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { env } from "@/config/env";
import { getFamilyByToken } from "@/lib/guests/rsvp";
import { namesFor } from "@/lib/site/looks";
import { deleteDraft, saveDraft, sendToSingle, type Result } from "@/lib/rishta/profiles";

/*
 * Rishta Corner from a household's own private RSVP link. The token is the
 * only key: the shared family link and the QR code never reach here. Every
 * profile is looked up again by this household in src/lib/rishta.
 */

const id = z.string().uuid();

async function householdOf(token: unknown) {
  const d = typeof token === "string" ? await getFamilyByToken(token) : null;
  return d ? { family: { id: d.family.id, weddingId: d.wedding.id }, couple: namesFor(d.wedding, d.family.side === "groom" ? "groom" : "bride").couple } : null;
}
const GONE: Result = { ok: false, error: "This link has expired. Open the newest invitation email and try again." };
const linkFor = (t: string) => `${env.appUrl}/rishta/me/${t}`;

/** Save a draft; with `send`, also email the single their own link. */
export async function saveRishtaDraftAction(token: string, fields: Record<string, unknown>, profileId: string | null, send: boolean): Promise<Result<{ id?: string; sent?: boolean }>> {
  const h = await householdOf(token);
  if (!h) return GONE;
  if (profileId !== null && !id.safeParse(profileId).success) return { ok: false, error: "We couldn't find that profile." };
  const r = await saveDraft(h.family, fields ?? {}, profileId ?? undefined);
  if (!r.ok) return r;
  revalidatePath(`/rsvp/${token}/rishta`);
  if (!send) return { ok: true, id: r.id };
  const s = await sendToSingle(h.family, r.id, linkFor, h.couple);
  return s.ok ? { ok: true, id: r.id, sent: true } : { ok: false, error: `Saved, but not sent: ${s.error}` };
}

/** Email the single their link again (a fresh one; the old one stops working). */
export async function sendRishtaLinkAction(token: string, profileId: string): Promise<Result> {
  const h = await householdOf(token);
  if (!h) return GONE;
  if (!id.safeParse(profileId).success) return { ok: false, error: "We couldn't find that profile." };
  return sendToSingle(h.family, profileId, linkFor, h.couple);
}

export async function deleteRishtaDraftAction(token: string, profileId: string): Promise<Result> {
  const h = await householdOf(token);
  if (!h) return GONE;
  if (!id.safeParse(profileId).success) return { ok: false, error: "We couldn't find that profile." };
  const r = await deleteDraft(h.family.id, profileId);
  if (r.ok) revalidatePath(`/rsvp/${token}/rishta`);
  return r;
}
