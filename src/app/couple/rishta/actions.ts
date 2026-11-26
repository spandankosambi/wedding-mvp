"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { weddings } from "@/db/schema";
import { requireRole } from "@/lib/auth/authz";
import { setEnabled, setWindow } from "@/lib/rishta/profiles";
import { approve, hostRemove, resolveReport } from "@/lib/rishta/host";

/* The host's Rishta Corner: the couple (their own wedding) or admin (any).
   The switch and reports are admin only during the pilot. */

const uuid = z.string().uuid();
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

async function hostWedding(fd: FormData) {
  const staff = await requireRole(["couple", "admin"]);
  const weddingId = staff.role === "admin" ? str(fd, "weddingId") : staff.weddingId;
  if (!weddingId || !uuid.safeParse(weddingId).success) return null;
  const [w] = await db.select({ id: weddings.id }).from(weddings).where(eq(weddings.id, weddingId));
  return w ? { weddingId: w.id, admin: staff.role === "admin" } : null;
}
function back(fd: FormData, q: Record<string, string>): never {
  const s = new URLSearchParams(q);
  if (str(fd, "weddingId")) s.set("wedding", str(fd, "weddingId"));
  redirect(`/couple/rishta?${s.toString()}`);
}

export async function setRishtaSwitchAction(fd: FormData) {
  const h = await hostWedding(fd);
  if (!h?.admin) back(fd, { error: "Only the One Tap Invites team can switch Rishta Corner on during the pilot." });
  await setEnabled(h.weddingId, str(fd, "enabled") === "on");
  revalidatePath("/couple/rishta");
  back(fd, { saved: str(fd, "enabled") === "on" ? "Rishta Corner is on" : "Rishta Corner is off" });
}

export async function setRishtaWindowAction(fd: FormData) {
  const h = await hostWedding(fd);
  if (!h) back(fd, { error: "You don't have access to this." });
  const r = await setWindow(h.weddingId, str(fd, "opensOn"), str(fd, "closesOn"));
  if (!r.ok) back(fd, { error: r.error });
  revalidatePath("/couple/rishta");
  back(fd, { saved: "Dates saved" });
}

export async function approveRishtaAction(fd: FormData) {
  const h = await hostWedding(fd);
  if (!h) back(fd, { error: "You don't have access to this." });
  if (!uuid.safeParse(str(fd, "id")).success) back(fd, { error: "We couldn't find that profile." });
  const r = await approve(h.weddingId, str(fd, "id"), str(fd, "relationOk") === "on");
  if (!r.ok) back(fd, { error: r.error });
  revalidatePath("/couple/rishta");
  back(fd, { saved: `${str(fd, "name") || "Profile"} is live` });
}

export async function removeRishtaAction(fd: FormData) {
  const h = await hostWedding(fd);
  if (!h) back(fd, { error: "You don't have access to this." });
  if (!uuid.safeParse(str(fd, "id")).success) back(fd, { error: "We couldn't find that profile." });
  const r = await hostRemove(h.weddingId, str(fd, "id"));
  if (!r.ok) back(fd, { error: r.error });
  revalidatePath("/couple/rishta");
  back(fd, { saved: `${str(fd, "name") || "Profile"} is removed` });
}

export async function resolveRishtaReportAction(fd: FormData) {
  const h = await hostWedding(fd);
  if (!h?.admin) back(fd, { error: "Only the grievance officer can close reports." });
  if (!uuid.safeParse(str(fd, "id")).success) back(fd, { error: "We couldn't find that report." });
  const r = await resolveReport(h.weddingId, str(fd, "id"));
  if (!r.ok) back(fd, { error: r.error });
  revalidatePath("/couple/rishta");
  back(fd, { saved: "Report closed" });
}
