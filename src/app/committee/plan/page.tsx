import { PlanScreen, type PlanParams } from "../../couple/plan/PlanScreen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plan", robots: { index: false, follow: false } };

/** A committee member's Plan: Both families, and their own family's space. */
export default async function CommitteePlanPage({ searchParams }: { searchParams: Promise<PlanParams> }) {
  return <PlanScreen base="/committee/plan" sp={await searchParams} />;
}
