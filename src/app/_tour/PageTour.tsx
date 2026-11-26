import { requireRole } from "@/lib/auth/authz";
import { env } from "@/config/env";
import { hasSeenTour } from "@/lib/tours/progress";
import { autoStartFor, stepsFor, type TourId } from "@/lib/tours/tours";
import { TourRunner } from "./TourRunner";

/**
 * A page's tour, for the signed-in couple or committee member: it starts by
 * itself the first time they open the page (on any device), and the "?"
 * button replays it. Guests never see one.
 */
export async function PageTour({ id }: { id: TourId }) {
  const staff = await requireRole(["couple", "committee", "admin"]);
  const role = staff.role === "committee" ? "committee" : "couple";
  const autoStart = autoStartFor({ enabled: env.toursAutostart, role: staff.role, seen: env.toursAutostart && await hasSeenTour(staff.userId, id) });
  return <TourRunner id={id} steps={stepsFor(id, role)} autoStart={autoStart} />;
}
