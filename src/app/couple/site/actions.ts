"use server";

import { revalidatePath } from "next/cache";
import { DEFAULT_ZONE, guessZone, zonedParts } from "@/lib/core/timezones";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { weddings } from "@/db/schema";
import { requireRole } from "@/lib/auth/authz";
import { allows, homeSide, seesSide } from "@/lib/auth/access";
import * as editor from "@/lib/site/editor";
import { EVENT_PRESETS, presetStart } from "@/lib/site/presets";
import { put, del } from "@vercel/blob";
import * as gallery from "@/lib/site/gallery";
import { newShareKey } from "@/lib/site/share";
import { MAX_KNOW, MAX_MUSIC_BYTES, MUSIC_TYPES } from "@/lib/site/site-decor";
import { asFamilySide, otherSide, copyFromPartner, photoInUse, updateLook, type FamilySide, type LookPart } from "@/lib/site/looks";

/* Every action re-resolves the wedding server-side: a couple is pinned to
   their own; admin passes one explicitly. Then the site + editor revalidate
   and we bounce back to the section that was saved. */
async function scoped(formData: FormData, need: "site" | "guests" | "couple" = "site") {
  const staff = await requireRole(["committee", "couple", "admin"]);
  const weddingId = staff.role === "admin" ? String(formData.get("weddingId") ?? "") : staff.weddingId;
  if (!weddingId) redirect("/couple");
  const [w] = await db.select({ slug: weddings.slug, weddingDate: weddings.weddingDate, city: weddings.city }).from(weddings).where(eq(weddings.id, weddingId));
  if (!w) redirect("/couple");
  // which family's section this came from (the editor is per family)
  const family: FamilySide = asFamilySide(formData.get("family")) ?? homeSide(staff.access);
  // the site needs full access to that family's site; the shared details are the couple's
  const ok = need === "couple" ? staff.access.manage : allows(staff.access, need, family, "full");
  if (!ok) redirect("/couple");
  return { weddingId, slug: w.slug, weddingDate: w.weddingDate, city: w.city, admin: staff.role === "admin", family, access: staff.access };
}

type Ctx = Awaited<ReturnType<typeof scoped>>;
type Applied = { ok: boolean; error?: string };

/** Back to the family's editor (or its section page, or for shared details the dashboard). */
function done(ctx: Ctx, section: string, error?: string, page: "site" | "section" | "dashboard" = "site") {
  revalidatePath(`/w/${ctx.slug}`);
  revalidatePath(`/w/${ctx.slug}/rsvp`);
  revalidatePath("/couple", "layout");
  const q = new URLSearchParams(error ? { error, section } : { saved: section });
  if (ctx.admin) q.set("wedding", ctx.weddingId);
  if (page === "site") q.set("family", ctx.family);
  const path = page === "site" ? "/couple/site" : page === "section" ? `/couple/${ctx.family}` : "/couple";
  redirect(`${path}?${q}#${section.split(",")[0]}`);
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

/** The shared wedding details, saved from the main dashboard. */
export async function saveDetailsAction(formData: FormData) {
  const ctx = await scoped(formData, "couple");
  const r = await editor.updateDetails(ctx.weddingId, {
    brideName: str(formData, "brideName"), groomName: str(formData, "groomName"),
    weddingDate: str(formData, "weddingDate"), city: str(formData, "city"),
    brideParents: str(formData, "brideParents"), groomParents: str(formData, "groomParents"),
  });
  done(ctx, "details", r.ok ? undefined : r.error, "dashboard");
}

/** One family's tagline, story, hashtag and contact. */
const applyWords = (ctx: Ctx, formData: FormData): Promise<Applied> =>
  editor.updateWords(ctx.weddingId, ctx.family, {
    heroTagline: str(formData, "heroTagline"), story: str(formData, "story"),
    hashtag: str(formData, "hashtag"),
  });
export async function saveWordsAction(formData: FormData) {
  const ctx = await scoped(formData);
  const r = await applyWords(ctx, formData);
  done(ctx, "words", r.ok ? undefined : r.error);
}

const applyWording = (ctx: Ctx, formData: FormData): Promise<Applied> =>
  editor.updateWording(ctx.weddingId, ctx.family, {
    invocation: str(formData, "invocation"), shloka: str(formData, "shloka"),
    // up to two RSVP contacts; a row without a number is left out
    contacts: [0, 1].map((i) => ({
      name: str(formData, `contact${i}name`), phone: str(formData, `contact${i}phone`).trim(), whatsapp: formData.get(`contact${i}whatsapp`) === "on",
    })).filter((c) => c.phone),
    compliments: str(formData, "compliments"), closingLine: str(formData, "closingLine"),
  });
export async function saveWordingAction(formData: FormData) {
  const ctx = await scoped(formData);
  const r = await applyWording(ctx, formData);
  done(ctx, "wording", r.ok ? undefined : r.error);
}

const applyDecor = (ctx: Ctx, formData: FormData): Promise<Applied> =>
  editor.updateDecor(ctx.weddingId, ctx.family, {
    motion: str(formData, "motion") || undefined, scene: str(formData, "scene") || undefined,
    reveal: str(formData, "reveal") || undefined, falling: str(formData, "falling") || undefined, divider: str(formData, "divider") || undefined,
    toran: formData.get("toran") === "on", corners: formData.get("corners") === "on", icons: formData.get("icons") === "on",
  });
export async function saveDecorAction(formData: FormData) {
  const ctx = await scoped(formData);
  const r = await applyDecor(ctx, formData);
  done(ctx, "decor", r.ok ? undefined : r.error);
}

export async function saveRsvpSettingsAction(formData: FormData) {
  const ctx = await scoped(formData, "guests");
  const r = await editor.updateRsvpSettings(ctx.weddingId, ctx.family, {
    rsvpOpen: formData.get("rsvpOpen") === "on", rsvpDeadline: str(formData, "rsvpDeadline"),
  });
  done(ctx, "rsvp", r.ok ? undefined : r.error, "section");
}

/** "Same as your partner" for one part of this family's site. */
export async function copyPartAction(formData: FormData) {
  const ctx = await scoped(formData);
  if (!seesSide(ctx.access, otherSide(ctx.family))) redirect("/couple"); // it reads the other family's section
  const part = str(formData, "part");
  if (!["decor", "wording", "words", "travel", "gallery", "theme"].includes(part)) return done(ctx, "words", "invalid input");
  const r = await copyFromPartner(ctx.weddingId, ctx.family, part as LookPart);
  done(ctx, part, r.ok ? undefined : r.error);
}

function applyTravel(ctx: Ctx, formData: FormData): Promise<Applied> {
  const stays = [];
  for (let i = 0; i < editor.MAX_STAYS; i++) {
    const name = str(formData, `stay${i}name`).trim();
    if (name) stays.push({ name, note: str(formData, `stay${i}note`), url: str(formData, `stay${i}url`), common: formData.get(`stay${i}common`) === "on" });
  }
  return editor.updateTravel(ctx.weddingId, ctx.family, { stays, gettingThere: str(formData, "gettingThere") });
}
export async function saveTravelAction(formData: FormData) {
  const ctx = await scoped(formData);
  const r = await applyTravel(ctx, formData);
  done(ctx, "travel", r.ok ? undefined : r.error);
}

const applyEvent = (ctx: Ctx, formData: FormData): Promise<Applied> =>
  editor.upsertEvent(ctx.weddingId, {
    id: str(formData, "id") || undefined, name: str(formData, "name"), date: str(formData, "date"), time: str(formData, "time"),
    durationHours: str(formData, "durationHours"),
    timeZone: str(formData, "timeZone"),
    venueName: str(formData, "venueName"), address: str(formData, "address"), mapUrl: str(formData, "mapUrl"),
    dressCode: str(formData, "dressCode"), description: str(formData, "description"),
    isPublished: formData.get("isPublished") === "on",
    // in a family's editor an event is common, or that family's own
    side: str(formData, "side") === "both" ? "both" : ctx.family,
    icon: str(formData, "icon"), iconImage: str(formData, "iconImage"),
  }, ctx.access.side);
export async function saveEventAction(formData: FormData) {
  const ctx = await scoped(formData);
  const id = str(formData, "id") || undefined;
  const r = await applyEvent(ctx, formData);
  done(ctx, id ? `event-${id}` : "events", r.ok ? undefined : r.error);
}

export async function addPresetEventAction(formData: FormData) {
  const ctx = await scoped(formData);
  const preset = EVENT_PRESETS.find((p) => p.name === str(formData, "preset"));
  const startsAt = preset ? presetStart(preset, ctx.weddingDate) : ctx.weddingDate;
  // a destination wedding's city sets the new celebration's time zone
  const timeZone = guessZone(ctx.city) ?? DEFAULT_ZONE;
  // the preset's usual hour (e.g. 7 pm), read as local time there
  const parts = zonedParts(startsAt, DEFAULT_ZONE);
  const r = await editor.upsertEvent(ctx.weddingId, {
    name: preset?.name ?? "New celebration", date: parts.date, time: parts.time, timeZone,
    venueName: "Venue to be announced", address: "To be announced",
    dressCode: preset?.dressCode ?? "", description: preset?.blurb ?? "", isPublished: true, side: "both",
  }, ctx.access.side);
  done(ctx, r.ok && r.id ? `event-${r.id}` : "events", r.ok ? undefined : r.error);
}

export async function toggleEventAction(formData: FormData) {
  const ctx = await scoped(formData);
  const id = str(formData, "id");
  const r = await editor.setEventPublished(ctx.weddingId, id, formData.get("isPublished") === "true", ctx.access.side);
  done(ctx, `event-${id}`, r.ok ? undefined : r.error);
}

export async function removeEventAction(formData: FormData) {
  const ctx = await scoped(formData);
  const r = await editor.deleteEvent(ctx.weddingId, str(formData, "id"), ctx.access.side);
  done(ctx, "events", r.ok ? undefined : r.error);
}

export async function moveEventAction(formData: FormData) {
  const ctx = await scoped(formData);
  const id = str(formData, "id");
  const r = await editor.moveEvent(ctx.weddingId, id, str(formData, "dir") === "up" ? "up" : "down", ctx.access.side);
  done(ctx, `event-${id}`, r.ok ? undefined : r.error);
}

export async function sortEventsAction(formData: FormData) {
  const ctx = await scoped(formData);
  await editor.sortEventsByTime(ctx.weddingId, ctx.access.side);
  done(ctx, "events");
}

/* ── Gallery ──────────────────────────────────────────────────────── */

const applyGallery = (ctx: Ctx, formData: FormData): Promise<Applied> =>
  gallery.setGalleryEnabled(ctx.weddingId, ctx.family, formData.get("galleryEnabled") === "on");
export async function saveGallerySettingsAction(formData: FormData) {
  const ctx = await scoped(formData);
  const r = await applyGallery(ctx, formData);
  done(ctx, "gallery", r.ok ? undefined : r.error);
}

export async function removeGalleryPhotoAction(formData: FormData) {
  const ctx = await scoped(formData);
  const r = await gallery.detachPhoto(ctx.weddingId, ctx.family, str(formData, "pathname"));
  // the list is the source of truth; a file left behind in storage is harmless.
  // The other family may share this photo ("same as partner") — then it stays.
  if (r.ok && gallery.photoStorageConfigured() && !(await photoInUse(ctx.weddingId, r.photo.pathname))) {
    await del(r.photo.url).catch(() => {});
  }
  done(ctx, "gallery", r.ok ? undefined : r.error);
}

export async function moveGalleryPhotoAction(formData: FormData) {
  const ctx = await scoped(formData);
  const r = await gallery.movePhoto(ctx.weddingId, ctx.family, str(formData, "pathname"), str(formData, "dir") === "up" ? "up" : "down");
  done(ctx, "gallery", r.ok ? undefined : r.error);
}

/** One photo per call, already resized in the browser. Returns instead of
    redirecting so the uploader can work through a batch and report progress. */
export async function uploadGalleryPhotoAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const ctx = await scoped(formData);
  if (!gallery.photoStorageConfigured()) return { ok: false, error: "photo uploads aren't switched on for this site yet" };
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "no photo received" };
  if (!(gallery.PHOTO_TYPES as readonly string[]).includes(file.type)) return { ok: false, error: "use a JPG, PNG or WebP photo" };
  if (file.size > gallery.MAX_PHOTO_BYTES) return { ok: false, error: "that photo is too large" };
  const width = Math.round(Number(formData.get("width")));
  const height = Math.round(Number(formData.get("height")));
  const room = await gallery.canAddPhoto(ctx.weddingId, ctx.family);
  if (!room.ok) return room;

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const blob = await put(`weddings/${ctx.weddingId}/gallery/${crypto.randomUUID()}.${ext}`, file, {
    access: "public", contentType: file.type,
  });
  const r = await gallery.appendPhoto(ctx.weddingId, ctx.family, { url: blob.url, pathname: blob.pathname, width, height });
  if (!r.ok) { await del(blob.url).catch(() => {}); return r; }
  revalidatePath(`/w/${ctx.slug}`);
  revalidatePath("/couple", "layout");
  return { ok: true };
}

/** "Things to know": short notes for guests. */
function applyKnow(ctx: Ctx, formData: FormData): Promise<Applied> {
  const rows = [];
  for (let i = 0; i < MAX_KNOW; i++) rows.push({ title: str(formData, `know${i}title`), text: str(formData, `know${i}text`) });
  return editor.updateKnow(ctx.weddingId, ctx.family, rows);
}
export async function saveKnowAction(formData: FormData) {
  const ctx = await scoped(formData);
  const r = await applyKnow(ctx, formData);
  done(ctx, "know", r.ok ? undefined : r.error);
}

/* ── One Save for the whole editor ────────────────────────────────── */

const APPLY: Record<string, (ctx: Ctx, fd: FormData) => Promise<Applied>> = {
  decor: applyDecor, wording: applyWording, words: applyWords, travel: applyTravel,
  gallery: applyGallery, know: applyKnow, event: applyEvent,
};

/**
 * The editor's floating Save: every section with changes, in one go. Each
 * section's fields arrive prefixed with its position ("0.story", "1.motion")
 * and "__parts" lists them in order ("words,event-abc"). Sections save one by
 * one; on the first that fails we stop and point at it (those before it are
 * already saved), otherwise we come back once with all of them noted.
 */
export async function saveChangesAction(formData: FormData) {
  const ctx = await scoped(formData);
  const parts = String(formData.get("__parts") ?? "").split(",").filter(Boolean).slice(0, 60);
  const saved: string[] = [];
  for (const [i, part] of parts.entries()) {
    const apply = APPLY[part.startsWith("event-") ? "event" : part];
    if (!apply) return done(ctx, part, "invalid input");
    const fd = new FormData();
    const prefix = `${i}.`;
    for (const [k, v] of formData.entries()) if (k.startsWith(prefix)) fd.append(k.slice(prefix.length), v);
    const r = await apply(ctx, fd);
    if (!r.ok) return done(ctx, part, r.error ?? "invalid input");
    saved.push(part);
  }
  done(ctx, saved.join(",") || "site");
}

function refresh(ctx: Ctx) {
  revalidatePath(`/w/${ctx.slug}`);
  revalidatePath("/couple", "layout");
}

/** Background music for this family's site: one MP3 (or M4A), played only after a guest taps. */
export async function uploadMusicAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const ctx = await scoped(formData);
  if (!gallery.photoStorageConfigured()) return { ok: false, error: "File storage isn't set up on this site yet." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "no file received" };
  if (!(MUSIC_TYPES as readonly string[]).includes(file.type)) return { ok: false, error: "Use an MP3 or M4A file." };
  if (file.size > MAX_MUSIC_BYTES) return { ok: false, error: "That file is over 4 MB. Trim the track or export it at a lower quality." };
  const ext = file.type.includes("mpeg") || file.type.includes("mp3") ? "mp3" : "m4a";
  const blob = await put(`weddings/${ctx.weddingId}/music/${crypto.randomUUID()}.${ext}`, file, { access: "public", contentType: file.type });
  const before = await editor.setMusic(ctx.weddingId, ctx.family, { url: blob.url, pathname: blob.pathname, name: file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Music" });
  if (before) await del(before.url).catch(() => {});
  refresh(ctx);
  return { ok: true };
}

export async function removeMusicAction(formData: FormData) {
  const ctx = await scoped(formData);
  const before = await editor.setMusic(ctx.weddingId, ctx.family, null);
  if (before && gallery.photoStorageConfigured()) await del(before.url).catch(() => {});
  done(ctx, "music");
}

/** Swaps a family's link code for a new one: the old link and QR stop opening the invitation. */
export async function renewShareLinkAction(formData: FormData) {
  const ctx = await scoped(formData, "couple");
  await updateLook(ctx.weddingId, ctx.family, { shareKey: newShareKey() });
  done(ctx, "share", undefined, "section");
}
