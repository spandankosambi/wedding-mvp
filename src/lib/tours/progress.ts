import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tourProgress } from "@/db/schema";
import type { TourId } from "@/lib/tours/tours";

/* Which tours someone has finished or skipped, saved to them (not the
   browser), so a tour is offered once on any phone or laptop. */

export async function hasSeenTour(userId: string, tour: TourId): Promise<boolean> {
  const [r] = await db.select({ tour: tourProgress.tour }).from(tourProgress)
    .where(and(eq(tourProgress.userId, userId), eq(tourProgress.tour, tour)));
  return !!r;
}

export async function markTour(userId: string, tour: TourId, how: "finished" | "skipped"): Promise<void> {
  await db.insert(tourProgress).values({ userId, tour, how })
    .onConflictDoUpdate({ target: [tourProgress.userId, tourProgress.tour], set: { how, at: new Date() } });
}
