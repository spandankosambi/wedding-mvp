import { and, eq } from "drizzle-orm";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { put, del } from "@vercel/blob";
import { db } from "@/db/client";
import { rishtaSettings, rishtaProfiles, rishtaConsents, weddings, type RishtaPhoto } from "@/db/schema";
import { env } from "@/config/env";
import { rateLimit } from "@/lib/auth/ratelimit";
import { generateInviteToken, hashToken } from "@/lib/auth/tokens";
import { normalizePhone } from "@/lib/site/slug";
import { sendRishtaCode, sendRishtaLink, EmailBudgetError } from "@/lib/email/mailer";
import { stripPhotoMetadata } from "@/lib/rishta/photo-meta";
import {
  DECLARATIONS, NOTICE_VERSION, allowedExternal, defaultWindow, istToday, oldEnough, windowState,
} from "@/lib/rishta/rules";

/*
 * Rishta Corner profiles. A household starts a draft from its own private
 * RSVP link; only the single, after proving their email with a passcode,
 * can publish it; the host approves it before anyone sees it.
 */

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
export type Profile = typeof rishtaProfiles.$inferSelect;

/* ── settings ──────────────────────────────────────────────────────────── */

export async function settingsFor(weddingId: string) {
  const [s] = await db.select().from(rishtaSettings).where(eq(rishtaSettings.weddingId, weddingId));
  if (s) return s;
  const [w] = await db.select({ weddingDate: weddings.weddingDate }).from(weddings).where(eq(weddings.id, weddingId));
  return { weddingId, enabled: false, updatedAt: new Date(), ...defaultWindow(w?.weddingDate ?? new Date()) };
}

/** Admin only during the pilot (checked by the caller). */
export async function setEnabled(weddingId: string, enabled: boolean): Promise<void> {
  const s = await settingsFor(weddingId);
  await db.insert(rishtaSettings).values({ weddingId, enabled, opensOn: s.opensOn, closesOn: s.closesOn })
    .onConflictDoUpdate({ target: rishtaSettings.weddingId, set: { enabled, updatedAt: new Date() } });
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export async function setWindow(weddingId: string, opensOn: string, closesOn: string): Promise<Result> {
  if (!day.safeParse(opensOn).success || !day.safeParse(closesOn).success) return { ok: false, error: "Pick both dates." };
  if (closesOn < opensOn) return { ok: false, error: "The closing date must be after the opening date." };
  const s = await settingsFor(weddingId);
  await db.insert(rishtaSettings).values({ weddingId, enabled: s.enabled, opensOn, closesOn })
    .onConflictDoUpdate({ target: rishtaSettings.weddingId, set: { opensOn, closesOn, updatedAt: new Date() } });
  return { ok: true };
}

/** Whether drafting / browsing is possible for this wedding today. */
export async function stateFor(weddingId: string, today = istToday()) {
  const s = await settingsFor(weddingId);
  return { settings: s, phase: s.enabled ? windowState(s, today) : ("off" as const) };
}

/* ── the profile's fields ───────────────────────────────────────────────── */

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const text = (max: number) => z.string().trim().max(max).default("");
const thisYear = () => Number(istToday().slice(0, 4));

const profileInput = z.object({
  firstName: z.string().trim().min(1, "Add a first name.").max(40, "Keep the name under 40 characters."),
  gender: z.enum(["woman", "man"], { message: "Choose woman or man." }),
  lookingFor: z.enum(["woman", "man"], { message: "Choose who they'd like to meet." }),
  birthYear: z.coerce.number().int().min(1940, "Check the birth year.").max(2015, "Check the birth year."),
  city: text(60),
  education: text(80),
  profession: text(80),
  bio: text(600),
  relation: z.preprocess(blank, z.string().trim().max(60).nullable()).optional(),
  relationShown: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()).default(false),
  externalUrl: z.preprocess(blank, z.string().trim().max(300).refine(allowedExternal, "Only a Jeevansathi or Shaadi.com profile link (https) can be added.").nullable()).optional(),
  familyContactName: z.preprocess(blank, z.string().trim().max(60).nullable()).optional(),
  familyContactPhone: z.preprocess(blank, z.string().trim().max(20).nullable()).optional(),
});
const emailInput = z.string().trim().toLowerCase().email("Add the single's own email address.").max(200);

function clean(raw: unknown): Result<{ values: Omit<z.infer<typeof profileInput>, "relation" | "externalUrl" | "familyContactName" | "familyContactPhone"> & { relation: string | null; externalUrl: string | null; familyContactName: string | null; familyContactPhone: string | null } }> {
  const p = profileInput.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Please check the profile." };
  const d = p.data;
  const phone = d.familyContactPhone ? normalizePhone(d.familyContactPhone) : null;
  if (d.familyContactPhone && !phone) return { ok: false, error: "Check the family contact's phone number." };
  return { ok: true, values: { ...d, relation: d.relation ?? null, externalUrl: d.externalUrl ?? null, familyContactName: d.familyContactName ?? null, familyContactPhone: phone } };
}

/* ── the household's side (from its own private RSVP link) ──────────────── */

export async function draftsOf(familyId: string): Promise<Profile[]> {
  return db.select().from(rishtaProfiles).where(eq(rishtaProfiles.familyId, familyId)).orderBy(rishtaProfiles.createdAt);
}

/** Start or change a draft. Once the single has opened it with a passcode, it's theirs alone. */
export async function saveDraft(family: { id: string; weddingId: string }, raw: Record<string, unknown>, id?: string): Promise<Result<{ id: string }>> {
  const { phase } = await stateFor(family.weddingId);
  if (phase === "off" || phase === "closed") return { ok: false, error: "Rishta Corner isn't open for this wedding." };
  const c = clean(raw);
  if (!c.ok) return c;
  const email = emailInput.safeParse(raw.email);
  if (!email.success) return { ok: false, error: email.error.issues[0]?.message ?? "Add the single's own email address." };
  if (id) {
    const [p] = await db.select().from(rishtaProfiles).where(and(eq(rishtaProfiles.id, id), eq(rishtaProfiles.familyId, family.id)));
    if (!p) return { ok: false, error: "We couldn't find that profile." };
    if (p.verifiedAt) return { ok: false, error: `${p.firstName} has opened this profile, so only they can change it now.` };
    await db.update(rishtaProfiles).set({ ...c.values, email: email.data, updatedAt: new Date() }).where(eq(rishtaProfiles.id, p.id));
    return { ok: true, id: p.id };
  }
  const { tokenHash } = generateInviteToken(); // replaced when it's sent
  const [p] = await db.insert(rishtaProfiles).values({ weddingId: family.weddingId, familyId: family.id, ...c.values, email: email.data, tokenHash }).returning();
  return { ok: true, id: p.id };
}

export async function deleteDraft(familyId: string, id: string): Promise<Result> {
  const [p] = await db.select().from(rishtaProfiles).where(and(eq(rishtaProfiles.id, id), eq(rishtaProfiles.familyId, familyId)));
  if (!p) return { ok: false, error: "We couldn't find that profile." };
  if (p.verifiedAt) return { ok: false, error: `${p.firstName} has opened this profile, so only they can delete it.` };
  await removeProfile(p);
  return { ok: true };
}

/** Email the single their own link. A fresh link each time; the old one stops working. */
export async function sendToSingle(family: { id: string; weddingId: string }, id: string, linkFor: (token: string) => string, coupleNames: string): Promise<Result> {
  const [p] = await db.select().from(rishtaProfiles).where(and(eq(rishtaProfiles.id, id), eq(rishtaProfiles.familyId, family.id)));
  if (!p) return { ok: false, error: "We couldn't find that profile." };
  const { phase } = await stateFor(family.weddingId);
  if (phase === "off" || phase === "closed") return { ok: false, error: "Rishta Corner isn't open for this wedding." };
  if (!(await rateLimit(`rishta-send-family:${family.id}`, { max: 10, windowMs: 86_400_000 }))
    || !(await rateLimit(`rishta-send-email:${p.email}`, { max: 3, windowMs: 3_600_000 }))) {
    return { ok: false, error: "That's been sent a few times already. Please wait an hour before sending it again." };
  }
  const { token, tokenHash } = generateInviteToken();
  await db.update(rishtaProfiles).set({ tokenHash, sentAt: new Date(), updatedAt: new Date() }).where(eq(rishtaProfiles.id, p.id));
  try {
    await sendRishtaLink({ to: p.email, firstName: p.firstName, coupleNames, link: linkFor(token) });
  } catch (e) {
    return { ok: false, error: e instanceof EmailBudgetError ? "Today's email allowance is used up. Please try again tomorrow." : "The email didn't go. Please try again in a minute." };
  }
  return { ok: true };
}

/* ── the single's side: their link, a passcode, a short session ─────────── */

export async function byToken(token: string): Promise<Profile | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const [p] = await db.select().from(rishtaProfiles).where(eq(rishtaProfiles.tokenHash, hashToken(token)));
  return p ?? null;
}

const sign = (s: string) => createHmac("sha256", env.authSecret).update(s).digest("base64url");
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const CODE_MINUTES = 10;
export const SESSION_HOURS = 12;
export const RISHTA_COOKIE = "rishta_s";

/** Email a 6-digit code. Limited per profile, per email and per visitor. */
export async function requestCode(p: Profile, ip: string): Promise<Result> {
  const { phase } = await stateFor(p.weddingId);
  if (phase === "off" || phase === "closed") return { ok: false, error: "Rishta Corner has closed for this wedding." };
  const allowed = (await rateLimit(`rishta-code-profile:${p.id}`, { max: 5, windowMs: 3_600_000 }))
    && (await rateLimit(`rishta-code-email:${p.email}`, { max: 5, windowMs: 3_600_000 }))
    && (await rateLimit(`rishta-code-ip:${ip}`, { max: 10, windowMs: 900_000 }));
  if (!allowed) return { ok: false, error: "Please wait a few minutes before asking for another code." };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.update(rishtaProfiles).set({
    otpHash: sign(`otp:${p.id}:${code}`), otpExpiresAt: new Date(Date.now() + CODE_MINUTES * 60_000), otpTries: 0,
  }).where(eq(rishtaProfiles.id, p.id));
  try {
    await sendRishtaCode({ to: p.email, code, minutes: CODE_MINUTES });
  } catch (e) {
    return { ok: false, error: e instanceof EmailBudgetError ? "Today's email allowance is used up. Please try again tomorrow." : "The code didn't go. Please try again in a minute." };
  }
  return { ok: true };
}

/** Check the code; on success, a session value for a cookie. 5 tries per code. */
export async function verifyCode(p: Profile, code: string): Promise<Result<{ session: string }>> {
  const [now] = await db.select().from(rishtaProfiles).where(eq(rishtaProfiles.id, p.id));
  if (!now?.otpHash || !now.otpExpiresAt || now.otpExpiresAt.getTime() < Date.now()) return { ok: false, error: "That code has expired. Ask for a new one." };
  if (now.otpTries >= 5) return { ok: false, error: "Too many tries. Ask for a new code." };
  if (!/^\d{6}$/.test(code.trim()) || !same(sign(`otp:${p.id}:${code.trim()}`), now.otpHash)) {
    await db.update(rishtaProfiles).set({ otpTries: now.otpTries + 1 }).where(eq(rishtaProfiles.id, p.id));
    return { ok: false, error: "That code isn't right. Check the latest email and try again." };
  }
  await db.update(rishtaProfiles).set({ otpHash: null, otpExpiresAt: null, otpTries: 0, verifiedAt: now.verifiedAt ?? new Date() }).where(eq(rishtaProfiles.id, p.id));
  const exp = Date.now() + SESSION_HOURS * 3_600_000;
  return { ok: true, session: `${p.id}.${exp}.${sign(`rishta:${p.id}.${exp}`)}` };
}

/** The profile id a session cookie vouches for, if it's genuine and current. */
export function sessionProfileId(value: string | undefined): string | null {
  const [id, exp, sig] = (value ?? "").split(".");
  if (!id || !exp || !sig || Number(exp) < Date.now()) return null;
  return same(sign(`rishta:${id}.${exp}`), sig) ? id : null;
}

/* ── the single editing, publishing, deleting ───────────────────────────── */

/** Their changes; a published profile goes back to the host for another look. */
export async function updateMine(p: Profile, raw: unknown): Promise<Result> {
  if (p.status === "removed") return { ok: false, error: "The hosts removed this profile, so it can't be changed." };
  const c = clean(raw);
  if (!c.ok) return c;
  const back = p.status === "live" || p.status === "pending";
  await db.update(rishtaProfiles).set({
    ...c.values, updatedAt: new Date(),
    ...(back ? { status: "pending" as const, approvedAt: null, relationApproved: false } : {}),
  }).where(eq(rishtaProfiles.id, p.id));
  return { ok: true };
}

/** The single's own act: every declaration ticked, old enough, during the pilot's window. */
export async function publish(p: Profile, ticked: string[], marketing: boolean): Promise<Result> {
  if (!p.verifiedAt) return { ok: false, error: "Open your profile with the code we email you first." };
  if (p.status === "removed") return { ok: false, error: "The hosts removed this profile." };
  const { settings, phase } = await stateFor(p.weddingId);
  if (phase === "off" || phase === "closed") return { ok: false, error: "Rishta Corner has closed for this wedding." };
  if (!DECLARATIONS.every((d) => ticked.includes(d.id))) return { ok: false, error: "Please tick all three to publish." };
  if (!oldEnough(p.gender, p.birthYear, thisYear())) {
    return { ok: false, error: p.gender === "woman" ? "Rishta Corner is for women aged 18 and over." : "Rishta Corner is for men aged 21 and over." };
  }
  const consent = { notice: NOTICE_VERSION, lang: "en", at: new Date().toISOString(), declarations: DECLARATIONS.map((d) => d.id) };
  await db.update(rishtaProfiles).set({ status: "pending", consent, marketingOptIn: marketing, publishedAt: new Date(), updatedAt: new Date() }).where(eq(rishtaProfiles.id, p.id));
  await db.insert(rishtaConsents).values({ weddingId: p.weddingId, emailHash: hashToken(`rishta:${p.email}`), consent, closesOn: settings.closesOn });
  return { ok: true };
}

/** Gone at once: the profile, its photos, its interests and blocks. */
export async function removeProfile(p: Pick<Profile, "id" | "photos">): Promise<void> {
  await Promise.all(p.photos.map((ph) => del(ph.url).catch(() => {})));
  await db.delete(rishtaProfiles).where(eq(rishtaProfiles.id, p.id));
}

/* ── photos (up to 3; hidden data removed; never a public address) ──────── */

const MAX_PHOTOS = 3;
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const photosConfigured = () => !!env.blobToken;

export async function addPhoto(p: Profile, file: File, width: number, height: number): Promise<Result> {
  if (!photosConfigured()) return { ok: false, error: "Photo uploads aren't switched on yet." };
  if (p.photos.length >= MAX_PHOTOS) return { ok: false, error: `Up to ${MAX_PHOTOS} photos.` };
  if (file.size === 0 || file.size > MAX_PHOTO_BYTES) return { ok: false, error: "That photo is too large." };
  const clean = stripPhotoMetadata(new Uint8Array(await file.arrayBuffer()));
  if (!clean) return { ok: false, error: "Use a JPG, PNG or WebP photo." };
  const type = clean.kind === "jpeg" ? "image/jpeg" : `image/${clean.kind}`;
  const blob = await put(`rishta/${p.weddingId}/${crypto.randomUUID()}.${clean.kind === "jpeg" ? "jpg" : clean.kind}`, Buffer.from(clean.bytes), { access: "public", contentType: type });
  const photo: RishtaPhoto = { pathname: blob.pathname, url: blob.url, width: Math.round(width) || 0, height: Math.round(height) || 0 };
  await db.update(rishtaProfiles).set({ photos: [...p.photos, photo], updatedAt: new Date() }).where(eq(rishtaProfiles.id, p.id));
  return { ok: true };
}

export async function removePhoto(p: Profile, index: number): Promise<Result> {
  const ph = p.photos[index];
  if (!ph) return { ok: false, error: "We couldn't find that photo." };
  await del(ph.url).catch(() => {});
  await db.update(rishtaProfiles).set({ photos: p.photos.filter((_, i) => i !== index), updatedAt: new Date() }).where(eq(rishtaProfiles.id, p.id));
  return { ok: true };
}
