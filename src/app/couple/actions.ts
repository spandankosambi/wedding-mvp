"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { weddings } from "@/db/schema";
import { requireRole } from "@/lib/authz";
import { allows, seesSide } from "@/lib/access";
import { THEMES } from "@/themes/catalog";
import { asFamilySide, copyFromPartner, otherSide, updateLook } from "@/lib/looks";
import { adoptCardWording } from "@/lib/editor";

const schema = z.object({
  theme: z.enum(THEMES),
  weddingId: z.string().uuid(),
  family: z.enum(["bride", "groom"]),
});

export async function setTheme(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const staff = await requireRole(["committee", "couple", "admin"]);
  const weddingId = staff.role === "admin" ? parsed.data.weddingId : staff.weddingId;
  if (!weddingId || !allows(staff.access, "site", parsed.data.family, "full")) return { ok: false, error: "forbidden" };

  const [wedding] = await db.select({ slug: weddings.slug }).from(weddings).where(eq(weddings.id, weddingId));
  if (!wedding) return { ok: false, error: "wedding not found" };
  await updateLook(weddingId, parsed.data.family, { theme: parsed.data.theme });

  revalidatePath(`/w/${wedding.slug}`);
  revalidatePath("/couple", "layout");
  return { ok: true };
}

const copySchema = z.object({
  weddingId: z.string().uuid(),
  family: z.enum(["bride", "groom"]),
  part: z.enum(["theme", "decor", "wording", "words", "travel", "gallery"]),
});

/** "Same as your partner": copy one part of the other family's look. */
export async function copyFromPartnerAction(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const parsed = copySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const staff = await requireRole(["committee", "couple", "admin"]);
  const weddingId = staff.role === "admin" ? parsed.data.weddingId : staff.weddingId;
  if (!weddingId || !allows(staff.access, "site", parsed.data.family, "full") || !seesSide(staff.access, otherSide(parsed.data.family))) return { ok: false, error: "forbidden" };
  const [wedding] = await db.select({ slug: weddings.slug }).from(weddings).where(eq(weddings.id, weddingId));
  if (!wedding) return { ok: false, error: "wedding not found" };
  const r = await copyFromPartner(weddingId, parsed.data.family, parsed.data.part);
  revalidatePath(`/w/${wedding.slug}`);
  revalidatePath("/couple", "layout");
  return r;
}

const adoptSchema = z.object({
  weddingId: z.string().uuid(),
  family: z.enum(["bride", "groom"]),
  wording: z.record(z.string(), z.unknown()),
});

/** Moves wording typed in the print dialog (on this device) into the family's site wording. */
export async function adoptCardWordingAction(input: unknown): Promise<{ ok: boolean; filled?: number; error?: string }> {
  const parsed = adoptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const staff = await requireRole(["committee", "couple", "admin"]);
  const weddingId = staff.role === "admin" ? parsed.data.weddingId : staff.weddingId;
  if (!weddingId || !allows(staff.access, "site", parsed.data.family, "full")) return { ok: false, error: "forbidden" };
  const [wedding] = await db.select({ slug: weddings.slug }).from(weddings).where(eq(weddings.id, weddingId));
  if (!wedding) return { ok: false, error: "wedding not found" };
  const r = await adoptCardWording(weddingId, parsed.data.family, parsed.data.wording);
  revalidatePath(`/w/${wedding.slug}`);
  revalidatePath("/couple", "layout");
  return r;
}

/** The print page's "Save configuration": this family's card choices, kept with the wedding
    so they are there next time on any device. The photo stays on the device (it is large). */
export async function savePrintConfigAction(input: { weddingId?: string; family: string; config: unknown }): Promise<{ ok: boolean; error?: string }> {
  const family = asFamilySide(input?.family);
  const staff = await requireRole(["committee", "couple", "admin"]);
  const weddingId = staff.role === "admin" ? input?.weddingId : staff.weddingId;
  if (!family || !weddingId || !z.string().uuid().safeParse(weddingId).success || !allows(staff.access, "print", family, "full")) return { ok: false, error: "forbidden" };
  if (!input.config || typeof input.config !== "object" || Array.isArray(input.config)) return { ok: false, error: "invalid input" };
  const { photo: _photo, ...config } = input.config as Record<string, unknown>;
  void _photo;
  if (JSON.stringify(config).length > 30_000) return { ok: false, error: "invalid input" };
  await updateLook(weddingId, family, { printConfig: { ...config, version: family } });
  return { ok: true };
}
