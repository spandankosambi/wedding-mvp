"use server";

import { z } from "zod";
import { requireRole } from "@/lib/auth/authz";
import { markTour } from "@/lib/tours/progress";
import { TOURS, type TourId } from "@/lib/tours/tours";

/** A tour was finished or skipped: don't start it by itself again, on any device. */
export async function markTourAction(input: unknown): Promise<{ ok: boolean }> {
  const p = z.object({ tour: z.string(), how: z.enum(["finished", "skipped"]) }).safeParse(input);
  if (!p.success || !(p.data.tour in TOURS)) return { ok: false };
  const staff = await requireRole(["couple", "committee", "admin"]);
  await markTour(staff.userId, p.data.tour as TourId, p.data.how);
  return { ok: true };
}
