"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { visitorIp } from "@/lib/auth/ratelimit";
import {
  addPhoto, byToken, publish, removePhoto, removeProfile, requestCode, sessionProfileId, updateMine, verifyCode,
  SESSION_HOURS, MAX_PHOTO_BYTES, RISHTA_COOKIE as COOKIE, type Profile, type Result,
} from "@/lib/rishta/profiles";
import { block, introduce, report, setInterest } from "@/lib/rishta/match";

/*
 * The single's own page. Two keys, both needed: their link (the token) and
 * a short session from the emailed passcode, for that same profile.
 */


const uuid = z.string().uuid();
const OUT: Result = { ok: false, error: "Your session has ended. Ask for a new code to carry on." };

async function mine(token: string): Promise<Profile | null> {
  const p = typeof token === "string" ? await byToken(token) : null;
  if (!p) return null;
  return sessionProfileId((await cookies()).get(COOKIE)?.value) === p.id ? p : null;
}
const done = (token: string) => revalidatePath(`/rishta/me/${token}`);

export async function requestRishtaCodeAction(token: string): Promise<Result> {
  const p = await byToken(token);
  if (!p) return { ok: false, error: "This link no longer works. Ask your family to send it again." };
  return requestCode(p, visitorIp(await headers()));
}

export async function verifyRishtaCodeAction(token: string, code: string): Promise<Result> {
  const p = await byToken(token);
  if (!p) return { ok: false, error: "This link no longer works. Ask your family to send it again." };
  const r = await verifyCode(p, String(code ?? ""));
  if (!r.ok) return r;
  (await cookies()).set(COOKIE, r.session, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/rishta", maxAge: SESSION_HOURS * 3600 });
  done(token);
  return { ok: true };
}

export async function leaveRishtaAction(token: string): Promise<void> {
  (await cookies()).delete({ name: COOKIE, path: "/rishta" });
  done(token);
}

export async function saveMyRishtaAction(token: string, fields: Record<string, unknown>): Promise<Result> {
  const p = await mine(token);
  if (!p) return OUT;
  const r = await updateMine(p, fields ?? {});
  if (r.ok) done(token);
  return r;
}

export async function publishRishtaAction(token: string, ticked: string[], marketing: boolean): Promise<Result> {
  const p = await mine(token);
  if (!p) return OUT;
  const r = await publish(p, Array.isArray(ticked) ? ticked.map(String) : [], marketing === true);
  if (r.ok) done(token);
  return r;
}

export async function addRishtaPhotoAction(token: string, fd: FormData): Promise<Result> {
  const p = await mine(token);
  if (!p) return OUT;
  const file = fd.get("photo");
  if (!(file instanceof File) || file.size > MAX_PHOTO_BYTES) return { ok: false, error: "That photo is too large. Try a smaller one." };
  const r = await addPhoto(p, file, Number(fd.get("width")), Number(fd.get("height")));
  if (r.ok) done(token);
  return r;
}

export async function removeRishtaPhotoAction(token: string, index: number): Promise<Result> {
  const p = await mine(token);
  if (!p) return OUT;
  const r = await removePhoto(p, Number(index));
  if (r.ok) done(token);
  return r;
}

export async function rishtaInterestAction(token: string, otherId: string, on: boolean): Promise<Result> {
  const p = await mine(token);
  if (!p) return OUT;
  if (!uuid.safeParse(otherId).success) return { ok: false, error: "That profile isn't available." };
  const r = await setInterest(p, otherId, on === true);
  if (r.ok) done(token);
  return r;
}

export async function rishtaIntroduceAction(token: string, otherId: string): Promise<Result> {
  const p = await mine(token);
  if (!p) return OUT;
  if (!uuid.safeParse(otherId).success) return { ok: false, error: "That profile isn't available." };
  const r = await introduce(p, otherId);
  if (r.ok) done(token);
  return r;
}

export async function rishtaBlockAction(token: string, otherId: string): Promise<Result> {
  const p = await mine(token);
  if (!p) return OUT;
  if (!uuid.safeParse(otherId).success) return { ok: false, error: "That profile isn't available." };
  const r = await block(p, otherId);
  if (r.ok) done(token);
  return r;
}

export async function rishtaReportAction(token: string, otherId: string, reason: string, note: string): Promise<Result> {
  const p = await mine(token);
  if (!p) return OUT;
  if (!uuid.safeParse(otherId).success) return { ok: false, error: "That profile isn't available." };
  const r = await report(p, otherId, String(reason ?? ""), String(note ?? ""));
  if (r.ok) done(token);
  return r;
}

/** Everything goes at once: the profile, photos, interests and blocks. */
export async function deleteMyRishtaAction(token: string): Promise<Result> {
  const p = await mine(token);
  if (!p) return OUT;
  await removeProfile(p);
  // the session cookie is left to expire (it vouches for a profile that's gone);
  // clearing it now would reload the page over the "deleted" message
  return { ok: true };
}
