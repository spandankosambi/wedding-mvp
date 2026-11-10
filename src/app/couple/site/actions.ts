"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { weddings } from "@/db/schema";
import { requireRole } from "@/lib/authz";
import * as editor from "@/lib/editor";
import { EVENT_PRESETS, presetStart } from "@/lib/presets";
import { put, del } from "@vercel/blob";
import * as gallery from "@/lib/gallery";
import { asFamilySide, copyFromPartner, photoInUse, type FamilySide, type LookPart } from "@/lib/looks";

/* Every action re-resolves the wedding server-side: a couple is pinned to
   their own; admin passes one explicitly. Then the site + editor revalidate
   and we bounce back to the section that was saved. */
async function scoped(formData: FormData) {
  const staff = await requireRole(["couple", "admin"]);
  const weddingId = staff.role === "admin" ? String(formData.get("weddingId") ?? "") : staff.weddingId;
  if (!weddingId) redirect("/couple");
  const [w] = await db.select({ slug: weddings.slug, weddingDate: weddings.weddingDate }).from(weddings).where(eq(weddings.id, weddingId));
  if (!w) redirect("/couple");
  // which family's section this came from (the editor is per family)
  const family: FamilySide = asFamilySide(formData.get("family")) ?? "bride";
  return { weddingId, slug: w.slug, weddingDate: w.weddingDate, admin: staff.role === "admin", family };
}

type Ctx = Awaited<ReturnType<typeof scoped>>;

/** Back to the family's editor (or, for shared details, the dashboard). */
function done(ctx: Ctx, section: string, error?: string, page: "site" | "dashboard" = "site") {
  revalidatePath(`/w/${ctx.slug}`);
  revalidatePath(`/w/${ctx.slug}/rsvp`);
  revalidatePath("/couple", "layout");
  const q = new URLSearchParams(error ? { error, section } : { saved: section });
  if (ctx.admin) q.set("wedding", ctx.weddingId);
  if (page === "site") q.set("family", ctx.family);
  redirect(`${page === "site" ? "/couple/site" : "/couple"}?${q}#${section}`);
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

/** The shared wedding details, saved from the main dashboard. */
export async function saveDetails(formData: FormData) {
  const ctx = await scoped(formData);
  const r = await editor.updateDetails(ctx.weddingId, {
    brideName: str(formData, "brideName"), groomName: str(formData, "groomName"),
    weddingDate: str(formData, "weddingDate"), city: str(formData, "city"),
    brideParents: str(formData, "brideParents"), groomParents: str(formData, "groomParents"),
  });
  done(ctx, "details", r.ok ? undefined : r.error, "dashboard");
}

/** One family's tagline, story, hashtag and contact. */
export async function saveWords(formData: FormData) {
  const ctx = await scoped(formData);
  const r = await editor.updateWords(ctx.weddingId, ctx.family, {
    heroTagline: str(formData, "heroTagline"), story: str(formData, "story"),
    hashtag: str(formData, "hashtag"), contactPhone: str(formData, "contactPhone"),
  });
  done(ctx, "words", r.ok ? undefined : r.error);
}

export async function saveRsvpSettings(formData: FormData) {
  const ctx = await scoped(formData);
  const r = await editor.updateRsvpSettings(ctx.weddingId, {
    rsvpOpen: formData.get("rsvpOpen") === "on", rsvpDeadline: str(formData, "rsvpDeadline"),
  });
  done(ctx, "rsvp", r.ok ? undefined : r.error, "dashboard");
}

/** "Same as your partner" for one part of this family's site. */
export async function copyPartAction(formData: FormData) {
  const ctx = await scoped(formData);
  const part = str(formData, "part");
  if (!["words", "travel", "gallery", "theme"].includes(part)) return done(ctx, "words", "invalid input");
  const r = await copyFromPartner(ctx.weddingId, ctx.family, part as LookPart);
  done(ctx, part, r.ok ? undefined : r.error);
}

export async function saveTravel(formData: FormData) {
  const ctx = await scoped(formData);
  const stays = [];
  for (let i = 0; i < 6; i++) {
    const name = str(formData, `stay${i}name`).trim();
    if (name) stays.push({ name, note: str(formData, `stay${i}note`), url: str(formData, `stay${i}url`) });
  }
  const r = await editor.updateTravel(ctx.weddingId, ctx.family, { stays, gettingThere: str(formData, "gettingThere") });
  done(ctx, "travel", r.ok ? undefined : r.error);
}

export async function saveEvent(formData: FormData) {
  const ctx = await scoped(formData);
  const id = str(formData, "id") || undefined;
  const r = await editor.upsertEvent(ctx.weddingId, {
    id, name: str(formData, "name"), date: str(formData, "date"), time: str(formData, "time"),
    venueName: str(formData, "venueName"), address: str(formData, "address"), mapUrl: str(formData, "mapUrl"),
    dressCode: str(formData, "dressCode"), description: str(formData, "description"),
    isPublished: formData.get("isPublished") === "on",
    // in a family's editor an event is common, or that family's own
    side: str(formData, "side") === "both" ? "both" : ctx.family,
  });
  done(ctx, id ? `event-${id}` : "events", r.ok ? undefined : r.error);
}

export async function addPresetEvent(formData: FormData) {
  const ctx = await scoped(formData);
  const preset = EVENT_PRESETS.find((p) => p.name === str(formData, "preset"));
  const startsAt = preset ? presetStart(preset, ctx.weddingDate) : ctx.weddingDate;
  const parts = editor.istParts(startsAt);
  const r = await editor.upsertEvent(ctx.weddingId, {
    name: preset?.name ?? "New celebration", date: parts.date, time: parts.time,
    venueName: "Venue to be announced", address: "To be announced",
    dressCode: preset?.dressCode ?? "", description: preset?.blurb ?? "", isPublished: true, side: "both",
  });
  done(ctx, r.ok && r.id ? `event-${r.id}` : "events", r.ok ? undefined : r.error);
}

export async function toggleEvent(formData: FormData) {
  const ctx = await scoped(formData);
  const id = str(formData, "id");
  const r = await editor.setEventPublished(ctx.weddingId, id, formData.get("isPublished") === "true");
  done(ctx, `event-${id}`, r.ok ? undefined : r.error);
}

export async function removeEvent(formData: FormData) {
  const ctx = await scoped(formData);
  const r = await editor.deleteEvent(ctx.weddingId, str(formData, "id"));
  done(ctx, "events", r.ok ? undefined : r.error);
}

export async function moveEventAction(formData: FormData) {
  const ctx = await scoped(formData);
  const id = str(formData, "id");
  const r = await editor.moveEvent(ctx.weddingId, id, str(formData, "dir") === "up" ? "up" : "down");
  done(ctx, `event-${id}`, r.ok ? undefined : r.error);
}

export async function sortEvents(formData: FormData) {
  const ctx = await scoped(formData);
  await editor.sortEventsByTime(ctx.weddingId);
  done(ctx, "events");
}

/* ── Gallery ──────────────────────────────────────────────────────── */

export async function saveGallerySettings(formData: FormData) {
  const ctx = await scoped(formData);
  const r = await gallery.setGalleryEnabled(ctx.weddingId, ctx.family, formData.get("galleryEnabled") === "on");
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
export async function uploadGalleryPhoto(formData: FormData): Promise<{ ok: boolean; error?: string }> {
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
