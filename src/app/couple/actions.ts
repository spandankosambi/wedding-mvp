"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { weddings } from "@/db/schema";
import { requireRole } from "@/lib/authz";
import { THEMES } from "@/themes/catalog";
import { copyFromPartner, updateLook } from "@/lib/looks";
import { adoptCardWording } from "@/lib/editor";

const schema = z.object({
  theme: z.enum(THEMES),
  weddingId: z.string().uuid(),
  family: z.enum(["bride", "groom"]),
});

export async function setTheme(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const staff = await requireRole(["couple", "admin"]);
  const weddingId = staff.role === "admin" ? parsed.data.weddingId : staff.weddingId;
  if (!weddingId) return { ok: false, error: "forbidden" };

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
  part: z.enum(["theme", "wording", "words", "travel", "gallery"]),
});

/** "Same as your partner": copy one part of the other family's look. */
export async function copyFromPartnerAction(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const parsed = copySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid input" };
  const staff = await requireRole(["couple", "admin"]);
  const weddingId = staff.role === "admin" ? parsed.data.weddingId : staff.weddingId;
  if (!weddingId) return { ok: false, error: "forbidden" };
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
  const staff = await requireRole(["couple", "admin"]);
  const weddingId = staff.role === "admin" ? parsed.data.weddingId : staff.weddingId;
  if (!weddingId) return { ok: false, error: "forbidden" };
  const [wedding] = await db.select({ slug: weddings.slug }).from(weddings).where(eq(weddings.id, weddingId));
  if (!wedding) return { ok: false, error: "wedding not found" };
  const r = await adoptCardWording(weddingId, parsed.data.family, parsed.data.wording);
  revalidatePath(`/w/${wedding.slug}`);
  revalidatePath("/couple", "layout");
  return r;
}
