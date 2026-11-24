"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/authz";
import { sendQueued } from "@/lib/email/mailer";

/** Send queued emails now, as far as today's allowance goes. */
export async function sendQueuedAction() {
  await requireRole(["admin"]);
  await sendQueued();
  revalidatePath("/admin");
  revalidatePath("/admin/mailroom");
}
